import { hostname } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { runOnce, type Handler, type JobKind } from "./worker.ts";
import { embedderFromEnv } from "./ai/embeddings.ts";
import { ingestHandler } from "./ingest/handler.ts";
import { llmFromEnv } from "./ai/llm.ts";
import { studioHandler } from "./studio/generate.ts";
import { guideHandler, overviewHandler } from "./studio/summaries.ts";
import { researchHandler } from "./research/handler.ts";
import { transcriberFromEnv } from "./ai/transcription.ts";
import { speechFromEnv } from "./ai/speech.ts";

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
if (!transcriber) console.warn("DEEPGRAM_API_KEY absent : import audio et transcription vidéo désactivés.");
if (!process.env.OPENROUTER_API_KEY) console.warn("OPENROUTER_API_KEY absent : OCR des images et PDF scannés désactivé.");
if (!process.env.FFMPEG_PATH && process.platform !== "win32") console.warn("FFMPEG_PATH absent : le binaire ffmpeg doit être disponible dans le PATH pour les vidéos.");
const handlers: Partial<Record<JobKind, Handler>> = {
  ingest_source: ingestHandler(db, embedder, { summaries: Boolean(llm), transcriber }),
  research: researchHandler(db, process.env.TAVILY_API_KEY),
  generate_artifact: studioHandler(db, llm, speech),
  ...(llm ? { source_guide: guideHandler(db, llm), notebook_overview: overviewHandler(db, llm) } : {}),
};
if (!llm) console.warn("OPENROUTER_API_KEY / OPENROUTER_CHAT_MODEL absents : Studio en échec (crédit rendu), pas de guides ni de résumé de notebook.");

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

console.log(`worker ${workerId} démarré, types gérés : ${Object.keys(handlers).join(", ") || "aucun"}`);
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
