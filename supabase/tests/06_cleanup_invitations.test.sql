-- M4 : expiration et nettoyage des invitations en attente.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000f1', 'invite-owner@test.local');
insert into public.notebooks (id, workspace_id, created_by, title)
select '77777777-7777-7777-7777-777777777774', id, '00000000-0000-0000-0000-0000000000f1', 'Invitations'
  from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000f1';
insert into public.notebook_members (notebook_id, invited_email, role, expires_at)
values ('77777777-7777-7777-7777-777777777774', 'expired@test.local', 'viewer', now() - interval '1 day'),
       ('77777777-7777-7777-7777-777777777774', 'active@test.local', 'editor', now() + interval '15 days');

-- Une inscription tardive ne transforme pas une invitation expirée en accès actif.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000f2', 'expired@test.local');
select is((select user_id is null from public.notebook_members
            where notebook_id = '77777777-7777-7777-7777-777777777774'
              and invited_email = 'expired@test.local'), true,
          'une invitation expirée ne se rattache pas lors de l’inscription');

set local role service_role;
select is(public.cleanup_invitations(), 1, 'le nettoyage supprime uniquement l’invitation expirée');
select is((select count(*)::int from public.notebook_members
            where notebook_id = '77777777-7777-7777-7777-777777777774'
              and invited_email = 'expired@test.local'), 0, 'l’invitation expirée est supprimée');
select is((select count(*)::int from public.notebook_members
            where notebook_id = '77777777-7777-7777-7777-777777777774'
              and invited_email = 'active@test.local'), 1, 'l’invitation encore valide est conservée');
reset role;

select * from finish();
rollback;
