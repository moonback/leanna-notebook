-- Sécurité et isolation (exécuté par `supabase test db`). Tout est annulé en fin de fichier.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- utilisateurs de test (le trigger crée profil + workspace personnel)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local');

create temp table ctx as
select (select id from public.workspaces where owner_id = '00000000-0000-0000-0000-00000000000a') as ws;
grant select on ctx to authenticated, service_role;

create or replace function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select is((select count(*)::int from public.workspace_members where user_id = '00000000-0000-0000-0000-00000000000a'), 1, 'inscription : workspace personnel créé');

-- données créées côté serveur
insert into public.notebooks (id, workspace_id, created_by, title)
values ('11111111-1111-1111-1111-111111111111', (select ws from ctx), '00000000-0000-0000-0000-00000000000a', 'NB');
insert into public.notebook_members (notebook_id, user_id, role)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 'viewer');
select public.add_source('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'txt', 'Doc', p_idempotency_key => 'src1');

-- A : propriétaire
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.notebooks), 1, 'A voit son notebook');
select is(public.my_notebook_role('11111111-1111-1111-1111-111111111111')::text, 'owner', 'A est owner');
select throws_ok($$ insert into public.notebooks (workspace_id, created_by) select ws, auth.uid() from ctx $$, '42501', null, 'client : insertion interdite');
select throws_ok($$ update public.workspaces set plan_id = 'free' $$, '42501', null, 'client : impossible de changer de plan');
select throws_ok($$ update public.notebooks set is_featured = true $$, '42501', null, 'client : impossible de se mettre en avant');
select throws_ok($$ update public.sources set storage_path = 'x' $$, '42501', null, 'client : storage_path non modifiable');
select throws_ok($$ select public.reserve_usage((select ws from ctx), auth.uid(), 'chat') $$, '42501', null, 'client : quota non manipulable');
select throws_ok($$ select * from public.match_chunks('11111111-1111-1111-1111-111111111111', null, 'x', 'simple', '{}', 5) $$, '42501', null, 'client : recherche réservée au serveur');
reset role;

-- B : lecteur
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.notebooks), 1, 'B voit le notebook partagé');
select is(public.my_notebook_role('11111111-1111-1111-1111-111111111111')::text, 'viewer', 'B est viewer');
select is((select count(*)::int from public.sources), 1, 'B lit les sources');
select is((select count(*)::int from public.workspaces), 1, 'B ne voit que son workspace');
reset role;

-- C : étranger, puis lien « chat seul »
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.notebooks), 0, 'C ne voit rien');
select is(public.my_notebook_role('11111111-1111-1111-1111-111111111111'), null, 'C sans rôle');
reset role;
insert into public.share_links (notebook_id, scope, token_hash)
values ('11111111-1111-1111-1111-111111111111', 'chat_only', sha256(convert_to('tok-test', 'UTF8')));
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(public.accept_share_link('tok-test'), '11111111-1111-1111-1111-111111111111'::uuid, 'lien accepté');
select is(public.my_notebook_role('11111111-1111-1111-1111-111111111111')::text, 'chat', 'C a le rôle chat');
select is((select count(*)::int from public.sources), 0, 'chat seul : aucune source lisible');
reset role;
update public.share_links set revoked_at = now();
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.notebooks), 0, 'révocation immédiate');
reset role;

-- quotas et atomicité (serveur)
set local role service_role;
select lives_ok($$ select public.create_artifact('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'audio', '{}', null, '{}') $$, 'audio 1/2');
select lives_ok($$ select public.create_artifact('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'audio', '{}', null, '{}') $$, 'audio 2/2');
select throws_ok($$ select public.create_artifact('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'audio', '{}', null, '{}') $$, 'P0001', 'quota_daily_exceeded', 'audio 3 refusé');
select is((select count(*)::int from public.artifacts where notebook_id = '11111111-1111-1111-1111-111111111111'), 2, 'pas d''artefact orphelin');
reset role;

-- invariant : RLS active partout
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'RLS active sur toutes les tables');

select * from finish();
rollback;
