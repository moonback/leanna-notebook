# Workers

Le worker est un processus séparé dans apps/worker. Son script start est `node --env-file-if-exists=.env src/main.ts`.

Le README décrit une file jobs persistée en base : réclamation concurrente SKIP LOCKED, bail renouvelé par heartbeat, retries avec attente croissante, reprise des jobs abandonnés et confirmation/remboursement des quotas.

Les familles de traitements mentionnées sont ingestion, extraction PDF/Office/EPUB/web, transcription Deepgram, embeddings, guides de source, résumés, génération Studio, audio et récupération des jobs. Les noms exacts des types et payloads doivent être confirmés dans le code worker.

Démarrage : `pnpm --dir apps/worker start`.