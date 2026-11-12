-- Fonctionnalités désactivables par l'utilisateur (Réglages → Fonctionnalités).
-- Une fonctionnalité désactivée est masquée de l'interface et n'est plus déclenchée pour cet utilisateur.
alter table public.profiles
  add column if not exists disabled_features text[] not null default '{}'
  check (disabled_features <@ array['deep_research', 'knowledge_graph', 'contradictions']::text[]);
