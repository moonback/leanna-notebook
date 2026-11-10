-- Partage privé (H01) : fonctions serveur, invitation en attente, retrait immédiat. Tout est annulé.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'member@test.local');
insert into public.notebooks (id, workspace_id, created_by, title)
select '22222222-2222-2222-2222-222222222222', id, owner_id, 'Partagé' from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- invitation d'une adresse sans compte, puis inscription
insert into public.notebook_members (notebook_id, invited_email, role)
values ('22222222-2222-2222-2222-222222222222', 'later@test.local', 'editor');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'Later@test.local');
select is((select user_id from public.notebook_members where notebook_id = '22222222-2222-2222-2222-222222222222' and role = 'editor'),
          '00000000-0000-0000-0000-0000000000c1'::uuid, 'invitation en attente rattachée à l''inscription (casse ignorée)');

insert into public.notebook_members (notebook_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'viewer');

-- fonctions réservées au serveur
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.user_id_by_email('member@test.local') $$, '42501', null, 'client : impossible de tester si une adresse a un compte');
select throws_ok($$ select * from public.notebook_people('22222222-2222-2222-2222-222222222222') $$, '42501', null, 'client : liste des personnes réservée au serveur');
reset role;

set local role service_role;
select is(public.user_id_by_email('MEMBER@test.local'), '00000000-0000-0000-0000-0000000000b1'::uuid, 'serveur : compte trouvé par email');
select is((select count(*)::int from public.notebook_people('22222222-2222-2222-2222-222222222222')), 3, 'serveur : propriétaire + 2 membres');
reset role;

-- le membre lecteur voit le notebook, ne peut pas écrire
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is(public.my_notebook_role('22222222-2222-2222-2222-222222222222')::text, 'viewer', 'membre : rôle lecteur');
select is((select count(*)::int from public.notebooks where id = '22222222-2222-2222-2222-222222222222'), 1, 'membre : notebook visible');
select throws_ok($$ insert into public.notebook_members (notebook_id, user_id, role) values ('22222222-2222-2222-2222-222222222222', auth.uid(), 'editor') $$, '42501', null, 'membre : ne peut pas s''octroyer un rôle');
reset role;

-- retrait : effet immédiat
delete from public.notebook_members where user_id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.notebooks where id = '22222222-2222-2222-2222-222222222222'), 0, 'retrait : notebook aussitôt invisible');
reset role;

select * from finish();
rollback;
