-- Rollback de la valeur temporaire 'github' de public.source_kind.
-- PostgreSQL ne sait pas supprimer une valeur d'enum directement : on reconstruit
-- le type avec les valeurs d'origine puis on rebranche la colonne et la fonction.
--
-- Sécurité : on refuse le rollback si des sources GitHub existent déjà. Leur
-- conversion automatique en 'web' serait sémantiquement incorrecte et pourrait
-- déclencher un mauvais pipeline d'ingestion.

do $$
begin
  if exists (
    select 1
      from public.sources
     where kind::text = 'github'
  ) then
    raise exception
      'rollback_source_kind_github_blocked: des sources GitHub existent. Supprimez-les ou migrez-les explicitement avant ce rollback.';
  end if;
end
$$;

-- add_source dépend du type dans sa signature : suppression puis recréation.
drop function public.add_source(
  uuid, uuid, public.source_kind, text, text, text, text, bigint, jsonb, text
);

create type public.source_kind_without_github as enum (
  'pdf', 'docx', 'txt', 'md', 'csv', 'pptx', 'epub',
  'image', 'audio', 'video', 'web', 'youtube',
  'text', 'gdrive', 'note'
);

alter table public.sources
  alter column kind type public.source_kind_without_github
  using kind::text::public.source_kind_without_github;

drop type public.source_kind;
alter type public.source_kind_without_github rename to source_kind;

-- Restauration de la fonction avec la signature basée sur le type reconstruit.
create function public.add_source(
  p_notebook uuid,
  p_user uuid,
  p_kind public.source_kind,
  p_title text,
  p_origin_url text default null,
  p_storage_path text default null,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_note_body jsonb default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_max int;
  v_count int;
  v_src uuid;
begin
  select n.workspace_id, (p.limits ->> 'max_sources_per_notebook')::int
    into v_ws, v_max
    from public.notebooks n
    join public.workspaces w on w.id = n.workspace_id
    join public.plans p on p.id = w.plan_id
   where n.id = p_notebook;

  if v_ws is null then
    raise exception 'notebook_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_notebook::text, 1));

  select count(*) into v_count
    from public.sources
   where notebook_id = p_notebook;

  if v_max is not null and v_count >= v_max then
    raise exception 'max_sources' using errcode = 'P0001';
  end if;

  insert into public.sources (
    workspace_id, notebook_id, created_by, kind, title, origin_url, storage_path,
    mime_type, size_bytes, note_body
  )
  values (
    v_ws, p_notebook, p_user, p_kind, p_title, p_origin_url, p_storage_path,
    p_mime_type, p_size_bytes, p_note_body
  )
  returning id into v_src;

  insert into public.jobs (
    workspace_id, notebook_id, user_id, kind, target_id, idempotency_key
  )
  values (
    v_ws, p_notebook, p_user, 'ingest_source', v_src, p_idempotency_key
  );

  update public.notebooks
     set last_activity_at = now()
   where id = p_notebook;

  return v_src;
end
$$;

revoke execute on function public.add_source(
  uuid, uuid, public.source_kind, text, text, text, text, bigint, jsonb, text
) from public, anon, authenticated;

grant execute on function public.add_source(
  uuid, uuid, public.source_kind, text, text, text, text, bigint, jsonb, text
) to service_role;
