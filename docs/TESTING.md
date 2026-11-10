# Tests

Framework déclaré : Vitest pour web, worker et core ; pgTAP pour la base ; Node test runner pour desktop.

Commandes racine :
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm db:test
pnpm desktop:test
pnpm desktop:doctor
```

Le README cite des tests de citations, validation/rendu/export, ingestion, SSRF, génération Studio, cycle de vie des jobs, RLS, isolation, partage, quotas et copie. Aucun test n'a été exécuté pendant cet audit distant : aucun résultat de réussite n'est affirmé.