-- S04 / H07 : ouverture contrôlée des notebooks éditoriaux curés.
-- Une visite sans lien n'accorde le rôle viewer que tant que le notebook reste featured.
alter table public.notebook_visits alter column via_link_id drop not null;

create or replace function private.notebook_role(p_nb uuid) returns public.notebook_role
language sql stable security definer set search_path = '' as $$
  select max(r) from (
    select case when m.role in ('owner', 'admin') or n.created_by = auth.uid()
                then 'owner'::public.notebook_role else 'editor'::public.notebook_role end
      from public.notebooks n
      join public.workspace_members m on m.workspace_id = n.workspace_id and m.user_id = auth.uid()
     where n.id = p_nb
    union all
    select nm.role from public.notebook_members nm
     where nm.notebook_id = p_nb and nm.user_id = auth.uid()
    union all
    select case l.scope when 'full' then 'viewer'::public.notebook_role else 'chat'::public.notebook_role end
      from public.notebook_visits v
      join public.share_links l on l.id = v.via_link_id
     where v.notebook_id = p_nb and v.user_id = auth.uid()
       and l.revoked_at is null and l.scope in ('full', 'chat_only')
    union all
    select 'viewer'::public.notebook_role
      from public.notebook_visits v
      join public.notebooks n on n.id = v.notebook_id
     where v.notebook_id = p_nb and v.user_id = auth.uid()
       and v.via_link_id is null and n.is_featured
  ) s(r)
$$;

create or replace function public.accept_featured_notebook(p_notebook uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = '28000'; end if;
  if not exists (select 1 from public.notebooks where id = p_notebook and is_featured) then
    raise exception 'featured_not_found' using errcode = 'P0002';
  end if;
  insert into public.notebook_visits (notebook_id, user_id, via_link_id, hidden)
       values (p_notebook, auth.uid(), null, false)
  on conflict (notebook_id, user_id) do update
       set via_link_id = null, hidden = false, updated_at = now();
  return p_notebook;
end $$;

revoke execute on function public.accept_featured_notebook(uuid) from public, anon;
grant execute on function public.accept_featured_notebook(uuid) to authenticated;
