-- Autoriser les formats vidéo utilisés comme sources (les objets restent privés).
update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/epub+zip', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg',
  'audio/aac', 'audio/flac', 'audio/webm',
<<<<<<< HEAD
  'video/mp4', 'video/quicktime', 'video/x-matroska',
=======
  'video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm',
>>>>>>> 65fdac847fbb3cb3909204603b981aa97876041d
  'image/png', 'image/jpeg', 'image/webp'
]
where id = 'sources';
