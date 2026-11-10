# Dépannage

| Problème | Vérification |
|---|---|
| Chat/Studio IA non configurée | OPENROUTER_API_KEY côté web et worker |
| Recherche sans vecteurs | Vérifier fournisseur, modèle et dimension embeddings |
| Source en traitement | Vérifier que le worker tourne et consulter ses logs |
| Transcription audio en échec | Vérifier DEEPGRAM_API_KEY |
| Audio Overview en échec | Vérifier clés/voix ElevenLabs et ffmpeg |
| Email local absent | Ouvrir http://127.0.0.1:58324 |
| Quota atteint | Consulter l'écran Consommation |

Ne transmettez jamais de fichiers .env ou de journaux contenant des secrets.