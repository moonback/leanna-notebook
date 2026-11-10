-- H01 partage privé : fonctions de lecture d'auth.users, réservées au serveur.
-- Le serveur vérifie le rôle (owner) AVANT l'appel ; exposées aux clients, elles
-- permettraient de tester si une adresse a un compte.

create function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

-- Personnes ayant accès à un notebook : propriétaire (créateur), membres, invitations en attente.
create function public.notebook_people(p_nb uuid)
returns table (member_id uuid, user_id uuid, email text, display_name text, role public.notebook_role, pending boolean)
language sql stable security definer set search_path = '' as $$
  select null::uuid, n.created_by, u.email::text, p.display_name, 'owner'::public.notebook_role, false
    from public.notebooks n
    join auth.users u on u.id = n.created_by
    left join public.profiles p on p.id = n.created_by
   where n.id = p_nb
  union all
  select nm.id, nm.user_id, coalesce(u.email::text, nm.invited_email), p.display_name, nm.role, nm.user_id is null
    from public.notebook_members nm
    left join auth.users u on u.id = nm.user_id
    left join public.profiles p on p.id = nm.user_id
   where nm.notebook_id = p_nb
$$;

revoke execute on function public.user_id_by_email(text), public.notebook_people(uuid) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text), public.notebook_people(uuid) to service_role;
