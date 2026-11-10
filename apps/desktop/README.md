# Leanna Notebook Desktop

Premier socle Electron de développement pour le monorepo Leanna Notebook.

## Lancer

Depuis la racine du dépôt :

```bash
pnpm install
pnpm desktop:dev
```

La commande compile le processus Electron, démarre Next.js sur `127.0.0.1:3000`, attend sa disponibilité puis ouvre la fenêtre desktop.

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Le renderer n'accède jamais directement à Node.js.
- Le preload expose une API étroite et typée via `contextBridge`.
- Les dialogues natifs sont déclenchés par IPC et vérifient le processus émetteur.
- La navigation interne reste limitée à l'origine Next configurée.
- Les liens externes HTTPS sont ouverts dans le navigateur système.
- Aucun secret Supabase, Gemini ou worker n'est embarqué dans Electron.

## Périmètre actuel

Cette tranche fournit le shell Electron en développement, les dialogues de fichiers et le contrat IPC. Elle ne constitue pas encore un installateur autonome : le serveur Next.js standalone, les callbacks OAuth/deep links, les mises à jour et les signatures seront ajoutés après validation de ce socle.
