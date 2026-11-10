-- B17 — Fast Research : réservation atomique du quota et création du job.
-- Les résultats sont persistés dans jobs.result par le worker ; aucune table parallèle.
create or replace function public.create_research_job(
  p_notebook uuid,
  p_user uuid,
  p_query text,
  p_mode text default 'fast',
  p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_existing uuid;
  v_job uuid;
  v_usage uuid;
begin
  if p_mode <> 'fast' then raise exception 'unsupported_research_mode' using errcode = '22023'; end if;
  if char_length(btrim(p_query)) < 3 or char_length(p_query) > 300 then
    raise exception 'invalid_research_query' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing from public.jobs
     where idempotency_key = p_idempotency_key and notebook_id = p_notebook
       and user_id = p_user and kind = 'research';
    if found then return v_existing; end if;
  end if;

  select workspace_id into v_ws from public.notebooks where id = p_notebook;
  if v_ws is null then raise exception 'notebook_not_found' using errcode = 'P0002'; end if;

  insert into public.jobs (workspace_id, notebook_id, user_id, kind, payload, idempotency_key)
       values (v_ws, p_notebook, p_user, 'research', jsonb_build_object('query', btrim(p_query), 'mode', p_mode),
               p_idempotency_key)
    returning id into v_job;

  v_usage := public.reserve_usage(v_ws, p_user, 'research', v_job);
  update public.jobs set usage_id = v_usage where id = v_job;
  update public.notebooks set last_activity_at = now() where id = p_notebook;
  return v_job;
end $$;

revoke execute on function public.create_research_job(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_research_job(uuid, uuid, text, text, text) to service_role;
