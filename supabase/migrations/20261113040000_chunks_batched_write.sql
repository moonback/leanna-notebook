-- Écriture des chunks par lots pour les grosses sources (ex. dépôt GitHub : ~2 000 chunks + vecteurs).
-- replace_chunks fait tout en UNE requête et dépasse le statement_timeout au-delà de quelques centaines
-- de chunks. Séquence : begin_chunks → append_chunks (n fois) → finish_chunks.
-- La source reste en 'processing' pendant l'écriture : le chat et Leanna ne l'interrogent qu'une fois
-- 'ready' (finish_chunks), donc un état partiel n'est jamais servi ; une reprise recommence au début.

create function public.begin_chunks(p_source uuid, p_language text, p_fts_config regconfig)
returns void
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  -- fts_config d'abord : le trigger chunks_set_fts le lit à chaque insertion
  update public.sources set language = p_language, fts_config = p_fts_config where id = p_source;
  if not found then raise exception 'source_not_found' using errcode = 'P0002'; end if;
  delete from public.chunks where source_id = p_source;
end $$;

create function public.append_chunks(p_source uuid, p_chunks jsonb)
returns integer
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_src public.sources; v_n int;
begin
  select * into v_src from public.sources where id = p_source;
  if not found then raise exception 'source_not_found' using errcode = 'P0002'; end if;
  insert into public.chunks (workspace_id, notebook_id, source_id, ordinal, content, char_start, char_end,
                             page_start, page_end, time_start_ms, time_end_ms, heading_path, token_count,
                             fts, embedding, embedding_model)
  select v_src.workspace_id, v_src.notebook_id, p_source, c.ordinal, c.content, c.char_start, c.char_end,
         c.page_start, c.page_end, c.time_start_ms, c.time_end_ms, coalesce(c.heading_path, '{}'),
         c.token_count, ''::tsvector, c.embedding::halfvec(1024), c.embedding_model
    from jsonb_to_recordset(p_chunks) as c(ordinal int, content text, char_start int, char_end int,
         page_start int, page_end int, time_start_ms int, time_end_ms int, heading_path text[],
         token_count int, embedding text, embedding_model text);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function public.finish_chunks(p_source uuid, p_extracted_text text, p_word_count int, p_page_count int default null)
returns integer
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_n int;
begin
  update public.sources set extracted_text = p_extracted_text, word_count = p_word_count, page_count = p_page_count,
         status = 'ready', error_code = null
   where id = p_source;
  if not found then raise exception 'source_not_found' using errcode = 'P0002'; end if;
  select count(*) into v_n from public.chunks where source_id = p_source;
  return v_n;
end $$;

revoke execute on function public.begin_chunks(uuid, text, regconfig), public.append_chunks(uuid, jsonb),
                         public.finish_chunks(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.begin_chunks(uuid, text, regconfig), public.append_chunks(uuid, jsonb),
                        public.finish_chunks(uuid, text, int, int) to service_role;
