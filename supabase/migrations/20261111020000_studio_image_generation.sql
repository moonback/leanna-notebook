-- Génération d'images IA dans le Studio.
alter type public.artifact_type add value if not exists 'image';

create table public.artifact_image_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  prompt text not null,
  model_id text not null,
  provider text,
  provider_cost_usd numeric(12,8),
  provider_usage jsonb not null default '{}',
  source_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (artifact_id, version_number)
);
create index artifact_image_versions_artifact_idx on public.artifact_image_versions(artifact_id, version_number desc);
create index artifact_image_versions_notebook_idx on public.artifact_image_versions(notebook_id);
alter table public.artifact_image_versions enable row level security;
create policy artifact_image_versions_read on public.artifact_image_versions
  for select to authenticated using (private.notebook_role(notebook_id) >= 'viewer');
revoke insert, update, delete, truncate on public.artifact_image_versions from anon, authenticated;
grant select on public.artifact_image_versions to authenticated;
grant select, insert, update, delete on public.artifact_image_versions to service_role;
