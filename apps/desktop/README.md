# Leanna Notebook Desktop

Socle Electron de développement pour le monorepo Leanna Notebook.

## Prérequis

- Node.js et pnpm (version déclarée par le projet).
- Windows, macOS ou Linux pour le développement sur la plateforme correspondante.
- Accès réseau au téléchargement des binaires Electron lors de la première installation.

Le workspace autorise explicitement le script d'installation d'Electron dans `pnpm-workspace.yaml` (`allowBuilds.electron: true`). Ce script télécharge le binaire natif correspondant à la plateforme et à l'architecture. Ne pas définir `ELECTRON_SKIP_BINARY_DOWNLOAD` si le binaire doit être installé.

## Lancer

Depuis la racine du dépôt :

```bash
pnpm install
pnpm desktop:doctor
pnpm desktop:dev
```

`pnpm desktop:doctor` vérifie Node.js, la présence de l'application Next.js, le workspace pnpm et le binaire Electron. En cas de binaire manquant, il indique la commande de réparation.\n\n`pnpm desktop:test` compile le processus Electron puis exécute les tests Node.js des validations de sécurité (URL d'application, liens externes et filtres de fichiers).

La commande compile le processus Electron, démarre Next.js sur `127.0.0.1:3000`, attend sa disponibilité puis ouvre la fenêtre desktop. Le port est explicite : si un autre service l'utilise, Next.js doit signaler le conflit au lieu de basculer silencieusement sur un autre port. Si l'URL locale ne répond pas, Electron affiche maintenant un diagnostic natif.

Si le package npm Electron est présent mais que son binaire natif manque, relancer l'installation du workspace après récupération de la configuration :

```bash
pnpm install
pnpm --filter @notebook/desktop rebuild electron
pnpm --dir apps/desktop exec electron --version
```

## Expérience native

- Le sélecteur HTML `input[type=file]` utilisé par l'ajout de sources ouvre le sélecteur de fichiers natif fourni par Electron/Chromium. Le transfert reste celui de l'application web : URL signée Supabase Storage, puis création de source et ingestion par le worker distant.
- Les téléchargements déclenchés par l'application ouvrent maintenant une boîte de dialogue native « Enregistrer sous ». L'utilisateur choisit explicitement le chemin ; l'annulation interrompt le téléchargement.
- Menu natif en français : édition (annuler/rétablir/copier/coller), affichage, zoom, plein écran et fermeture.
- Les outils de développement sont présents uniquement en mode non packagé.

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Le renderer n'accède jamais directement à Node.js.
- Le preload expose une API étroite et typée via `contextBridge`.
- Les dialogues IPC vérifient le processus émetteur.
- Les téléchargements sont acceptés uniquement depuis la fenêtre principale et nécessitent une destination choisie par l'utilisateur.
- L'URL configurée via `LEANNA_WEB_URL` doit utiliser HTTPS ; HTTP n'est accepté que pour `localhost`, `127.0.0.1` ou `::1` en développement.
- La navigation interne reste limitée à l'origine Next configurée.
- Les liens externes HTTPS sont ouverts dans le navigateur système.
- Aucun secret Supabase, Gemini ou worker n'est embarqué dans Electron.

## Périmètre actuel

Pour le moment, le mode local est le mode de travail attendu : aucun hébergement ni nom de domaine n'est nécessaire. `pnpm desktop:dev` démarre Next.js sur la machine puis ouvre Electron. Les services Supabase, Gemini et le worker restent distants selon la configuration existante.\n\nCette tranche améliore l'expérience native en développement. Elle ne constitue pas encore un installateur autonome : le serveur Next.js standalone ou le raccordement à l'URL SaaS de production, les callbacks OAuth/deep links, les mises à jour et les signatures seront traités dans des phases distinctes.
