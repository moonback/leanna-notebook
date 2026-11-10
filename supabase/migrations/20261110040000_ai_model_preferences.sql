-- Per-user OpenRouter model selection, isolated by authenticated user.
create table if not exists public.ai_model_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null check (feature_key in ('chat','report','flashcards','quiz','mind_map','audio_overview')),
  model_id text not null check (char_length(model_id) between 3 and 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);
create index if not exists ai_model_preferences_user_idx on public.ai_model_preferences(user_id);
alter table public.ai_model_preferences enable row level security;
create policy "Users manage their own AI model preferences"
  on public.ai_model_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
