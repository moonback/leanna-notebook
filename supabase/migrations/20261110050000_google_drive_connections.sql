-- Google Drive OAuth connection metadata. Refresh tokens are encrypted by the web server.
create table public.google_drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_subject text not null unique,
  google_email text not null,
  refresh_token_ciphertext text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.google_drive_connections enable row level security;
revoke all on public.google_drive_connections from anon, authenticated;
grant select on public.google_drive_connections to authenticated;
create policy google_drive_connection_self_read
  on public.google_drive_connections for select to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.google_drive_connections to service_role;
