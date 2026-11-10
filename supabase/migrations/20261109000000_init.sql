-- =============================================================================
-- Notebook SaaS — migration initiale (migration 0001, copie de replica/schema.sql)
-- Cible : Supabase Postgres 15+, région UE. Lu par replica/database-schema.md.
-- Conventions :
--   * tables dans `public` (exposées à l'API, toujours sous RLS) ;
--     fonctions d'aide dans `private` (non exposé) ;
--   * uuid + created_at/updated_at timestamptz (UTC) partout, sauf tables de
--     jointure (clé composite) et lignes immuables (chunks, stripe_events) ;
--   * workspace_id / notebook_id dénormalisés sur les données volumineuses
--     pour des policies RLS sans jointure ;
--   * argent en centimes entiers + devise ISO.
-- =============================================================================

create extension if not exists vector;    -- Supabase : with schema extensions
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create schema if not exists private;

-- ---------------------------------------------------------------- enums ------
create type public.workspace_kind      as enum ('personal', 'team');
create type public.workspace_role      as enum ('member', 'admin', 'owner');
-- l'ordre compte : comparaisons `>=` dans les policies
create type public.notebook_role       as enum ('chat', 'viewer', 'editor', 'owner');
create type public.link_scope          as enum ('full', 'chat_only', 'artifact');
create type public.source_kind         as enum ('pdf', 'docx', 'txt', 'md', 'csv', 'pptx', 'epub',
                                                'image', 'audio', 'video', 'web', 'youtube',
                                                'text', 'gdrive', 'note');
create type public.source_status       as enum ('pending', 'processing', 'ready', 'failed', 'inactive');
create type public.artifact_type       as enum ('report', 'data_table', 'mind_map', 'flashcards', 'quiz',
                                                'audio', 'video', 'slide_deck', 'infographic');
create type public.artifact_status     as enum ('queued', 'scheduled', 'generating', 'outline_ready',
                                                'ready', 'failed', 'cancelled');
create type public.job_kind            as enum ('ingest_source', 'sync_source', 'source_guide', 'auto_label',
                                                'notebook_overview', 'generate_artifact', 'research',
                                                'copy_notebook', 'export_account', 'delete_account',
                                                'purge_storage');
create type public.job_status          as enum ('queued', 'running', 'waiting_user', 'succeeded',
                                                'failed', 'cancelled');
create type public.usage_status        as enum ('reserved', 'committed', 'refunded');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled',
                                                'incomplete', 'unpaid');

-- -------------------------------------------------------------- helpers ------
create function private.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- unaccent n'est pas IMMUTABLE : enveloppe pour index et tsvector
create function private.f_unaccent(text) returns text
language sql immutable strict parallel safe
set search_path = pg_catalog, public, extensions
as $$ select unaccent('unaccent'::regdictionary, $1) $$;

-- ---------------------------------------------------------------- plans ------
create table public.plans (
  id               text primary key,                    -- 'free', 'plus', 'pro', 'team'
  name             text not null,
  price_cents      integer not null check (price_cents >= 0),
  currency         char(3) not null default 'EUR',
  billing_interval text not null check (billing_interval in ('none', 'month', 'year')),
  stripe_price_id  text unique,
  -- {"monthly_credits":300,"daily":{"chat":50,"audio":3},"credit_cost":{"chat":1,"audio":20},
  --  "max_notebooks":100,"max_sources_per_notebook":50,"max_members_per_notebook":50}
  limits           jsonb not null,
  is_public        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------- users & workspaces ----
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text check (char_length(display_name) <= 120),
  avatar_path       text,
  locale            text not null default 'fr',
  output_language   text not null default 'fr',
  theme             text not null default 'system' check (theme in ('light', 'dark', 'system')),
  web_notifications boolean not null default false,
  dashboard_view    text not null default 'list' check (dashboard_view in ('grid', 'list')),
  adult_verified_at timestamptz,                         -- fonctions 18+
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.workspaces (
  id                 uuid primary key default gen_random_uuid(),
  kind               public.workspace_kind not null default 'personal',
  name               text not null check (char_length(name) between 1 and 120),
  owner_id           uuid not null references auth.users (id) on delete cascade,
  plan_id            text not null default 'free' references public.plans (id) on delete restrict,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index workspaces_one_personal on public.workspaces (owner_id) where kind = 'personal';
create index workspaces_plan_idx on public.workspaces (plan_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.workspace_role not null default 'member',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ------------------------------------------------------------ notebooks -----
create table public.notebooks (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  created_by          uuid references auth.users (id) on delete set null,
  title               text not null default '' check (char_length(title) <= 200),
  emoji               text check (char_length(emoji) <= 16),
  overview            text,                              -- résumé de toutes les sources (S08)
  suggested_questions jsonb not null default '[]',
  chat_style          text not null default 'default'
                        check (chat_style in ('default', 'learning_guide', 'custom')),
  chat_custom_prompt  text check (char_length(chat_custom_prompt) <= 4000),
  response_length     text not null default 'default' check (response_length in ('short', 'default', 'long')),
  output_language     text,                              -- null = langue du profil
  allow_copies        boolean not null default false,
  is_featured         boolean not null default false,
  last_activity_at    timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index notebooks_workspace_activity_idx on public.notebooks (workspace_id, last_activity_at desc);
create index notebooks_created_by_idx on public.notebooks (created_by);
create index notebooks_title_trgm on public.notebooks
  using gin (private.f_unaccent(lower(title)) gin_trgm_ops);
create index notebooks_featured_idx on public.notebooks (is_featured) where is_featured;

create table public.notebook_members (
  id            uuid primary key default gen_random_uuid(),
  notebook_id   uuid not null references public.notebooks (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete cascade,     -- null tant que l'invité n'a pas de compte
  invited_email text check (invited_email = lower(invited_email) and invited_email like '%_@_%'),
  role          public.notebook_role not null check (role in ('viewer', 'editor')),
  invited_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (user_id is not null or invited_email is not null)
);
create unique index notebook_members_user_uq on public.notebook_members (notebook_id, user_id) where user_id is not null;
create unique index notebook_members_email_uq on public.notebook_members (notebook_id, invited_email) where invited_email is not null;
create index notebook_members_user_idx on public.notebook_members (user_id);
create index notebook_members_email_idx on public.notebook_members (invited_email) where user_id is null;

create table public.collections (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_owner_idx on public.collections (owner_id);

create table public.collection_notebooks (
  collection_id uuid not null references public.collections (id) on delete cascade,
  notebook_id   uuid not null references public.notebooks (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, notebook_id)
);
create index collection_notebooks_nb_idx on public.collection_notebooks (notebook_id);

-- --------------------------------------------------------------- sources ----
create table public.source_labels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  origin       text not null default 'manual' check (origin in ('auto', 'manual')),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index source_labels_nb_idx on public.source_labels (notebook_id, position);
create index source_labels_ws_idx on public.source_labels (workspace_id);

create table public.sources (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  notebook_id        uuid not null references public.notebooks (id) on delete cascade,
  created_by         uuid references auth.users (id) on delete set null,
  kind               public.source_kind not null,
  title              text not null check (char_length(title) between 1 and 300),
  status             public.source_status not null default 'pending',
  error_code         text,                                -- 'too_large','too_many_words','protected_pdf','paywall',...
  origin_url         text check (origin_url ~* '^https?://'),
  external_ref       jsonb not null default '{}',         -- {"drive_file_id":..,"etag":..}
  storage_path       text,                                -- {workspace}/{notebook}/{source}/original.ext
  mime_type          text,
  size_bytes         bigint check (size_bytes between 0 and 209715200),   -- 200 Mo
  content_sha256     bytea,
  language           text,                                -- BCP-47 détecté
  fts_config         regconfig not null default 'simple',
  word_count         integer check (word_count between 0 and 500000),
  page_count         integer check (page_count >= 0),
  duration_ms        integer check (duration_ms >= 0),
  extracted_text     text,                                -- texte normalisé : base des offsets de citation
  note_body          jsonb,                               -- kind = 'note' : document éditeur
  note_has_citations boolean not null default false,      -- vrai = édition verrouillée (comportement original)
  guide              jsonb,                               -- Source Guide : {"summary":..,"topics":[..]}
  label_id           uuid references public.source_labels (id) on delete set null,
  synced_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((kind = 'note') = (note_body is not null))
);
create index sources_nb_idx on public.sources (notebook_id, created_at);
create index sources_ws_idx on public.sources (workspace_id);
create index sources_label_idx on public.sources (label_id);
create index sources_created_by_idx on public.sources (created_by);
create index sources_status_idx on public.sources (status) where status in ('pending', 'processing');
create index sources_hash_idx on public.sources (notebook_id, content_sha256) where content_sha256 is not null;

-- sélection personnelle : on stocke ce qui est DÉcoché (défaut = tout coché)
create table public.source_deselections (
  user_id     uuid not null references auth.users (id) on delete cascade,
  source_id   uuid not null references public.sources (id) on delete cascade,
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, source_id)
);
create index source_deselections_nb_idx on public.source_deselections (notebook_id, user_id);
create index source_deselections_src_idx on public.source_deselections (source_id);

-- immuable : régénéré en bloc à chaque (ré)ingestion, donc pas d'updated_at
create table public.chunks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  notebook_id     uuid not null references public.notebooks (id) on delete cascade,
  source_id       uuid not null references public.sources (id) on delete cascade,
  ordinal         integer not null check (ordinal >= 0),
  content         text not null,
  char_start      integer not null check (char_start >= 0),
  char_end        integer not null,
  page_start      integer,
  page_end        integer,
  time_start_ms   integer,
  time_end_ms     integer,
  heading_path    text[] not null default '{}',
  token_count     integer not null check (token_count > 0),
  fts             tsvector not null,                       -- to_tsvector(source.fts_config, f_unaccent(content)) écrit par le worker
  embedding       halfvec(1024),                           -- null tant que non embeddé
  embedding_model text,                                    -- permet un ré-embedding progressif
  created_at      timestamptz not null default now(),
  check (char_end > char_start),
  unique (source_id, ordinal)
);
create index chunks_nb_idx on public.chunks (notebook_id, source_id);
create index chunks_ws_idx on public.chunks (workspace_id);
create index chunks_fts_idx on public.chunks using gin (fts);
-- Pas d'index HNSW au MVP : scan exact filtré par notebook (rappel 100 %).
-- À ajouter quand un notebook dépasse ~20k chunks, avec hnsw.iterative_scan :
-- create index chunks_embedding_hnsw on public.chunks using hnsw (embedding halfvec_cosine_ops);

-- ------------------------------------------------------------------ chat ----
create table public.conversations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text check (char_length(title) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index conversations_nb_user_idx on public.conversations (notebook_id, user_id, updated_at desc);
create index conversations_user_idx on public.conversations (user_id);
create index conversations_ws_idx on public.conversations (workspace_id);

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  notebook_id     uuid not null references public.notebooks (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null default '',
  status          text not null default 'complete'
                    check (status in ('streaming', 'complete', 'stopped', 'refused', 'failed')),
  source_ids      uuid[] not null default '{}',            -- contexte au moment de la question
  model           text,
  usage           jsonb,                                   -- tokens in/out/cache
  feedback        smallint check (feedback in (-1, 1)),
  feedback_reason text check (char_length(feedback_reason) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index chat_messages_conv_idx on public.chat_messages (conversation_id, created_at);
create index chat_messages_nb_idx on public.chat_messages (notebook_id, created_at);   -- analytics H06
create index chat_messages_user_idx on public.chat_messages (user_id);
create index chat_messages_ws_idx on public.chat_messages (workspace_id);

-- --------------------------------------------------------------- studio -----
create table public.artifacts (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  notebook_id      uuid not null references public.notebooks (id) on delete cascade,
  created_by       uuid references auth.users (id) on delete set null,
  type             public.artifact_type not null,
  title            text not null default '' check (char_length(title) <= 300),
  status           public.artifact_status not null default 'queued',
  options          jsonb not null default '{}',             -- format, langue, longueur, difficulté...
  custom_prompt    text check (char_length(custom_prompt) <= 4000),
  source_ids       uuid[] not null default '{}',            -- instantané : la source peut disparaître
  outline          jsonb,                                   -- plan / producer notes (revue)
  outline_feedback text check (char_length(outline_feedback) <= 8000),
  content          jsonb,                                   -- rapport, cartes, arbre, slides (JSON validé)
  storage_path     text,                                    -- mp3 / mp4 / png / pptx
  mime_type        text,
  duration_ms      integer check (duration_ms >= 0),
  parent_id        uuid references public.artifacts (id) on delete set null,  -- révision de deck
  auto_generated   boolean not null default false,
  error_code       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index artifacts_nb_idx on public.artifacts (notebook_id, created_at desc);
create index artifacts_ws_idx on public.artifacts (workspace_id);
create index artifacts_parent_idx on public.artifacts (parent_id);
create index artifacts_created_by_idx on public.artifacts (created_by);

create table public.citations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  message_id   uuid references public.chat_messages (id) on delete cascade,
  artifact_id  uuid references public.artifacts (id) on delete cascade,
  note_id      uuid references public.sources (id) on delete cascade,      -- note (kind='note') qui cite
  marker       smallint not null check (marker > 0),                       -- n° affiché [1], [2]...
  chunk_id     uuid references public.chunks (id) on delete set null,      -- null si source ré-ingérée/supprimée
  source_id    uuid references public.sources (id) on delete set null,
  quote_text   text not null,                                              -- reste lisible après suppression
  char_start   integer,
  char_end     integer,
  verified     boolean not null,                                           -- quote ⊂ chunk vérifié côté serveur
  created_at   timestamptz not null default now(),
  check (num_nonnulls(message_id, artifact_id, note_id) = 1),
  check (char_end is null or char_end > char_start)
);
create index citations_message_idx on public.citations (message_id);
create index citations_artifact_idx on public.citations (artifact_id);
create index citations_note_idx on public.citations (note_id);
create index citations_chunk_idx on public.citations (chunk_id);
create index citations_source_idx on public.citations (source_id);
create index citations_nb_idx on public.citations (notebook_id);
create index citations_ws_idx on public.citations (workspace_id);

create table public.artifact_reads (                       -- point bleu « non lu »
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (artifact_id, user_id)
);
create index artifact_reads_user_idx on public.artifact_reads (user_id);

create table public.study_progress (                       -- flashcards / quiz
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_key    text not null,
  state       text not null check (state in ('unseen', 'got_it', 'missed', 'correct', 'wrong')),
  answer      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (artifact_id, user_id, item_key)
);
create index study_progress_user_idx on public.study_progress (user_id);

-- -------------------------------------------------------------- partage -----
create table public.share_links (
  id          uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  artifact_id uuid references public.artifacts (id) on delete cascade,
  scope       public.link_scope not null,
  token_hash  bytea not null unique,                     -- sha256 du jeton ; le jeton n'est jamais stocké
  created_by  uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((scope = 'artifact') = (artifact_id is not null))
);
create index share_links_nb_idx on public.share_links (notebook_id) where revoked_at is null;
create index share_links_artifact_idx on public.share_links (artifact_id);
create index share_links_created_by_idx on public.share_links (created_by);

create table public.notebook_visits (                      -- notebook public ajouté à l'accueil
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  via_link_id uuid not null references public.share_links (id) on delete cascade,
  hidden      boolean not null default false,             -- « Retirer de l'accueil »
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (notebook_id, user_id)
);
create index notebook_visits_user_idx on public.notebook_visits (user_id);
create index notebook_visits_link_idx on public.notebook_visits (via_link_id);

-- ----------------------------------------------------------------- jobs -----
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  notebook_id      uuid references public.notebooks (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  kind             public.job_kind not null,
  target_id        uuid,                                  -- source ou artefact concerné
  status           public.job_status not null default 'queued',
  priority         smallint not null default 100,         -- plus petit = plus urgent ; plans payants < 100
  payload          jsonb not null default '{}',
  result           jsonb,
  progress         smallint not null default 0 check (progress between 0 and 100),
  stage            text,                                  -- 'extracting','embedding','writing_script'...
  attempts         smallint not null default 0,
  max_attempts     smallint not null default 3,
  run_after        timestamptz not null default now(),    -- « Générer plus tard », backoff
  locked_by        text,
  locked_until     timestamptz,                           -- bail ; prolongé par heartbeat
  idempotency_key  text unique,
  error_code       text,
  error_message    text,
  cancel_requested boolean not null default false,
  usage_id         uuid,                                  -- réservation de quota à régler
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index jobs_claim_idx on public.jobs (priority, run_after) where status = 'queued';
create index jobs_lease_idx on public.jobs (locked_until) where status = 'running';
create index jobs_nb_idx on public.jobs (notebook_id, created_at desc);
create index jobs_ws_idx on public.jobs (workspace_id);
create index jobs_user_idx on public.jobs (user_id);
create index jobs_target_idx on public.jobs (target_id);

-- -------------------------------------------------- quotas & facturation ----
create table public.usage_ledger (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  job_id       uuid references public.jobs (id) on delete set null,
  feature      text not null,                           -- 'chat','audio','report','research'...
  units        integer not null check (units > 0),      -- crédits
  status       public.usage_status not null default 'reserved',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index usage_ledger_ws_feature_idx on public.usage_ledger (workspace_id, feature, created_at);
create index usage_ledger_ws_created_idx on public.usage_ledger (workspace_id, created_at);
create index usage_ledger_job_idx on public.usage_ledger (job_id);
create index usage_ledger_user_idx on public.usage_ledger (user_id);
alter table public.jobs add constraint jobs_usage_fk
  foreign key (usage_id) references public.usage_ledger (id) on delete set null;
create index jobs_usage_idx on public.jobs (usage_id);

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null unique references public.workspaces (id) on delete cascade,
  plan_id                text not null references public.plans (id) on delete restrict,
  stripe_subscription_id text not null unique,
  status                 public.subscription_status not null,
  seats                  integer not null default 1 check (seats > 0),
  current_period_end     timestamptz not null,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index subscriptions_plan_idx on public.subscriptions (plan_id);

create table public.stripe_events (                      -- idempotence des webhooks
  id           text primary key,                          -- evt_... (clé naturelle Stripe)
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- ----------------------------------------------------- modération, audit ----
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references auth.users (id) on delete set null,
  kind            text not null check (kind in ('feedback', 'abuse')),
  category        text,
  notebook_id     uuid references public.notebooks (id) on delete set null,
  artifact_id     uuid references public.artifacts (id) on delete set null,
  message_id      uuid references public.chat_messages (id) on delete set null,
  body            text check (char_length(body) <= 5000),
  screenshot_path text,
  status          text not null default 'open' check (status in ('open', 'triaged', 'closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_status_idx on public.reports (status, created_at);
create index reports_nb_idx on public.reports (notebook_id);
create index reports_artifact_idx on public.reports (artifact_id);
create index reports_message_idx on public.reports (message_id);

create table public.audit_log (                          -- append-only
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  action       text not null,                             -- 'notebook.share','member.remove','source.delete'...
  target_type  text,
  target_id    uuid,
  meta         jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index audit_log_ws_idx on public.audit_log (workspace_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);

-- ------------------------------------------------------- updated_at -------
do $$
declare t text;
begin
  foreach t in array array['plans','profiles','workspaces','workspace_members','notebooks',
    'notebook_members','collections','source_labels','sources','conversations','chat_messages',
    'artifacts','study_progress','share_links','notebook_visits','jobs','usage_ledger',
    'subscriptions','reports']
  loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------- fonctions d'accès -------
create function private.workspace_role(p_ws uuid) returns public.workspace_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m
  where m.workspace_id = p_ws and m.user_id = auth.uid()
$$;

-- LA fonction d'autorisation : toutes les policies notebook passent par elle.
create function private.notebook_role(p_nb uuid) returns public.notebook_role
language sql stable security definer set search_path = '' as $$
  select max(r) from (
    -- membres du workspace : owner/admin ou créateur = owner, membre simple = editor
    select case when m.role in ('owner', 'admin') or n.created_by = auth.uid()
                then 'owner'::public.notebook_role else 'editor'::public.notebook_role end
      from public.notebooks n
      join public.workspace_members m on m.workspace_id = n.workspace_id and m.user_id = auth.uid()
     where n.id = p_nb
    union all
    -- partage individuel
    select nm.role from public.notebook_members nm
     where nm.notebook_id = p_nb and nm.user_id = auth.uid()
    union all
    -- lien public déjà ouvert (visite enregistrée via accept_share_link)
    select case l.scope when 'full' then 'viewer'::public.notebook_role else 'chat'::public.notebook_role end
      from public.notebook_visits v
      join public.share_links l on l.id = v.via_link_id
     where v.notebook_id = p_nb and v.user_id = auth.uid()
       and l.revoked_at is null and l.scope in ('full', 'chat_only')
  ) s(r)
$$;

grant usage on schema private to authenticated;
grant execute on function private.workspace_role(uuid), private.notebook_role(uuid) to authenticated;

-- Point d'entrée du contrôle d'autorisation des Route Handlers : appelé avec le JWT
-- de l'utilisateur (le schéma `private` n'est pas exposé par PostgREST, et en
-- service_role auth.uid() est null).
create function public.my_notebook_role(p_nb uuid) returns public.notebook_role
language sql stable security invoker set search_path = '' as $$ select private.notebook_role(p_nb) $$;
grant execute on function public.my_notebook_role(uuid) to authenticated;

-- -------------------------------------------------- inscription -------------
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  insert into public.profiles (id) values (new.id);
  insert into public.workspaces (kind, name, owner_id)
       values ('personal', 'Personnel', new.id) returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, new.id, 'owner');
  -- invitations en attente pour cet email
  update public.notebook_members
     set user_id = new.id, invited_email = null
   where invited_email = lower(new.email) and user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- --------------------------------------------------------------- RPC --------
-- Ouvrir un lien public : enregistre la visite (le jeton n'est jamais stocké en clair).
create function public.accept_share_link(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_link public.share_links;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = '28000'; end if;
  select * into v_link from public.share_links
   where token_hash = sha256(convert_to(p_token, 'UTF8')) and revoked_at is null and scope <> 'artifact';
  if not found then raise exception 'link_invalid' using errcode = 'P0002'; end if;
  insert into public.notebook_visits (notebook_id, user_id, via_link_id)
       values (v_link.notebook_id, auth.uid(), v_link.id)
  on conflict (notebook_id, user_id) do update set via_link_id = excluded.via_link_id, hidden = false;
  return v_link.notebook_id;
end $$;

-- Recherche hybride : vecteur (scan exact) + plein texte, fusion RRF (k = 60).
-- Réservée au serveur (service_role) : il vérifie notebook_role AVANT l'appel et ne
-- renvoie au client que les passages cités. Exposée aux clients, elle permettrait
-- au rôle 'chat' d'extraire tout le corpus en boucle.
create function public.match_chunks(
  p_notebook   uuid,
  p_embedding  halfvec(1024),
  p_query      text,
  p_fts_config regconfig,
  p_source_ids uuid[],
  p_k          integer default 30
) returns table (chunk_id uuid, source_id uuid, content text, char_start integer, char_end integer,
                 page_start integer, time_start_ms integer, score double precision)
language plpgsql stable security invoker set search_path = pg_catalog, public, extensions as $$
begin
  return query
  with vec as (
    select c.id, row_number() over (order by c.embedding <=> p_embedding) as r
      from public.chunks c
     where c.notebook_id = p_notebook and c.source_id = any (p_source_ids) and c.embedding is not null
     order by c.embedding <=> p_embedding
     limit 60
  ), kw as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q) desc) as r
      from public.chunks c,
           websearch_to_tsquery(p_fts_config, private.f_unaccent(p_query)) q
     where c.notebook_id = p_notebook and c.source_id = any (p_source_ids) and c.fts @@ q
     order by ts_rank_cd(c.fts, q) desc
     limit 60
  ), fused as (
    select coalesce(vec.id, kw.id) as id,
           coalesce(1.0 / (60 + vec.r), 0) + coalesce(1.0 / (60 + kw.r), 0) as s
      from vec full join kw on vec.id = kw.id
  )
  select c.id, c.source_id, c.content, c.char_start, c.char_end, c.page_start, c.time_start_ms, f.s::double precision
    from fused f join public.chunks c on c.id = f.id
   order by f.s desc
   limit p_k;
end $$;

-- Quotas : réservation atomique (verrou consultatif par workspace).
-- Appelée uniquement par le serveur / worker (service_role).
create function public.reserve_usage(p_ws uuid, p_user uuid, p_feature text, p_job uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb; v_cost int; v_daily int; v_monthly int; v_used int; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ws::text, 0));
  select p.limits into v_limits
    from public.workspaces w join public.plans p on p.id = w.plan_id where w.id = p_ws;
  if v_limits is null then raise exception 'workspace_not_found' using errcode = 'P0002'; end if;
  v_cost  := coalesce((v_limits -> 'credit_cost' ->> p_feature)::int, 1);
  v_daily := (v_limits -> 'daily' ->> p_feature)::int;
  if v_daily is not null then
    select count(*) into v_used from public.usage_ledger
     where workspace_id = p_ws and feature = p_feature and status <> 'refunded'
       and created_at >= date_trunc('day', now());
    if v_used >= v_daily then raise exception 'quota_daily_exceeded' using errcode = 'P0001'; end if;
  end if;
  v_monthly := (v_limits ->> 'monthly_credits')::int;
  if v_monthly is not null then
    select coalesce(sum(units), 0) into v_used from public.usage_ledger
     where workspace_id = p_ws and status <> 'refunded'
       and created_at >= date_trunc('month', now());
    if v_used + v_cost > v_monthly then raise exception 'quota_monthly_exceeded' using errcode = 'P0001'; end if;
  end if;
  insert into public.usage_ledger (workspace_id, user_id, job_id, feature, units)
       values (p_ws, p_user, p_job, p_feature, v_cost) returning id into v_id;
  return v_id;
end $$;

create function public.settle_usage(p_id uuid, p_status public.usage_status) returns void
language sql security definer set search_path = '' as $$
  update public.usage_ledger set status = p_status where id = p_id and status = 'reserved'
$$;

-- File de jobs : réclamation concurrente sans double traitement.
create function public.claim_jobs(p_worker text, p_kinds public.job_kind[], p_limit int default 1,
                                  p_lease_seconds int default 60)
returns setof public.jobs
language sql security definer set search_path = '' as $$
  update public.jobs j
     set status = 'running', locked_by = p_worker,
         locked_until = now() + make_interval(secs => p_lease_seconds),
         attempts = j.attempts + 1, started_at = coalesce(j.started_at, now())
   where j.id in (
     select id from public.jobs
      where status = 'queued' and run_after <= now() and kind = any (p_kinds)
      order by priority, run_after
      for update skip locked
      limit p_limit)
  returning j.*
$$;

-- Bail expiré (worker mort) : remise en file avec backoff, ou échec définitif après
-- max_attempts. L'échec rembourse le quota et passe la source / l'artefact en 'failed'.
-- pg_cron chaque minute.
create function public.requeue_stale_jobs() returns integer
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
     where id in (select usage_id from dead) and status = 'reserved'
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

-- fts calculé en base : un insert PostgREST ne peut pas appeler to_tsvector
create function private.chunks_set_fts() returns trigger
language plpgsql set search_path = pg_catalog, public, extensions as $$
begin
  new.fts := to_tsvector((select s.fts_config from public.sources s where s.id = new.source_id),
                         private.f_unaccent(new.content));
  return new;
end $$;
create trigger chunks_set_fts before insert on public.chunks
  for each row execute function private.chunks_set_fts();

-- (Ré)ingestion atomique : remplace tous les chunks d'une source et la passe en 'ready'.
-- p_chunks = [{"ordinal":0,"content":"..","char_start":0,"char_end":120,"page_start":1,
--              "heading_path":["..."],"token_count":95,"embedding":"[0.1,...]","embedding_model":".."}]
create function public.replace_chunks(p_source uuid, p_chunks jsonb, p_extracted_text text,
                                      p_language text, p_fts_config regconfig, p_word_count int,
                                      p_page_count int default null)
returns integer
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_src public.sources; v_n int;
begin
  update public.sources set extracted_text = p_extracted_text, language = p_language,
         fts_config = p_fts_config, word_count = p_word_count, page_count = p_page_count
   where id = p_source returning * into v_src;
  if not found then raise exception 'source_not_found' using errcode = 'P0002'; end if;
  delete from public.chunks where source_id = p_source;
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
  update public.sources set status = 'ready', error_code = null where id = p_source;
  return v_n;
end $$;

-- Ajout de source atomique : plafond de sources vérifié sous verrou + job d'ingestion.
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

-- Génération Studio atomique : artefact + job + quota réservé, ou rien.
create function public.create_artifact(p_notebook uuid, p_user uuid, p_type public.artifact_type,
                                       p_options jsonb, p_custom_prompt text, p_source_ids uuid[],
                                       p_run_after timestamptz default now(), p_idempotency_key text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_existing uuid; v_art uuid; v_job uuid; v_usage uuid;
begin
  if p_idempotency_key is not null then
    -- clé préfixée côté serveur : '{user}:{notebook}:{clé client}' ; on revérifie la portée
    select target_id into v_existing from public.jobs
     where idempotency_key = p_idempotency_key and notebook_id = p_notebook and user_id = p_user;
    if found then return v_existing; end if;                 -- double clic : même artefact
  end if;
  select workspace_id into v_ws from public.notebooks where id = p_notebook;
  if v_ws is null then raise exception 'notebook_not_found' using errcode = 'P0002'; end if;
  insert into public.artifacts (workspace_id, notebook_id, created_by, type, options, custom_prompt,
                                source_ids, status)
       values (v_ws, p_notebook, p_user, p_type, coalesce(p_options, '{}'), p_custom_prompt, p_source_ids,
               case when p_run_after > now() then 'scheduled'::public.artifact_status
                    else 'queued'::public.artifact_status end)
    returning id into v_art;
  insert into public.jobs (workspace_id, notebook_id, user_id, kind, target_id, run_after, idempotency_key)
       values (v_ws, p_notebook, p_user, 'generate_artifact', v_art, p_run_after, p_idempotency_key)
    returning id into v_job;
  v_usage := public.reserve_usage(v_ws, p_user, p_type::text, v_job);  -- lève si quota épuisé : tout est annulé
  update public.jobs set usage_id = v_usage where id = v_job;
  return v_art;
end $$;

revoke execute on function public.reserve_usage(uuid, uuid, text, uuid),
                         public.settle_usage(uuid, public.usage_status),
                         public.claim_jobs(text, public.job_kind[], int, int),
                         public.requeue_stale_jobs(),
                         public.match_chunks(uuid, halfvec, text, regconfig, uuid[], integer),
                         public.replace_chunks(uuid, jsonb, text, text, regconfig, int, int),
                         public.add_source(uuid, uuid, public.source_kind, text, text, text, text, bigint, jsonb, text),
                         public.create_artifact(uuid, uuid, public.artifact_type, jsonb, text, uuid[], timestamptz, text)
  from public, anon, authenticated;

-- Droits explicites du serveur / worker : ne pas dépendre des privilèges par défaut.
grant usage on schema private to service_role;
grant execute on function private.f_unaccent(text), private.notebook_role(uuid),
                          private.workspace_role(uuid) to service_role;
grant execute on function public.reserve_usage(uuid, uuid, text, uuid),
                         public.settle_usage(uuid, public.usage_status),
                         public.claim_jobs(text, public.job_kind[], int, int),
                         public.requeue_stale_jobs(),
                         public.match_chunks(uuid, halfvec, text, regconfig, uuid[], integer),
                         public.replace_chunks(uuid, jsonb, text, text, regconfig, int, int),
                         public.add_source(uuid, uuid, public.source_kind, text, text, text, text, bigint, jsonb, text),
                         public.create_artifact(uuid, uuid, public.artifact_type, jsonb, text, uuid[], timestamptz, text)
  to service_role;

-- ---------------------------------------------------------------- RLS -------
-- MODÈLE D'ÉCRITURE : les clients (anon, authenticated) n'ont QUE `select`, filtré par RLS.
-- Toute écriture passe par un Route Handler ou le worker, en service_role, APRÈS contrôle
-- de notebook_role et validation Zod (liste blanche de colonnes). Raison : des policies
-- UPDATE sans liste de colonnes laisseraient un client modifier plan_id, is_featured,
-- storage_path, status ou extracted_text directement via PostgREST.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;
revoke select on all tables in schema public from anon;
grant select on public.plans to anon;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
-- stripe_events : RLS active, aucune policy => invisible pour les clients.

create policy plans_read on public.plans for select to anon, authenticated using (is_public);
create policy profiles_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy workspaces_read on public.workspaces for select to authenticated
  using (private.workspace_role(id) is not null);
create policy workspace_members_read on public.workspace_members for select to authenticated
  using (private.workspace_role(workspace_id) is not null);

-- Les notebooks « featured » sont listables par tous (onglet Découvrir) ; leur contenu
-- s'ouvre par un share_link de portée 'full' (accept_share_link => rôle viewer).
-- workspace_role est testé avant notebook_role : moins cher dans le cas courant.
create policy notebooks_read on public.notebooks for select to authenticated
  using (is_featured or private.workspace_role(workspace_id) is not null
         or private.notebook_role(id) is not null);
create policy notebook_members_read on public.notebook_members for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');
create policy collections_own on public.collections for select to authenticated
  using (owner_id = (select auth.uid()));
create policy collection_notebooks_own on public.collection_notebooks for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())));

create policy source_labels_read on public.source_labels for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');
create policy sources_read on public.sources for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');
create policy source_deselections_own on public.source_deselections for select to authenticated
  using (user_id = (select auth.uid()));
create policy chunks_read on public.chunks for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');

create policy conversations_own on public.conversations for select to authenticated
  using (user_id = (select auth.uid()) and private.notebook_role(notebook_id) is not null);
create policy chat_messages_own on public.chat_messages for select to authenticated
  using (user_id = (select auth.uid()) and private.notebook_role(notebook_id) is not null);

create policy artifacts_read on public.artifacts for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer');
create policy citations_read on public.citations for select to authenticated
  using (private.notebook_role(notebook_id) >= 'viewer'
         or (message_id is not null and exists (
               select 1 from public.chat_messages m
                where m.id = message_id and m.user_id = (select auth.uid()))));
create policy artifact_reads_own on public.artifact_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy study_progress_own on public.study_progress for select to authenticated
  using (user_id = (select auth.uid()));

create policy share_links_manage on public.share_links for select to authenticated
  using (private.notebook_role(notebook_id) >= 'editor');
create policy notebook_visits_own on public.notebook_visits for select to authenticated
  using (user_id = (select auth.uid()));

create policy jobs_read on public.jobs for select to authenticated
  using (user_id = (select auth.uid())
         or (notebook_id is not null and private.notebook_role(notebook_id) >= 'viewer'));
create policy usage_read on public.usage_ledger for select to authenticated
  using (private.workspace_role(workspace_id) is not null);
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (private.workspace_role(workspace_id) in ('owner', 'admin'));
create policy reports_own on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy audit_read on public.audit_log for select to authenticated
  using (private.workspace_role(workspace_id) in ('owner', 'admin'));

-- --------------------------------------------------------- Realtime ---------
-- Seule `jobs` est publiée (petites lignes) : publier sources/artifacts rediffuserait
-- extracted_text / content à chaque changement de statut. Le client relit la ligne.
alter publication supabase_realtime add table public.jobs;

