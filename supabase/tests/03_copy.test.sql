-- Copie de notebook (H05) : contenu repris, contenu exclu, isolation, fonction réservée au serveur. Tout est annulé.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'copier@test.local');
insert into public.notebooks (id, workspace_id, created_by, title, overview)
select '33333333-3333-3333-3333-333333333333', id, owner_id, 'Source', 'Résumé' from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000a1';

insert into public.sources (id, workspace_id, notebook_id, kind, title, status, storage_path, extracted_text, word_count)
select '44444444-4444-4444-4444-444444444441', workspace_id, id, 'txt', 'Prête', 'ready', workspace_id || '/' || id || '/44444444-4444-4444-4444-444444444441/original.txt', 'bonjour le monde', 3
  from public.notebooks where id = '33333333-3333-3333-3333-333333333333';
insert into public.sources (id, workspace_id, notebook_id, kind, title, status)
select '44444444-4444-4444-4444-444444444442', workspace_id, id, 'txt', 'Échouée', 'failed'
  from public.notebooks where id = '33333333-3333-3333-3333-333333333333';
insert into public.sources (id, workspace_id, notebook_id, kind, title, status, note_body)
select '44444444-4444-4444-4444-444444444443', workspace_id, id, 'note', 'Note privée', 'ready', '{"text":"x"}'
  from public.notebooks where id = '33333333-3333-3333-3333-333333333333';
insert into public.chunks (id, workspace_id, notebook_id, source_id, ordinal, content, char_start, char_end, token_count, fts)
select '55555555-5555-5555-5555-555555555551', workspace_id, notebook_id, id, 0, 'bonjour le monde', 0, 16, 3, to_tsvector('simple', 'bonjour le monde')
  from public.sources where id = '44444444-4444-4444-4444-444444444441';
insert into public.artifacts (id, workspace_id, notebook_id, type, title, status, content, source_ids)
select '66666666-6666-6666-6666-666666666661', workspace_id, id, 'report', 'Rapport', 'ready', '{"markdown":"x"}', array['44444444-4444-4444-4444-444444444441'::uuid]
  from public.notebooks where id = '33333333-3333-3333-3333-333333333333';
insert into public.artifacts (id, workspace_id, notebook_id, type, title, status)
select '66666666-6666-6666-6666-666666666662', workspace_id, id, 'quiz', 'En cours', 'generating'
  from public.notebooks where id = '33333333-3333-3333-3333-333333333333';
insert into public.citations (workspace_id, notebook_id, artifact_id, marker, chunk_id, source_id, quote_text, char_start, char_end, verified)
select workspace_id, id, '66666666-6666-6666-6666-666666666661', 1, '55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444441', 'bonjour', 0, 7, true
  from public.notebooks where id = '33333333-3333-3333-3333-333333333333';

-- réservée au serveur
set local role authenticated;
select throws_ok($$ select public.copy_notebook('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-0000000000b1', (select id from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000b1'), 'x') $$,
  '42501', null, 'client : copy_notebook interdite');
reset role;

create temp table _res as
select public.copy_notebook('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-0000000000b1',
       (select id from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000b1'), 'Copie de Source') as r;
grant all on _res to public;

select is((select count(*)::int from public.notebooks where id = (select (r ->> 'notebook_id')::uuid from _res)
            and created_by = '00000000-0000-0000-0000-0000000000b1' and allow_copies = false and overview = 'Résumé'), 1,
  'le notebook copié appartient au copieur, copies désactivées, résumé repris');
select is((select count(*)::int from public.sources where notebook_id = (select (r ->> 'notebook_id')::uuid from _res)), 1,
  'seules les sources prêtes sont reprises (ni échouée ni note)');
select is((select count(*)::int from public.chunks where notebook_id = (select (r ->> 'notebook_id')::uuid from _res)), 1, 'passages repris');
select is((select count(*)::int from public.artifacts where notebook_id = (select (r ->> 'notebook_id')::uuid from _res)), 1, 'seuls les artefacts prêts sont repris');
select is((select count(*)::int from public.citations c join public.chunks k on k.id = c.chunk_id
            where c.notebook_id = (select (r ->> 'notebook_id')::uuid from _res) and k.notebook_id = c.notebook_id), 1,
  'citations des artefacts rattachées aux passages copiés');
select is((select count(*)::int from public.artifacts a, _res
            where a.notebook_id = (r ->> 'notebook_id')::uuid and a.source_ids <> '{}'
              and not exists (select 1 from public.sources s where s.id = any (a.source_ids) and s.notebook_id = a.notebook_id)), 0,
  'les source_ids des artefacts pointent vers les sources copiées');
select is((select jsonb_array_length(r -> 'files') from _res), 1, 'un fichier Storage à dupliquer');
select ok((select (r -> 'files' -> 0 ->> 'to') like (select id::text from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000b1') || '/' || (r ->> 'notebook_id') || '/%/original.txt' from _res),
  'le nouveau chemin Storage est dans l''espace du copieur');
select is((select count(*)::int from public.sources where notebook_id = '33333333-3333-3333-3333-333333333333'), 3, 'l''original est intact');

-- le propriétaire d'origine ne voit pas la copie
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.notebooks where created_by = '00000000-0000-0000-0000-0000000000b1'), 0, 'isolation : la copie reste privée');
reset role;

select * from finish();
rollback;
