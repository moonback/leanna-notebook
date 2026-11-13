# Leanna Browser — architecture

## Vue d'ensemble

```
┌──────────────────────────── Fenêtre Electron (BrowserWindow) ────────────────────────────┐
│ Renderer de l'application = Next.js (origine LEANNA_WEB_URL)                              │
│   app/browser/*  : onglets, barre d'adresse, panneau Leanna, bibliothèque, réglages        │
│   └─ window.leannaDesktop.browser.*  ──IPC « browser:* »──┐                                │
│                                                            ▼                               │
│ Processus Main (apps/desktop/src/browser)                                                  │
│   BrowserManager ── possède ──► WebContentsView × N  (pages web, sans preload, sandbox)    │
│   BrowserAgent   ── garde-fous + exécution des outils                                      │
│   BrowserDataStore ── userData/browser-data.json                                           │
└────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ fetch (cookies de session)
        │
Serveur Next.js : POST /api/v1/browser/agent ──► OpenRouter (streamChat + outils)
                  POST /api/v1/notebooks/:id/sources | notes  (routes existantes) ──► worker d'ingestion
```

Le renderer est l'application web existante, chargée à distance en production. Il ne voit jamais une page
visitée : celles-ci vivent dans des `WebContentsView` natives que le processus Main superpose à une zone vide
de l'interface (`[data-browser-viewport]`), dont le renderer communique la position.

## Processus Main (`apps/desktop/src/browser/`)

| Fichier | Rôle |
|---|---|
| `browser-manager.ts` | Cycle de vie des onglets, navigation, zoom, plein écran, pop-ups, permissions, téléchargements, crash, session. Seul détenteur des `WebContents`. |
| `browser-validation.ts` | Fonctions pures : URL sûres, résolution d'adresse/recherche, bornes, permissions, fichiers à risque, messages d'erreur. |
| `browser-shortcuts.ts` | Table unique des raccourcis clavier. |
| `browser-data-store.ts` | Réglages, favoris/dossiers, historique, session d'onglets, permissions par origine, téléchargements (JSON atomique). |
| `page-scripts.ts` | Fonctions autonomes injectées dans les pages, en **monde isolé**. |
| `browser-extract.ts` | Extraction : Readability (injecté) puis nettoyage, segmentation, bornage côté Main. |
| `agent-tools.ts` | Les 19 outils : schémas stricts et validation. |
| `browser-agent.ts` | Politique de l'agent (modes, sensibilité, provenance) et exécution. |
| `browser-ipc.ts` | Enregistrement unique des canaux `browser:*`, contrôle de l'émetteur, revalidation. |

Points de conception :

- **Un onglet = une `WebContentsView`** avec sa pile de navigation et son processus. Les onglets normaux partagent le profil
  `persist:leanna-browser` (connexions conservées) ; chaque onglet privé a sa propre partition en mémoire.
- **Onglets restaurés paresseusement** : seul l'onglet actif est chargé au démarrage.
- **Monde isolé** (`executeJavaScriptInIsolatedWorld`) : la page ne peut ni voir ni modifier Readability ou nos scripts.
  Les actions approuvées (clic, saisie) portent une activation utilisateur, sans quoi Chromium saute l'entrée d'historique créée.
- **Dialogues natifs injectés** (`ManagerDeps`) : enregistrement, fichier à risque, permission. Non falsifiables par une page
  ni par le renderer ; remplaçables dans les tests.

## Extraction de contenu

`extractPage(tabId)` → `PageContent` : `status` (`ok` / `empty` / `unavailable` + `reason`), titre, URL (celle de l'onglet, pas
celle que déclare la page), description, auteur, langue, date de publication, URL canonique, titres, liens, tableaux, et le
texte principal **nettoyé** (contrôles et caractères invisibles retirés), **segmenté** (≈ 1 200 caractères) et **borné**
(24 000 caractères pour l'IA ; texte complet jusqu'à 1 000 000 pour l'enregistrement dans le Notebook).
Le DOM n'est jamais transmis.

## Agent de navigation

Même patron que l'assistant vocal existant (le modèle propose, le client fait exécuter) — pas de seconde pile IA.

```
utilisateur ─► runTurn (app/browser/agent-runner.ts)
   1. agentStart(texte)                         Main : nouveau tour, registre des adresses connues
   2. extractPage(onglet actif)                 contexte de page borné
   3. POST /api/v1/browser/agent                serveur : quota, prompt, <untrusted_web_content>, outils → modèle
   4. pour chaque appel d'outil proposé :
        agentCall(nom, arguments)               Main : schéma → mode → inspection → décision
          ├─ ok                                 exécuté, résultat renvoyé au modèle
          ├─ confirmation_required              journal « en attente » → Autoriser / Refuser → agentResolve
          └─ refused / error                    rapporté au modèle
   5. retour en 3 avec le jeton de continuation, jusqu'à la réponse finale (12 étapes max)
```

Cycle comprendre → planifier → agir → observer → vérifier → récupérer : porté par le prompt (annonce du plan, une étape à la
fois, relecture après action, autre voie en cas d'échec) et par les résultats d'outils, qui décrivent l'état réel après chaque
action (URL, titre, erreur éventuelle).

## Côté web (`apps/web`)

| Fichier | Rôle |
|---|---|
| `app/browser/browser-client.tsx` | Coquille : état, synchronisation de la vue native, raccourcis, panneaux. |
| `app/browser/{tab-strip,toolbar,ai-panel,library-panel,settings-panel,notebook-save-bar}.tsx` | Interface. |
| `app/browser/agent-runner.ts` | Boucle de l'agent, sans React (testée avec simulacres). |
| `app/browser/notebook-save.ts` | Ajout au Notebook par les routes existantes. |
| `app/api/v1/browser/agent/route.ts` | Une étape de modèle (SSE). |
| `lib/browser/context.ts` | Schémas de requête, assemblage des messages, bloc non fiable. |
| `lib/browser/continuation.ts` | Jeton HMAC de continuation. |
| `lib/browser/tools.ts` | Copie des définitions d'outils déclarées au modèle (égalité testée avec le desktop). |
| `lib/ai/prompts/*` | Prompts versionnés de Leanna et Roxane. |
| `lib/ai/openrouter.ts` | `streamChat`, étendu aux appels d'outils. |

## Données

| Donnée | Emplacement | Migration |
|---|---|---|
| Favoris, dossiers, historique, session, réglages, permissions, téléchargements | `userData/browser-data.json` (local) | Aucune (format v1 de la première tentative relu sans perte) |
| Pages ajoutées au Notebook | `sources` (routes existantes) : `origin_url` + `external_ref.browser` (`added_at`, `consulted_at`, `favicon_url`, `title`, `mode`) | Aucune : colonnes existantes |
| Synthèse IA d'une page | Source `kind='note'` (route `notes` existante) | Aucune |
| Personnalisation des prompts | `ai_prompt_overrides` (`voice.leanna`, `voice.roxane`), réutilisée | Aucune |
| Conversation du panneau | Mémoire du renderer | — |

## Tests

| Suite | Commande | Contenu |
|---|---|---|
| Unitaires desktop | `pnpm --dir apps/desktop test` | validation, stockage, IPC, extraction, outils, agent |
| Unitaires web | `pnpm --dir apps/web test` | prompts, assemblage, jeton, boucle de l'agent, Notebook |
| E2E Electron | `pnpm --dir apps/desktop test:e2e` | moteur réel (`browser.e2e.cjs`) et UI réelle (`ui.e2e.cjs`) |
| Évaluation des prompts | `RUN_PROMPT_EVAL=1 pnpm --dir apps/web exec vitest run lib/ai/prompts/eval` | vrai modèle (facturé) |

Le banc E2E de l'UI compile la vraie interface React (esbuild + Tailwind) et la sert depuis une origine locale de confiance ;
seule l'API serveur est simulée (`e2e/servers.cjs` : modèle scripté, Notebook).
