-- G01: autoriser un artefact audio distinct, facturé via la clé `audio` des plans.
-- On étend le CHECK existant sans supprimer les types déjà supportés.
do $$
declare
  item record;
  updated_definition text;
begin
  for item in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.artifacts'::regclass
      and contype = 'c'
  loop
    if item.definition ilike '%type%' and item.definition ilike '%mind_map%' then
      updated_definition := replace(item.definition, '''mind_map''', '''mind_map'', ''audio''');
      if updated_definition <> item.definition then
        execute format('alter table public.artifacts drop constraint %I', item.conname);
        execute format('alter table public.artifacts add constraint %I %s', item.conname, updated_definition);
      end if;
    end if;
  end loop;
end $$;
