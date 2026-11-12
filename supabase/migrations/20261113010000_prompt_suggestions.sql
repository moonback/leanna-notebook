-- Suggestions de consignes du Studio : désactivables (Réglages → Fonctionnalités) et modèle configurable (Réglages → IA).
alter table public.profiles drop constraint if exists profiles_disabled_features_check;
alter table public.profiles add constraint profiles_disabled_features_check
  check (disabled_features <@ array['deep_research', 'knowledge_graph', 'contradictions', 'prompt_suggestions']::text[]);

alter table public.ai_model_preferences drop constraint if exists ai_model_preferences_feature_key_check;
alter table public.ai_model_preferences add constraint ai_model_preferences_feature_key_check
  check (feature_key in ('chat','report','flashcards','quiz','mind_map','audio_overview',
                         'deep_research','knowledge_extraction','contradictions','prompt_suggestions'))
  not valid;
