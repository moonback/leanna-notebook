# Configuration

Les secrets doivent rester dans des fichiers d'environnement locaux, jamais dans Git. Les variables suivantes sont documentées par le README et/ou l'exemple worker consulté.

| Variable | Rôle |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | URL Supabase côté web |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Clé publique Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Accès serveur privilégié uniquement |
| SUPABASE_URL / SUPABASE_ANON_KEY | Accès Supabase du worker |
| OPENROUTER_API_KEY | Chat et générations |
| OPENROUTER_CHAT_MODEL | Identifiant du modèle de chat |
| OPENROUTER_EMBEDDINGS_MODEL | Modèle d'embeddings (1024 dimensions) |
| EMBEDDINGS_PROVIDER / EMBEDDINGS_MODEL / EMBEDDINGS_API_KEY | Fournisseur et modèle d'embeddings worker |
| GEMINI_API_KEY | Conversations Gemini Live |
| TAVILY_API_KEY | Fast Research |
| DEEPGRAM_API_KEY | Transcription audio |
| STT_MODEL / STT_LANGUAGE | Paramètres STT, défauts nova-3 / multi |
| ELEVENLABS_API_KEY | TTS Audio Overview |
| AUDIO_OVERVIEW_HOST_VOICE_ID / AUDIO_OVERVIEW_GUEST_VOICE_ID | Deux voix TTS |
| AUDIO_OVERVIEW_TTS_MODEL | Modèle TTS |
| FFMPEG_PATH | Chemin ffmpeg, défaut ffmpeg |
| WORKER_ID | Identifiant worker |
| APP_URL | URL publique de l'app |
| BILLING_MODE | Mode de facturation, simulé par défaut |
| NEXT_PUBLIC_LEGAL_ENTITY / NEXT_PUBLIC_LEGAL_EMAIL | Mentions légales |
| OPENROUTER_BASE_URL | Endpoint compatible alternatif facultatif |

Le web et le worker doivent utiliser un modèle d'embeddings compatible et de même dimension. Exemple fictif : `OPENROUTER_API_KEY=sk-or-v1-<cle-locale>`. La liste n'est pas une extraction exhaustive de toutes les lectures process.env.