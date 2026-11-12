-- Audio Overview désactivable (Réglages → Fonctionnalités).
alter table public.profiles drop constraint if exists profiles_disabled_features_check;
alter table public.profiles add constraint profiles_disabled_features_check
  check (disabled_features <@ array['deep_research', 'knowledge_graph', 'contradictions', 'prompt_suggestions', 'audio_overview']::text[]);
