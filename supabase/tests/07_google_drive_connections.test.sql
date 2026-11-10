-- Google Drive connection records: private to the owning user and server-managed writes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select ok((select relrowsecurity from pg_class where oid = 'public.google_drive_connections'::regclass),
          'Google Drive connection table has RLS enabled');
select ok(has_table_privilege('authenticated', 'public.google_drive_connections', 'SELECT'),
          'authenticated users can read through the owner-only RLS policy');
select ok(not has_table_privilege('authenticated', 'public.google_drive_connections', 'INSERT'),
          'authenticated users cannot create connection records directly');
select ok(not has_table_privilege('authenticated', 'public.google_drive_connections', 'UPDATE'),
          'authenticated users cannot change encrypted credentials directly');
select ok(not has_table_privilege('anon', 'public.google_drive_connections', 'SELECT'),
          'anonymous users cannot read Google Drive connection records');

select * from finish();
rollback;
