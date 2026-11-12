# Worker — transcription audio et vidéo

## Configuration Groq

Configurer ces variables dans l'environnement **du worker hébergé** (jamais dans le navigateur ni dans l'application web) :

```env
GROQ_API_KEY=
GROQ_STT_MODEL=whisper-large-v3-turbo
# Facultatif : fr, en, etc. Vide = détection automatique.
GROQ_STT_LANGUAGE=
FFMPEG_PATH=ffmpeg
YTDLP_PATH=yt-dlp
```

Groq est prioritaire si `GROQ_API_KEY` est renseignée. Deepgram reste un fallback de compatibilité si la clé Groq est absente.

## Dépendances système vidéo

Le conteneur ou la machine qui exécute le worker doit fournir :
- **FFmpeg** (extraction de la piste audio et conversion MP3).
- **yt-dlp** (récupération des liens TikTok autorisés).

Ces exécutables doivent être installés dans l'image/runtime du worker et accessibles dans le `PATH`, ou référencés par `FFMPEG_PATH` et `YTDLP_PATH`. Les installer uniquement sur la machine du développeur ne suffit pas pour le déploiement cloud.

Les imports vidéo sont traités dans le worker : les fichiers temporaires sont isolés dans un répertoire unique et supprimés à la fin du traitement. Les vidéos uploadées sont limitées à 200 Mo ; la piste audio est encodée en mono 16 kHz à 48 kbit/s et plafonnée à 24 Mo pour rester sous la limite d'upload Groq de 25 Mo. Les vidéos plus longues nécessitant une piste supérieure à cette limite échouent explicitement (le découpage en plusieurs appels sera une amélioration ultérieure).

Les URL TikTok acceptées doivent être HTTPS et appartenir exactement à `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, `vm.tiktok.com` ou `vt.tiktok.com`. La disponibilité dépend des restrictions et mécanismes anti-bot de TikTok ; l'import manuel du fichier reste l'alternative.
