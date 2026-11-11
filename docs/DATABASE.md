# Base de données

Le schéma est géré par les migrations Supabase dans `supabase/migrations/`. La migration initiale déclare l'extension pgvector, pg_trgm, unaccent et le schéma privé `private`. La configuration locale du dépôt utilise PostgreSQL 17 ; le commentaire de la migration initiale indique une compatibilité PostgreSQL 15+.

## Tables déclarées dans la migration initiale

- **Comptes et espaces :** `plans`, `profiles`, `workspaces`, `workspace_members`.
- **Organisation :** `notebooks`, `collections`, `collection_notebooks`.
- **Membres et partage :** `notebook_members`, `share_links`, `notebook_visits`.
- **Sources et recherche :** `source_labels`, `sources`, `source_deselections`, `chunks`.
- **Conversation :** `conversations`, `chat_messages`, `citations`.
- **Studio et apprentissage :** `artifacts`, `artifact_reads`, `study_progress`.
- **Traitements et quotas :** `jobs`, `usage_ledger`.
- **Facturation et audit :** `subscriptions`, `stripe_events`, `reports`, `audit_log`.

Migrations additionnelles :
- `ai_model_preferences` : choix de modèle OpenRouter par utilisateur et fonctionnalité.
- `ai_prompt_overrides` : personnalisations des prompts système par utilisateur.
- `notebook_members.expires_at` : expiration des invitations en attente.

## Types d'artefacts

La migration initiale déclare notamment `report`, `data_table`, `mind_map`, `flashcards`, `quiz`, `audio`, `video`, `slide_deck` et `infographic`. Des migrations ajoutent `timeline`, `comparison`, `glossary`, `faq`, `diagram`, `editorial` et `study_plan`.

Attention : la présence d'une valeur dans l'enum PostgreSQL ne signifie pas que l'API ou l'interface la prend en charge. Par exemple, `slide_deck` n'est pas accepté par le schéma Zod de création d'artefact actuellement inspecté.

## Storage

La migration Storage crée les buckets privés `sources`, `artifacts` et `exports`. Les commentaires SQL précisent que les accès fichiers passent par des URL signées émises côté serveur après vérification du rôle notebook ; les buckets ne sont pas publics.

## Fonctions SQL identifiées

La migration initiale définit notamment `my_notebook_role`, `accept_share_link`, `match_chunks`, `reserve_usage`, `settle_usage`, `claim_jobs`, `requeue_stale_jobs`, `replace_chunks`, `add_source` et `create_artifact`. Des migrations ajoutent entre autres `copy_notebook`, `create_research_job`, `accept_featured_notebook` et `cleanup_invitations`.

## Migrations disponibles

`20261109000000_init.sql`, `20261109010000_storage.sql`, `20261109020000_sharing.sql`, `20261110000000_audio_overview.sql`, `20261110000000_copy_notebook.sql`, `20261110010000_fast_research.sql`, `20261110020000_featured_discovery.sql`, `20261110030000_cleanup_invitations.sql`, `20261110040000_ai_model_preferences.sql`, `20261110040000_studio_expanded_artifacts.sql`, `20261111010000_ai_prompt_overrides.sql`.

## Tests et commandes

Les tests SQL pgTAP présents sont numérotés de `01_security.test.sql` à `06_cleanup_invitations.test.sql`. Leur présence ne prouve pas qu'ils passent dans l'environnement courant.

Commandes : `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`. La liste ci-dessus est un inventaire des objets déclarés, pas un dictionnaire exhaustif de toutes les colonnes, index, contraintes et policies RLS.
