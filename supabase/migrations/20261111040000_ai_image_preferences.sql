-- Préférences personnelles de génération d'images IA.
create table if not exists public.ai_image_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  auto_suggestions boolean not null default true,
  suggestion_count integer not null default 4 check (suggestion_count between 3 and 5),
  default_model_id text,
  default_orientation text not null default 'landscape' check (default_orientation in ('landscape','portrait','square')),
  updated_at timestamptz not null default now()
);
alter table public.ai_image_preferences enable row level security;
create policy ai_image_preferences_owner_read on public.ai_image_preferences
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.ai_image_preferences from anon, authenticated;
grant select on public.ai_image_preferences to authenticated;
grant select, insert, update, delete on public.ai_image_preferences to service_role;
