# Installation locale

## Prérequis
Node.js 24, pnpm et Docker pour Supabase local. ffmpeg est nécessaire au pipeline Audio Overview.

```bash
git clone https://github.com/moonback/leanna-notebook.git
cd leanna-notebook
pnpm install
pnpm db:start
```

Configurer les variables web et worker selon [CONFIGURATION.md](CONFIGURATION.md). Le README recommande apps/web/.env.example vers apps/web/.env.local ; ce fichier n'a pas pu être lu durant l'audit distant, vérifier sa présence dans le clone. L'exemple worker accessible est apps/worker/.env.example.

```bash
pnpm dev
```
Dans un second terminal :
```bash
pnpm --dir apps/worker start
```
Web : http://localhost:3000. Mailpit local : http://127.0.0.1:58324.

Pour réinitialiser la base locale (destructive) :
```bash
pnpm db:reset
```

Vérifications disponibles : `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:test`. Elles n'ont pas été exécutées dans cet audit distant.