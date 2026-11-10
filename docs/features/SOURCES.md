# Sources

Formats déclarés : PDF, DOCX, PPTX, EPUB, TXT, Markdown, CSV ; audio MP3/WAV/M4A/AAC/OGG/FLAC/WEBM ; pages web, texte collé et notes. Limite annoncée : 200 Mo.

Le worker extrait ou transcrit (Deepgram Nova-3), segmente, calcule les embeddings si configurés et indexe le plein texte. Statuts persistants : pending, processing, ready, failed. Les segments audio conservent leurs offsets temporels. Les PDF scannés sans couche texte ne disposent pas encore d'OCR selon le README.