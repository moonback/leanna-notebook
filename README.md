# Notebook

Assistant de recherche documentaire : importez vos documents, posez vos questions, et **vérifiez chaque réponse** grâce à des citations cliquables qui renvoient au passage exact de la source. À partir des mêmes sources, le Studio génère rapports, fiches de révision, quiz et cartes mentales.

Application SaaS multi-utilisateur (Next.js + Supabase + worker Node), conçue pour être commercialisée : isolation stricte des données entre clients, quotas par offre, traitements longs asynchrones avec statuts persistants.

> **État :** en développement actif. Les 22 fonctionnalités indispensables sont faites ; la facturation est **simulée** (aucun paiement réel) et l'envoi d'emails n'est pas encore branché. Détail dans [État d'avancement](#état-davancement).

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Structure du dépôt](#structure-du-dépôt)
- [Démarrage en local](#démarrage-en-local)
- [Variables d'environnement](#variables-denvironnement)
- [Scripts](#scripts)
- [Tests](#tests)
- [Fonctionnement interne](#fonctionnement-interne)
- [API](#api)
- [Sécurité et isolation des données](#sécurité-et-isolation-des-données)
- [État d'avancement](#état-davancement)
- [Documentation de conception](#documentation-de-conception)

---

## Fonctionnalités

### Notebooks et sources
- Tableau de bord : tous / les miens / partagés avec moi, recherche, renommer, supprimer (fichiers purgés du stockage).
- Import de sources : **PDF, DOCX, PPTX, EPUB, TXT, Markdown, CSV** et **audio MP3/WAV/M4A/AAC/OGG/FLAC/WEBM** (200 Mo max), **page web** (protection SSRF), **texte collé**, **notes**.
- Traitement en arrière-plan avec progression visible ; messages d’erreur explicites. Les fichiers audio sont transcrits par Deepgram Nova-3 ; les passages gardent leurs horodatages et la visionneuse permet de lire l’original.
- Sélection des sources interrogées, renommage, suppression.
- **Guide de source** : résumé et thèmes clés en tête de la visionneuse (cliquer un thème pose la question au chat).

### Chat avec citations vérifiables
- Réponses en flux (streaming), fondées **uniquement** sur les sources sélectionnées (recherche hybride vecteur + plein texte).
- Chaque affirmation porte un numéro `[n]` : la pastille affiche l'extrait cité et ouvre la source **avec le passage surligné**. Les numéros inventés par le modèle sont supprimés ; chaque citation indique si l'extrait a été retrouvé tel quel.
- Résumé du notebook et **3 questions suggérées** à l'ouverture, mis à jour après chaque ajout ou suppression de source.
- Arrêter une réponse (le texte partiel et ses citations sont conservés), effacer l'historique, avis 👍/👎 avec motif.
- Réglages par notebook : style (par défaut, guide d'apprentissage, personnalisé) et longueur des réponses.
- Enregistrer une réponse en **note** (avec ses citations) ; une note peut elle-même servir de source.

### Studio
- **Rapport** (note de synthèse, guide d'étude, FAQ) avec citations cliquables.
- **Fiches de révision** : retourner, « Je savais » / « À revoir », reprise là où on s'est arrêté, export **CSV**.
- **Quiz** (QCM) : indice, explication, score enregistré, reprise, « Expliquer dans le chat ».
- **Carte mentale** dépliable ; cliquer un thème l'explore dans le chat.
- **Audio Overview (G01)** : script de podcast dialogué, deux voix ElevenLabs, assemblage MP3 par ffmpeg, stockage privé et lecteur intégré au Studio. Nécessite deux identifiants de voix et ffmpeg côté worker.
- **Fast Research (B17)** : recherche web asynchrone, cinq résultats maximum avec extrait explicatif, sélection multiple et import direct comme sources indexées.
- **Découvrir (S04)** : galerie de notebooks éditoriaux publiés, ouverture en lecture seule et copie dans sa bibliothèque si autorisée.
- **Invitations** : les invitations en attente expirent après 30 jours et sont nettoyées quotidiennement par pg_cron.
- Options (difficulté, quantité, consignes libres), génération en arrière-plan, point « non lu », notification du navigateur quand l'onglet est en arrière-plan, crédit restitué en cas d'échec.

### Compte, partage et offres
- Inscription / connexion par email et mot de passe ou **lien magique**.
- **Partage privé** : inviter par email en lecteur ou éditeur, invitation en attente rattachée à l'inscription, changer le rôle, retirer l'accès (effet immédiat).
- **Liens de partage** : « lecture et chat » ou « chat seul » (sources et Studio refusés par le serveur), jeton haché, révocation immédiate.
- **Copie de notebook** : le propriétaire peut autoriser les lecteurs à copier. La copie reprend sources prêtes, passages indexés, guides, artefacts prêts et leurs citations, avec les fichiers ; pas les conversations, notes ni partages. Elle est annulée entièrement si la duplication des fichiers échoue.
- Offres Gratuit / Pro avec quotas (crédits mensuels, limites quotidiennes par type, nombre de notebooks, de sources, de membres) ; écran **Consommation** dans les réglages.
- Préférences : nom affiché, langue des réponses, thème clair / sombre / système.
- **Export des données** (Réglages › Vos données) : un fichier JSON avec profil, notebooks, sources (texte extrait), contenus générés, conversations, progression, usage et journal d'audit, plus des liens signés de 7 jours vers les fichiers d'origine. Les passages indexés et les embeddings n'y figurent pas.
- **Suppression définitive du compte** (Réglages › Zone dangereuse) : confirmation par saisie de l'email, puis effacement en cascade du profil, des espaces possédés (notebooks, sources, conversations, artefacts) et des fichiers du stockage. Les notebooks partagés disparaissent aussi pour leurs destinataires.
- Pages publiques **Confidentialité** (`/privacy`) et **Conditions d'utilisation** (`/terms`), liées depuis les écrans de connexion et d'inscription.
- Envoyer un avis ou **signaler un notebook** (stocké pour modération).

---

## Architecture

```
┌──────────────────────────┐      ┌────────────────────────────────────┐
│  apps/web (Next.js 15)   │      │  Supabase                          │
│  pages React + API /v1   │─────▶│  Postgres (RLS, pgvector, FTS)     │
│  chat en flux (SSE)      │      │  Auth  ·  Storage (buckets privés) │
└────────────┬─────────────┘      └───────────────┬────────────────────┘
             │ crée des jobs                      │ réclame les jobs (SKIP LOCKED)
             ▼                                    ▼
      table `jobs` ◀──────────────────── apps/worker (Node 24)
                                         ingestion · embeddings · Studio
                                         guides · résumés · rattrapage
             ▲
             └── OpenRouter (API compatible OpenAI) : chat, génération, embeddings
```

| Couche | Choix |
| --- | --- |
| Web | Next.js 15 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4 (tokens de design), Radix UI, lucide-react |
| Données | Supabase : Postgres + Row Level Security, `pgvector` (`halfvec(1024)`), `pg_trgm`, `unaccent` |
| Auth | Supabase Auth (cookies via `@supabase/ssr`) |
| Fichiers | Supabase Storage, buckets privés `sources`, `artifacts`, `exports` |
| Traitements longs | Worker Node 24 (TypeScript exécuté nativement), file `jobs` en base |
| IA | OpenRouter : chat en flux, génération JSON, embeddings 1024 dimensions |
| Code partagé | `@notebook/core` (résolution des citations, utilisée par le web et le worker) |
| Tests | Vitest, pgTAP |

Principes : **une seule base**, pas de micro-services ; les clients ne font que **lire** sous RLS, toutes les écritures passent par le serveur après vérification du rôle ; tout traitement long passe par la file `jobs` avec statut persistant (aucune requête HTTP ne reste ouverte pendant une extraction).

---

## Structure du dépôt

```
apps/
  web/                    Application Next.js
    app/                  Pages (tableau de bord, notebook, réglages, auth, /design)
    app/(legal)/          Pages publiques /privacy et /terms
    app/api/v1/           API REST
    components/ui/        Composants réutilisables (Button, Dialog, Panel, Citation…)
    lib/                  Auth/rôles, validation (zod), clients Supabase, OpenRouter, facturation
  worker/                 Worker de jobs
    src/ingest/           Extraction, découpage, protection SSRF
    src/research/        Recherche web Fast Research (Tavily)
    src/studio/           Génération Studio, guides de source, résumés
    src/ai/               Clients OpenRouter (génération, embeddings), adaptateur STT Deepgram
packages/
  core/                   Citations partagées
supabase/
  migrations/             Schéma, stockage, partage, copie de notebook
  tests/                  Tests pgTAP (sécurité, isolation, partage, copie)
  seed.sql                Offres Gratuit et Pro
  config.toml             Ports locaux 583xx
replica/                  Documents de conception (voir plus bas)
start.bat                 Lance le web et le worker (Windows)
```

---

## Démarrage en local

### Prérequis
- **Node.js 24** (le worker exécute TypeScript nativement)
- **pnpm**
- **Docker** (Supabase local)

### 1. Installer
```bash
pnpm install
```

### 2. Démarrer Supabase
```bash
pnpm db:start
```
Les ports locaux sont dans la plage 583xx : API `58321`, base `58322`, Studio Supabase `58323`, boîte mail de test `58324`. La commande affiche l'URL de l'API et les clés `anon` et `service_role` (aussi visibles avec `pnpm exec supabase status`).

Pour repartir d'une base propre avec les offres de test :
```bash
pnpm db:reset
```

### 3. Configurer
Copiez les exemples puis remplissez-les (voir [Variables d'environnement](#variables-denvironnement)) :
```bash
cp apps/web/.env.example apps/web/.env.local
```
```bash
cp apps/worker/.env.example apps/worker/.env
```
Sans clé OpenRouter, l'application fonctionne mais le chat et le Studio indiquent que l'assistant n'est pas configuré, et la recherche se fait en plein texte seulement.

### 4. Lancer
Dans deux terminaux :
```bash
pnpm dev
```
```bash
pnpm --dir apps/worker start
```
Sous Windows, `start.bat` ouvre les deux. L'application est sur http://localhost:3000. Les emails (confirmation, lien magique) arrivent dans la boîte de test http://127.0.0.1:58324.

---

## Variables d'environnement

Les fichiers `.env*` ne sont jamais versionnés. Les clés `service_role` et OpenRouter restent côté serveur.

### `apps/web/.env.local`
| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de l'API Supabase (local : `http://127.0.0.1:58321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur (écritures après contrôle du rôle) |
| `OPENROUTER_API_KEY` | Clé OpenRouter ([openrouter.ai/keys](https://openrouter.ai/keys)) |
| `OPENROUTER_CHAT_MODEL` | Identifiant du modèle de chat sur OpenRouter |
| `TAVILY_API_KEY` | Clé du fournisseur de recherche web Fast Research (également requise côté worker) |
| `OPENROUTER_EMBEDDINGS_MODEL` | Modèle d'embeddings **1024 dimensions** (facultatif) |
| `OPENROUTER_BASE_URL` | Facultatif : autre point d'accès compatible (tests) |
| `APP_URL` | URL publique de l'application |
| `BILLING_MODE` | `simulated` (par défaut, aucun paiement réel) ; `stripe` à venir |
| `NEXT_PUBLIC_LEGAL_ENTITY` | Raison sociale de l'éditeur, affichée dans `/privacy` et `/terms` |
| `NEXT_PUBLIC_LEGAL_EMAIL` | Email de contact (droits RGPD), affiché dans `/privacy` et `/terms` |

Les deux variables `NEXT_PUBLIC_LEGAL_*` sont à renseigner **avant toute mise en ligne** ; vides, les pages légales affichent des formulations génériques.

### `apps/worker/.env`
| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Accès à la base et au stockage |
| `WORKER_ID` | Nom du worker (par défaut : machine + PID) |
| `EMBEDDINGS_PROVIDER` | `openrouter` (défaut), `voyage` ou `mistral` |
| `EMBEDDINGS_MODEL`, `EMBEDDINGS_API_KEY` | Modèle et clé d'embeddings (1024 dimensions) |
| `OPENROUTER_API_KEY`, `OPENROUTER_CHAT_MODEL` | Génération du Studio, guides et résumés |
| `DEEPGRAM_API_KEY` | Transcription des sources audio B06 (facultatif pour les autres sources) |
| `ELEVENLABS_API_KEY` | Synthèse vocale Audio Overview (G01) |
| `AUDIO_OVERVIEW_HOST_VOICE_ID`, `AUDIO_OVERVIEW_GUEST_VOICE_ID` | Deux identifiants de voix ElevenLabs distincts |
| `AUDIO_OVERVIEW_TTS_MODEL` | Modèle TTS (défaut `eleven_multilingual_v2`) |
| `FFMPEG_PATH` | Chemin vers ffmpeg (défaut `ffmpeg`, à installer sur la machine du worker) |
| `STT_MODEL`, `STT_LANGUAGE` | Modèle STT (`nova-3`) et langue (`multi`) |
| `OPENROUTER_BASE_URL` | Facultatif, comme côté web |

Le web et le worker doivent utiliser **le même modèle d'embeddings**, sinon la recherche vectorielle compare des vecteurs incompatibles.

---

## Scripts

| Commande (racine) | Effet |
| --- | --- |
| `pnpm dev` | Application web en développement |
| `pnpm --dir apps/worker start` | Worker de jobs |
| `pnpm typecheck` | Vérification TypeScript de tous les paquets |
| `pnpm lint` | ESLint |
| `pnpm test` | Tests Vitest de tous les paquets |
| `pnpm db:start` | Démarre Supabase local |
| `pnpm db:reset` | Recrée la base (migrations + données de départ) |
| `pnpm db:test` | Tests pgTAP de la base |

---

## Tests

```bash
pnpm test
```
```bash
pnpm db:test
```

- **packages/core** : résolution des citations (renumérotation, numéros inventés, offsets).
- **apps/web** : validation des entrées, rendu Markdown sûr des rapports, export CSV.
- **apps/worker** : découpage, protection SSRF, extraction Office, ingestion de bout en bout, génération Studio, guides et résumés, cycle de vie des jobs (échec, remboursement, rattrapage d'un worker arrêté). Les tests d'intégration utilisent Supabase local et sont ignorés sans `apps/worker/.env`.
- **pgTAP** : RLS sur toutes les tables, isolation entre clients (un autre utilisateur ne voit ni notebook, ni source, ni passage, ni fichier), liens « chat seul », quotas atomiques, partage et retrait d'accès, copie de notebook (`03_copy.test.sql`).

> Les tests d'intégration du worker partagent la base locale de développement. Leurs jobs passent en priorité pour ne jamais traiter vos jobs réels ; une base de test séparée reste préférable.

---

## Fonctionnement interne

### Ingestion
1. Le navigateur envoie le fichier au stockage, puis l'API enregistre la source et son job `ingest_source` **dans la même transaction**.
2. Le worker extrait le texte (PDF, Office, EPUB, page web lisible) ou transcrit l’audio via Deepgram. Pour l’audio, les utterances sont converties en texte et leurs offsets temporels en millisecondes sont propagés aux chunks ; le worker normalise, découpe, calcule les embeddings si configurés et indexe le plein texte.
3. Le statut de la source (`pending` → `processing` → `ready` / `failed` avec code d'erreur) est persistant ; l'interface l'affiche en direct.
4. Une fois la source prête : guide de source et résumé du notebook (différé de 20 s pour regrouper les imports), sans consommer de quota.

### Réponse avec citations
Recherche hybride (vecteur + plein texte, fusion RRF) sur les sources sélectionnées → passages numérotés envoyés au modèle → réponse en flux → `@notebook/core` supprime les numéros inexistants, renumérote, choisit la phrase la plus proche dans le passage et calcule sa position exacte dans la source, ce qui permet le surlignage.

### Jobs
File `jobs` en base : réclamation concurrente (`SKIP LOCKED`), bail prolongé par battement de cœur, nouvelles tentatives avec attente croissante, erreurs définitives distinguées des erreurs temporaires. Le quota est **réservé** à la création et **confirmé ou remboursé** à la fin. Chaque minute, le worker remet en file les jobs d'un worker arrêté (ou les passe en échec avec remboursement au dernier essai). Plusieurs workers peuvent tourner en parallèle.

### Facturation
Interface `BillingProvider` ; l'implémentation actuelle est **simulée** (changement d'offre immédiat, abonnements `sim_…`, aucun paiement). Le branchement Stripe (Checkout, portail client, webhooks) reste à faire avec vos propres clés.

---

## API

Préfixe `/api/v1`. Authentification par cookie de session ; chaque route vérifie le rôle de l'utilisateur sur le notebook. Les corps sont validés (zod) et les requêtes d'écriture vérifient l'origine.

| Ressource | Routes |
| --- | --- |
| Profil | `GET` `PATCH` `DELETE` `/me` (`DELETE` : `{ "confirm": "<email>" }`, suppression définitive, `204`) · `GET` `/me/export` (JSON en téléchargement) |
| Notebooks | `GET` `POST` `/notebooks` · `GET` `PATCH` `DELETE` `/notebooks/:id` (`PATCH allow_copies` : propriétaire) · `POST` `/notebooks/:id/copy` (`201`, `403 copies_disabled`, `409 max_notebooks`) |
| Sources | `POST` `/notebooks/:id/uploads` · `GET` `POST` `/notebooks/:id/sources` · `PUT` `/notebooks/:id/selection` · `GET` `PATCH` `DELETE` `/sources/:id` |
| Notes | `POST` `/notebooks/:id/notes` · `GET` `PATCH` `/notes/:id` · `POST` `/messages/:id/save-note` |
| Chat | `GET` `POST` `/notebooks/:id/conversations` · `GET` `POST` (flux SSE) `DELETE` `/conversations/:id/messages` · `POST` `/messages/:id/feedback` |
| Studio | `GET` `POST` `/notebooks/:id/artifacts` · `GET` `DELETE` `/artifacts/:id` · `PUT` `DELETE` `/artifacts/:id/progress` |
| Partage | `GET` `POST` `/notebooks/:id/members` · `PATCH` `DELETE` `/notebook-members/:id` · `GET` `POST` `/notebooks/:id/links` · `DELETE` `/share-links/:id` |
| Offre | `POST` `/workspaces/:id/billing` |
| Avis | `POST` `/reports` |

Codes d'erreur : `401` non connecté, `403` rôle insuffisant, `404` inexistant **ou invisible** (on ne révèle pas l'existence d'un notebook d'un autre client), `409` conflit ou plafond, `422` validation (avec le détail par champ), `429` quota, `503` IA non configurée.

---

## Sécurité et isolation des données

- Chaque notebook, source, passage, conversation, note et artefact appartient à un **workspace** ; l'accès est calculé par une seule fonction de rôle (`owner`, `editor`, `viewer`, `chat`).
- **RLS active sur toutes les tables** (vérifié par test) ; les clients n'ont que la lecture, les écritures passent par l'API après contrôle du rôle.
- Fonctions sensibles (recherche de passages, quotas, recherche de compte par email) **réservées au serveur** : exposées aux clients, elles permettraient d'extraire un corpus ou de tester des adresses.
- Fichiers dans des buckets **privés**, chemins préfixés par workspace et notebook ; extraction web protégée contre le SSRF ; archives Office protégées contre les « zip bombs ».
- Contenu des sources traité comme une **donnée** : les prompts demandent d'ignorer toute instruction qui s'y trouverait ; les sorties JSON du modèle sont validées, le Markdown est rendu sans HTML.
- Journaux structurés sans données personnelles (adresses et secrets masqués) ; journal d'audit pour les suppressions et le partage.
- **RGPD** : suppression du compte en libre-service (base en cascade + purge des buckets `sources`, `artifacts`, `exports`) ; une purge de fichiers qui échoue est seulement journalisée (`storage.purge_failed`) : le type de job `purge_storage` existe mais son traitement n'est pas encore écrit, la reprise est donc manuelle. Export des données en JSON en libre-service ; il est construit en mémoire dans la requête, ce qui convient aux comptes de taille courante mais devra passer par un job (`export_account`) pour les très gros volumes.
- Limites : taille des fichiers, nombre de mots, quotas, 20 signalements par jour.

---

## État d'avancement

Parité pondérée avec la référence fonctionnelle : **environ 67 %** ; **22/22 indispensables**.

| Jalon | Contenu | État |
| --- | --- | --- |
| M0–M2 | Socle, ingestion, chat avec citations, notes | fait |
| M3 | Studio texte, quotas visibles, chat avancé, résumés, avis | fait, sauf Stripe réel |
| M4 | Partage et RGPD | en cours : partage privé, liens de partage (lecture + chat, chat seul), copie de notebook, export des données, suppression de compte et pages Confidentialité / Conditions faits ; lien public d'un artefact, recherche web et onglet Découvrir à faire |
| M5 | Import/transcription audio, lecteur temporel et Audio Overview deux voix ; connecteurs Google Drive | Audio Overview implémenté sur branche dédiée, validation locale et benchmark TTS à faire ; Google Drive à faire |
| M6 | Présentations, infographies, recherche web, équipes | à faire |

Limites actuelles : paiement simulé ; pas d'envoi d'emails applicatifs (invitations, notifications) ; pas de notification hors de l'onglet ; pas d'écran de modération ; pas de reconnaissance de texte pour les PDF scannés ; pas encore de déploiement de production.

---

## Documentation de conception

Le dossier [`replica/`](replica/) contient la reconnaissance fonctionnelle, l'architecture et le suivi :

- [`architecture.md`](replica/architecture.md), [`database-schema.md`](replica/database-schema.md), [`api-design.md`](replica/api-design.md) : conception technique
- [`implementation-roadmap.md`](replica/implementation-roadmap.md) : jalons et critères de sortie
- [`features.csv`](replica/features.csv) : matrice des fonctionnalités et état de chacune
- [`build-log.md`](replica/build-log.md) : journal de construction
- [`design/`](replica/design/) : tokens et spécifications des composants (page de démonstration sur `/design`)

Notebook est un produit indépendant : identité, code et contenus sont originaux ; aucune ressource ni sortie d'un service tiers n'y est réutilisée.
