// Réindexation des vecteurs après un changement de modèle d'embeddings (EMBEDDINGS_PROVIDER / EMBEDDINGS_MODEL).
// Usage : pnpm --dir apps/worker reembed            → recalcule les chunks d'un autre modèle (ou sans vecteur)
//         pnpm --dir apps/worker reembed --dry-run  → compte seulement
// Reprenable : chaque lot enregistré n'est plus sélectionné ; relancer après une interruption continue où ça s'est arrêté.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embedderFromEnv, type Embedder } from "./ai/embeddings.ts";

const BATCH = 100;

/** Filtre PostgREST : chunks dont le vecteur manque ou vient d'un autre modèle. */
export const staleFilter = (model: string) => `embedding.is.null,embedding_model.is.null,embedding_model.neq."${model.replace(/"/g, "")}"`;

export async function countStale(db: SupabaseClient, model: string): Promise<number> {
  const { count, error } = await db.from("chunks").select("id", { count: "exact", head: true }).or(staleFilter(model));
  if (error) throw error;
  return count ?? 0;
}

export async function reembed(db: SupabaseClient, embedder: Embedder, log: (msg: string) => void = console.log): Promise<number> {
  const total = await countStale(db, embedder.model);
  log(`[reembed] modèle cible ${embedder.model} : ${total} chunk(s) à recalculer`);
  let done = 0;
  const startedAt = Date.now();
  while (true) {
    const { data, error } = await db.from("chunks").select("id, content").or(staleFilter(embedder.model)).order("id").limit(BATCH);
    if (error) throw error;
    if (!data?.length) break;
    const vectors = await embedder.embed(data.map((c) => c.content as string));
    if (vectors.length !== data.length) throw new Error("embeddings_count_mismatch");
    const { data: n, error: e2 } = await db.rpc("set_chunk_embeddings", {
      p_rows: data.map((c, i) => ({ id: c.id, embedding: `[${vectors[i]!.join(",")}]` })), p_model: embedder.model,
    });
    if (e2) throw e2;
    if (!n) throw new Error("aucune ligne mise à jour : arrêt pour éviter une boucle infinie");
    done += data.length;
    const rate = done / Math.max(1, (Date.now() - startedAt) / 1000);
    log(`[reembed] ${done}/${total} (${rate.toFixed(1)} chunks/s, reste ~${Math.ceil(Math.max(0, total - done) / Math.max(rate, 0.1))} s)`);
  }
  log(`[reembed] terminé : ${done} chunk(s) recalculé(s) en ${Math.round((Date.now() - startedAt) / 1000)} s`);
  return done;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("reembed.ts")) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis."); process.exit(1); }
  const embedder = embedderFromEnv();
  if (!embedder) { console.error("EMBEDDINGS_PROVIDER, EMBEDDINGS_MODEL et EMBEDDINGS_API_KEY sont requis."); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });
  if (process.argv.includes("--dry-run")) console.log(`[reembed] ${await countStale(db, embedder.model)} chunk(s) à recalculer pour ${embedder.model}`);
  else await reembed(db, embedder);
}
