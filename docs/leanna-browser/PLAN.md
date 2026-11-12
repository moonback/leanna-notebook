# Leanna Browser — audit et plan

Branche : `feat/leanna-browser` · Dernière mise à jour : 2026-11-13

Ce fichier sert de mémoire de travail. Il remplace `docs/audits/LEANNA_BROWSER_AUDIT.md`
(première passe, conservée pour l'historique).

## 1. Conclusions de l'audit

### Monorepo
- pnpm 10, Node 24. `apps/web` (Next.js 15.5, React 19, Tailwind 4, Radix, zod, vitest 3),
  `apps/desktop` (Electron 38, TypeScript 5.9, tests `node --test` sur `dist/`),
  `apps/worker` (ingestion, recherche, Studio), `packages/core` (citations).
- Scripts racine : `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm desktop:test`.

### Electron
- `apps/desktop/src/main.ts` : une `BrowserWindow` qui charge l'application web
  (`LEANNA_WEB_URL`, distante en production). Le renderer **est** l'application Next.js.
- Preload unique `preload.ts` → `window.leannaDesktop` (contextBridge). IPC en
  `ipcMain.handle("domaine:action")`, émetteur vérifié.
- Electron 38 ⇒ `WebContentsView` disponible et retenu (pas de `BrowserView`, pas d'iframe).

### État de la branche à la reprise
Une première tentative existait (32 commits) : `BrowserManager` (WebContentsView), stockage JSON
local, UI minimale, route `/browser`. Constats vérifiés :
- **Le build desktop était cassé** : `browser-manager.ts(147)` appelait `webContents.destroy()`,
  absent du typage Electron 38 (`pnpm --dir apps/desktop test` → `TS2339`, exit 2).
- Aucun test n'avait été exécuté. Pas d'agent, pas de panneau IA, pas de zoom, pas de restauration,
  permissions toutes refusées, extraction = `innerText` brut jusqu'à 3,4 Mo.
- Base web saine : `tsc --noEmit` OK, 25 tests vitest OK, lint 0 erreur (15 avertissements).

### IA existante (il n'y a pas de « registre d'outils » générique)
- **Chat texte** : `apps/web/lib/ai/openrouter.ts` (`streamChat`, SSE, sans outils) utilisé par
  `app/api/v1/conversations/[id]/messages/route.ts`. Modèle : préférence utilisateur
  `ai_model_preferences(feature_key='chat')` sinon `OPENROUTER_CHAT_MODEL`.
- **Voix** : Gemini Live. `notebooks/[id]/voice-token/route.ts` déclare les outils
  (`search_notebook_sources`, `create_studio_artifact`) ; le **client** exécute les appels d'outils
  (`voice-assistant.tsx`) en appelant les routes API. C'est le seul patron « agent + outils » du repo.
- **Quotas** : `reserve_usage` / `settle_usage` (RPC), fonctionnalité `chat`.
- Décision : l'agent navigateur réutilise ce patron — le modèle (OpenRouter, via `streamChat`
  étendu aux outils) émet des appels d'outils, le client les fait exécuter. Pas de seconde pile IA.

### Prompts de Leanna et de Roxane
- `apps/web/lib/ai/prompts/leanna.ts`, `roxane.ts`, `chat.ts`, catalogue `lib/ai/prompt-catalog.ts`.
- Personnalisations utilisateur : table `ai_prompt_overrides` (clés figées par contrainte SQL),
  éditées dans Réglages → Prompts système. Pour la voix, le texte utilisateur est **ajouté** au
  prompt de référence ; il n'est jamais écrasé par une mise à jour du code.
- Rôles déduits du code : voir `PROMPTS.md`.
- Incohérence relevée (hors périmètre, non modifiée) : l'UI des réglages annonce que le texte
  personnalisé est « ajouté » au prompt de référence, mais la route de chat **remplace**
  `CHAT_DEFAULT_INSTRUCTIONS` par la personnalisation (les règles fixes restent appliquées).

### Données
- Supabase (Postgres, RLS). `sources` possède déjà `origin_url` et `external_ref jsonb`.
  RPC `add_source(p_kind, p_title, p_origin_url, …)` + job d'ingestion ; les notes sont des sources
  `kind='note'`. Le worker ignore `origin_url` pour `kind='text'` (pas de re-téléchargement).
- **Aucune migration** : métadonnées navigateur (favicon, date de consultation, mode) dans
  `sources.external_ref.browser` ; favoris, historique, session, réglages, permissions et
  téléchargements restent locaux (`userData/browser-data.json`).

### Environnement de vérification (contraintes réelles)
- Docker absent ⇒ pas de Supabase local. `apps/web/.env.local` pointe vers un projet Supabase
  **hébergé**. Aucun compte de test fourni : je ne crée ni compte ni données sur ce projet.
- Conséquence : le parcours E2E lance réellement Electron (Playwright), avec la vraie UI React
  du navigateur et le vrai moteur, mais derrière un **serveur de test local** qui simule l'API
  (modèle scripté, sources). Le parcours authentifié dans l'application Next réelle n'est pas
  exécutable ici ; c'est documenté dans le rapport.
- Une clé OpenRouter est configurée ⇒ l'évaluation avant/après des prompts appelle le vrai modèle.

## 2. Décisions d'architecture

| # | Décision | Raison |
|---|---|---|
| D1 | `WebContentsView` par onglet, propriété du processus Main | Electron 38 ; isolation du contenu distant |
| D2 | Onglets sans preload, `sandbox`, `contextIsolation`, pas de Node | Un site ne peut appeler aucun IPC |
| D3 | Onglets normaux : profil partagé `persist:leanna-browser`. Onglets privés : partition éphémère par onglet | « Session isolée » = pile de navigation et processus par onglet ; isoler les cookies par onglet casserait les connexions. Les onglets privés sont, eux, isolés aussi au niveau cookies |
| D4 | Scripts de page exécutés en monde isolé (`executeJavaScriptInIsolatedWorld`) | La page ne peut pas altérer nos fonctions d'extraction |
| D5 | Extraction : Readability (dépendance déjà utilisée par le worker) injecté en monde isolé, repli heuristique | « Readability ou équivalent », pas de HTML analysé dans Main |
| D6 | Boucle agent côté renderer, modèle côté serveur, outils côté Main | Même patron que la voix ; la clé API reste serveur |
| D7 | Garde-fous dans Main (`browser-agent.ts`) : schéma strict, mode, sensibilité, provenance des URL | Les prompts ne sont qu'une couche ; le modèle n'a aucun accès IPC |
| D8 | Confirmation dans le panneau latéral (hors zone de la vue native), exécution seulement après `resolve` | Journal visible ; testable ; la vue native masquerait une modale HTML |
| D9 | Coupure du triptyque d'exfiltration : l'agent navigateur n'a **aucun** outil de lecture du Notebook ; toute URL non « connue » (absente de la demande utilisateur et des liens vus) exige une confirmation ; `save_to_notebook` exige toujours une confirmation | Contenu non fiable + données privées + sortie ne se combinent jamais sans humain |
| D10 | Noms d'outils sur le fil : `browser_open_url` (les API de function calling refusent le point) ; nom canonique documenté `browser.open_url` | Compatibilité fournisseurs |
| D11 | Quota : 1 unité `chat` par tour utilisateur ; les étapes d'outils suivantes portent un jeton HMAC de continuation (12 étapes max) | Empêche de contourner le quota avec une transcription forgée |
| D12 | Prompts versionnés (`v1` conservée, `v2` par défaut, `PROMPTS_VERSION=1` pour revenir) ; les personnalisations utilisateur restent ajoutées | Retour arrière sans migration |
| D13 | Permissions par origine : demande via boîte de dialogue native, mémorisation par origine (jamais en privé) | Non falsifiable par le renderer ni par la page |
| D14 | Pas de persistance serveur de la conversation du panneau (mémoire du renderer) | Pas de table dupliquée ; limitation documentée |

## 3. Fichiers

### Desktop (`apps/desktop`)
- `src/browser/browser-validation.ts` (étendu) — URL, moteurs de recherche, téléchargements à risque.
- `src/browser/browser-data-store.ts` (étendu) — réglages, favoris/dossiers, historique, session, permissions, téléchargements.
- `src/browser/browser-manager.ts` (réécrit) — onglets, navigation, zoom, plein écran, pop-ups, permissions, téléchargements, crash.
- `src/browser/browser-shortcuts.ts` — raccourcis clavier.
- `src/browser/page-scripts.ts` — fonctions injectées (extraction, liens, tableaux, recherche, éléments).
- `src/browser/browser-extract.ts` — nettoyage, segmentation et bornage du contexte.
- `src/browser/agent-tools.ts` — schémas stricts des 19 outils + validation.
- `src/browser/browser-agent.ts` — modes, classification sensible, provenance, confirmations, exécution.
- `src/browser/browser-ipc.ts` — tous les handlers `browser:*` (enregistrés une seule fois).
- `src/main.ts`, `src/preload.ts`, `src/shared/desktop-api.ts` — intégration.
- `test/*.test.cjs`, `e2e/*` — tests unitaires et parcours Playwright/Electron.

### Web (`apps/web`)
- `app/browser/*` — UI (onglets, barre d'adresse, panneau IA, bibliothèque, réglages), boucle agent.
- `app/api/v1/browser/agent/route.ts` — étape de modèle (SSE, outils).
- `lib/browser/*` — schémas zod des outils, assemblage des messages, jeton de continuation.
- `lib/ai/prompts/*` — prompts v2, v1 archivés, règles navigateur.
- `lib/ai/openrouter.ts` — `streamChat` étendu aux outils.
- `lib/validation.ts`, `app/api/v1/notebooks/[id]/sources/route.ts` — métadonnées d'origine navigateur.

## 4. Risques

| Risque | Mesure |
|---|---|
| Vue native au-dessus de l'UI HTML | Panneaux à côté de la vue, jamais par-dessus ; vue masquée hors route |
| Injection de prompt | Bloc `<untrusted_web_content>` séparé, garde-fous dans Main, confirmations, tests + évaluation |
| Exfiltration | D9 |
| TOCTOU sur clic (page qui change l'élément après inspection) | Signature de l'élément revérifiée dans le même appel que le clic |
| Changement du prompt vocal par défaut sans test audio | Évaluation texte v1/v2 + retour arrière `PROMPTS_VERSION=1` ; limite documentée |
| Parcours authentifié réel non exécutable ici | E2E Electron sur serveur de test ; documenté |

## 5. Avancement

- [x] Phase 1 — audit et plan
- [ ] Phase 2 — moteur, onglets, navigation
- [ ] Phase 3 — interface
- [ ] Phase 4 — extraction et services IA
- [ ] Phase 5 — agent, outils, prompts
- [ ] Phase 6 — Notebook
- [ ] Phase 7 — persistance, réglages, téléchargements
- [ ] Phase 8 — revue sécurité
- [ ] Phase 9 — tests, corrections, documentation

## 6. Journal des décisions prises en cours de route

(complété au fil des phases)
