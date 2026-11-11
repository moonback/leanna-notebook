# Configuration

Les secrets doivent rester dans des fichiers d'environnement locaux, jamais dans Git. L'exemple de configuration actuellement versionné et inspecté est `apps/worker/.env.example`. L'existence d'un `apps/web/.env.example` n'a pas été confirmée dans l'arborescence consultée.

## Variables worker

L'exemple `apps/worker/.env.example` déclare :

| Variable | Rôle / valeur documentée |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Clé anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé privilégiée, exclusivement serveur |
| `WORKER_ID` | Identifiant du worker |
| `EMBEDDINGS_PROVIDER` | Fournisseur ; défaut `openrouter`, alternatives `voyage` et `mistral` |
| `EMBEDDINGS_MODEL` | Modèle d'embeddings |
| `EMBEDDINGS_API_KEY` | Clé dédiée au fournisseur d'embeddings |
| `OPENROUTER_API_KEY` | Accès OpenRouter |
| `OPENROUTER_CHAT_MODEL` | Modèle chat |
| `TAVILY_API_KEY` | Recherche web Fast Research |
| `DEEPGRAM_API_KEY` | Transcription audio |
| `STT_MODEL` | Défaut `nova-3` |
| `STT_LANGUAGE` | Défaut `multi` |
| `ELEVENLABS_API_KEY` | Synthèse vocale Audio Overview |
| `AUDIO_OVERVIEW_TTS_MODEL` | Défaut `eleven_multilingual_v2` |
| `AUDIO_OVERVIEW_HOST_VOICE_ID` | Identifiant de la voix hôte |
| `AUDIO_OVERVIEW_GUEST_VOICE_ID` | Identifiant de la voix invitée |
| `FFMPEG_PATH` | Défaut `ffmpeg` ; binaire accessible dans le PATH |

L'exemple précise que le fournisseur d'embeddings doit produire des vecteurs de 1024 dimensions. Les configurations web et worker doivent rester compatibles en dimension et modèle.

## Variables web et serveur

Le README documente les variables suivantes ; leurs lectures exactes doivent être recherchées dans le code avant de modifier leurs noms :

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase exposée au client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Connexion Supabase serveur |
| `SUPABASE_SERVICE_ROLE_KEY` | Accès privilégié serveur uniquement |
| `OPENROUTER_API_KEY` | Chat et générations IA |
| `OPENROUTER_CHAT_MODEL` | Modèle de chat par défaut |
| `OPENROUTER_EMBEDDINGS_MODEL` | Modèle d'embeddings |
| `GEMINI_API_KEY` | Jetons et sessions Gemini Live |
| `TAVILY_API_KEY` | Fast Research |
| `DEEPGRAM_API_KEY` | Transcription |
| `STT_MODEL` / `STT_LANGUAGE` | Modèle et langue de transcription |
| `APP_URL` | URL publique de l'application |
| `BILLING_MODE` | Mode de facturation |
| `NEXT_PUBLIC_LEGAL_ENTITY` / `NEXT_PUBLIC_LEGAL_EMAIL` | Mentions légales |
| `OPENROUTER_BASE_URL` | Endpoint OpenRouter compatible facultatif |

Les variables partagées peuvent être requises dans plusieurs processus : le README indique notamment que Tavily doit être configuré côté web et worker. Ne pas supposer qu'un fichier .env unique est chargé automatiquement dans tous les packages.

## Supabase local

Les valeurs proviennent de `supabase/config.toml` :

| Service | Port |
|---|---:|
| API Supabase | 58321 |
| PostgreSQL | 58322 |
| Shadow DB | 58320 |
| Supabase Studio | 58323 |
| Interface mail de test | 58324 |
| Pooler (désactivé par défaut) | 58329 |

Autres paramètres remarquables :
- PostgreSQL major version 17.
- Limite de taille de fichier Storage locale : 200 MiB.
- Auth site URL : `http://localhost:3000`.
- URLs de redirection autorisées : localhost et 127.0.0.1 sur le port 3000.
- Signup activé ; connexions anonymes désactivées.
- Les emails du setup local sont capturés dans l'interface de test, pas envoyés réellement.

## Bonnes pratiques

1. Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`, `DEEPGRAM_API_KEY` ou `ELEVENLABS_API_KEY` dans du code client.
2. Préférer des clés différentes entre développement, staging et production.
3. Vérifier les variables réellement lues dans le code avant de supprimer ou renommer une variable.
4. Maintenir les dimensions des embeddings identiques entre ingestion et recherche.
5. Après changement de configuration Supabase, relancer les services locaux et vérifier les migrations.

Commandes usuelles : `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`. La liste ci-dessus est fondée sur l'exemple worker, le README et `supabase/config.toml` ; ce n'est pas encore une extraction exhaustive de toutes les lectures `process.env`.
