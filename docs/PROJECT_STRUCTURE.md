# Structure du dépôt

```text
apps/
  web/       Application Next.js : pages, composants et API
  worker/    Processus Node de traitement asynchrone
  desktop/   Wrapper Electron
packages/
  core/      Logique partagée de citations
supabase/
  migrations/ Schéma et évolutions SQL
  tests/      Tests pgTAP
replica/      Documents de conception signalés par le README
```

Arborescence synthétique issue du README et des manifestes. Les sous-répertoires et fichiers précis doivent être confirmés avec un listing complet du dépôt.