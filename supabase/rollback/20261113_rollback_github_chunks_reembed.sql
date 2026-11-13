-- ROLLBACK des migrations :
--   20261113050000_reembed_chunks.sql        (set_chunk_embeddings)
--   20261113040000_chunks_batched_write.sql  (begin_chunks / append_chunks / finish_chunks)
--   20261113030000_github_sources.sql        (valeur 'github' de public.source_kind)
--
-- À exécuter UNE fois dans le SQL Editor de Supabase. Tout se fait dans une transaction : en cas d'erreur, rien n'est modifié.
-- ⚠ Les sources de type 'github' sont SUPPRIMÉES (avec leurs chunks ; les citations passées gardent leur extrait).
-- ⚠ Postgres ne sait pas retirer une valeur d'enum : le type source_kind est recréé sans 'github',
--   et la fonction add_source (qui en dépend) est recréée à l'identique.

begin;

-- 1) reembed
drop function if exists public.set_chunk_embeddings(jsonb, text);

-- 2) écriture des chunks par lots
drop function if exists public.begin_chunks(uuid, text, regconfig);
drop function if exists public.append_chunks(uuid, jsonb);
drop function if exists public.finish_chunks(uuid, text, int, int);

-- 3) sources GitHub : données d'abord (jobs non liés par clé étrangère), puis le type
delete from public.jobs where target_id in (select id from public.sources where kind::text = 'github');
delete from public.sources where kind::text = 'github';

drop function if exists public.add_source(uuid, uuid, public.source_kind, text, text, text, text, bigint, jsonb, text);
alter type public.source_kind rename to source_kind_old;
create type public.source_kind as enum ('pdf', 'docx', 'txt', 'md', 'csv', 'pptx', 'epub',
                                        'image', 'audio', 'video', 'web', 'youtube',
                                        'text', 'gdrive', 'note');

-- La contrainte « kind = 'note' ⇔ note_body » référence l'ancien type : retirée puis recréée sous le même nom.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.sources'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%note_body%';
  if v_name is null then raise exception 'contrainte note_body introuvable sur public.sources'; end if;
  execute format('alter table public.sources drop constraint %I', v_name);
  alter table public.sources alter column kind type public.source_kind using kind::text::public.source_kind;
  execute format('alter table public.sources add constraint %I check ((kind = ''note'') = (note_body is not null))', v_name);
end $$;

drop type public.source_kind_old;

-- add_source : identique à 20261109000000_init.sql
create function public.add_source(p_notebook uuid, p_user uuid, p_kind public.source_kind, p_title text,
                                  p_origin_url text default null, p_storage_path text default null,
                                  p_mime_type text default null, p_size_bytes bigint default null,
                                  p_note_body jsonb default null, p_idempotency_key text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_max int; v_count int; v_src uuid;
begin
  select n.workspace_id, (p.limits ->> 'max_sources_per_notebook')::int into v_ws, v_max
    from public.notebooks n join public.workspaces w on w.id = n.workspace_id
    join public.plans p on p.id = w.plan_id where n.id = p_notebook;
  if v_ws is null then raise exception 'notebook_not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_notebook::text, 1));
  select count(*) into v_count from public.sources where notebook_id = p_notebook;
  if v_max is not null and v_count >= v_max then raise exception 'max_sources' using errcode = 'P0001'; end if;
  insert into public.sources (workspace_id, notebook_id, created_by, kind, title, origin_url, storage_path,
                              mime_type, size_bytes, note_body)
       values (v_ws, p_notebook, p_user, p_kind, p_title, p_origin_url, p_storage_path, p_mime_type,
               p_size_bytes, p_note_body)
    returning id into v_src;
  insert into public.jobs (workspace_id, notebook_id, user_id, kind, target_id, idempotency_key)
       values (v_ws, p_notebook, p_user, 'ingest_source', v_src, p_idempotency_key);
  update public.notebooks set last_activity_at = now() where id = p_notebook;
  return v_src;
end $$;
revoke execute on function public.add_source(uuid, uuid, public.source_kind, text, text, text, text, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.add_source(uuid, uuid, public.source_kind, text, text, text, text, bigint, jsonb, text)
  to service_role;

commit;

-- PostgREST : oublier les fonctions supprimées et la nouvelle signature d'add_source.
notify pgrst, 'reload schema';
