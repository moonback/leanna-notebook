-- Personnalisation des instructions système par utilisateur.
-- Les écritures passent par les handlers serveur avec service_role après authentification.
create table if not exists public.ai_prompt_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null check (prompt_key in (
    'chat','studio.report','studio.flashcards','studio.quiz','studio.mind_map',
    'studio.infographic','studio.timeline','studio.audio_overview','studio.comparison','studio.glossary','studio.faq','studio.diagram','studio.editorial','studio.study_plan','voice.leanna','voice.roxane'
  )),
  content text not null check (char_length(content) between 1 and 12000),
  updated_at timestamptz not null default now(),
  primary key (user_id, prompt_key)
);
create index if not exists ai_prompt_overrides_user_idx on public.ai_prompt_overrides(user_id);
alter table public.ai_prompt_overrides enable row level security;
