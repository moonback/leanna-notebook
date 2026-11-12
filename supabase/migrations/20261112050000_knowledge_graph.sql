-- Knowledge Graph & détection des contradictions.
-- Principe : AUCUNE donnée du graphe sans provenance. Une entité existe tant qu'au moins une mention
-- (source + passage exact) la justifie ; une relation tant qu'au moins une preuve la justifie.
-- Le worker (knowledge_extract) remplace en une transaction tout ce qu'une source apporte.

create table public.knowledge_entities (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  notebook_id    uuid not null references public.notebooks (id) on delete cascade,
  type           text not null check (type ~ '^[a-z_]{2,30}$'),     -- person, organization, place… extensible
  type_group     text not null check (type_group ~ '^[a-z_]{2,30}$'), -- organization/company/institution → 'org'
  name           text not null check (char_length(name) between 1 and 200),
  normalized_key text not null check (char_length(normalized_key) between 1 and 200),
  description    text check (char_length(description) <= 1000),
  properties     jsonb not null default '{}',
  confidence     real not null default 0.5 check (confidence between 0 and 1),
  mention_count  integer not null default 0,
  source_count   integer not null default 0,
  first_seen_at  timestamptz,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (notebook_id, type_group, normalized_key)
);
create index knowledge_entities_nb_idx on public.knowledge_entities (notebook_id, source_count desc, mention_count desc);
create index knowledge_entities_ws_idx on public.knowledge_entities (workspace_id);
create index knowledge_entities_name_trgm on public.knowledge_entities using gin (private.f_unaccent(lower(name)) gin_trgm_ops);
create trigger touch_updated_at before update on public.knowledge_entities
  for each row execute function private.touch_updated_at();

-- Alias normalisés : base de la résolution d'identité (exacte, jamais floue pour les personnes).
create table public.knowledge_entity_aliases (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references public.knowledge_entities (id) on delete cascade,
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  type_group  text not null,
  alias       text not null check (char_length(alias) between 1 and 200),
  normalized  text not null check (char_length(normalized) between 1 and 200),
  origin      text not null default 'extracted' check (origin in ('extracted', 'merge', 'manual')),
  created_at  timestamptz not null default now(),
  unique (notebook_id, type_group, normalized)
);
create index knowledge_aliases_entity_idx on public.knowledge_entity_aliases (entity_id);

-- Mentions : passage exact où l'entité apparaît (provenance des nœuds).
create table public.knowledge_mentions (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references public.knowledge_entities (id) on delete cascade,
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  source_id    uuid not null references public.sources (id) on delete cascade,
  chunk_id     uuid references public.chunks (id) on delete set null,
  surface_form text not null check (char_length(surface_form) <= 200),
  quote_text   text not null check (char_length(quote_text) <= 1500),
  char_start   integer not null check (char_start >= 0),
  char_end     integer not null,
  page         integer,
  created_at   timestamptz not null default now(),
  check (char_end > char_start)
);
create index knowledge_mentions_entity_idx on public.knowledge_mentions (entity_id);
create index knowledge_mentions_source_idx on public.knowledge_mentions (source_id);
create index knowledge_mentions_nb_idx on public.knowledge_mentions (notebook_id);
create index knowledge_mentions_chunk_idx on public.knowledge_mentions (chunk_id);

create table public.knowledge_relations (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  notebook_id      uuid not null references public.notebooks (id) on delete cascade,
  source_entity_id uuid not null references public.knowledge_entities (id) on delete cascade,
  target_entity_id uuid not null references public.knowledge_entities (id) on delete cascade,
  type             text not null check (type ~ '^[a-z_]{2,40}$'),     -- works_for, leads, owns… extensible
  description      text check (char_length(description) <= 1000),
  assertion        text not null check (assertion in ('explicit', 'inferred')), -- déclaré vs déduit par le modèle
  confidence       real not null check (confidence between 0 and 1),
  status           text not null default 'unreviewed' check (status in ('unreviewed', 'confirmed', 'rejected')),
  valid_from       text check (char_length(valid_from) <= 40),
  valid_to         text check (char_length(valid_to) <= 40),
  evidence_count   integer not null default 0,
  source_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (source_entity_id <> target_entity_id),
  unique (notebook_id, source_entity_id, target_entity_id, type)
);
create index knowledge_relations_nb_idx on public.knowledge_relations (notebook_id);
create index knowledge_relations_src_idx on public.knowledge_relations (source_entity_id);
create index knowledge_relations_tgt_idx on public.knowledge_relations (target_entity_id);
create index knowledge_relations_ws_idx on public.knowledge_relations (workspace_id);
create trigger touch_updated_at before update on public.knowledge_relations
  for each row execute function private.touch_updated_at();

-- Affirmations factuelles normalisées (base de la détection des contradictions).
create table public.knowledge_claims (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  notebook_id       uuid not null references public.notebooks (id) on delete cascade,
  source_id         uuid not null references public.sources (id) on delete cascade,
  subject_entity_id uuid not null references public.knowledge_entities (id) on delete cascade,
  attribute         text not null check (attribute ~ '^[a-z0-9_]{2,60}$'),
  attribute_label   text not null check (char_length(attribute_label) <= 120),
  value_text        text not null check (char_length(value_text) <= 500),
  value_type        text not null check (value_type in ('date', 'amount', 'quantity', 'place', 'person', 'organization', 'text')),
  value_norm        jsonb not null default '{}',
  context           text check (char_length(context) <= 500),
  observed_at       text check (char_length(observed_at) <= 40),   -- date du document / de l'énoncé si connue
  confidence        real not null check (confidence between 0 and 1),
  chunk_id          uuid references public.chunks (id) on delete set null,
  quote_text        text not null check (char_length(quote_text) <= 1500),
  char_start        integer not null check (char_start >= 0),
  char_end          integer not null,
  page              integer,
  created_at        timestamptz not null default now(),
  check (char_end > char_start)
);
create index knowledge_claims_group_idx on public.knowledge_claims (notebook_id, subject_entity_id, attribute);
create index knowledge_claims_source_idx on public.knowledge_claims (source_id);
create index knowledge_claims_chunk_idx on public.knowledge_claims (chunk_id);
create index knowledge_claims_ws_idx on public.knowledge_claims (workspace_id);

-- Preuves des relations : passage exact, stance (confirme / contredit).
create table public.knowledge_evidence (
  id          uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  relation_id uuid not null references public.knowledge_relations (id) on delete cascade,
  source_id   uuid not null references public.sources (id) on delete cascade,
  chunk_id    uuid references public.chunks (id) on delete set null,
  quote_text  text not null check (char_length(quote_text) <= 1500),
  char_start  integer not null check (char_start >= 0),
  char_end    integer not null,
  page        integer,
  stance      text not null default 'supports' check (stance in ('supports', 'contradicts')),
  created_at  timestamptz not null default now(),
  check (char_end > char_start)
);
create index knowledge_evidence_relation_idx on public.knowledge_evidence (relation_id);
create index knowledge_evidence_source_idx on public.knowledge_evidence (source_id);
create index knowledge_evidence_nb_idx on public.knowledge_evidence (notebook_id);
create index knowledge_evidence_chunk_idx on public.knowledge_evidence (chunk_id);

-- Historique des fusions / séparations d'entités (provenance des résolutions d'identité).
create table public.knowledge_merges (
  id               uuid primary key default gen_random_uuid(),
  notebook_id      uuid not null references public.notebooks (id) on delete cascade,
  action           text not null check (action in ('merge', 'split')),
  target_entity_id uuid references public.knowledge_entities (id) on delete set null,
  other_entity_id  uuid references public.knowledge_entities (id) on delete set null,
  snapshot         jsonb not null,                            -- noms / alias au moment de l'opération
  reason           text check (char_length(reason) <= 500),
  user_id          uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index knowledge_merges_nb_idx on public.knowledge_merges (notebook_id, created_at desc);
create index knowledge_merges_target_idx on public.knowledge_merges (target_entity_id);
create index knowledge_merges_other_idx on public.knowledge_merges (other_entity_id);
create index knowledge_merges_user_idx on public.knowledge_merges (user_id);

-- État d'extraction par source (statistiques, dernière synchronisation, erreurs).
create table public.knowledge_source_state (
  source_id    uuid primary key references public.sources (id) on delete cascade,
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  status       text not null check (status in ('queued', 'processing', 'ready', 'failed')),
  entities     integer not null default 0,
  relations    integer not null default 0,
  claims       integer not null default 0,
  dropped      integer not null default 0,                   -- éléments rejetés faute de passage vérifiable
  model        text,
  error_code   text,
  extracted_at timestamptz,
  updated_at   timestamptz not null default now()
);
create index knowledge_source_state_nb_idx on public.knowledge_source_state (notebook_id, status);
create trigger touch_updated_at before update on public.knowledge_source_state
  for each row execute function private.touch_updated_at();

create table public.knowledge_contradictions (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  notebook_id       uuid not null references public.notebooks (id) on delete cascade,
  fingerprint       text not null,                            -- stable entre deux analyses (sources + attribut + valeurs)
  subject_entity_id uuid references public.knowledge_entities (id) on delete cascade,
  attribute         text not null,
  category          text not null check (category in ('date', 'amount', 'quantity', 'location', 'responsibility',
                      'statement', 'chronology', 'factual', 'obsolete', 'version')),
  kind              text not null check (kind in ('direct', 'divergence', 'contextual', 'obsolete', 'insufficient')),
  claim_a_id        uuid not null references public.knowledge_claims (id) on delete cascade,
  claim_b_id        uuid not null references public.knowledge_claims (id) on delete cascade,
  explanation       text not null check (char_length(explanation) <= 2000),
  confidence        real not null check (confidence between 0 and 1),
  detector          jsonb not null default '{}',              -- {deterministic:{…}, llm:{model,kind}|null}
  status            text not null default 'open' check (status in ('open', 'verified', 'confirmed', 'rejected', 'obsolete', 'resolved')),
  resolution_note   text check (char_length(resolution_note) <= 4000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (claim_a_id <> claim_b_id),
  unique (notebook_id, fingerprint)
);
create index knowledge_contradictions_nb_idx on public.knowledge_contradictions (notebook_id, status, kind);
create index knowledge_contradictions_a_idx on public.knowledge_contradictions (claim_a_id);
create index knowledge_contradictions_b_idx on public.knowledge_contradictions (claim_b_id);
create index knowledge_contradictions_subject_idx on public.knowledge_contradictions (subject_entity_id);
create index knowledge_contradictions_ws_idx on public.knowledge_contradictions (workspace_id);
create trigger touch_updated_at before update on public.knowledge_contradictions
  for each row execute function private.touch_updated_at();

-- Sources ajoutées par un humain à une contradiction.
create table public.contradiction_evidence (
  id               uuid primary key default gen_random_uuid(),
  contradiction_id uuid not null references public.knowledge_contradictions (id) on delete cascade,
  notebook_id      uuid not null references public.notebooks (id) on delete cascade,
  source_id        uuid references public.sources (id) on delete set null,
  note             text check (char_length(note) <= 2000),
  added_by         uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index contradiction_evidence_c_idx on public.contradiction_evidence (contradiction_id);
create index contradiction_evidence_nb_idx on public.contradiction_evidence (notebook_id);
create index contradiction_evidence_src_idx on public.contradiction_evidence (source_id);
create index contradiction_evidence_user_idx on public.contradiction_evidence (added_by);

-- Décisions humaines : append-only, conservées même si la contradiction disparaît (fingerprint + instantané).
create table public.contradiction_reviews (
  id               uuid primary key default gen_random_uuid(),
  contradiction_id uuid references public.knowledge_contradictions (id) on delete set null,
  notebook_id      uuid not null references public.notebooks (id) on delete cascade,
  fingerprint      text not null,
  action           text not null check (action in ('verify', 'confirm', 'reject', 'mark_obsolete', 'resolve', 'reopen', 'note', 'attach_source')),
  previous_status  text,
  new_status       text,
  note             text check (char_length(note) <= 4000),
  snapshot         jsonb not null default '{}',
  user_id          uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index contradiction_reviews_c_idx on public.contradiction_reviews (contradiction_id, created_at desc);
create index contradiction_reviews_fp_idx on public.contradiction_reviews (notebook_id, fingerprint, created_at desc);
create index contradiction_reviews_user_idx on public.contradiction_reviews (user_id);

-- ------------------------------------------------------------------ RLS ------
do $$
declare t text;
begin
  foreach t in array array['knowledge_entities','knowledge_entity_aliases','knowledge_mentions','knowledge_relations',
    'knowledge_claims','knowledge_evidence','knowledge_merges','knowledge_source_state','knowledge_contradictions',
    'contradiction_evidence','contradiction_reviews']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.notebook_role(notebook_id) >= ''viewer'')', t || '_read', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ------------------------------------------------------- maintenance --------
-- Supprime ce qui n'est plus justifié par aucune source et recalcule les compteurs.
create function private.prune_knowledge(p_notebook uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.knowledge_relations r
   where r.notebook_id = p_notebook
     and not exists (select 1 from public.knowledge_evidence e where e.relation_id = r.id);
  delete from public.knowledge_entities k
   where k.notebook_id = p_notebook
     and not exists (select 1 from public.knowledge_mentions m where m.entity_id = k.id);
  update public.knowledge_entities k
     set mention_count = s.n, source_count = s.sources, first_seen_at = s.first_at, last_seen_at = s.last_at
    from (select m.entity_id, count(*) as n, count(distinct m.source_id) as sources,
                 min(m.created_at) as first_at, max(m.created_at) as last_at
            from public.knowledge_mentions m where m.notebook_id = p_notebook group by m.entity_id) s
   where k.id = s.entity_id
     and (k.mention_count, k.source_count, k.first_seen_at, k.last_seen_at) is distinct from (s.n, s.sources, s.first_at, s.last_at);
  update public.knowledge_relations r
     set evidence_count = s.n, source_count = s.sources
    from (select e.relation_id, count(*) as n, count(distinct e.source_id) as sources
            from public.knowledge_evidence e where e.notebook_id = p_notebook group by e.relation_id) s
   where r.id = s.relation_id and (r.evidence_count, r.source_count) is distinct from (s.n, s.sources);
end $$;

-- Source supprimée : les mentions/preuves/affirmations partent en cascade, puis on élague.
-- Une entité encore citée par une autre source est conservée.
create function private.sources_prune_knowledge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- suppression du notebook entier : tout part en cascade, inutile d'élaguer source par source
  if exists (select 1 from public.notebooks where id = old.notebook_id) then
    perform private.prune_knowledge(old.notebook_id);
  end if;
  return null;
end $$;
-- nom en minuscules : s'exécute après les triggers de cascade « RI_ConstraintTrigger_* »
create trigger zz_sources_prune_knowledge after delete on public.sources
  for each row execute function private.sources_prune_knowledge();

-- Résolution d'un alias normalisé vers une entité du notebook.
create function private.knowledge_find_entity(p_notebook uuid, p_group text, p_key text) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select id from public.knowledge_entities where notebook_id = p_notebook and type_group = p_group and normalized_key = p_key),
    (select entity_id from public.knowledge_entity_aliases where notebook_id = p_notebook and type_group = p_group and normalized = p_key))
$$;

-- Remplace atomiquement tout ce qu'une source apporte au graphe (ré-extraction idempotente).
-- p_payload : {entities:[{key,type,type_group,name,description,confidence,properties,aliases:[{alias,normalized}],
--               mentions:[{chunk_id,surface,quote,char_start,char_end,page}]}],
--              relations:[{source_key,source_group,target_key,target_group,type,description,assertion,confidence,
--               valid_from,valid_to,evidence:[{chunk_id,quote,char_start,char_end,page}]}],
--              claims:[{subject_key,subject_group,attribute,attribute_label,value_text,value_type,value_norm,context,
--               observed_at,confidence,chunk_id,quote,char_start,char_end,page}], dropped:int}
create function public.replace_source_knowledge(p_source uuid, p_payload jsonb, p_model text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.sources; v_e jsonb; v_a jsonb; v_m jsonb; v_r jsonb; v_c jsonb; v_id uuid; v_src_id uuid; v_tgt_id uuid;
  v_rel uuid; n_ent int := 0; n_rel int := 0; n_claim int := 0;
begin
  select * into v_src from public.sources where id = p_source;
  if not found then raise exception 'source_not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_src.notebook_id::text, 2));  -- résolution sans course
  delete from public.knowledge_mentions where source_id = p_source;
  delete from public.knowledge_evidence where source_id = p_source;
  delete from public.knowledge_claims where source_id = p_source;

  for v_e in select * from jsonb_array_elements(coalesce(p_payload -> 'entities', '[]')) loop
    v_id := private.knowledge_find_entity(v_src.notebook_id, v_e ->> 'type_group', v_e ->> 'key');
    if v_id is null then
      for v_a in select * from jsonb_array_elements(coalesce(v_e -> 'aliases', '[]')) loop
        v_id := private.knowledge_find_entity(v_src.notebook_id, v_e ->> 'type_group', v_a ->> 'normalized');
        exit when v_id is not null;
      end loop;
    end if;
    if v_id is null then
      insert into public.knowledge_entities (workspace_id, notebook_id, type, type_group, name, normalized_key, description, properties, confidence)
           values (v_src.workspace_id, v_src.notebook_id, v_e ->> 'type', v_e ->> 'type_group', left(v_e ->> 'name', 200),
                   v_e ->> 'key', left(nullif(v_e ->> 'description', ''), 1000), coalesce(v_e -> 'properties', '{}'),
                   coalesce((v_e ->> 'confidence')::real, 0.5))
        returning id into v_id;
    else
      update public.knowledge_entities
         set description = coalesce(description, left(nullif(v_e ->> 'description', ''), 1000)),
             properties = coalesce(v_e -> 'properties', '{}') || properties,
             confidence = greatest(confidence, coalesce((v_e ->> 'confidence')::real, 0))
       where id = v_id;
    end if;
    n_ent := n_ent + 1;
    insert into public.knowledge_entity_aliases (entity_id, notebook_id, type_group, alias, normalized)
         values (v_id, v_src.notebook_id, v_e ->> 'type_group', left(v_e ->> 'name', 200), v_e ->> 'key')
    on conflict (notebook_id, type_group, normalized) do nothing;
    for v_a in select * from jsonb_array_elements(coalesce(v_e -> 'aliases', '[]')) loop
      insert into public.knowledge_entity_aliases (entity_id, notebook_id, type_group, alias, normalized)
           values (v_id, v_src.notebook_id, v_e ->> 'type_group', left(v_a ->> 'alias', 200), v_a ->> 'normalized')
      on conflict (notebook_id, type_group, normalized) do nothing;
    end loop;
    for v_m in select * from jsonb_array_elements(coalesce(v_e -> 'mentions', '[]')) loop
      insert into public.knowledge_mentions (entity_id, notebook_id, source_id, chunk_id, surface_form, quote_text, char_start, char_end, page)
           values (v_id, v_src.notebook_id, p_source, (v_m ->> 'chunk_id')::uuid, left(v_m ->> 'surface', 200), left(v_m ->> 'quote', 1500),
                   (v_m ->> 'char_start')::int, (v_m ->> 'char_end')::int, (v_m ->> 'page')::int);
    end loop;
  end loop;

  for v_r in select * from jsonb_array_elements(coalesce(p_payload -> 'relations', '[]')) loop
    v_src_id := private.knowledge_find_entity(v_src.notebook_id, v_r ->> 'source_group', v_r ->> 'source_key');
    v_tgt_id := private.knowledge_find_entity(v_src.notebook_id, v_r ->> 'target_group', v_r ->> 'target_key');
    continue when v_src_id is null or v_tgt_id is null or v_src_id = v_tgt_id;
    insert into public.knowledge_relations (workspace_id, notebook_id, source_entity_id, target_entity_id, type, description,
                                            assertion, confidence, valid_from, valid_to)
         values (v_src.workspace_id, v_src.notebook_id, v_src_id, v_tgt_id, v_r ->> 'type', left(nullif(v_r ->> 'description', ''), 1000),
                 v_r ->> 'assertion', (v_r ->> 'confidence')::real, left(v_r ->> 'valid_from', 40), left(v_r ->> 'valid_to', 40))
    on conflict (notebook_id, source_entity_id, target_entity_id, type) do update
       set assertion = case when public.knowledge_relations.assertion = 'explicit' or excluded.assertion = 'explicit'
                            then 'explicit' else 'inferred' end,
           confidence = greatest(public.knowledge_relations.confidence, excluded.confidence),
           description = coalesce(public.knowledge_relations.description, excluded.description),
           valid_from = coalesce(public.knowledge_relations.valid_from, excluded.valid_from),
           valid_to = coalesce(public.knowledge_relations.valid_to, excluded.valid_to)
    returning id into v_rel;
    n_rel := n_rel + 1;
    for v_m in select * from jsonb_array_elements(coalesce(v_r -> 'evidence', '[]')) loop
      insert into public.knowledge_evidence (notebook_id, relation_id, source_id, chunk_id, quote_text, char_start, char_end, page, stance)
           values (v_src.notebook_id, v_rel, p_source, (v_m ->> 'chunk_id')::uuid, left(v_m ->> 'quote', 1500),
                   (v_m ->> 'char_start')::int, (v_m ->> 'char_end')::int, (v_m ->> 'page')::int, coalesce(v_m ->> 'stance', 'supports'));
    end loop;
  end loop;

  for v_c in select * from jsonb_array_elements(coalesce(p_payload -> 'claims', '[]')) loop
    v_id := private.knowledge_find_entity(v_src.notebook_id, v_c ->> 'subject_group', v_c ->> 'subject_key');
    continue when v_id is null;
    insert into public.knowledge_claims (workspace_id, notebook_id, source_id, subject_entity_id, attribute, attribute_label, value_text,
                                         value_type, value_norm, context, observed_at, confidence, chunk_id, quote_text, char_start, char_end, page)
         values (v_src.workspace_id, v_src.notebook_id, p_source, v_id, v_c ->> 'attribute', left(v_c ->> 'attribute_label', 120),
                 left(v_c ->> 'value_text', 500), v_c ->> 'value_type', coalesce(v_c -> 'value_norm', '{}'), left(nullif(v_c ->> 'context', ''), 500),
                 left(nullif(v_c ->> 'observed_at', ''), 40), (v_c ->> 'confidence')::real, (v_c ->> 'chunk_id')::uuid,
                 left(v_c ->> 'quote', 1500), (v_c ->> 'char_start')::int, (v_c ->> 'char_end')::int, (v_c ->> 'page')::int);
    n_claim := n_claim + 1;
  end loop;

  insert into public.knowledge_source_state (source_id, notebook_id, status, entities, relations, claims, dropped, model, error_code, extracted_at)
       values (p_source, v_src.notebook_id, 'ready', n_ent, n_rel, n_claim, coalesce((p_payload ->> 'dropped')::int, 0), p_model, null, now())
  on conflict (source_id) do update set status = 'ready', entities = excluded.entities, relations = excluded.relations,
       claims = excluded.claims, dropped = excluded.dropped, model = excluded.model, error_code = null, extracted_at = now();
  perform private.prune_knowledge(v_src.notebook_id);
  return jsonb_build_object('entities', n_ent, 'relations', n_rel, 'claims', n_claim);
end $$;

-- Fusion contrôlée de deux entités (action humaine), avec provenance conservée.
create function public.merge_knowledge_entities(p_from uuid, p_into uuid, p_user uuid, p_reason text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_from public.knowledge_entities; v_into public.knowledge_entities; v_r record; v_existing uuid;
begin
  select * into v_from from public.knowledge_entities where id = p_from;
  select * into v_into from public.knowledge_entities where id = p_into;
  if v_from.id is null or v_into.id is null or v_from.notebook_id <> v_into.notebook_id or p_from = p_into then
    raise exception 'invalid_merge' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_into.notebook_id::text, 2));
  insert into public.knowledge_merges (notebook_id, action, target_entity_id, other_entity_id, snapshot, reason, user_id)
       values (v_into.notebook_id, 'merge', p_into, null,
               jsonb_build_object('merged', jsonb_build_object('id', v_from.id, 'name', v_from.name, 'type', v_from.type,
                 'aliases', (select coalesce(jsonb_agg(alias), '[]') from public.knowledge_entity_aliases where entity_id = p_from)),
                 'into', jsonb_build_object('id', v_into.id, 'name', v_into.name, 'type', v_into.type)),
               p_reason, p_user);
  update public.knowledge_mentions set entity_id = p_into where entity_id = p_from;
  update public.knowledge_claims set subject_entity_id = p_into where subject_entity_id = p_from;
  update public.knowledge_contradictions set subject_entity_id = p_into where subject_entity_id = p_from;
  -- les alias passent sur la cible ; ceux d'un autre groupe de types restent résolubles vers elle
  update public.knowledge_entity_aliases a set entity_id = p_into, origin = 'merge', type_group = v_into.type_group
   where a.entity_id = p_from
     and not exists (select 1 from public.knowledge_entity_aliases b
                      where b.notebook_id = a.notebook_id and b.type_group = v_into.type_group and b.normalized = a.normalized);
  for v_r in select * from public.knowledge_relations where source_entity_id = p_from or target_entity_id = p_from loop
    if (case when v_r.source_entity_id = p_from then p_into else v_r.source_entity_id end)
       = (case when v_r.target_entity_id = p_from then p_into else v_r.target_entity_id end) then
      delete from public.knowledge_relations where id = v_r.id;   -- relation devenue réflexive
      continue;
    end if;
    select id into v_existing from public.knowledge_relations
     where notebook_id = v_r.notebook_id and type = v_r.type
       and source_entity_id = case when v_r.source_entity_id = p_from then p_into else v_r.source_entity_id end
       and target_entity_id = case when v_r.target_entity_id = p_from then p_into else v_r.target_entity_id end;
    if v_existing is not null then
      update public.knowledge_evidence set relation_id = v_existing where relation_id = v_r.id;
      delete from public.knowledge_relations where id = v_r.id;
    else
      update public.knowledge_relations
         set source_entity_id = case when source_entity_id = p_from then p_into else source_entity_id end,
             target_entity_id = case when target_entity_id = p_from then p_into else target_entity_id end
       where id = v_r.id;
    end if;
  end loop;
  delete from public.knowledge_entities where id = p_from;
  perform private.prune_knowledge(v_into.notebook_id);
  return p_into;
end $$;

-- Séparation manuelle : un alias (et les mentions écrites sous cette forme) devient une entité distincte.
create function public.split_knowledge_alias(p_entity uuid, p_alias_id uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_ent public.knowledge_entities; v_alias public.knowledge_entity_aliases; v_new uuid;
begin
  select * into v_ent from public.knowledge_entities where id = p_entity;
  select * into v_alias from public.knowledge_entity_aliases where id = p_alias_id and entity_id = p_entity;
  if v_ent.id is null or v_alias.id is null or v_alias.normalized = v_ent.normalized_key then
    raise exception 'invalid_split' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_ent.notebook_id::text, 2));
  insert into public.knowledge_entities (workspace_id, notebook_id, type, type_group, name, normalized_key, confidence)
       values (v_ent.workspace_id, v_ent.notebook_id, v_ent.type, v_ent.type_group, v_alias.alias, v_alias.normalized, v_ent.confidence)
    returning id into v_new;
  update public.knowledge_entity_aliases set entity_id = v_new, origin = 'manual' where id = p_alias_id;
  update public.knowledge_mentions m set entity_id = v_new
   where m.entity_id = p_entity and lower(private.f_unaccent(m.surface_form)) = lower(private.f_unaccent(v_alias.alias));
  insert into public.knowledge_merges (notebook_id, action, target_entity_id, other_entity_id, snapshot, user_id)
       values (v_ent.notebook_id, 'split', p_entity, v_new,
               jsonb_build_object('from', jsonb_build_object('id', v_ent.id, 'name', v_ent.name), 'alias', v_alias.alias), p_user);
  perform private.prune_knowledge(v_ent.notebook_id);
  return v_new;
end $$;

-- Enregistre le résultat d'une analyse des contradictions. Les statuts humains sont restaurés via
-- le fingerprint ; les cas ouverts qui ne sont plus détectés sont retirés, jamais les cas revus.
-- p_items : [{fingerprint,subject_entity_id,attribute,category,kind,claim_a_id,claim_b_id,explanation,confidence,detector}]
create function public.replace_contradictions(p_notebook uuid, p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_i jsonb; v_status text; v_n int := 0;
begin
  select workspace_id into v_ws from public.notebooks where id = p_notebook;
  if v_ws is null then raise exception 'notebook_not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_notebook::text, 3));
  delete from public.knowledge_contradictions
   where notebook_id = p_notebook and status = 'open'
     and fingerprint not in (select x ->> 'fingerprint' from jsonb_array_elements(p_items) x);
  for v_i in select * from jsonb_array_elements(p_items) loop
    select new_status into v_status from public.contradiction_reviews
     where notebook_id = p_notebook and fingerprint = v_i ->> 'fingerprint' and new_status is not null
     order by created_at desc limit 1;
    insert into public.knowledge_contradictions (workspace_id, notebook_id, fingerprint, subject_entity_id, attribute, category, kind,
                                                 claim_a_id, claim_b_id, explanation, confidence, detector, status)
         values (v_ws, p_notebook, v_i ->> 'fingerprint', (v_i ->> 'subject_entity_id')::uuid, v_i ->> 'attribute', v_i ->> 'category',
                 v_i ->> 'kind', (v_i ->> 'claim_a_id')::uuid, (v_i ->> 'claim_b_id')::uuid, left(v_i ->> 'explanation', 2000),
                 (v_i ->> 'confidence')::real, coalesce(v_i -> 'detector', '{}'), coalesce(v_status, 'open'))
    on conflict (notebook_id, fingerprint) do update
       set kind = excluded.kind, category = excluded.category, explanation = excluded.explanation, confidence = excluded.confidence,
           detector = excluded.detector, claim_a_id = excluded.claim_a_id, claim_b_id = excluded.claim_b_id,
           subject_entity_id = excluded.subject_entity_id;
    update public.contradiction_reviews r set contradiction_id = c.id
      from public.knowledge_contradictions c
     where c.notebook_id = p_notebook and c.fingerprint = v_i ->> 'fingerprint'
       and r.notebook_id = p_notebook and r.fingerprint = c.fingerprint and r.contradiction_id is null;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Décision humaine : statut + historique dans la même transaction.
create function public.review_contradiction(p_id uuid, p_user uuid, p_action text, p_note text default null,
                                            p_source uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_c public.knowledge_contradictions; v_new text;
begin
  select * into v_c from public.knowledge_contradictions where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_new := case p_action when 'verify' then 'verified' when 'confirm' then 'confirmed' when 'reject' then 'rejected'
                         when 'mark_obsolete' then 'obsolete' when 'resolve' then 'resolved' when 'reopen' then 'open' else null end;
  if p_action not in ('verify', 'confirm', 'reject', 'mark_obsolete', 'resolve', 'reopen', 'note', 'attach_source') then
    raise exception 'invalid_review_action' using errcode = '22023';
  end if;
  if p_action = 'attach_source' then
    if p_source is null or not exists (select 1 from public.sources where id = p_source and notebook_id = v_c.notebook_id) then
      raise exception 'invalid_source' using errcode = '22023';
    end if;
    insert into public.contradiction_evidence (contradiction_id, notebook_id, source_id, note, added_by)
         values (p_id, v_c.notebook_id, p_source, p_note, p_user);
  end if;
  if v_new is not null then
    update public.knowledge_contradictions set status = v_new,
           resolution_note = coalesce(p_note, resolution_note) where id = p_id;
  elsif p_action = 'note' then
    update public.knowledge_contradictions set resolution_note = p_note where id = p_id;
  end if;
  insert into public.contradiction_reviews (contradiction_id, notebook_id, fingerprint, action, previous_status, new_status, note, snapshot, user_id)
       values (p_id, v_c.notebook_id, v_c.fingerprint, p_action, v_c.status, v_new, p_note,
               jsonb_build_object('kind', v_c.kind, 'category', v_c.category, 'attribute', v_c.attribute, 'explanation', v_c.explanation,
                 'claims', (select jsonb_agg(jsonb_build_object('id', k.id, 'value', k.value_text, 'quote', k.quote_text, 'source_id', k.source_id))
                              from public.knowledge_claims k where k.id in (v_c.claim_a_id, v_c.claim_b_id))),
               p_user);
  return coalesce(v_new, v_c.status);
end $$;

-- Graphe borné : les N entités les plus connectées (filtres optionnels) et les relations entre elles.
create function public.knowledge_graph(p_notebook uuid, p_limit int default 150, p_types text[] default null,
                                       p_source uuid default null, p_from timestamptz default null, p_to timestamptz default null,
                                       p_min_confidence real default 0)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with ents as (
    select e.id, e.name, e.type, e.confidence, e.mention_count, e.source_count,
           (select count(*) from public.knowledge_relations r
             where (r.source_entity_id = e.id or r.target_entity_id = e.id) and r.status <> 'rejected') as degree
      from public.knowledge_entities e
     where e.notebook_id = p_notebook
       and (p_types is null or e.type = any (p_types))
       and (p_source is null or exists (select 1 from public.knowledge_mentions m where m.entity_id = e.id and m.source_id = p_source))
       and (p_from is null or e.last_seen_at >= p_from)
       and (p_to is null or e.first_seen_at <= p_to)
     order by degree desc, e.source_count desc, e.mention_count desc, e.name
     limit least(greatest(p_limit, 1), 500)
  ), rels as (
    select r.id, r.source_entity_id, r.target_entity_id, r.type, r.assertion, r.confidence, r.status, r.evidence_count, r.source_count,
           exists (select 1 from public.knowledge_evidence e where e.relation_id = r.id and e.stance = 'contradicts') as contested
      from public.knowledge_relations r
     where r.notebook_id = p_notebook and r.status <> 'rejected' and r.confidence >= p_min_confidence
       and r.source_entity_id in (select id from ents) and r.target_entity_id in (select id from ents)
  )
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(to_jsonb(ents)) from ents), '[]'),
    'edges', coalesce((select jsonb_agg(to_jsonb(rels)) from rels), '[]'),
    'totals', jsonb_build_object(
      'entities', (select count(*) from public.knowledge_entities where notebook_id = p_notebook),
      'relations', (select count(*) from public.knowledge_relations where notebook_id = p_notebook and status <> 'rejected')))
$$;

revoke execute on function public.replace_source_knowledge(uuid, jsonb, text), public.merge_knowledge_entities(uuid, uuid, uuid, text),
                         public.split_knowledge_alias(uuid, uuid, uuid), public.replace_contradictions(uuid, jsonb),
                         public.review_contradiction(uuid, uuid, text, text, uuid),
                         public.knowledge_graph(uuid, int, text[], uuid, timestamptz, timestamptz, real),
                         private.prune_knowledge(uuid), private.knowledge_find_entity(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.replace_source_knowledge(uuid, jsonb, text), public.merge_knowledge_entities(uuid, uuid, uuid, text),
                        public.split_knowledge_alias(uuid, uuid, uuid), public.replace_contradictions(uuid, jsonb),
                        public.review_contradiction(uuid, uuid, text, text, uuid),
                        public.knowledge_graph(uuid, int, text[], uuid, timestamptz, timestamptz, real),
                        private.prune_knowledge(uuid), private.knowledge_find_entity(uuid, text, text)
  to service_role;
