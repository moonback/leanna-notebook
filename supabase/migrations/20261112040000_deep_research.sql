-- Deep Research : agent de recherche autonome par notebook.
-- Une recherche = une ligne research_runs. Le worker l'exécute en ÉTAPES COURTES (jobs 'deep_research'
-- chaînés) : plan → itérations recherche/lecture → ajout des sources → attente d'indexation → rédaction.
-- Chaque étape persiste son résultat : reprise après crash, pause et annulation réelles entre deux étapes,
-- et un seul worker n'est jamais bloqué pendant que les sources s'indexent.

create table public.research_runs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  notebook_id      uuid not null references public.notebooks (id) on delete cascade,
  created_by       uuid references auth.users (id) on delete set null,
  parent_run_id    uuid references public.research_runs (id) on delete set null,   -- approfondissement
  question         text not null check (char_length(btrim(question)) between 3 and 2000),
  instructions     text[] not null default '{}',             -- consignes initiales puis ajoutées en cours
  depth            text not null check (depth in ('quick', 'deep', 'expert')),
  max_sources      smallint not null check (max_sources between 3 and 30),
  report_format    text not null check (report_format in ('structured', 'executive', 'comparative', 'detailed',
                     'dossier', 'timeline', 'actors', 'risks', 'bibliography', 'none')),
  status           text not null default 'queued' check (status in ('queued', 'planning', 'searching', 'reading',
                     'extracting', 'cross_checking', 'writing', 'completed', 'failed', 'cancelled', 'paused')),
  stage            text,                                      -- libellé lisible de l'étape courante
  next_step        text not null default 'plan' check (next_step in ('plan', 'iterate', 'ingest', 'await_ingest', 'write', 'done')),
  step_seq         integer not null default 0,
  current_job_id   uuid references public.jobs (id) on delete set null,
  pause_requested  boolean not null default false,
  cancel_requested boolean not null default false,
  plan             jsonb not null default '{}',               -- {objectives:[], subquestions:[{id,text,status,queries}]}
  budget           jsonb not null default '{}',               -- plafonds figés à la création
  spent            jsonb not null default '{}',               -- {iterations,queries,pages,tokens,cost_usd}
  coverage         jsonb not null default '{}',               -- dernier bilan de couverture / lacunes
  artifact_id      uuid references public.artifacts (id) on delete set null,
  usage_id         uuid references public.usage_ledger (id) on delete set null,
  models           text[] not null default '{}',              -- traçabilité des modèles utilisés
  idempotency_key  text,
  error_code       text,
  error_message    text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (notebook_id, idempotency_key)
);
create index research_runs_nb_idx on public.research_runs (notebook_id, created_at desc);
create index research_runs_ws_idx on public.research_runs (workspace_id);
create index research_runs_active_idx on public.research_runs (notebook_id)
  where status not in ('completed', 'failed', 'cancelled', 'paused');
create trigger touch_updated_at before update on public.research_runs
  for each row execute function private.touch_updated_at();

-- Journal append-only : étapes, requêtes, pages, contradictions… Base du suivi temps réel.
create table public.research_events (
  id          bigint generated always as identity primary key,
  run_id      uuid not null references public.research_runs (id) on delete cascade,
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  type        text not null check (type ~ '^research\.[a-z_.]+$'),
  message     text not null check (char_length(message) <= 1000),
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index research_events_run_idx on public.research_events (run_id, id);
create index research_events_nb_idx on public.research_events (notebook_id);

-- Pages examinées par la recherche (retenues ou rejetées, avec motif).
create table public.research_sources (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.research_runs (id) on delete cascade,
  notebook_id    uuid not null references public.notebooks (id) on delete cascade,
  subquestion_id text,
  url            text not null check (url ~* '^https?://'),
  canonical_url  text not null check (canonical_url ~* '^https?://'),
  title          text not null default '' check (char_length(title) <= 300),
  domain         text not null,
  author         text check (char_length(author) <= 200),
  published_at   text check (char_length(published_at) <= 40),  -- tel que publié (ISO si disponible)
  accessed_at    timestamptz,
  doc_type       text check (doc_type in ('html', 'pdf', 'text')),
  content_sha256 text,
  content_chars  integer,
  summary        text check (char_length(summary) <= 2000),
  relevance      real check (relevance between 0 and 1),
  status         text not null check (status in ('candidate', 'retained', 'rejected', 'duplicate', 'failed', 'added', 'indexed')),
  reason         text check (char_length(reason) <= 300),
  source_id      uuid references public.sources (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (run_id, canonical_url)
);
create index research_sources_run_idx on public.research_sources (run_id, status);
create index research_sources_nb_idx on public.research_sources (notebook_id);
create index research_sources_source_idx on public.research_sources (source_id);
create index research_sources_hash_idx on public.research_sources (run_id, content_sha256);
create trigger touch_updated_at before update on public.research_sources
  for each row execute function private.touch_updated_at();

-- Informations extraites des pages : la citation est vérifiée mot pour mot dans le texte lu.
create table public.research_findings (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.research_runs (id) on delete cascade,
  notebook_id        uuid not null references public.notebooks (id) on delete cascade,
  research_source_id uuid not null references public.research_sources (id) on delete cascade,
  subquestion_id     text,
  statement          text not null check (char_length(statement) <= 1000),
  quote              text not null check (char_length(quote) <= 1500),
  quote_verified     boolean not null,
  support            text not null default 'single' check (support in ('single', 'corroborated', 'contested')),
  created_at         timestamptz not null default now()
);
create index research_findings_run_idx on public.research_findings (run_id);
create index research_findings_src_idx on public.research_findings (research_source_id);
create index research_findings_nb_idx on public.research_findings (notebook_id);

alter table public.research_runs enable row level security;
alter table public.research_events enable row level security;
alter table public.research_sources enable row level security;
alter table public.research_findings enable row level security;
create policy research_runs_read on public.research_runs for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');
create policy research_events_read on public.research_events for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');
create policy research_sources_read on public.research_sources for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');
create policy research_findings_read on public.research_findings for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');
revoke all on public.research_runs, public.research_events, public.research_sources, public.research_findings from anon;
revoke insert, update, delete, truncate on public.research_runs, public.research_events, public.research_sources,
  public.research_findings from authenticated;
grant select on public.research_runs, public.research_events, public.research_sources, public.research_findings to authenticated;
grant select, insert, update, delete on public.research_runs, public.research_events, public.research_sources,
  public.research_findings to service_role;

-- Étape suivante d'une recherche : un job par étape, clé d'idempotence = (run, n° d'étape).
-- Refuse si la recherche est terminale, annulée ou en pause (l'étape restera next_step pour la reprise).
create function public.research_enqueue_step(p_run uuid, p_step text, p_delay_seconds int default 0)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_run public.research_runs; v_job uuid;
begin
  select * into v_run from public.research_runs where id = p_run for update;
  if not found then raise exception 'research_not_found' using errcode = 'P0002'; end if;
  update public.research_runs set next_step = p_step where id = p_run;
  if v_run.status in ('completed', 'failed', 'cancelled') or v_run.cancel_requested then return null; end if;
  if v_run.pause_requested then
    update public.research_runs set status = 'paused', stage = 'en pause', pause_requested = false where id = p_run;
    insert into public.research_events (run_id, notebook_id, type, message)
         values (p_run, v_run.notebook_id, 'research.paused', 'Recherche mise en pause entre deux étapes.');
    return null;
  end if;
  insert into public.jobs (workspace_id, notebook_id, user_id, kind, target_id, payload, run_after, idempotency_key, priority)
       values (v_run.workspace_id, v_run.notebook_id, v_run.created_by, 'deep_research', p_run,
               jsonb_build_object('step', p_step), now() + make_interval(secs => greatest(0, p_delay_seconds)),
               'deep_research:' || p_run || ':' || (v_run.step_seq + 1), 110)
    returning id into v_job;
  update public.research_runs set step_seq = v_run.step_seq + 1, current_job_id = v_job where id = p_run;
  return v_job;
end $$;

-- Création atomique : recherche + premier job + réservation du quota, ou rien.
create function public.create_deep_research(
  p_notebook uuid, p_user uuid, p_question text, p_depth text, p_max_sources int, p_report_format text,
  p_instructions text default null, p_parent uuid default null, p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_run uuid; v_budget jsonb;
begin
  if p_idempotency_key is not null then
    select id into v_run from public.research_runs where notebook_id = p_notebook and idempotency_key = p_idempotency_key;
    if found then return v_run; end if;
  end if;
  select workspace_id into v_ws from public.notebooks where id = p_notebook;
  if v_ws is null then raise exception 'notebook_not_found' using errcode = 'P0002'; end if;
  if p_parent is not null and not exists (select 1 from public.research_runs where id = p_parent and notebook_id = p_notebook) then
    raise exception 'research_not_found' using errcode = 'P0002';
  end if;
  v_budget := case p_depth
    when 'quick'  then '{"iterations":1,"subquestions":3,"queries":4,"pages":8,"tokens":120000,"minutes":10}'
    when 'deep'   then '{"iterations":2,"subquestions":5,"queries":10,"pages":20,"tokens":300000,"minutes":20}'
    when 'expert' then '{"iterations":3,"subquestions":7,"queries":18,"pages":36,"tokens":600000,"minutes":35}'
  end::jsonb;
  if v_budget is null then raise exception 'invalid_research_depth' using errcode = '22023'; end if;
  insert into public.research_runs (workspace_id, notebook_id, created_by, parent_run_id, question, instructions, depth,
                                    max_sources, report_format, budget, idempotency_key)
       values (v_ws, p_notebook, p_user, p_parent, btrim(p_question),
               case when nullif(btrim(coalesce(p_instructions, '')), '') is null then '{}' else array[btrim(p_instructions)] end,
               p_depth, p_max_sources, p_report_format, v_budget, p_idempotency_key)
    returning id into v_run;
  update public.research_runs set usage_id = public.reserve_usage(v_ws, p_user, 'deep_research', null) where id = v_run;
  insert into public.research_events (run_id, notebook_id, type, message)
       values (v_run, p_notebook, 'research.created', 'Recherche créée et placée en file.');
  perform public.research_enqueue_step(v_run, 'plan', 0);
  update public.notebooks set last_activity_at = now() where id = p_notebook;
  return v_run;
end $$;

-- Reprise d'une recherche en pause ou échouée : repart de l'étape persistée (rien n'est refait).
create function public.resume_deep_research(p_run uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_run public.research_runs; v_usage_status public.usage_status;
begin
  select * into v_run from public.research_runs where id = p_run for update;
  if not found then raise exception 'research_not_found' using errcode = 'P0002'; end if;
  if v_run.status not in ('paused', 'failed') then raise exception 'research_not_resumable' using errcode = '22023'; end if;
  if exists (select 1 from public.jobs where target_id = p_run and kind = 'deep_research' and status in ('queued', 'running')) then
    raise exception 'research_busy' using errcode = '22023';
  end if;
  select status into v_usage_status from public.usage_ledger where id = v_run.usage_id;
  if v_usage_status is distinct from 'reserved' then   -- crédit rendu à l'échec : nouvelle réservation
    update public.research_runs set usage_id = public.reserve_usage(v_run.workspace_id, p_user, 'deep_research', null) where id = p_run;
  end if;
  update public.research_runs
     set status = 'queued', stage = 'reprise', pause_requested = false, error_code = null, error_message = null, finished_at = null
   where id = p_run;
  insert into public.research_events (run_id, notebook_id, type, message, data)
       values (p_run, v_run.notebook_id, 'research.resumed', 'Recherche reprise.', jsonb_build_object('step', v_run.next_step));
  return public.research_enqueue_step(p_run, case when v_run.next_step = 'done' then 'write' else v_run.next_step end, 0);
end $$;

revoke execute on function public.research_enqueue_step(uuid, text, int),
                         public.create_deep_research(uuid, uuid, text, text, int, text, text, uuid, text),
                         public.resume_deep_research(uuid, uuid) from public, anon, authenticated;
grant execute on function public.research_enqueue_step(uuid, text, int),
                        public.create_deep_research(uuid, uuid, text, text, int, text, text, uuid, text),
                        public.resume_deep_research(uuid, uuid) to service_role;

-- Bail expiré : comme avant, plus l'échec visible de la recherche (crédit rendu, reprise possible).
create or replace function public.requeue_stale_jobs() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with dead as (
    update public.jobs
       set status = 'failed', error_code = 'lease_expired', locked_by = null, locked_until = null,
           finished_at = now()
     where status = 'running' and locked_until < now() and attempts >= max_attempts
    returning target_id, kind, usage_id
  ), refund as (
    update public.usage_ledger set status = 'refunded'
     where (id in (select usage_id from dead)
            or id in (select r.usage_id from public.research_runs r
                       where r.id in (select target_id from dead where kind = 'deep_research')))
       and status = 'reserved'
  ), runs as (
    update public.research_runs set status = 'failed', error_code = 'lease_expired', stage = 'interrompue', finished_at = now()
     where id in (select target_id from dead where kind = 'deep_research')
  ), art as (
    update public.artifacts set status = 'failed', error_code = 'lease_expired'
     where id in (select target_id from dead where kind = 'generate_artifact')
  )
  update public.sources set status = 'failed', error_code = 'lease_expired'
   where id in (select target_id from dead where kind in ('ingest_source', 'sync_source'));

  update public.jobs
     set status = 'queued', locked_by = null, locked_until = null,
         run_after = now() + make_interval(secs => 15 * attempts * attempts)
   where status = 'running' and locked_until < now() and attempts < max_attempts;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Modèles configurables par tâche (réglages IA existants).
alter table public.ai_model_preferences drop constraint if exists ai_model_preferences_feature_key_check;
alter table public.ai_model_preferences add constraint ai_model_preferences_feature_key_check
  check (feature_key in ('chat','report','flashcards','quiz','mind_map','audio_overview',
                         'deep_research','knowledge_extraction','contradictions'))
  not valid;  -- NOT VALID : des lignes existantes hors liste (clés ajoutées hors migration) ne bloquent plus l'ajout ;
              -- la contrainte reste appliquée à toute nouvelle écriture ou modification.
