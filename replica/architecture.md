# Architecture : SaaS « Notebook »

Le produit reprend les usages clés de Gemini Notebook (ex-NotebookLM) avec sa propre implémentation.

- **Date** : 2026-11-09.
- **Entrées** : [recon.md](recon.md), [features.csv](features.csv), [user-flows.md](user-flows.md), [data-model-observations.md](data-model-observations.md).
- **Sorties liées** : [database-schema.md](database-schema.md) + [schema.sql](schema.sql), [api-design.md](api-design.md), [implementation-roadmap.md](implementation-roadmap.md).
- **Statut** : conception. Aucune ligne d'application n'est écrite.

---

## 0. Audit du dépôt `moonback/Notebook`

| rubrique | constat | preuve |
| --- | --- | --- |
| `package.json` | **absent** | aucun fichier à la racine |
| Arborescence | `.gitignore` (contient seulement `.claude`), `concept.md` (vide), `capture/` (2 PNG), `replica/` (livrables de recon), `.claude/skills/` | `git ls-files` |
| Frontend | **absent** | — |
| Backend | **absent** | — |
| Base de données | **absente** | — |
| Authentification | **absente** | — |
| Stockage | **absent** | — |
| Services IA | **absents** | — |
| Traitement des documents | **absent** | — |
| Tests | **absents** | — |
| Déploiement | **absent** (ni CI, ni Dockerfile, ni config d'hébergement) | — |
| Historique | 4 commits de documentation et de captures. `main` local a un commit d'avance sur `origin/main` (`b113a9b`, non poussé). | `git log`, `git ls-remote` |

**Conclusion** : projet vierge, aucune technologie n'est à remplacer. Chaque choix ci-dessous est donc justifié par rapport aux défauts du skill et aux besoins de la recon. Indices sur les habitudes de l'utilisateur : ses autres projets sont en Electron et React, et il a des marque-pages Supabase et des LLM. La stack TypeScript, React et Supabase lui sera familière.

> ⚠️ **À traiter par l'utilisateur.** `capture/` est suivi par git et **déjà poussé** sur GitHub. Ces captures montrent l'interface de Google et les titres de notebooks privés. Si le dépôt est ou devient public, retirez-les et ajoutez `capture/` et `replica/screens/` au `.gitignore`. Je n'ai rien modifié.

---

## 1. Stack retenue

| couche | choix | pourquoi (une ligne) |
| --- | --- | --- |
| Langage | **TypeScript partout** (web, worker, scripts) | Un seul langage pour le web et le worker. Les schémas Zod sont partagés entre API, LLM et UI. |
| Monorepo | **pnpm workspaces** (`apps/web`, `apps/worker`, `packages/core`, `packages/db`, `supabase/`) | Le worker réutilise le domaine sans publier de paquets. Turborepo est inutile à cette taille. |
| Web | **Next.js (App Router) + React** | C'est le défaut du skill. RSC pour les lectures, Route Handlers pour le streaming SSE et les webhooks. |
| UI | **Tailwind + composants Radix (shadcn/ui)** | Composants accessibles (menus ⋮, dialogues, onglets). Tokens fournis par `/replica-design`. |
| Éditeur de notes | **Tiptap** (ProseMirror) | Texte riche avec nœud « citation » non éditable, ce qui reproduit le verrou de l'original. |
| Mind map | **React Flow + elkjs** | Zoom, pliage et clic sur un nœud, rendu côté client. |
| Base de données | **Supabase Postgres (région UE, Francfort)** + `pgvector`, `pg_trgm`, `unaccent` | Une seule base pour relationnel, vecteurs, plein texte, file de jobs et RLS. Service managé. |
| Accès aux données | **supabase-js + types générés + migrations SQL (Supabase CLI), sans ORM** | Le SQL est la seule source de vérité pour le schéma et la RLS. Un ORM ajouterait un second modèle. Toute opération en plusieurs étapes passe par une **RPC transactionnelle** (`add_source`, `create_artifact`, `replace_chunks`…), puisque chaque appel PostgREST est une transaction. |
| Auth | **Supabase Auth** (`@supabase/ssr`) : email + mot de passe, lien magique, Google OAuth | Intégrée à la RLS (`auth.uid()`). SSO SAML disponible plus tard pour le B2B. |
| Fichiers | **Supabase Storage** (buckets privés, URL signées) | Même fournisseur, même région, pas de clé S3 à gérer. R2 reste possible si le volume explose. |
| Tâches longues | **Worker Node en conteneur** (Fly.io, région `fra`) + **file Postgres** (`jobs`) | Les générations audio et vidéo dépassent les limites des fonctions serverless. Pas de broker. Détails au § 12. |
| Planification | **pg_cron** (Supabase) | Remise en file des baux expirés, purges, synchronisation Drive. |
| Temps réel | **Supabase Realtime** (postgres_changes sur `jobs`, `sources`, `artifacts`) | Progression poussée au client sous RLS, sans websocket maison. |
| LLM | **Anthropic Claude via `@anthropic-ai/sdk`**, derrière une interface `LlmProvider` | Citations natives vérifiables (§ 10), cache de prompt, sorties structurées. |
| Embeddings | **Fournisseur multilingue en 1024 dimensions**, choisi par un test au M1 (Voyage ou Mistral) | Anthropic ne fournit pas d'embeddings. La dimension est figée, le fournisseur reste interchangeable (§ 8). |
| OCR / STT / TTS | Interfaces `Ocr`, `Transcriber`, `Speech`. Candidats : Mistral OCR, Voxtral ou Deepgram, ElevenLabs | Remplaçables sans toucher au domaine. Choix final au jalon concerné, sur un test qualité et coût. |
| Paiement | **Stripe Checkout + Billing + Customer Portal + Stripe Tax** | Défaut du skill. Stripe Tax gère la TVA UE, indispensable pour vendre en France. |
| Email | **Resend** (ou Postmark) | Invitations, notifications. Vérifier le DPA et la région. |
| Hébergement web | **Vercel** (fonctions en `fra1`) | Défaut du skill. Previews par PR. |
| Observabilité | **Sentry** (web et worker) + logs Supabase + journal d'usage LLM en base | Erreurs et traces. Le coût IA est suivi dans `usage_ledger` et `chat_messages.usage`. |
| Tests | **Vitest** (unitaires), **pgTAP** (RLS), **Playwright** (E2E), **jeu d'évaluation RAG maison** | La RLS et les citations sont les deux risques majeurs : ils ont chacun leurs tests. |
| CI/CD | **GitHub Actions** : lint, typecheck, tests, `supabase db lint`, migrations sur une branche Supabase de preview | Bloque toute fusion qui casse la RLS ou les types. |

**Écarts aux défauts du skill**
- Tâches longues : un **worker conteneurisé** remplace Vercel Cron, Inngest ou Trigger.dev, pour trois raisons : la durée des jobs, la résidence des données en UE et l'absence de fournisseur supplémentaire.
- Pas d'ORM.
- Pas d'app mobile au MVP (M01 = P3).

**Rien d'autre que le skill ne le recommande** : une base, un dépôt, deux processus (web + worker), pas de microservices.

---

## 2. Vue d'ensemble

```
 Navigateur (React)
   │  RSC/HTML ─────────────┐        Realtime (WS, RLS) ◄──────────────┐
   │  fetch /api/* + SSE    │                                          │
   ▼                        ▼                                          │
 ┌──────────────── Vercel : apps/web (Next.js) ───────────────┐        │
 │ Route Handlers : auth, notebooks, sources, chat (SSE),     │        │
 │ studio, partage, billing, webhooks Stripe                  │        │
 │ → lectures : supabase-js avec le JWT utilisateur (RLS)     │        │
 │ → service_role pour TOUTES les écritures (après contrôle)  │        │
 │ → Claude (chat en streaming), embeddings (requête)         │        │
 └───────┬───────────────────────────┬────────────────────────┘        │
         │ SQL / RPC                 │ URL signées                     │
         ▼                           ▼                                 │
 ┌──────────── Supabase (UE) ─────────────────────────┐                │
 │ Postgres : 26 tables + RLS, pgvector, FTS, jobs    │────────────────┘
 │ Auth · Storage (privé) · Realtime · pg_cron        │
 └───────▲────────────────────────────────────────────┘
         │ claim_jobs / heartbeat / écritures (service_role)
 ┌───────┴──── Fly.io (fra) : apps/worker (Node) ─────────────────────┐
 │ ingestion (fetch SSRF-safe, parseurs, OCR, STT, chunking, embed)   │
 │ Studio (rapports, cartes, quiz, mind map, audio TTS + ffmpeg, deck)│
 │ recherche (web_search / web_fetch de Claude), exports, purges      │
 └────────────────────────────────────────────────────────────────────┘
        ▲ API officielles uniquement : Anthropic, embeddings, OCR, STT, TTS,
          Google Drive (OAuth de l'utilisateur), Stripe, Resend
```

---

## 3. Frontend et backend

### Arborescence cible

```
apps/web/
  app/(marketing)/            landing, tarifs, mentions légales
  app/(auth)/                 login, signup, callback, reset
  app/(app)/page.tsx          S03 tableau de bord (onglets, recherche, grille/liste)
  app/(app)/notebook/[id]/    S08 vue 3 panneaux (Sources | Chat | Studio)
  app/(app)/settings/         S28–S30
  app/s/[token]/              ouverture d'un lien public (S32)
  app/a/[token]/              artefact public sans compte (S33)
  app/api/**/route.ts         API (voir api-design.md)
  lib/supabase/{server,client}.ts, lib/auth.ts, lib/sse.ts
apps/worker/
  src/main.ts                 boucle claim → run → heartbeat
  src/jobs/{ingest,guide,overview,artifact,research,export,purge}.ts
packages/core/                domaine pur, testable sans réseau
  ai/   provider.ts (interface), anthropic.ts, models.ts (registre), prompts/*.ts
  rag/  chunker.ts, retrieve.ts, citations.ts (mapping + vérification)
  extract/ pdf.ts, docx.ts, pptx.ts, epub.ts, html.ts, csv.ts, audio.ts, image.ts
  studio/  report.ts, flashcards.ts, quiz.ts, mindmap.ts, datatable.ts, audio.ts, deck.ts
  schemas/ zod : entrées API, sorties structurées LLM
  security/ ssrf.ts, mime.ts, limits.ts
packages/db/  types générés, helpers de requêtes typés
supabase/     migrations/0001_init.sql (= replica/schema.sql), seed.sql, tests/*.sql (pgTAP)
```

### Principes

- **Lectures** : Server Components avec le client Supabase de l'utilisateur, donc sous RLS. Pas de lecture de données métier depuis le navigateur. Le client navigateur sert **uniquement** à l'auth et au Realtime.
- **Écritures** : **jamais depuis le client.** Les rôles `anon` et `authenticated` n'ont que `select` (RLS). Les Route Handlers écrivent en `service_role` après contrôle, sur une **liste blanche de colonnes** par route. Chaque handler suit le même ordre :
  1. vérifier la session ;
  2. valider l'entrée avec Zod ;
  3. contrôler le rôle (`notebook_role`) ;
  4. réserver le quota ;
  5. écrire ;
  6. créer le job.

  On choisit du REST plutôt que des Server Actions pour qu'une **API publique** (Z03) soit déjà en place et que les tests E2E restent simples.
- **État client** : TanStack Query (cache et invalidation sur les événements Realtime). Pas de store global.
- **Streaming du chat** : SSE depuis un Route Handler (runtime Node, `maxDuration` de 60 s). Événements : `delta`, `citation`, `done`, `error`.
- **Accessibilité** : composants Radix, navigation clavier dans le chat et le lecteur, `aria-live` pour la progression.

---

## 4. Multi-utilisateur et multi-tenant

- **Tenant = workspace.**
  - Chaque utilisateur reçoit un workspace *personnel* à l'inscription (trigger SQL).
  - Les workspaces *team* sont prévus pour l'offre B2B (Z01), avec les rôles `owner | admin | member`.
  - Facturation et quotas sont **portés par le workspace** : une équipe partage un même pool.
- **Partage transversal** : `notebook_members` donne `viewer` ou `editor` à une personne **hors** workspace, comme dans l'original. Liens publics : `share_links` avec la portée `full | chat_only | artifact`.
- **Autorisation unique** : `private.notebook_role(notebook_id)` renvoie `chat < viewer < editor < owner` ou `null`. Toutes les policies l'utilisent ; la recherche (`match_chunks`) est appelée par le serveur seulement après ce contrôle. Les Route Handlers l'appellent via `my_notebook_role()` (JWT de l'utilisateur) : c'est le contrôle **unique** des écritures, puisque les clients n'ont aucun droit d'écriture. Il est couvert par les tests.
- **Isolation** :
  - RLS sur 100 % des tables, clients en lecture seule ;
  - `workspace_id` et `notebook_id` dénormalisés sur les données volumineuses ;
  - le worker (service_role) filtre **toujours** par les IDs du job ;
  - tests pgTAP de non-fuite inter-tenant en CI.
- **Évolution** : si un gros client exige une base dédiée, la même migration s'applique à un projet Supabase séparé. Le code reste identique, seule la configuration change par tenant. C'est une option Enterprise, pas une architecture du MVP.

## 5. Authentification et sessions

- **Méthodes** : Supabase Auth avec email + mot de passe (vérification d'email obligatoire), lien magique et Google OAuth. SSO SAML et MFA TOTP arriveront avec le plan Team.
- **Sessions** :
  - cookies HTTP-only via `@supabase/ssr` ;
  - un middleware Next rafraîchit la session ;
  - côté serveur, l'identité est **toujours** obtenue par vérification du JWT (`getClaims` / `getUser`), jamais par `getSession()` seul ;
  - jeton d'accès de 1 h, rotation des refresh tokens.
- **Clés** : la clé `service_role` n'existe que dans les variables d'environnement serveur (Vercel) et worker (Fly), jamais dans un bundle client. Un test CI recherche la clé dans le build.
- **Âge** : les fonctions 18+ de l'original (deck, infographie, Deep Research) ne sont **pas** restreintes par défaut chez nous, car rien ne l'impose légalement pour ces usages. Le champ `profiles.adult_verified_at` reste disponible si une fonction l'exige (vidéo réaliste, par exemple).
- **Invitations** :
  - destinataire déjà inscrit : il est ajouté directement et reçoit un email ;
  - destinataire inconnu : une ligne `invited_email` est créée, puis résolue à l'inscription par le trigger.

## 6. Stockage des documents

- **Buckets privés** : `sources/`, `artifacts/`, `exports/`, avec les chemins `{workspace}/{notebook}/{id}/...`.
- **Upload** :
  1. le serveur valide le type déclaré et la taille (200 Mo maximum), puis crée une **URL d'upload signée** de 10 minutes ;
  2. le navigateur envoie le fichier directement à Storage, sans passer par Vercel (limite de corps de requête) ;
  3. `POST /sources` confirme et crée le job d'ingestion.
- **Lecture** : URL signée de 5 minutes, générée après contrôle de `notebook_role`.
- **Texte extrait** : stocké dans `sources.extracted_text` (TOAST Postgres). Il est la **référence des offsets de citation**, ce qui explique sa présence en base.
- **Déduplication** : `content_sha256` sert à avertir en cas de doublon dans le même notebook. Pas de déduplication inter-tenant, pour des raisons de confidentialité.
- **Suppression** : la cascade SQL est suivie du job `purge_storage` (objets Storage). Les fichiers d'upload abandonnés sont purgés après 24 h.

## 7. Pipeline d'importation et d'extraction (job `ingest_source`)

```
création (pending) ─► fetch/lecture ─► détection MIME réelle ─► extraction ─► normalisation
   ─► détection de langue ─► chunking ─► embeddings (lots) ─► tsvector ─► ready
   └─► Source Guide (job `source_guide`) et vue d'ensemble du notebook (`notebook_overview`) en aval
```

| entrée | extraction | notes |
| --- | --- | --- |
| PDF | pdf.js (`unpdf`), texte et numéros de page. **Fallback OCR** si une page a moins de ~50 caractères (PDF scanné). | PDF chiffré ou protégé → `protected_pdf`. |
| DOCX | `mammoth` (vers HTML puis texte avec titres) | Les titres alimentent `heading_path`. |
| PPTX | Lecture du ZIP et du XML des slides (une slide = une section) | Notes du présentateur incluses. |
| EPUB | ZIP + XHTML des chapitres | — |
| MD / TXT / CSV | Lecture directe. CSV → table Markdown par blocs de lignes. | — |
| Image | OCR + description par Claude vision | — |
| Audio / vidéo (fichier) | ffmpeg (extraction audio) → STT **avec horodatage** | `time_start_ms` sert aux citations audio. |
| URL web | **fetch SSRF-safe** (§ 15) → `@mozilla/readability` → texte | Paywall ou contenu vide → `paywall` ou `empty_content`. |
| Texte collé / note | Direct | Une note est réindexée à chaque sauvegarde (debounce 2 s). |
| Google Drive | **API Drive officielle**, OAuth de l'utilisateur (scope `drive.file` via Google Picker) ; export Docs → texte, Slides → texte, Sheets → CSV | Resynchronisation par pg_cron toutes les 10 min pour les sources actives ; perte d'accès → `inactive`. |
| YouTube | **Pas de récupération de transcript tiers** : aucune API officielle ne fournit les sous-titres des vidéos d'autrui. MVP : *le reporter*. Ensuite : vidéos **de l'utilisateur** via YouTube Data API (OAuth), ou upload du fichier puis STT. | Écart assumé avec l'original (B05 → P2). |

- **Normalisation** : NFC, espaces unifiés, conservation des sauts de paragraphe. Les offsets de citation se calculent **sur ce texte normalisé**. Il est figé une fois `ready`.
- **Garde-fous** : 500 000 mots maximum, timeout de 10 minutes par étape, nombre maximal de fichiers dans un ZIP, taille décompressée plafonnée (anti zip-bomb).
- **Idempotence** :
  - chaque étape réécrit son résultat en entier (les chunks sont remplacés en **une transaction** par la RPC `replace_chunks`, et `fts` est calculé par trigger) ;
  - un job rejoué ne crée pas de doublon ;
  - `idempotency_key = ingest:{source_id}:{content_sha256}`.

## 8. Chunking et embeddings

- **Découpage structurel puis par taille** :
  1. on coupe d'abord sur les titres, slides, pages et timestamps ;
  2. puis par paragraphes, regroupés jusqu'à **~400 tokens** (cible) avec un **chevauchement de ~60 tokens** ;
  3. on ne coupe jamais au milieu d'une phrase.
- **Ce qu'on stocke** : `char_start` et `char_end` (dans `extracted_text`), `page_start`, `time_start_ms`, `heading_path`.
- **Texte embeddé** : `"{titre de la source} › {heading_path}\n{contenu}"`. Le contexte améliore la recherche sans modifier `content`, qui reste la base des citations.
- **Embeddings** :
  - dimension **1024**, type `halfvec`, `embedding_model` stocké sur chaque ligne ;
  - envoi par lots de 64 à 128 chunks, avec retry exponentiel ;
  - la requête est embeddée côté web à chaque question (latence d'environ 100 ms).
- **Choix du fournisseur (M1)** : test sur **50 questions en français et en anglais** rédigées par nous sur nos propres documents (jamais sur des sorties de Gemini Notebook). Deux candidats compatibles 1024 dimensions : Voyage (multilingue) et Mistral (hébergé en UE). Critère : recall@10, puis le coût, puis la région. Les versions exactes des modèles seront figées à ce moment-là.
- **Changement de modèle** : job de ré-embedding progressif. `match_chunks` filtre implicitement sur les lignes non nulles. Pendant la transition, on interroge les deux modèles.

## 9. Recherche hybride et RAG

1. **Contexte** : sources cochées par l'utilisateur (défaut moins les `source_deselections`), notes comprises si elles sont cochées.
2. **Exécution côté serveur uniquement** : le Route Handler vérifie `notebook_role ≥ chat`, puis appelle `match_chunks` en `service_role`. La fonction n'est pas exposée aux clients. Le client ne reçoit que la réponse et les passages cités.
3. **Choix du mode** :
   - **Mode « intégral »** si les sources cochées totalisent **≤ 60 000 tokens**. Tous les chunks sont envoyés dans un bloc document placé en tête de prompt avec `cache_control`. La qualité est maximale (aucun rappel perdu). Le coût d'un échange suivant est faible grâce au cache : environ 60 k × 0,20 $/MTok ≈ **0,012 $** de lecture de cache avec Claude Opus 5.5, contre environ 0,24 $ sans cache.
   - **Mode « recherche »** au-delà. La RPC `match_chunks` exécute en parallèle :
     - un scan vectoriel exact filtré par notebook et sources, top 60 ;
     - une recherche plein texte `websearch_to_tsquery` sans accents, avec la config de langue, top 60 ;
     - une fusion **RRF (k = 60)** → top 30.

     On complète par un ré-ordonnancement léger (diversité par source, chunks voisins fusionnés) pour arriver à environ 20 chunks (~10 k tokens).
4. **Reranker** : non retenu au MVP. À évaluer au M3 sur le jeu de test si recall@10 < 0,85.
5. **Ce qui part au LLM** :
   - prompt système stable : règles d'ancrage, langue, style du notebook ;
   - **documents « contenu personnalisé »**, un bloc par chunk (§ 10) ;
   - les 6 derniers échanges ;
   - la question.
6. **Hors sources** : si aucun chunk ne dépasse le seuil ou si la question demande une création libre, le modèle répond qu'il ne trouve pas l'information dans les sources. C'est le comportement de l'original, imposé par le prompt et vérifié dans le jeu de test.
7. **Échelle** : le scan exact suffit jusqu'à environ 20 000 chunks par notebook (environ 600 sources moyennes). Au-delà, on active l'index HNSW avec `hnsw.iterative_scan`. Ce n'est pas nécessaire au MVP.

> **Mise à jour 2026-11-09 (décision de l'utilisateur)** : le chat **et** les embeddings passent par **OpenRouter** (API compatible OpenAI, `apps/web/lib/ai/openrouter.ts`, `apps/worker/src/ai/embeddings.ts`). Les citations natives de Claude (mécanisme A ci-dessous) ne sont pas exposées par cette API. Le chat utilise donc le **mécanisme B, étendu à la prose** : passages numérotés `<passage n>`, citations `[n]` dans la réponse, résolution et vérification serveur (`apps/web/lib/rag/citations.ts`). Les numéros absents des passages sont supprimés ; l'extrait affiché est une phrase exacte du passage, avec ses offsets absolus. Le § 11 (SDK Anthropic) est remplacé par ce connecteur ; les modèles se choisissent par configuration (`OPENROUTER_CHAT_MODEL`).

## 10. Citations vérifiables

On utilise deux mécanismes, parce que les **citations natives de Claude sont incompatibles avec les sorties structurées** (`output_config.format` renvoie une erreur 400).

**A. Chat, rapports, notes en prose : citations natives Claude**

- Chaque source retenue est envoyée comme **document à contenu personnalisé** (`source.type = "content"`), un **bloc texte par chunk**, avec `citations.enabled = true` et `title` = titre de la source.
- La réponse renvoie des citations `content_block_location` (`document_index`, `start_block_index`, `end_block_index` exclusif, `cited_text`). Le serveur fait une **correspondance déterministe** `(document_index, block_index) → chunk_id`, sans aucune analyse de texte libre.
- **Vérification serveur** avant d'enregistrer la citation :
  - `cited_text` est contenu dans le chunk (après normalisation des espaces) → `verified = true`, et les offsets absolus sont calculés : `char_start = chunk.char_start + indexOf` ;
  - sinon `verified = false`, la citation est affichée avec un avertissement et comptée dans les métriques.
- **Streaming** : les citations arrivent en événements `citations_delta`, relayés au client en SSE `citation`. `cited_text` n'est pas facturé en tokens de sortie.
- **Stockage** : `citations` contient `marker`, `chunk_id`, `source_id`, `quote_text`, `char_start` et `char_end`. La citation reste lisible si la source est supprimée.

**B. Studio structuré** (flashcards, quiz, mind map, data table, plan de deck, script audio)

- Les chunks sont envoyés avec un identifiant court (`[c12]`). Le schéma de sortie Zod / JSON impose `chunk_ids: string[]` sur chaque élément.
- Le serveur **rejette** les IDs absents de l'ensemble envoyé. Un élément sans ID valide est conservé mais marqué non sourcé.

**Affichage**
- Chip `[n]` ; au survol, `quote_text` ; au clic, la visionneuse S10 défile jusqu'à `char_start` et surligne `[char_start, char_end)`.
- Pour l'audio, saut au timestamp ; pour un PDF, numéro de page affiché.

**Indicateur de qualité suivi** : taux de citations vérifiées, avec un objectif ≥ 98 % sur le jeu de test.

**Lien « chat seul »** : le visiteur ne lit jamais les sources, mais il voit les extraits que les réponses citent. On l'indique dans l'interface de partage.

## 11. Orchestration des modèles IA

- **`LlmProvider`** (`packages/core/ai/provider.ts`) : `stream(chat)`, `generateStructured(schema)`, `generateWithCitations()`.
  - L'adaptateur Claude utilise **directement le SDK officiel `@anthropic-ai/sdk`**, sans couche d'abstraction tierce, pour profiter des citations, du cache et des server tools.
  - Un second adaptateur (Vertex AI UE ou Mistral) est possible sans toucher au domaine.
- **Registre** `models.ts` : chaque tâche a son modèle, son effort et ses limites, modifiables par configuration.

| tâche | modèle par défaut | effort | remarque |
| --- | --- | --- | --- |
| Chat ancré | `claude-opus-5-5` | `low` | Latence. La réflexion de ce modèle ne se désactive pas : l'effort est le seul levier, et sa valeur par défaut (`medium`) est **fixée explicitement**. |
| Studio (rapport, quiz, script, plan) | `claude-opus-5-5` | `medium` | Qualité. |
| Source Guide, vue d'ensemble, questions suggérées | `claude-opus-5-5` | `low` | — |
| Titres, emoji, labels | `claude-opus-5-5` | `low` | Candidat naturel à un modèle moins cher (voir ci-dessous). |
| Recherche web (Fast / Deep Research) | `claude-opus-5-5` + server tools `web_search_20260209` / `web_fetch_20260209` | `medium` / `high` | Outils officiels, aucun fournisseur de recherche en plus. |

> **Décision de coût à prendre par vous.** Tarifs Anthropic par million de tokens (entrée / sortie) :
> - Opus 5.5 : **4 $ / 20 $** ;
> - Sonnet 5.5 : **2 $ / 10 $** ;
> - Haiku 5.5 : **0,10 $ / 0,50 $**.
>
> Basculer les tâches mineures (titres, emoji, labels, Source Guide) vers Haiku 5.5, ou le chat vers Sonnet 5.5, réduirait fortement la marge brute nécessaire. Le registre le permet en une ligne. Je laisse Opus 5.5 par défaut tant que vous n'avez pas tranché après mesure.

**Règles d'appel** (contraintes actuelles de l'API)
- Streaming pour le chat et toute sortie longue.
- `fallbacks: "default"` (bêta `server-side-fallback-2026-07-01`). On gère `stop_reason: "refusal"` → message « réponse impossible » et statut `refused`.
- Pas de `tool_choice` forcé (erreur 400 sur ces modèles) : on utilise les sorties structurées ou `auto` + `strict: true`.
- Pas de prefill d'assistant.
- **Cache** : ordre stable outils → système → documents (mode intégral) → historique → question. Aucun horodatage ni identifiant variable avant le dernier point de cache. Le taux est surveillé via `usage.cache_read_input_tokens`.
- **Erreurs** : retry automatique du SDK (429, 5xx) ; au-delà, job en échec avec `error_code` et remboursement du quota.
- **Injection de prompt** : le contenu des sources n'entre **que** dans des blocs `document` et le prompt système précise que ce sont des données. **Le chat ancré n'a aucun outil**, donc un document piégé ne peut rien déclencher. Les outils web ne sont actifs que dans les jobs de recherche, sans accès aux données des autres notebooks.

## 12. Génération des contenus Studio

Chaque type d'artefact est un module `packages/core/studio/<type>.ts` qui exporte `{ optionsSchema, plan?, generate, render?, creditCost }`. Il est exécuté par le worker via le job `generate_artifact`.

| type | sélection du contenu | sortie | rendu / fichier |
| --- | --- | --- | --- |
| Rapport (FAQ, guide d'étude, briefing, personnalisé) | Intégral si ≤ 60 k tokens ; sinon map-reduce sur les Source Guides + chunks clés | Prose avec citations natives (A) | Markdown → HTML ; export DOCX ou MD |
| Data Table | Recherche guidée par le prompt de colonnes | JSON `{columns, rows[{cells, chunk_ids}]}` (B) | Tableau ; export CSV / XLSX |
| Mind map | Source Guides + titres | Arbre JSON avec `chunk_ids` par nœud (B) | React Flow ; export PNG |
| Flashcards / Quiz | Chunks échantillonnés par thème | JSON d'éléments `{front/back | question/choices/answer/hint/explanation, chunk_ids}` (B) | Viewers S20 / S21 ; export CSV |
| Audio Overview | Intégral ou map-reduce | Étape 1 : **script JSON** `{segments[{speaker, text, chunk_ids}]}` ; étape 2 : TTS par segment (2 voix) ; étape 3 : ffmpeg (concaténation, normalisation du volume) → MP3 | Lecteur, téléchargement |
| Slide deck (P2) | — | **Plan** (`outline_ready`, revue utilisateur) → slides JSON | HTML ; PPTX via `pptxgenjs` ; PDF via Chromium headless dans le worker |
| Infographie (P2) | — | Spécification JSON → rendu SVG maison (gabarits) | PNG. Pas de modèle d'image au MVP : rendu plus fiable et moins cher. |
| Vidéo (P3) | — | Script + visuels | Reportée : coût et complexité très élevés. |

- **Revue du plan** (deck, puis vidéo) : le job passe en `waiting_user`, l'artefact en `outline_ready`. `POST /artifacts/:id/proceed` relance un job de rendu. Le feedback est stocké dans `outline_feedback`.
- **Prompt personnalisé** : stocké dans `custom_prompt` et affiché via « voir le prompt ». C'est une donnée de l'utilisateur, insérée dans un bloc balisé et jamais dans le prompt système.
- **Langue** : `notebooks.output_language`, sinon `profiles.output_language`.

## 13. Tâches longues et progression

- **Une seule file** : la table `jobs`.
  - La création est atomique avec l'objet métier et la réservation de quota, grâce aux RPC `add_source` et `create_artifact` (une transaction Postgres ; un refus de quota annule tout).
  - `idempotency_key` empêche les doubles clics et les doubles soumissions.
- **Worker**
  - Boucle `claim_jobs(worker_id, kinds, n)` avec `FOR UPDATE SKIP LOCKED` et un bail de 60 s, prolongé toutes les 20 s par heartbeat.
  - Concurrence par type : ingestion 4, Studio texte 4, audio 2, recherche 2.
  - Mise à l'échelle horizontale en ajoutant des machines Fly.
- **Progression**
  - Le worker écrit `progress` (0–100) et `stage`, au plus une fois par seconde.
  - Le client s'abonne via Realtime à `jobs` filtrés par `notebook_id`, sous RLS. **Seule `jobs` est publiée** : publier `sources` ou `artifacts` rediffuserait `extracted_text` ou `content` à chaque changement de statut.
  - Les statuts métier (`sources.status`, `artifacts.status`) sont mis à jour en parallèle ; le client relit la ligne quand le job se termine.
- **Fin de job**
  - `succeeded` → `settle_usage(committed)`, notification web (Web Push si autorisée) et point bleu (`artifact_reads` absent).
  - `failed` → `settle_usage(refunded)`, `error_code` lisible (Q31 tranchée : échec visible, bouton Réessayer, crédit rendu).
- **Annulation** : `POST /jobs/:id/cancel` met `cancel_requested` à vrai. Le worker vérifie ce drapeau entre deux étapes.
- **Reprise sur panne**
  - pg_cron appelle `requeue_stale_jobs()` chaque minute, avec un backoff quadratique jusqu'à `max_attempts`. Au-delà, la fonction passe le job **et** la source ou l'artefact en `failed`, puis rembourse le quota (testé).
  - Les étapes sont idempotentes. Les étapes coûteuses (TTS par segment) sont mises en cache dans Storage par `hash(segment)` : un retry ne repaie pas ce qui est déjà produit.
- **« Générer plus tard »** : `run_after` = prochaine ouverture du quota, ou heure creuse ; `artifacts.status = 'scheduled'`.
- **Priorité** : `priority` est plus basse (donc plus urgente) pour les plans payants.

## 14. Quotas, abonnements et facturation

- **Notre modèle** (et non celui de l'original, contradictoire) : des **crédits mensuels par workspace** plus des **plafonds journaliers par fonctionnalité**, tous deux définis dans `plans.limits`.
  - Coûts en crédits (calibrés sur le coût IA réel au M3) : chat 1, rapport 5, carte mentale 3, audio 30, deck 30.
  - Limites structurelles : nombre de notebooks, sources par notebook, membres par notebook.
- **Réservation atomique** : `reserve_usage()` prend un verrou consultatif par workspace, vérifie les plafonds journalier et mensuel, puis insère une ligne `reserved`. En fin de job : `committed` ou `refunded`. Pour le chat, la réservation est confirmée en fin de streaming et remboursée en cas d'erreur.
- **Affichage**
  - Écran Usage (S29) : crédits restants, réinitialisation (début de mois / minuit UTC, affiché en heure locale).
  - Bannières dans le chat et le Studio.
  - Coût estimé affiché avant chaque génération.
- **Stripe**
  - Checkout (abonnement) → webhook `checkout.session.completed` / `customer.subscription.*` → mise à jour de `subscriptions` et `workspaces.plan_id`.
  - Customer Portal pour la gestion. **Stripe Tax** pour la TVA.
  - Montants en centimes et en euros.
  - Idempotence via `stripe_events`. La signature du webhook est vérifiée.
- **Plans** : la structure Free / Plus / Pro / Team est prévue. Les **prix sont fixés par `/replica-launch`**, sur la base du coût IA mesuré.

## 15. Sécurité, confidentialité et isolation

| sujet | mesure |
| --- | --- |
| Isolation | RLS 100 %, **clients en lecture seule** (les écritures passent par le serveur avec une liste blanche de colonnes), `notebook_role` unique, `match_chunks` réservé au serveur, tests pgTAP de non-fuite, service_role côté serveur uniquement, worker filtrant par les IDs du job. |
| SSRF (import d'URL, web) | Résolution DNS **une seule fois** puis connexion à l'IP résolue. Refus des plages privées, loopback et link-local v4/v6 et de l'IP de métadonnées (`169.254.169.254`). **Nouvelle vérification à chaque redirection** (5 maximum). Schémas http/https uniquement, ports 80/443, taille et durée plafonnées. Exécuté **dans le worker uniquement**. |
| Fichiers | MIME détecté sur le contenu (*magic bytes*). Liste blanche par `source_kind`. Limites de décompression des ZIP (docx, pptx, epub). Aucun fichier exécuté. Parsers en sandbox de processus avec timeout. |
| Injection de prompt | Sources = blocs `document` ; chat sans outils ; sorties structurées validées par Zod ; HTML des rapports nettoyé (sanitizer) avant affichage. |
| XSS / CSRF | React échappe par défaut ; Markdown rendu sans HTML brut ; cookies `SameSite=Lax` ; vérification d'`Origin` sur les POST. |
| Liens publics | Jeton de 32 octets aléatoires, seul le `sha256` est stocké, révocable, portée limitée (`chat_only` réellement appliqué). |
| Abus | Rate limiting par IP sur l'auth (natif Supabase) et par utilisateur sur `/api/*` (fenêtre glissante en base, ou Vercel WAF). Quotas. Signalements (`reports`). |
| Secrets | Variables d'environnement Vercel / Fly ; jetons OAuth Drive chiffrés (Supabase Vault). Aucun secret dans le dépôt (scan CI). |
| Données et IA | **Aucun entraînement sur les données client.** Mentions dans les CGU. Journal `audit_log` pour les partages, suppressions et changements de rôle. |
| RGPD | Export (`export_account` → ZIP) ; suppression du compte (`delete_account` : cascade + purge Storage + annulation Stripe) ; registre des sous-traitants ; DPA signables. |
| **Résidence des données** | **Stockage en UE** : Supabase Francfort, Fly `fra`, Vercel `fra1`. **Inférence** : l'API Claude directe propose `inference_geo` = `global` (défaut) ou `us`, **sans option UE**. Pour une inférence en UE (offre Enterprise), il faut passer par Claude sur **Vertex AI (région `eu`)** ou **Amazon Bedrock UE** (tarifs partenaires ; certaines fonctions comme les server tools web y sont absentes ou limitées). L'adaptateur `LlmProvider` rend ce basculement configurable par workspace. **Message commercial honnête** : « données stockées en UE ; traitement IA hors UE sauf offre Entreprise ». La rétention des données chez chaque fournisseur (LLM, embeddings, STT, TTS) est à vérifier et à documenter dans le registre RGPD avant le lancement. |

## 16. Les points délicats

- **Fuseaux horaires** : tout est en `timestamptz` UTC. La remise à zéro des quotas est en UTC et affichée en heure locale. Les dates relatives (« Il y a 1 h ») sont calculées côté client.
- **Idempotence** : `idempotency_key` sur les jobs, `stripe_events`, réingestion par remplacement transactionnel.
- **Concurrences** :
  - double soumission → clé d'idempotence ;
  - quota concurrent → verrou consultatif ;
  - deux workers → `SKIP LOCKED` ;
  - deux éditeurs sur une note → dernier enregistrement gagnant avec avertissement (pas de co-édition temps réel au MVP).
- **Limites de débit** : retry du SDK. Si l'API LLM est saturée, les jobs Studio attendent (`run_after` + backoff) au lieu d'échouer.
- **Taille des fichiers** : upload direct vers Storage (contourne la limite de corps de requête de Vercel), 200 Mo maximum.
- **Recherche** : cohérence des offsets garantie en figeant `extracted_text` ; FTS sans accents et selon la langue ; RRF.
- **Temps réel** : un seul canal par notebook ouvert ; on ne dépend pas de la livraison exactement-une-fois (le client relit l'état à la reconnexion).
- **Hors ligne** : non prévu (web).
- **Délivrabilité des emails** : domaine dédié avec SPF, DKIM et DMARC (`/replica-deploy`).
- **Multi-tenant** : voir § 4. **Suppression RGPD** : voir § 15.
- **Coût IA** : c'est le risque économique n° 1. On mesure le coût par requête dès le M1 (`chat_messages.usage`) et on ajuste les crédits avant d'ouvrir les plans payants.

## 17. Tests, observabilité, déploiement

- **Tests**
  - Vitest : chunker, correspondance des citations, SSRF, quotas en mémoire.
  - **pgTAP** : chaque policy, avec lecteur, éditeur, rôle chat et étranger.
  - **Playwright** : les flows F02 → F06 → F09 en E2E, avec LLM *mocké* par des fixtures.
  - **Jeu d'évaluation RAG** : 50 à 100 questions avec réponses attendues et passages sources, rédigées par l'équipe sur des documents libres de droits. Métriques : recall@10, taux de citations vérifiées, taux de refus correct. Lancé en CI de nuit et à chaque changement de modèle.
- **Observabilité** : Sentry (web et worker, traces des jobs), métriques de jobs (durée et échecs par type) via une vue SQL, coût IA par workspace et par jour (`usage`), alerte quand le taux de jobs en échec dépasse 5 %.
- **Déploiement**
  - Vercel : preview par PR, production sur `main`.
  - Fly : image Docker du worker avec ffmpeg et Chromium.
  - Supabase : migrations appliquées par la CI sur une branche de preview, puis en production.
  - Environnements : `local` (supabase start), `preview`, `production`.

## 18. Décisions ouvertes

| # | décision | quand | options |
| --- | --- | --- | --- |
| D1 | Fournisseur d'embeddings | M1 | Voyage ou Mistral (test recall@10) |
| D2 | Modèles des tâches mineures et du chat | Après mesure au M1 | Opus 5.5 (actuel), Sonnet 5.5 ou Haiku 5.5 |
| D3 | Fournisseurs STT et TTS | M5 | Qualité en français, coût à la minute, région |
| D4 | Inférence UE pour l'offre Entreprise | Avant la vente B2B | Vertex `eu` ou Bedrock UE |
| D5 | YouTube | M5 | Vidéos de l'utilisateur via OAuth, ou upload + STT |
| D6 | Prix des plans | `/replica-launch` | Selon le coût mesuré |
