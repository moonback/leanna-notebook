# Leanna Notebook Desktop

Premier socle Electron de développement pour le monorepo Leanna Notebook.

## Prérequis

- Node.js et pnpm (version déclarée par le projet).
- Windows, macOS ou Linux pour le développement sur la plateforme correspondante.
- Accès réseau au téléchargement des binaires Electron lors de la première installation.

Le workspace autorise explicitement le script d'installation d'Electron dans `pnpm-workspace.yaml` (`allowBuilds.electron: true`). Ce script télécharge le binaire natif correspondant à la plateforme et à l'architecture. Ne pas définir `ELECTRON_SKIP_BINARY_DOWNLOAD` si le binaire doit être installé.

## Lancer

Depuis la racine du dépôt :

```bash
pnpm install
pnpm desktop:dev
```

La commande compile le processus Electron, démarre Next.js sur `127.0.0.1:3000`, attend sa disponibilité puis ouvre la fenêtre desktop.

Si le package npm Electron est présent mais que son binaire natif manque, relancer l'installation du workspace après récupération de la configuration :

```bash
pnpm install
pnpm --filter @notebook/desktop rebuild electron
pnpm --dir apps/desktop exec electron --version
```

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Le renderer n'accède jamais directement à Node.js.
- Le preload expose une API étroite et typée via `contextBridge`.
- Les dialogues natifs sont déclenchés par IPC et vérifient le processus émetteur.
- La navigation interne reste limitée à l'origine Next configurée.
- Les liens externes HTTPS sont ouverts dans le navigateur système.
- Aucun secret Supabase, Gemini ou worker n'est embarqué dans Electron.

## Périmètre actuel

Cette tranche fournit le shell Electron de développement, les dialogues de fichiers et le contrat IPC. Elle ne constitue pas encore un installateur autonome : le serveur Next.js standalone, les callbacks OAuth/deep links, les mises à jour et les signatures seront ajoutés après validation de ce socle.
