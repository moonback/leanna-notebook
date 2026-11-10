# Déploiement

Le README indique qu'aucun déploiement de production n'est encore validé. La facturation est simulée, sans paiement réel.

Avant production : configurer les variables web/worker, utiliser un projet Supabase distant, appliquer les migrations, déployer le worker comme processus persistant, configurer les buckets privés, les URLs Auth, les mentions légales, les fournisseurs IA, la supervision des jobs et la procédure de purge.

Builds déclarés : `pnpm --dir apps/web build`, `pnpm desktop:build`, `pnpm desktop:dist:win`. Les cibles cloud, rollback, monitoring et migrations distantes ne sont pas documentés comme procédures testées.