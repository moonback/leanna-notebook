# Leanna Browser — audit technique initial

Date : 2026-11-12  
Repository : `moonback/leanna-notebook`  
Base : `main` at `e69c5e26d37c44168cdaefad271b0a47c3f0ffbd`  
Working branch : `feat/leanna-browser`

## 1. Résultat de l'audit

Le repository est un monorepo pnpm. Il contient une application Next.js, un client Electron séparé, un worker Node.js et un package partagé. Le desktop actuel est un conteneur sécurisé qui charge l'application web distante ou locale ; il n'embarque pas encore de navigateur intégré multi-onglets.

### Technologies constatées

- Web : Next.js 15.5.29, React 19.1.0, TypeScript, Tailwind CSS 4, Radix UI.
- Desktop : Electron 38, TypeScript 5.9, electron-builder 26, electron-updater.
- Worker : Node.js 24, TypeScript natif, Supabase JS.
- Données : Supabase PostgreSQL, Auth, Storage, RLS, pgvector.
- IA : OpenRouter et services déjà utilisés par le worker ; Tavily pour la recherche web.
- Workspace : pnpm ; scripts racine `typecheck`, `test`, `lint`, `desktop:test`.

### Architecture Electron existante

Fichiers vérifiés :

- `apps/desktop/src/main.ts` : crée une seule `BrowserWindow`, charge `LEANNA_WEB_URL`, limite la navigation à l'origine de l'application, ouvre les liens externes HTTPS dans le navigateur système, gère les téléchargements natifs et quelques IPC.
- `apps/desktop/src/preload.ts` : expose `window.leannaDesktop` via `contextBridge`, avec une API limitée aux fichiers, mises à jour et liens externes.
- `apps/desktop/src/shared/desktop-api.ts` : contrat TypeScript de cette API.
- `apps/desktop/src/shared/validation.ts` : validation des URL, des liens externes et des filtres de fichiers.
- `apps/desktop/test/validation.test.cjs` et `build-config.test.cjs` : tests Node du desktop.
- Les préférences Electron actuelles sont déjà solides : `contextIsolation`, `nodeIntegration: false`, `sandbox` et `webSecurity` activés.

Aucun usage existant de `BrowserView` ou `WebContentsView` n'a été trouvé dans l'arbre du repository. Electron 38 est la base cible ; l'implémentation devra privilégier `WebContentsView` et garder le contenu web distant hors du renderer de l'application.

### Architecture Web / Notebook existante

- `apps/web/app/notebook/[id]/workspace.tsx` : espace Notebook React, panneaux Sources / Chat / Studio et interactions avec les sources.
- `apps/web/app/api/v1/notebooks/[id]/sources/route.ts` : GET des sources et POST sécurisé pour ajouter une source à un notebook. Le POST vérifie le rôle `editor`, valide les données, puis appelle la RPC `add_source`.
- `apps/web/lib/api.ts` et `apps/web/lib/validation.ts` : conventions de gestion d'API et validation Zod à réutiliser.
- Les composants UI existants sont dans `apps/web/components/ui` et utilisent le design system du produit.

### Ingestion web et IA existantes

- `apps/worker/src/ingest/handler.ts` : pipeline d'ingestion asynchrone, extraction, chunking, embeddings, indexation et déclenchement des résumés / graphe de connaissances.
- `apps/worker/src/ingest/ssrf.ts` : téléchargement HTTP(S) avec validation d'adresse IP, refus des adresses privées, limites de taille, délais et redirections revérifiées.
- `apps/worker/src/research/reader.ts` : lecture réelle de pages avec extraction de contenu, métadonnées, canonicalisation et protection SSRF.
- Le type SQL `public.source_kind` contient déjà `web` ; la table `sources` possède les champs d'origine URL et de contenu extrait.
- La migration initiale définit déjà la RPC `add_source`, qui crée la source et le job d'ingestion de façon atomique.

Conclusion : l'ajout d'une page consultée au Notebook peut réutiliser l'API de sources et le pipeline existants. Il ne faut pas créer une deuxième chaîne d'ingestion web ni une table de sources parallèle.

## 2. Décisions d'architecture proposées

1. **Moteur Chromium** : créer et gérer les vues avec `WebContentsView` dans le processus Main Electron. Ne pas utiliser d'iframe, et ne jamais exposer un objet `WebContents` à React ou au modèle IA.
2. **Séparation des origines** : l'application Leanna reste dans la `BrowserWindow` principale ; chaque page visitée est rendue dans une vue Chromium séparée, avec preload absent ou minimal et aucune API Node.
3. **IPC typé et validé** : étendre le contrat `DesktopApi` avec des commandes explicites (onglets, navigation, dimensions, favoris, historique, téléchargements, permissions, extraction). Vérifier l'émetteur, valider chaque argument et ne transmettre que des DTO bornés.
4. **État local du navigateur** : conserver préférences, favoris, historique et session d'onglets dans le répertoire `app.getPath("userData")`, avec écriture atomique et données sensibles exclues des logs. Cela évite une migration Supabase pour des données de navigation personnelles.
5. **Mode privé** : utiliser une session Electron non persistante distincte, sans restauration ni écriture d'historique/favoris, et détruire ses vues à la fermeture.
6. **Intelligence de page** : extraire le contenu depuis le contexte de la vue active par une commande Main contrôlée, limiter et nettoyer le texte, puis appeler les services IA existants côté serveur. Le contenu d'une page sera toujours traité comme donnée non fiable (protection contre prompt injection).
7. **Ajout au Notebook** : réutiliser `POST /api/v1/notebooks/:id/sources` avec `type: "url"` pour enregistrer le lien ; le worker existant se charge de l'extraction et de l'indexation. Un mode « contenu/synthèse » devra être conçu autour des capacités existantes, sans contourner les droits d'accès.
8. **Interface** : ajouter une surface Browser dédiée dans l'application web, alignée sur les composants et tokens existants. Le renderer pilote la géométrie de la vue Chromium via IPC ; le Main reste propriétaire du moteur et de ses permissions.

## 3. Fichiers concernés

### À étendre ou intégrer

- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/shared/desktop-api.ts`
- `apps/desktop/src/shared/validation.ts`
- `apps/desktop/package.json` (uniquement si une dépendance réellement nécessaire est identifiée)
- `apps/desktop/test/validation.test.cjs`
- `apps/web/app` (nouvelle route/page Browser et composants dédiés)
- `apps/web/components/ui` (réutilisation prioritaire, pas de refonte du design system)
- `apps/web/lib/api.ts` / `apps/web/lib/validation.ts` (conventions à réutiliser)
- `apps/web/app/api/v1/notebooks/[id]/sources/route.ts` (réutilisation, modification seulement si un besoin précis est démontré)
- `apps/worker/src/ingest` et `apps/worker/src/research` (réutilisation prioritaire ; pas de pipeline parallèle)

### Nouveaux modules envisagés

- Services Main dédiés au navigateur : gestionnaire de vues/onglets, navigation, sessions, permissions, téléchargements, persistance, extraction.
- Contrats et validateurs IPC dédiés au navigateur.
- Composants React pour barre d'onglets, barre d'adresse, zone Browser et panneau IA.
- Tests unitaires pour validation URL, cycle de vie des onglets, permissions, persistance et extraction.

La liste finale des chemins sera confirmée au fur et à mesure de l'inspection des composants de navigation et des routes IA à réutiliser.

## 4. Risques et points de vigilance

| Risque | Conséquence | Mesure |
|---|---|---|
| Afficher des pages non fiables dans le renderer principal | Exposition de l'application et de ses privilèges | WebContentsView séparées, sandbox, isolation, aucun preload privilégié pour les sites |
| IPC trop permissif | Contrôle du navigateur par un site ou un renderer compromis | Vérification de l'émetteur, allowlist de commandes, schémas stricts, limites de taille |
| Géométrie incorrecte des vues natives | Décalage ou recouvrement de l'interface | Synchronisation des bounds, masquage hors page Browser, tests de redimensionnement |
| Sessions et cookies | Fuite entre navigation normale et privée | Partitions explicites, session privée éphémère, nettoyage à la fermeture |
| Téléchargements et permissions | Fichiers dangereux ou accès caméra/micro non souhaité | Confirmation, filtrage, permissions par origine, aucune exécution automatique |
| Prompt injection dans les pages | L'agent pourrait traiter une page comme des instructions système | Contenu explicitement non fiable, séparation des messages, confirmation des actions sensibles |
| Ajout de sources au Notebook | Contournement des rôles ou ingestion redondante | API existante, rôle editor, validation Zod, RPC `add_source` et pipeline worker |
| Portée trop large | Livraison d'une façade incomplète ou de commandes factices | Livraison incrémentale ; chaque capacité déclarée doit être réellement implémentée et testée |

## 5. Plan d'implémentation

1. **Fondations Electron** : contrats IPC, validateurs, BrowserManager et cycle de vie WebContentsView.
2. **Navigation et onglets** : URL/recherche, arrière/avant/recharger/stop, événements de titre/URL/favicon/chargement, création/fermeture/sélection.
3. **Interface Browser** : route dédiée, barre d'adresse, onglets, zone de contenu, redimensionnement, raccourcis et panneau latéral.
4. **Persistance et sécurité** : sessions normale/privée, restauration, favoris, historique, permissions, fenêtres secondaires et téléchargements.
5. **Lecture et IA** : extraction contrôlée de la page active, résumé/questions, limites de contexte, protection prompt injection, interruption et confirmation des actions sensibles.
6. **Notebook** : enregistrement du lien via l'API existante ; enrichissement contenu/synthèse uniquement après validation des contrats existants.
7. **Validation** : tests unitaires, intégration IPC, build/typecheck, tests Electron et parcours bout en bout ; documenter toute validation impossible dans l'environnement disponible.

## 6. Limites de cette première passe d'audit

- L'audit a été réalisé sur l'arbre et les fichiers accessibles de la branche `main` ; aucun environnement local de build Electron n'a été exécuté dans cette passe.
- Aucun test n'est déclaré réussi à ce stade.
- Aucune migration SQL n'est justifiée à ce stade : les sources web et leur ingestion existent déjà.
- Les routes exactes de chat/IA, le mécanisme de sélection du modèle et le routage principal de l'application doivent être inspectés avant de figer l'API d'analyse de page.
- Les capacités avancées d'automatisation (clic, saisie, formulaires) restent conditionnées à un modèle de permissions explicite et à des tests de sécurité dédiés.
