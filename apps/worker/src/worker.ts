import type { SupabaseClient } from "@supabase/supabase-js";

export type JobKind =
  | "ingest_source" | "sync_source" | "source_guide" | "auto_label" | "notebook_overview"
  | "generate_artifact" | "research" | "copy_notebook" | "export_account" | "delete_account" | "purge_storage";

export type Job = {
  id: string; kind: JobKind; workspace_id: string; notebook_id: string | null; target_id: string | null;
  payload: Record<string, unknown>; attempts: number; max_attempts: number; usage_id: string | null; cancel_requested: boolean;
};

export type JobContext = {
  /** Progression 0–100 et étape lisible, poussées au client par Realtime. */
  progress: (value: number, stage?: string) => Promise<void>;
  /** Vrai si l'utilisateur a demandé l'annulation : le handler s'arrête entre deux étapes. */
  cancelled: () => Promise<boolean>;
};
export type Handler = (job: Job, ctx: JobContext) => Promise<Record<string, unknown> | void>;

/** Erreur attendue (fichier illisible, quota…) : pas de nouvelle tentative. */
export class PermanentError extends Error {
  code: string;
  constructor(code: string, message?: string) { super(message ?? code); this.code = code; }
}

const LEASE_SECONDS = 60;
const HEARTBEAT_MS = 20_000;

/**
 * Réclame au plus un job parmi les types gérés, l'exécute, puis règle son statut et son quota.
 * Ne réclame jamais un type sans handler : un worker sans handler ne prend rien.
 * Retourne l'id du job traité, ou null si la file est vide.
 */
export async function runOnce(db: SupabaseClient, workerId: string, handlers: Partial<Record<JobKind, Handler>>): Promise<string | null> {
  const kinds = Object.keys(handlers) as JobKind[];
  if (kinds.length === 0) return null;
  const { data, error } = await db.rpc("claim_jobs", { p_worker: workerId, p_kinds: kinds, p_limit: 1, p_lease_seconds: LEASE_SECONDS });
  if (error) throw error;
  const job = (data as Job[])[0];
  if (!job) return null;

  const heartbeat = setInterval(() => {
    void db.from("jobs").update({ locked_until: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString() })
      .eq("id", job.id).eq("locked_by", workerId);
  }, HEARTBEAT_MS);

  const ctx: JobContext = {
    progress: async (value, stage) => {
      await db.from("jobs").update({ progress: Math.max(0, Math.min(100, Math.round(value))), stage }).eq("id", job.id);
    },
    cancelled: async () => {
      const { data: row } = await db.from("jobs").select("cancel_requested").eq("id", job.id).single();
      return Boolean(row?.cancel_requested);
    },
  };

  try {
    const result = await handlers[job.kind]!(job, ctx);
    if (await ctx.cancelled()) return await finish(db, job, "cancelled", { error_code: "cancelled" });
    return await finish(db, job, "succeeded", { result: result ?? null, progress: 100 });
  } catch (e) {
    const permanent = e instanceof PermanentError;
    const message = e instanceof Error ? e.message.slice(0, 500) : "erreur inconnue";
    if (!permanent && job.attempts < job.max_attempts) {
      // nouvelle tentative avec backoff quadratique ; le quota reste réservé
      await db.from("jobs").update({
        status: "queued", locked_by: null, locked_until: null, error_message: message,
        run_after: new Date(Date.now() + 15_000 * job.attempts * job.attempts).toISOString(),
      }).eq("id", job.id);
      return job.id;
    }
    return await finish(db, job, "failed", { error_code: permanent ? (e as PermanentError).code : "handler_error", error_message: message });
  } finally {
    clearInterval(heartbeat);
  }
}

async function finish(db: SupabaseClient, job: Job, status: "succeeded" | "failed" | "cancelled", fields: Record<string, unknown>) {
  const { error } = await db.from("jobs").update({
    status, locked_by: null, locked_until: null, finished_at: new Date().toISOString(), ...fields,
  }).eq("id", job.id);
  if (error) throw error;
  if (job.usage_id) {
    const { error: e } = await db.rpc("settle_usage", { p_id: job.usage_id, p_status: status === "succeeded" ? "committed" : "refunded" });
    if (e) throw e;
  }
  return job.id;
}
