# Base de données

Supabase PostgreSQL 17 est configuré localement. Le README cite pgvector (halfvec 1024), pg_trgm, unaccent, RLS et les buckets privés sources, artifacts et exports.

Le modèle fonctionnel décrit des workspaces, notebooks, membres/liens de partage, sources, passages, conversations/messages, notes, artefacts, jobs, quotas/usage, audit et offres. Les migrations SQL n'ont pas été accessibles pendant cette passe : aucun nom exact de colonne, contrainte, index ou politique n'est inventé ici. Cette page est un aperçu conceptuel, pas un dictionnaire de données.

Commandes : `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`. Pour compléter, lire toutes les migrations sous supabase/migrations et les tests pgTAP sous supabase/tests.