-- M4 : expiration des invitations en attente et nettoyage quotidien.
-- Durée par défaut : 30 jours. Une invitation acceptée devient un membre sans expiration.
alter table public.notebook_members add column expires_at timestamptz;

update public.notebook_members
   set expires_at = created_at + interval '30 days'
 where user_id is null and expires_at is null;

create index notebook_members_pending_expiry_idx
  on public.notebook_members (expires_at)
  where user_id is null and expires_at is not null;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  insert into public.profiles (id) values (new.id);
  insert into public.workspaces (kind, name, owner_id)
       values ('personal', 'Personnel', new.id) returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, new.id, 'owner');
  -- Les invitations expirées ne sont jamais rattachées au nouveau compte.
  update public.notebook_members
     set user_id = new.id, invited_email = null, expires_at = null
   where invited_email = lower(new.email) and user_id is null
     and (expires_at is null or expires_at > now());
  return new;
end $$;

create or replace function public.cleanup_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  delete from public.notebook_members
   where user_id is null and expires_at is not null and expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke execute on function public.cleanup_invitations() from public, anon, authenticated;
grant execute on function public.cleanup_invitations() to service_role;

-- Supabase fournit pg_cron sur les projets compatibles. La fonction reste appelable
-- manuellement si l'extension n'est pas disponible dans un environnement local.
do $$
declare v_job record;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and position('pg_cron' in current_setting('shared_preload_libraries')) > 0 then
    execute 'create extension if not exists pg_cron';
    if to_regnamespace('cron') is not null then
      for v_job in execute 'select jobid from cron.job where jobname = ''cleanup_invitations''' loop
        execute 'select cron.unschedule($1)' using v_job.jobid;
      end loop;
      execute $schedule$ select cron.schedule('cleanup_invitations', '17 3 * * *', 'select public.cleanup_invitations();') $schedule$;
    end if;
  end if;
end $$;
