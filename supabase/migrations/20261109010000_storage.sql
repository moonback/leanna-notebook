-- Buckets privés. AUCUNE policy sur storage.objects pour anon/authenticated :
-- tout accès passe par une URL signée générée par le serveur après contrôle de notebook_role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('sources', 'sources', false, 209715200, array[
    'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/epub+zip', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg',
    'image/png', 'image/jpeg', 'image/webp']),
  ('artifacts', 'artifacts', false, 524288000, null),
  ('exports', 'exports', false, 1073741824, array['application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
