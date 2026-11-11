# Audio Overview

Audio Overview est un artefact Studio qui produit un script dialogué, puis un fichier MP3 à partir des sources du notebook.

## Script

Le worker construit un échange entre deux intervenants (`host` et `guest`) avec alternance obligatoire ; l'animatrice ouvre le dialogue. Le schéma valide entre 6 et 40 segments, chaque réplique contenant entre 20 et 1 200 caractères. Les options éditoriales comprennent :
- format : deep dive, brief, critique ou débat ;
- durée cible : environ 5, 10 ou 15 minutes ;
- style : accessible, professionnel ou dynamique.

## Rendu audio

Chaque segment est synthétisé avec l'identifiant de voix correspondant à son intervenant. Le worker vérifie que les deux identifiants sont présents et distincts, écrit les segments temporaires, puis utilise ffmpeg pour les assembler et normaliser le volume. Le fichier final est un MP3 privé stocké dans le bucket `artifacts`. Le code configure un encodage MP3 128 kbit/s et un échantillonnage 44,1 kHz ; la chaîne de normalisation cible -16 LUFS et -1,5 dBTP.

## Variables worker

- `ELEVENLABS_API_KEY` : accès au fournisseur TTS configuré.
- `AUDIO_OVERVIEW_HOST_VOICE_ID` et `AUDIO_OVERVIEW_GUEST_VOICE_ID` : identifiants des deux voix.
- `AUDIO_OVERVIEW_TTS_MODEL` : modèle TTS.
- `FFMPEG_PATH` : chemin vers ffmpeg ; à défaut, le binaire `ffmpeg` du PATH est utilisé.

Le handler Studio expose le type `audio`. Le rendu dépend de la configuration TTS et de la présence de ffmpeg sur la machine worker. Aucun benchmark de qualité ou de durée n'a été exécuté dans cet audit.
