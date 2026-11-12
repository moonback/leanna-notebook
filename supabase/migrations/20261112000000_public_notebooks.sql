-- Notebooks publics : lecture seule, sans compte, via une URL /p/<slug>.
-- Pas de policy anon : la page publique lit via le serveur (service_role) en ne
-- sélectionnant que des colonnes explicites (aucune conversation, aucune note).
alter table public.notebooks
  add column public_slug  text,
  add column published_at timestamptz,
  add constraint notebooks_public_slug_format check (public_slug ~ '^[A-Za-z0-9_-]{16,64}$'),
  add constraint notebooks_public_consistent check ((public_slug is null) = (published_at is null));

create unique index notebooks_public_slug_uq on public.notebooks (public_slug) where public_slug is not null;
