# Schéma de base de données

Le SQL complet se trouve dans **[schema.sql](schema.sql)**. Ce document en explique les choix et ne le recopie pas.

- **Cible** : Supabase Postgres 15+, région UE (Francfort).
- **Taille** : 26 tables, 12 enums, 16 fonctions, 25 policies (lecture seule).
- **Contrôle d'accès** : **Row Level Security sur 100 % des tables**, avec une seule fonction d'autorisation, `private.notebook_role()`.

**Modèle d'écriture.** Les clients (`anon`, `authenticated`) n'ont **que `select`**, filtré par la RLS. Toute écriture passe par le serveur ou le worker en `service_role`, **après** contrôle de `notebook_role` et validation Zod sur une liste blanche de colonnes. Les opérations en plusieurs étapes passent par des **RPC transactionnelles** :
- `add_source` : source + job, plafond vérifié sous verrou ;
- `create_artifact` : artefact + job + quota, tout ou rien, idempotent ;
- `replace_chunks` : réingestion atomique ;
- `reserve_usage` / `settle_usage` ;
- `claim_jobs` / `requeue_stale_jobs`.

Pourquoi ce choix : des policies UPDATE sans liste de colonnes permettraient à n'importe quel client, via PostgREST, de modifier `plan_id`, `is_featured`, `storage_path`, `status` ou `extracted_text`.

## Validation effectuée le 2026-11-09

`schema.sql` a été chargé dans **pglite** (Postgres 17 WASM avec `vector`, `pg_trgm` et `unaccent`). Le schéma `auth` de Supabase y est simulé par des stubs. Les privilèges par défaut de Supabase sont reproduits : avant la migration, `anon` et `authenticated` ont tous les droits sur `public`. Un script de **40 assertions** passe ; les opérations serveur y tournent en `service_role` (pas en superuser). Il vérifie que :
- un utilisateur ne voit pas les notebooks d'autrui ;
- **aucune écriture client n'est possible**, y compris les 4 tentatives d'attaque testées : s'offrir un plan, mettre un notebook en avant (`is_featured`), détourner `storage_path`, se déclarer majeur (`adult_verified_at`) ;
- la recherche hybride classe d'abord le bon passage, y compris sur une requête sans accents ;
- `match_chunks` est **refusé aux clients** (y compris aux lecteurs) ;
- un lien « chat seul » donne accès au notebook sans aucune lecture des sources ni des chunks ;
- `add_source` crée la source et son job ensemble, et respecte le plafond de sources ;
- `replace_chunks` calcule `fts` par trigger et peut être rejoué sans doublon ;
- `create_artifact` est idempotent ; un refus de quota ne laisse **aucun artefact orphelin** ;
- la révocation d'un lien prend effet immédiatement ;
- l'historique de chat reste privé pour chaque utilisateur ;
- le quota journalier est respecté, et un remboursement restitue le crédit ;
- `reserve_usage` est interdit au rôle client ;
- un job n'est jamais réclamé deux fois ; un bail expiré remet le job en file ; un échec définitif passe l'artefact en `failed` et **rembourse le quota** ;
- Realtime ne publie que `jobs` ;
- la suppression d'un compte supprime tout en cascade.

**Corrigé pendant la conception** :
1. `INSERT … RETURNING` était refusé par la RLS, car la ligne neuve est invisible pour `notebook_role()`. La policy vérifie d'abord `workspace_role`.
2. Les écritures client par colonne n'étaient pas bornées : passage à « lecture seule pour les clients ».
3. `match_chunks` était appelable par le rôle `chat`, ce qui permettait d'extraire tout le corpus : la fonction est désormais réservée au serveur.
4. Un échec définitif après un crash du worker laissait l'artefact en `generating` et le quota réservé.
5. Realtime rediffusait `extracted_text`.

**Non validé** (absent de pglite) :
- Realtime et la publication réelle ;
- PostgREST et l'exposition des schémas ;
- Storage, pg_cron ;
- performances sur volume réel.

À refaire avec `supabase start` et des tests pgTAP au jalon M0 (voir la roadmap).

## Entités et relations

```
auth.users 1─1 profiles
auth.users 1─n workspaces (1 « personnel » garanti par index unique partiel)
workspaces n─n users            via workspace_members (owner | admin | member)
workspaces 1─n notebooks 1─n sources 1─n chunks
notebooks  n─n users            via notebook_members (viewer | editor) — partage hors workspace
notebooks  1─n share_links ─> notebook_visits (accès par lien : full | chat_only | artifact)
notebooks  1─n conversations 1─n chat_messages 1─n citations ─> chunks / sources
notebooks  1─n artifacts 1─n citations ; artifacts 1─n artifact_reads, study_progress
users      1─n collections n─n notebooks via collection_notebooks
workspaces 1─n jobs, usage_ledger ; 1─1 subscriptions ─> plans
```

| domaine | tables |
| --- | --- |
| Identité et tenants | `profiles`, `workspaces`, `workspace_members`, `plans`, `subscriptions` |
| Notebooks | `notebooks`, `notebook_members`, `share_links`, `notebook_visits`, `collections`, `collection_notebooks` |
| Sources | `sources` (les notes sont des sources, `kind='note'`), `source_labels`, `source_deselections`, `chunks` |
| Chat | `conversations`, `chat_messages`, `citations` |
| Studio | `artifacts`, `artifact_reads`, `study_progress` (+ `citations`) |
| Infra | `jobs`, `usage_ledger`, `stripe_events`, `reports`, `audit_log` |

## Décisions et justifications

| décision | pourquoi |
| --- | --- |
| **Une note est une ligne de `sources`** (`kind='note'`, `note_body` jsonb) | Le comportement documenté de l'original est identique : la note est cochable, citable et utilisée par le Studio. Un seul pipeline d'indexation et une seule sélection suffisent. Une contrainte `check` garantit qu'une note a toujours un corps. |
| **`workspace_id` et `notebook_id` dénormalisés** sur les chunks, messages, artefacts et citations | Les policies RLS et le filtre de recherche s'évaluent sans jointure. La suppression en cascade d'un tenant reste triviale. |
| **Workspace personnel créé à l'inscription** (trigger `handle_new_user`) | Le multi-tenant est en place dès le premier jour sans complexité pour l'utilisateur solo. L'offre B2B (Z01) ajoute des workspaces `team` sans migration. |
| **`notebook_role()` unique**, en `SECURITY DEFINER`, renvoyant un enum ordonné `chat < viewer < editor < owner` | Les 25 policies sont lisibles (`>= 'editor'`). Il n'y a pas de récursion de RLS et un seul endroit est à auditer. |
| **Rôle `chat`** (lien « chat seul ») | Il corrige une faiblesse documentée de l'original, où la chat view n'isole pas le contenu. Ce rôle n'a aucun `select` sur `sources`, `chunks` ou `artifacts`, et la recherche est exécutée par le serveur. **Limite à afficher dans l'interface de partage** : empêcher l'accès direct et l'extraction en masse ne protège pas les extraits qu'une réponse cite. Un visiteur obstiné peut reconstituer des passages en posant beaucoup de questions. C'est inhérent au chat, et c'est atténué par le quota et la limitation de débit. |
| **Liens publics = jeton aléatoire dont seul le `sha256` est stocké** | Une fuite de la base ne révèle aucun lien. La révocation est un simple `revoked_at`. Le lien est distinct de l'UUID du notebook, qui reste non devinable mais n'est jamais un secret. |
| **Sélection des sources par utilisateur**, stockée comme *désélections* | Le défaut (tout coché) ne coûte aucune ligne. Deux collaborateurs ne se gênent pas : Q07 est tranchée dans le sens le plus sûr. |
| **`conversations` dès le départ** | Le MVP n'affiche qu'un fil, mais les multi-conversations (C06, différenciation) ne nécessiteront pas de migration. |
| **`chunks` immuables**, régénérés en bloc | Une resynchronisation Drive ou une réingestion = `delete` + `insert`. Les citations gardent `quote_text` et passent `chunk_id` à `null` : elles restent lisibles. |
| **`halfvec(1024)` + `embedding_model` par ligne** | La moitié de l'espace d'un `vector`, sans perte mesurable de qualité de recherche. Changer de modèle d'embedding se fait progressivement, ligne par ligne. |
| **Pas d'index HNSW au MVP** | Le filtre `notebook_id` avant l'ordre vectoriel garantit un rappel de 100 % (scan exact). Avec HNSW, filtrer après l'index perd des résultats. Seuil de bascule : environ 20 000 chunks par notebook, avec `hnsw.iterative_scan`. |
| **`tsvector` calculé par le trigger `chunks_set_fts`** avec la config de langue de la source (`french`, `english`, `simple`) et `f_unaccent` | Une colonne générée ne peut pas lire une autre table, et un insert PostgREST ne peut pas appeler `to_tsvector`. L'enveloppe `IMMUTABLE` d'`unaccent` permet aussi l'index trigram sur les titres. |
| **`artifacts.source_ids` = instantané** | C'est la règle documentée : modifier une source ne régénère pas les artefacts. Le bandeau « sources modifiées » (différenciation n° 4) se calcule par comparaison. |
| **`jobs` = file de tâches Postgres** (`claim_jobs` avec `FOR UPDATE SKIP LOCKED`, bail et heartbeat) | Pas de broker supplémentaire. La progression est diffusée par Realtime, avec la même RLS. Testé sans double réclamation. |
| **`usage_ledger` en réservation → commit / remboursement** | Un échec de génération rend le crédit (réponse à Q31). Le verrou consultatif par workspace empêche le dépassement concurrent. |
| **`plans.limits` en jsonb** | Les limites changent souvent (l'original les a modifiées plusieurs fois). Les ajuster ne demande pas de migration. |
| **`stripe_events.id` = `evt_…`** (clé naturelle, sans UUID) | L'idempotence des webhooks repose sur cette clé : un événement déjà inséré est ignoré. |

## Règles `on delete`

| référence | règle | raison |
| --- | --- | --- |
| tout → `workspaces` / `notebooks` | `cascade` | Supprimer un tenant ou un notebook supprime tout son contenu (exigence RGPD). |
| `created_by`, `invited_by`, `reporter_id`, `actor_id` | `set null` | Un membre qui quitte une équipe ne fait pas disparaître le travail commun. |
| `citations.chunk_id` / `source_id` | `set null` | La citation reste lisible grâce à `quote_text`. |
| `workspaces.plan_id`, `subscriptions.plan_id` | `restrict` | On ne supprime pas un plan encore utilisé. |
| `sources.label_id` | `set null` | Supprimer un label ne supprime pas ses sources. |
| `artifacts.parent_id` | `set null` | Une révision de deck survit à la suppression de l'original. |

## Stockage des fichiers (hors SQL)

- **Buckets privés** :
  - `sources` : `{workspace}/{notebook}/{source}/original.{ext}` ;
  - `artifacts` : `{workspace}/{notebook}/{artifact}/…` ;
  - `exports`.
- **Aucune policy `storage.objects` pour les clients.** Le serveur génère des **URL signées courtes** : upload en 10 minutes, lecture en 5 minutes, après contrôle de `notebook_role`.
- La purge des objets d'un notebook supprimé est faite par le job `purge_storage`, parce que la suppression en cascade SQL ne touche pas Storage.

## Requêtes clés

| besoin | requête | index |
| --- | --- | --- |
| Tableau de bord (S03) | notebooks visibles, triés par `last_activity_at`, avec `count(sources)` | `notebooks_workspace_activity_idx`, `sources_nb_idx` |
| Recherche de titre | `f_unaccent(lower(title)) % f_unaccent(lower(:q))` | `notebooks_title_trgm` |
| Contexte du chat (serveur, service_role) | `match_chunks(nb, emb, q, cfg, ids, 30)` | `chunks_nb_idx` + `chunks_fts_idx` |
| Historique | messages d'une conversation | `chat_messages_conv_idx` |
| Analytics (H06) | `count(distinct user_id)` et `count(*)` par jour sur 7 jours | `chat_messages_nb_idx` |
| Quota | `count` / `sum` du ledger, jour ou mois | `usage_ledger_ws_feature_idx` |
| Worker | `claim_jobs` | `jobs_claim_idx` (partiel) |
