# Audit technique — Génération d'images IA dans Leanna Notebook

> Date de vérification : 11 novembre 2026. Branche d'analyse : `main`, commit audité : `572b879b4a40c513d747e5222e0697911ad1ae58`. Dépôt : [moonback/leanna-notebook](https://github.com/moonback/leanna-notebook).  
> Périmètre : audit en lecture seule du code et de la documentation fournisseur. Aucun code applicatif n'a été modifié et aucun test local n'a été exécuté pendant cet audit.

## 1. Synthèse exécutive

Le projet dispose déjà d'une base particulièrement réutilisable pour une fonctionnalité d'images : monorepo pnpm, application Next.js 15/React 19, worker asynchrone, adaptateur OpenRouter serveur, catalogue dynamique de modèles, système de jobs avec bail/heartbeat/annulation, artefacts Studio, bucket Supabase Storage privé, permissions notebook, réservations de crédits transactionnelles et remboursement des jobs échoués.

Le Studio ne doit donc pas devenir une application indépendante. La voie recommandée est d'ajouter un type d'artefact image au pipeline existant, avec un adaptateur image spécialisé dans le worker. Les générations doivent continuer à être créées par l'API notebook/artifacts, réservées par le mécanisme de crédits et traitées en arrière-plan.

**Écart majeur :** le code IA actuel ne sait traiter que du texte en sortie. Le type `Llm` retourne `text`, le client worker appelle exclusivement `/chat/completions`, et `toContent` ne valide que du contenu textuel/JSON. Il faut ajouter une voie binaire/image dédiée sans casser ce contrat textuel.

**Autre écart important :** la table `artifacts` et le bucket privé `artifacts` existent déjà, mais le modèle actuel ne représente qu'un seul `storage_path` et un `content` JSON générique. Une bibliothèque d'images avec versions, variantes et références réclame un modèle explicite de version/asset, ou une structure JSON documentée et indexée ; une table dédiée sera plus robuste à moyen terme.

## 2. Architecture générale constatée

### 2.1 Monorepo et applications

- Racine : `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- Applications : `apps/web`, `apps/worker`, `apps/desktop`.
- Package partagé : `packages/core`.
- Base et stockage : `supabase/config.toml`, `supabase/migrations/`, `supabase/tests/`.
- Frontend : Next.js 15.5.29, React 19.1, TypeScript 5, Tailwind CSS 4, Radix UI.
- Tests web/worker : Vitest ; scripts racine `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm db:test`.

Le worker est un processus distinct, exécutant les tâches en arrière-plan via Supabase. Le frontend ne doit pas appeler OpenRouter directement.

### 2.2 Authentification et autorisations

Les Route Handlers utilisent `requireUser()`, `requireRole(notebookId, role)` et les clients Supabase serveur. Les rôles sont vérifiés au niveau notebook : `viewer` pour lire, `editor` pour créer/supprimer. La migration initiale indique que les clients anon/authenticated n'ont pas de droits d'écriture SQL directs ; les mutations passent par Route Handler/worker après contrôle et validation.

Fichiers :
- `apps/web/lib/api.ts` (contrat d'API et contrôles à consulter au développement).
- `apps/web/lib/supabase/server.ts`.
- `apps/web/middleware.ts`.
- `supabase/migrations/20261109000000_init.sql` (fonctions de rôles, RLS et RPC).
- `supabase/migrations/20261109020000_sharing.sql` (partage).

### 2.3 Sources, ingestion et stockage

Les sources sont liées à un notebook et un workspace. L'upload actuel obtient une URL signée depuis `POST /api/v1/notebooks/[id]/uploads`, avec chemin imposé par le serveur. Le bucket `sources` est privé, limite 200 Mo ; le bucket `artifacts` est privé, limite 500 Mo ; le bucket `exports` est privé, limite 1 Go. Les fichiers sont servis via des URLs signées côté serveur après vérification des rôles.

Fichiers :
- `apps/web/app/api/v1/notebooks/[id]/uploads/route.ts`.
- `apps/web/app/api/v1/notebooks/[id]/sources/route.ts`.
- `apps/web/app/api/v1/sources/[id]/file/route.ts`.
- `apps/web/lib/validation.ts` : allowlist extensions/MIME, taille upload.
- `apps/worker/src/ingest/handler.ts`, `extract.ts`, `office.ts`, `ssrf.ts`.
- `supabase/migrations/20261109010000_storage.sql`.

**Point de vigilance vérifié :** le bucket `sources` autorise PNG/JPEG/WebP et l'enum SQL `source_kind` contient `image`, mais l'allowlist `UPLOAD_TYPES` actuelle de `apps/web/lib/validation.ts` n'expose pas d'extensions image. Il ne faut donc pas conclure que l'import d'images sources est déjà disponible dans le parcours d'upload standard.

## 3. Audit détaillé du Studio

### 3.1 Écran et composants existants

- Écran principal : `apps/web/app/notebook/[id]/studio.tsx`.
- Le composant `Studio` reçoit `notebookId`, `canEdit`, `sourceIds`, `sourceTitle`, `onOpenCitation`, `onAsk`, `onImported`.
- Le catalogue de types `TYPES` associe type, libellé, icône et description.
- `CreateDialog` gère les options, prompts et formulaires.
- `ArtifactViewer` affiche le résultat, les citations, l'export et les actions disponibles.
- `ArtifactShareButton` porte le partage d'artefact.
- Les composants UI réutilisables proviennent de `apps/web/components/ui/` : Button, Field, Dialog, Alert, Badge, Progress, Skeleton, EmptyState, ListRow, Panel, Citation, toast, confirm.

Le Studio affiche les contenus dans une liste ; les états `queued`, `scheduled`, `generating`, `ready`, `failed`, `cancelled` sont gérés. Il interroge la liste à intervalle de 2,5 secondes pendant qu'un job est actif, et affiche la progression du job.

### 3.2 Formats réellement exposés

Le type frontend et le schéma de création API déclarent actuellement 13 types :
`report`, `flashcards`, `quiz`, `mind_map`, `audio`, `infographic`, `timeline`, `comparison`, `glossary`, `faq`, `diagram`, `editorial`, `study_plan`.

Les types historiques `video` et `slide_deck` figurent dans l'enum SQL initial, mais ne sont pas exposés par le schéma Zod de création inspecté. Ne pas les présenter comme des parcours actifs sans autre preuve.

L'infographie existante est une sortie Markdown structurée avec options orientation/style/niveau de détail ; elle n'est pas un rendu d'image générée par modèle image. La chronologie est du texte structuré et cité. L'Audio Overview combine script IA, synthèse vocale et stockage audio.

### 3.3 Flux actuel de création

1. Le client POST sur `/api/v1/notebooks/[id]/artifacts`.
2. Zod valide le type, les options, le prompt (4 000 caractères max.) et les sources.
3. `requireRole(id, "editor")` contrôle le droit d'écriture.
4. La RPC SQL `create_artifact` crée artefact + job + réservation de quota dans une transaction.
5. Le worker réclame le job via `claim_jobs`, avec lease/heartbeat et tentative.
6. `studioHandler` charge les passages du notebook, construit un prompt, appelle OpenRouter, valide le résultat et vérifie les citations.
7. L'artefact passe à `ready`; en cas d'échec terminal, il passe à `failed`.
8. `finish()` règle la réservation en `committed` uniquement si succès, sinon `refunded`.

Fichiers clés :
- `apps/web/app/api/v1/notebooks/[id]/artifacts/route.ts`.
- `apps/worker/src/studio/generate.ts`.
- `apps/worker/src/worker.ts`.
- `apps/worker/src/main.ts`.
- `supabase/migrations/20261109000000_init.sql`.

### 3.4 Fonctionnalités réutilisables et limites

| Besoin image | Existant | Travail restant |
|---|---|---|
| Catégorie Studio | Catalogue `TYPES` et enum API | Ajouter `image` ou type dédié, icône et options |
| Prompt | `customPrompt` et `CreateDialog` | Construire prompt visuel structuré et versionné |
| Sources sélectionnées | `sourceIds` et recherche de passages | Préparer un brief visuel fondé sur citations/passages |
| Génération asynchrone | Jobs, progression, polling | Handler image et suivi d'étapes spécifiques |
| Modèles | Catalogue OpenRouter texte | Catalogue image séparé fondé sur Image Models API |
| Réponse multimodale | Pas de sortie image dans `Llm` | Parser les réponses binaires/base64 et MIME |
| Stockage | Bucket privé `artifacts` | Enregistrer chaque asset et ses métadonnées |
| Visualisation | `ArtifactViewer` | Viewer image haute résolution, zoom, téléchargement |
| Suppression | DELETE artefact | Supprimer aussi les objets Storage et versions |
| Historique | `parent_id` présent pour révision de deck | Relations version-parent adaptées aux images |
| Annulation | `cancel_requested` vérifié entre étapes | Contrôle avant/après appel externe ; clarifier coût si upstream continue |
| Erreurs | `error_code`, message job, toast | Erreurs fournisseur normalisées et visibles |

## 4. Audit IA / OpenRouter

### 4.1 Infrastructure existante

- `apps/web/lib/ai/openrouter.ts` : client serveur OpenRouter, chat streaming et embeddings.
- `apps/worker/src/ai/llm.ts` : client worker non-streamé pour Studio ; `OPENROUTER_API_KEY`, `OPENROUTER_CHAT_MODEL`, `OPENROUTER_BASE_URL`.
- `apps/web/app/api/v1/ai/models/route.ts` : catalogue dynamique via `GET /api/v1/models`, compatibilité calculée à partir des modalités déclarées, préférences par utilisateur.
- `apps/web/lib/ai/features.ts` : registre des usages IA.
- `apps/web/app/settings/openrouter-settings.tsx` : écran de sélection de modèles.
- `apps/web/lib/ai/prompt-catalog.ts`, `apps/web/lib/ai/prompts/` : prompts et catalogue.
- `supabase/migrations/20261110040000_ai_model_preferences.sql` et `20261111010000_ai_prompt_overrides.sql`.

### 4.2 Limite de l'abstraction actuelle

L'abstraction IA est réutilisable pour le choix des modèles, la clé, les en-têtes et les appels chat, mais elle est **orientée texte** :
- `LlmMessage.content` est une chaîne.
- `Llm` retourne `{ text, model, usage }`.
- Le worker utilise `choices[0].message.content`.
- Les features actuelles ont `outputModalities: ["text"]`.
- Le catalogue des modèles IA courant utilise `/api/v1/models`, alors que l'API Images dispose de son propre catalogue et de ses propres paramètres par endpoint.

Recommandation : ne pas transformer `Llm` en abstraction universelle qui complexifierait les usages existants. Introduire un contrat image séparé (`ImageGenerationProvider`) partageant configuration, authentification, journalisation et normalisation des erreurs, mais conservant les types de sortie binaires.

## 5. Données, crédits et facturation

### 5.1 Données actuelles

La table `artifacts` comprend `type`, `status`, `options`, `custom_prompt`, `source_ids`, `content` JSONB, `storage_path`, `mime_type`, `parent_id`, `error_code`. Les tables `jobs`, `usage_ledger`, `citations`, `sources`, `chunks`, `notebooks`, `workspaces` structurent les traitements et les droits.

Le stockage `artifacts` est privé et accepte les types MIME non limités par la migration. Le chemin recommandé est toujours construit côté serveur sous workspace/notebook/artefact/version.

### 5.2 Crédits réels de l'application

Le mécanisme existant est déjà transactionnel :
- `create_artifact` crée l'artefact et le job, puis appelle `reserve_usage`.
- `reserve_usage` verrouille le workspace avec advisory lock, lit les limites du plan et réserve les unités.
- `settle_usage` passe de `reserved` à `committed` ou `refunded`.
- `apps/worker/src/worker.ts` rembourse si le handler échoue ou est annulé ; il ne facture définitivement que le succès.

**Limite à traiter :** les coûts planifiés dans `plans.limits.credit_cost` sont des unités internes fixes par feature. Ils ne correspondent pas automatiquement aux coûts USD variables d'OpenRouter selon modèle, résolution, nombre de références et nombre d'images. Il faut conserver les crédits internes comme prix commercial affiché, tout en enregistrant le coût fournisseur réel en métadonnées d'usage pour marge et audit.

### 5.3 Facturation abonnement

`apps/web/lib/billing.ts` déclare `BillingProvider`, mais le mode par défaut est `simulated` ; le mode Stripe n'est pas branché. Il s'agit de la facturation d'abonnement du workspace, distincte du ledger de crédits IA. Ne pas assimiler l'état de Stripe à la consommation d'images.

## 6. Risques / écarts prioritaires

1. **Contrat image absent :** pas de gestion de réponse image/binaire dans le worker.
2. **Catalogue inadéquat :** le catalogue de modèles actuel est orienté chat ; il ne donne pas les paramètres de génération par endpoint image.
3. **Données/versionnage :** `storage_path` unique et `parent_id` général ne suffisent pas à décrire proprement une famille de variantes, une image de référence et un historique d'édition.
4. **Sources image importées :** le bucket autorise quelques MIME image mais l'allowlist upload standard ne les expose pas.
5. **Coûts :** unités internes actuelles par type ne sont pas liées au coût réel OpenRouter.
6. **Suppression :** la route DELETE supprime l'enregistrement artefact ; vérifier et implémenter la suppression des objets et versions liés au Storage.
7. **Taille/timeout :** base64 gonfle la mémoire ; limiter les dimensions/bytes et stocker rapidement côté worker. Les jobs doivent gérer les délais fournisseur sans marquer à tort les opérations facturées.
8. **Sécurité des références :** ne jamais accepter une URL arbitraire à télécharger côté serveur sans contrôle SSRF ; préférer les objets Storage autorisés et les signed URLs courtes.
9. **Prompt injection documentaire :** les passages sont déjà traités comme données dans le worker Studio ; appliquer la même isolation au prompt image.
10. **Tests :** la présence de tests dans le dépôt n'est pas preuve d'exécution dans cette mission.

## 7. Tests existants repérés

- `apps/web/app/notebook/[id]/studio.test.tsx`.
- `apps/worker/src/studio/generate.test.ts`.
- `apps/worker/src/worker.test.ts`.
- `apps/web/lib/validation.test.ts` (à confirmer dans l'arbre de tests).
- `apps/worker/src/ingest/ssrf.test.ts`.
- Tests SQL sous `supabase/tests/`.

Aucun de ces tests n'a été exécuté pendant l'audit distant. Les résultats d'exécution sont donc **non vérifiés**.

## 8. Fichiers existants à réutiliser / étendre

| Fichier | Rôle dans la future fonctionnalité |
|---|---|
| `apps/web/app/notebook/[id]/studio.tsx` | Entrée Images IA, options, viewer et galerie |
| `apps/web/app/api/v1/notebooks/[id]/artifacts/route.ts` | Création/liste de génération et validation |
| `apps/web/app/api/v1/artifacts/[id]/route.ts` | Lecture/suppression et permissions |
| `apps/web/lib/ai/openrouter.ts` | Configuration serveur partagée ; ne pas forcer l'image dans le flux chat |
| `apps/web/app/api/v1/ai/models/route.ts` | Référence d'architecture du catalogue, mais catalogue Image API dédié |
| `apps/worker/src/studio/generate.ts` | Handler Studio existant ; intégrer sans casser les branches texte/audio |
| `apps/worker/src/ai/llm.ts` | Référence du client OpenRouter worker texte |
| `apps/worker/src/worker.ts` | Cycle de vie des jobs et règlement de crédits |
| `apps/worker/src/main.ts` | Enregistrement du handler |
| `apps/web/lib/validation.ts` | Validation uploads/références |
| `supabase/migrations/20261109010000_storage.sql` | Bucket privé déjà existant |
| `supabase/migrations/20261109000000_init.sql` | Schéma artifacts/jobs/usage/source/RLS |

## 9. Conclusion

Leanna Notebook est compatible avec une intégration professionnelle sans nouveau sous-système de jobs, d'authentification ou de quota. Le principal travail est l'ajout d'un **adaptateur image dédié**, de la représentation durable des assets/versions et du raccordement au pipeline Studio existant. La fonctionnalité doit rester une capacité de l'artefact Studio, pas un produit parallèle.
