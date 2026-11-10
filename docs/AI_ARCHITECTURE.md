# Architecture IA

Fournisseurs identifiés : OpenRouter (chat, génération et embeddings), Gemini (Live vocal), Deepgram Nova-3 (transcription), ElevenLabs (Audio Overview), Tavily (recherche web), Voyage et Mistral (options embeddings worker).

Le README décrit une recherche RAG hybride vecteur + plein texte, fusion RRF, passages numérotés et validation des citations par `@notebook/core`. Les embeddings sont annoncés en 1024 dimensions ; web et worker doivent rester compatibles. Le chat est diffusé en streaming. Le navigateur reçoit un jeton Gemini éphémère, la clé restant côté serveur.

Les prompts effectifs, timeouts, retries fournisseur, budgets de contexte et schémas détaillés ne sont pas confirmés par les fichiers consultés.