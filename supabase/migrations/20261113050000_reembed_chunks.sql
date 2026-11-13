-- Changement de modèle d'embeddings : réécriture des vecteurs existants par lots (commande `reembed` du worker).
-- p_rows = [{"id":"<uuid chunk>","embedding":"[0.1,...]"}] ; p_model = identifiant enregistré dans chunks.embedding_model.
create function public.set_chunk_embeddings(p_rows jsonb, p_model text)
returns integer
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_n int;
begin
  update public.chunks c set embedding = r.embedding::halfvec(1024), embedding_model = p_model
    from jsonb_to_recordset(p_rows) as r(id uuid, embedding text)
   where c.id = r.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.set_chunk_embeddings(jsonb, text) from public, anon, authenticated;
grant execute on function public.set_chunk_embeddings(jsonb, text) to service_role;

-- PostgREST : rendre les nouvelles fonctions visibles sans redémarrage (sinon PGRST202).
notify pgrst, 'reload schema';
