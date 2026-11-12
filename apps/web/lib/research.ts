import { z } from "zod";

export const UUID = /^[0-9a-f-]{36}$/i;

export const DEPTHS = ["quick", "deep", "expert"] as const;
export const REPORT_FORMATS = ["structured", "executive", "comparative", "detailed", "dossier", "timeline", "actors", "risks", "bibliography", "none"] as const;

export const deepResearchCreateSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  depth: z.enum(DEPTHS).default("deep"),
  maxSources: z.number().int().min(3).max(30).default(10),
  reportFormat: z.enum(REPORT_FORMATS).default("structured"),
  instructions: z.string().trim().max(2000).optional(),
  parentRunId: z.string().regex(UUID).optional(),
}).strict();

export const deepResearchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("pause") }).strict(),
  z.object({ action: z.literal("resume") }).strict(),
  z.object({ action: z.literal("instruct"), instruction: z.string().trim().min(3).max(1000) }).strict(),
]);

export const ACTIVE_STATUSES = ["queued", "planning", "searching", "reading", "extracting", "cross_checking", "writing"] as const;
export type RunState = {
  status: string; next_step: string; budget: { iterations?: number } | null; spent: { iterations?: number } | null;
};

/**
 * Progression dérivée de l'état PERSISTÉ de la recherche (étape enregistrée et tours effectués),
 * jamais d'un minuteur : elle n'avance que lorsque le worker a réellement terminé un travail.
 */
export function researchProgress(run: RunState): number {
  if (run.status === "completed") return 100;
  const iterations = Math.max(1, run.budget?.iterations ?? 1);
  const done = Math.min(iterations, run.spent?.iterations ?? 0);
  switch (run.next_step) {
    case "plan": return run.status === "queued" ? 0 : 3;
    case "iterate": return 10 + Math.round((done / iterations) * 55);
    case "ingest": return 68;
    case "await_ingest": return 75;
    case "write": return 88;
    default: return run.status === "failed" || run.status === "cancelled" ? 0 : 95;
  }
}

export const REVIEW_ACTIONS = ["verify", "confirm", "reject", "mark_obsolete", "resolve", "reopen", "note", "attach_source"] as const;
export const contradictionReviewSchema = z.object({
  action: z.enum(REVIEW_ACTIONS),
  note: z.string().trim().max(4000).optional(),
  sourceId: z.string().regex(UUID).optional(),
}).strict().refine((v) => v.action !== "attach_source" || v.sourceId, { message: "Source requise.", path: ["sourceId"] })
  .refine((v) => v.action !== "note" || v.note, { message: "Explication requise.", path: ["note"] });

export const entityActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("merge"), intoId: z.string().regex(UUID), reason: z.string().trim().max(500).optional() }).strict(),
  z.object({ action: z.literal("split"), aliasId: z.string().regex(UUID) }).strict(),
]);

export const relationUpdateSchema = z.object({ status: z.enum(["unreviewed", "confirmed", "rejected"]) }).strict();

/** Filtres du graphe lus depuis l'URL : bornés et validés (limite de nœuds affichés). */
export function graphFilters(params: URLSearchParams) {
  const limit = Math.min(500, Math.max(10, Number(params.get("limit")) || 150));
  const types = params.get("types")?.split(",").map((t) => t.trim()).filter((t) => /^[a-z_]{2,30}$/.test(t)) ?? [];
  const source = params.get("source");
  const date = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const minConfidence = Math.min(1, Math.max(0, Number(params.get("minConfidence")) || 0));
  return { limit, types: types.length ? types : null, source: source && UUID.test(source) ? source : null, from: date(params.get("from")), to: date(params.get("to")), minConfidence };
}
