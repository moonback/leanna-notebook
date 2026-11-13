import { hostname } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { runOnce, PermanentError, type Handler, type JobKind } from "./worker.ts";
import { embedderFromEnv } from "./ai/embeddings.ts";
import { ingestHandler } from "./ingest/handler.ts";
import { llmFromEnv } from "./ai/llm.ts";
import { studioHandler } from "./studio/generate.ts";
import { generateImageArtifact } from "./studio/image-generation.ts";
import { guideHandler, overviewHandler } from "./studio/summaries.ts";
import { researchHandler } from "./research/handler.ts";
import { deepResearchHandler } from "./research/deep.ts";
import { searchProviderFromEnv } from "./research/search.ts";
import { knowledgeExtractHandler } from "./knowledge/extract.ts";
import { contradictionsHandler } from "./knowledge/contradictions.ts";
import { transcriberFromEnv } from "./ai/transcription.ts";
import { speechFromEnv } from "./ai/speech.ts";
import { SOURCE_KINDS } from "./ingest/extract.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (voir .env.example).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const workerId = process.env.WORKER_ID || `${hostname()}-${process.pid}`;

const embedder = embedderFromEnv();
if (!embedder) console.warn("EMBEDDINGS_* non configuré : indexation en plein texte uniquement (pas de recherche vectorielle).");

// Un handler par type de job réellement implémenté ; les autres types ne sont pas réclamés.
const llm = llmFromEnv();
const transcriber = transcriberFromEnv();
const speech = speechFromEnv();
if (!speech) console.warn("ELEVENLABS_API_KEY absent : génération Audio Overview désactivée.");
if (!transcriber) console.warn("DEEPGRAM_API_KEY absent : import audio désactivé (les autres sources restent disponibles).");
const handlers: Partial<Record<JobKind, Handler>> = {
  ingest_source: ingestHandler(db, embedder, { summaries: Boolean(llm), knowledge: Boolean(llm), transcriber }),
  research: researchHandler(db, process.env.TAVILY_API_KEY),
  // Deep Research est toujours réclamé : sans clé, la recherche échoue explicitement (crédit rendu) au lieu de rester en file
  deep_research: deepResearchHandler({
    db, llm, search: searchProviderFromEnv(), embedder,
    maxCostUsd: process.env.DEEP_RESEARCH_MAX_COST_USD ? Number(process.env.DEEP_RESEARCH_MAX_COST_USD) : undefined,
  }),
  knowledge_contradictions: contradictionsHandler(db, llm),
  generate_artifact: async (job, ctx) => {
    if (job.target_id) {
      const { data: artifact } = await db.from("artifacts").select("id,type,options,custom_prompt,source_ids,notebook_id,workspace_id,created_by").eq("id", job.target_id).single();
      if (artifact?.type === "image") {
        await db.from("artifacts").update({ status: "generating", error_code: null }).eq("id", artifact.id);
        try { return await generateImageArtifact(db, artifact, ctx); }
        catch (error) {
          if (error instanceof PermanentError || job.attempts >= job.max_attempts) {
            await db.from("artifacts").update({ status: "failed", error_code: error instanceof PermanentError ? error.code : "image_generation_failed" }).eq("id", artifact.id);
          }
          throw error;
        }
      }
    }
    return studioHandler(db, llm, speech)(job, ctx);
  },
  ...(llm ? { source_guide: guideHandler(db, llm), notebook_overview: overviewHandler(db, llm), knowledge_extract: knowledgeExtractHandler(db, llm) } : {}),
};
if (!llm) console.warn("OPENROUTER_API_KEY / OPENROUTER_CHAT_MODEL absents : Studio et Deep Research en échec (crédit rendu), pas de guides, de résumé ni de graphe de connaissances.");
if (!process.env.TAVILY_API_KEY) console.warn("TAVILY_API_KEY absente : Fast Research et Deep Research indisponibles.");

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

console.log(`worker ${workerId} démarré, types gérés : ${Object.keys(handlers).join(", ") || "aucun"}`);
console.log(`types de source pris en charge : ${SOURCE_KINDS.join(", ")}${process.env.GITHUB_TOKEN ? " (GITHUB_TOKEN configuré)" : " (GITHUB_TOKEN absent : 60 requêtes GitHub/heure)"}`);
// Jobs d'un worker mort (bail expiré) : remis en file, ou échec + crédit rendu. Sûr à plusieurs workers.
let lastSweep = 0;
while (!stopping) {
  try {
    if (Date.now() - lastSweep > 60_000) {
      lastSweep = Date.now();
      const { data: n, error } = await db.rpc("requeue_stale_jobs");
      if (error) console.error("requeue_stale_jobs", error.message); else if (n) console.log(`${n} job(s) au bail expiré remis en file`);
    }
    const id = await runOnce(db, workerId, handlers);
    if (!id) await new Promise((r) => setTimeout(r, 2000)); // file vide : attente courte
  } catch (e) {
    console.error("erreur de boucle", e);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
console.log("worker arrêté proprement");
