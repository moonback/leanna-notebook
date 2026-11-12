# OCR des PDF scannés

Le worker tente d'abord l'extraction native page par page avec PDF.js. Si le document ne contient pas de couche texte exploitable, il utilise automatiquement l'OCR OpenRouter lorsque l'option est activée pour le propriétaire de la source.

## Configuration

1. Configurer `OPENROUTER_API_KEY` dans l'environnement du serveur web et du worker.
2. Appliquer la migration `20261112020000_ai_ocr_preferences.sql`.
3. Ouvrir **Réglages → Fonctionnalités → OCR des PDF scannés**.
4. Activer l'OCR, sélectionner un modèle texte OpenRouter et choisir le moteur PDF :
   - **Mistral OCR** : recommandé pour les documents scannés et les pages image.
   - **Cloudflare AI** : moteur alternatif de conversion PDF en texte.
5. Enregistrer. Les préférences sont stockées par utilisateur ; les clés API restent côté serveur.

## Fonctionnement

- L'OCR n'est appelé que lorsque l'extraction native ne trouve pas de texte exploitable.
- Le worker envoie le PDF à OpenRouter avec le plugin `file-parser` et le moteur choisi.
- Le modèle sélectionné doit restituer la transcription, sans résumé, avec un marqueur `[PAGE N]` par page afin de conserver les références de page.
- Le texte reconnu passe ensuite par le même pipeline de normalisation, découpage, embeddings et indexation plein texte que les autres sources.
- Si l'OCR est désactivé ou non configuré, la source échoue avec `needs_ocr` et un message qui indique où activer la fonction.

## Limites et coûts

- Taille maximale actuelle d'un PDF envoyé au service OCR : **40 Mo**.
- Sortie maximale demandée au modèle : **32 000 tokens**. Une réponse tronquée échoue explicitement au lieu d'indexer un texte incomplet.
- L'appel OCR transmet le contenu du PDF à OpenRouter. Les frais éventuels du moteur de traitement PDF et du modèle sélectionné sont facturés selon les conditions OpenRouter.
- L'OCR est un traitement externe : ne l'activer que pour les documents que l'utilisateur est autorisé à transmettre à ce fournisseur.
- Les documents avec couche texte native continuent à être extraits localement sans appel OCR.

## Dépannage

- `ocr_provider_rejected` : vérifier le modèle, le moteur et les droits OpenRouter.
- `ocr_file_too_large` : réduire ou scinder le PDF pour rester sous 40 Mo.
- `ocr_output_truncated` : utiliser un modèle avec une sortie plus longue ou scinder le document.
- `needs_ocr` : activer l'OCR dans les réglages du compte propriétaire de la source.
