-- Prompt système personnalisé pour les conversations Gemini Live.
-- NULL signifie que le prompt système fourni par défaut par l'application est utilisé.
alter table public.profiles
  add column if not exists voice_system_prompt text
  check (voice_system_prompt is null or char_length(voice_system_prompt) between 1 and 20000);
