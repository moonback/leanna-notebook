-- Préférences personnelles de lecture OCR des PDF via OpenRouter.
create table if not exists public.ai_ocr_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  model_id text check (model_id is null or char_length(model_id) between 3 and 200),
  engine text not null default 'mistral-ocr' check (engine in ('mistral-ocr', 'cloudflare-ai')),
  updated_at timestamptz not null default now(),
  check (not enabled or model_id is not null)
);
alter table public.ai_ocr_preferences enable row level security;
create policy ai_ocr_preferences_owner_read on public.ai_ocr_preferences
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.ai_ocr_preferences from anon, authenticated;
grant select on public.ai_ocr_preferences to authenticated;
grant select, insert, update, delete on public.ai_ocr_preferences to service_role;
