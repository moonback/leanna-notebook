-- B17 Fast Research : job asynchrone, quota atomique, idempotence et droits serveur.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000d1', 'research-owner@test.local');
insert into public.notebooks (id, workspace_id, created_by, title)
select '77777777-7777-7777-7777-777777777771', id, owner_id, 'Recherche'
  from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000d1';

set local role service_role;
create temp table _job as
select public.create_research_job(
  '77777777-7777-7777-7777-777777777771',
  '00000000-0000-0000-0000-0000000000d1',
  'énergie solaire',
  'fast',
  'research-test-idempotency'
) as id;
grant all on _job to public;

select is((select count(*)::int from public.jobs where id = (select id from _job)
            and kind = 'research' and status = 'queued'
            and payload ->> 'query' = 'énergie solaire'), 1,
  'crée un job de recherche en file avec sa requête');
select is((select status::text from public.usage_ledger where job_id = (select id from _job)), 'reserved',
  'réserve le quota dans la même transaction');

create temp table _again as
select public.create_research_job(
  '77777777-7777-7777-7777-777777777771',
  '00000000-0000-0000-0000-0000000000d1',
  'énergie solaire',
  'fast',
  'research-test-idempotency'
) as id;
grant all on _again to public;
select is((select id from _again), (select id from _job), 'la clé d’idempotence retourne le même job sans double réservation');

reset role;
set local role authenticated;
select throws_ok($$ select public.create_research_job(
  '77777777-7777-7777-7777-777777777771',
  '00000000-0000-0000-0000-0000000000d1',
  'énergie solaire', 'fast', null
) $$, '42501', null, 'la fonction de création est réservée au serveur');
reset role;

select * from finish();
rollback;
