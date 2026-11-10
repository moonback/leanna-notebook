-- S04 : découverte éditoriale, accès lecteur conditionné au statut featured.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000e1', 'featured-owner@test.local'),
       ('00000000-0000-0000-0000-0000000000e2', 'featured-reader@test.local');
insert into public.notebooks (id, workspace_id, created_by, title, is_featured, allow_copies)
select '77777777-7777-7777-7777-777777777772', id, '00000000-0000-0000-0000-0000000000e1',
       'Sélection', true, true
  from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000e1';
insert into public.notebooks (id, workspace_id, created_by, title, is_featured)
select '77777777-7777-7777-7777-777777777773', id, '00000000-0000-0000-0000-0000000000e1',
       'Privé', false
  from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000e1';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
select is((select count(*)::int from public.notebooks
            where id in ('77777777-7777-7777-7777-777777777772', '77777777-7777-7777-7777-777777777773')), 1,
          'la galerie expose la sélection publiée, pas le notebook privé');
select is(public.accept_featured_notebook('77777777-7777-7777-7777-777777777772'),
          '77777777-7777-7777-7777-777777777772'::uuid, 'un lecteur peut ouvrir une sélection publiée');
select is(public.my_notebook_role('77777777-7777-7777-7777-777777777772'),
          'viewer'::public.notebook_role, 'une visite featured accorde uniquement le rôle viewer');
select is((select count(*)::int from public.notebook_visits
            where notebook_id = '77777777-7777-7777-7777-777777777772'
              and user_id = '00000000-0000-0000-0000-0000000000e2' and via_link_id is null), 1,
          'la visite éditoriale est enregistrée sans jeton de partage');

select throws_ok($$ select public.accept_featured_notebook('77777777-7777-7777-7777-777777777773') $$,
                 'P0002', 'featured_not_found', 'un notebook non publié ne peut pas être ouvert depuis Découvrir');
reset role;
select * from finish();
rollback;
