-- H05 : copie d'un notebook (sources prêtes, passages indexés, guides, artefacts prêts et leurs citations).
-- Exclus : conversations, notes, partages, progression d'étude. Réservée au serveur (service_role) :
-- le rôle de l'appelant sur le notebook source et l'option « autoriser les copies » sont vérifiés par la route.

create function public.copy_notebook(p_src uuid, p_user uuid, p_ws uuid, p_title text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_nb      uuid;
  v_max     int;
  v_count   int;
  v_files   jsonb;
begin
  if not exists (select 1 from public.notebooks where id = p_src) then
    raise exception 'notebook_not_found' using errcode = 'P0002';
  end if;

  select (p.limits ->> 'max_sources_per_notebook')::int into v_max
    from public.workspaces w join public.plans p on p.id = w.plan_id where w.id = p_ws;
  select count(*) into v_count from public.sources
   where notebook_id = p_src and kind <> 'note' and status = 'ready';
  if v_max is not null and v_count > v_max then raise exception 'max_sources' using errcode = 'P0001'; end if;

  insert into public.notebooks (workspace_id, created_by, title, emoji, overview, suggested_questions,
                                chat_style, chat_custom_prompt, response_length, output_language)
       select p_ws, p_user, p_title, emoji, overview, suggested_questions,
              chat_style, chat_custom_prompt, response_length, output_language
         from public.notebooks where id = p_src
    returning id into v_nb;

  create temp table _lab (old_id uuid primary key, new_id uuid not null default gen_random_uuid()) on commit drop;
  create temp table _src (old_id uuid primary key, new_id uuid not null default gen_random_uuid()) on commit drop;
  create temp table _chk (old_id uuid primary key, new_id uuid not null default gen_random_uuid()) on commit drop;
  create temp table _art (old_id uuid primary key, new_id uuid not null default gen_random_uuid()) on commit drop;

  insert into _lab (old_id) select id from public.source_labels where notebook_id = p_src;
  insert into public.source_labels (id, workspace_id, notebook_id, name, origin, position)
       select m.new_id, p_ws, v_nb, l.name, l.origin, l.position
         from public.source_labels l join _lab m on m.old_id = l.id;

  insert into _src (old_id)
       select id from public.sources where notebook_id = p_src and kind <> 'note' and status = 'ready';
  insert into public.sources (id, workspace_id, notebook_id, created_by, kind, title, status, origin_url,
                              storage_path, mime_type, size_bytes, content_sha256, language, fts_config,
                              word_count, page_count, duration_ms, extracted_text, guide, label_id)
       select m.new_id, p_ws, v_nb, p_user, s.kind, s.title, 'ready', s.origin_url,
              case when s.storage_path is null then null
                   else p_ws || '/' || v_nb || '/' || m.new_id || '/' || regexp_replace(s.storage_path, '^.*/', '') end,
              s.mime_type, s.size_bytes, s.content_sha256, s.language, s.fts_config,
              s.word_count, s.page_count, s.duration_ms, s.extracted_text, s.guide, l.new_id
         from public.sources s
         join _src m on m.old_id = s.id
         left join _lab l on l.old_id = s.label_id;

  insert into _chk (old_id) select c.id from public.chunks c join _src m on m.old_id = c.source_id;
  insert into public.chunks (id, workspace_id, notebook_id, source_id, ordinal, content, char_start, char_end,
                             page_start, page_end, time_start_ms, time_end_ms, heading_path, token_count,
                             fts, embedding, embedding_model)
       select k.new_id, p_ws, v_nb, m.new_id, c.ordinal, c.content, c.char_start, c.char_end,
              c.page_start, c.page_end, c.time_start_ms, c.time_end_ms, c.heading_path, c.token_count,
              c.fts, c.embedding, c.embedding_model
         from public.chunks c
         join _chk k on k.old_id = c.id
         join _src m on m.old_id = c.source_id;

  insert into _art (old_id) select id from public.artifacts where notebook_id = p_src and status = 'ready';
  insert into public.artifacts (id, workspace_id, notebook_id, created_by, type, title, status, options,
                                custom_prompt, source_ids, outline, content, storage_path, mime_type, duration_ms)
       select m.new_id, p_ws, v_nb, p_user, a.type, a.title, 'ready', a.options,
              a.custom_prompt,
              coalesce((select array_agg(s.new_id) from _src s where s.old_id = any (a.source_ids)), '{}'),
              a.outline, a.content,
              case when a.storage_path is null then null
                   else p_ws || '/' || v_nb || '/' || m.new_id || '/' || regexp_replace(a.storage_path, '^.*/', '') end,
              a.mime_type, a.duration_ms
         from public.artifacts a join _art m on m.old_id = a.id;

  insert into public.citations (workspace_id, notebook_id, artifact_id, marker, chunk_id, source_id,
                                quote_text, char_start, char_end, verified)
       select p_ws, v_nb, m.new_id, c.marker, k.new_id, s.new_id,
              c.quote_text, c.char_start, c.char_end, c.verified
         from public.citations c
         join _art m on m.old_id = c.artifact_id
         left join _chk k on k.old_id = c.chunk_id
         left join _src s on s.old_id = c.source_id;

  -- fichiers à dupliquer dans Storage : la route les copie, puis annule la copie en cas d'échec
  select coalesce(jsonb_agg(f), '[]') into v_files from (
    select jsonb_build_object('bucket', 'sources', 'from', s.storage_path,
                              'to', n.storage_path) as f
      from public.sources s join _src m on m.old_id = s.id
      join public.sources n on n.id = m.new_id
     where s.storage_path is not null
    union all
    select jsonb_build_object('bucket', 'artifacts', 'from', a.storage_path, 'to', n.storage_path)
      from public.artifacts a join _art m on m.old_id = a.id
      join public.artifacts n on n.id = m.new_id
     where a.storage_path is not null
  ) x;

  return jsonb_build_object('notebook_id', v_nb, 'files', v_files);
end $$;

revoke execute on function public.copy_notebook(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.copy_notebook(uuid, uuid, uuid, text) to service_role;
