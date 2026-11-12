import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { requireRoleFor } from "@/lib/ownership";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { ACTIVE_STATUSES, deepResearchActionSchema, researchProgress } from "@/lib/research";

type Params = { params: Promise<{ runId: string }> };

/**
 * État complet et PERSISTÉ d'une recherche : le client peut se reconnecter à tout moment et reprendre
 * le fil (`?after=<id du dernier événement reçu>` pour ne lire que les nouveaux événements).
 */
export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { runId } = await params;
  await requireRoleFor("research_runs", runId, "viewer");
  const after = Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0);
  const supabase = await createUserClient();
  const [run, events, sources, findings] = await Promise.all([
    supabase.from("research_runs").select("id, notebook_id, question, instructions, depth, max_sources, report_format, status, stage, next_step, plan, budget, spent, coverage, artifact_id, parent_run_id, models, error_code, error_message, current_job_id, pause_requested, cancel_requested, started_at, finished_at, created_at").eq("id", runId).single(),
    supabase.from("research_events").select("id, type, message, data, created_at").eq("run_id", runId).gt("id", after).order("id").limit(300),
    supabase.from("research_sources").select("id, subquestion_id, url, canonical_url, title, domain, author, published_at, accessed_at, doc_type, summary, relevance, status, reason, source_id").eq("run_id", runId).order("created_at"),
    supabase.from("research_findings").select("id, research_source_id, subquestion_id, statement, quote, support").eq("run_id", runId).order("created_at").limit(400),
  ]);
  if (run.error) throw run.error;
  // état du worker : lu en service (jobs sans notebook visible pour certains rôles), uniquement le job courant
  const { data: job } = run.data.current_job_id
    ? await createServiceClient().from("jobs").select("status, attempts, max_attempts, run_after, locked_until, error_code").eq("id", run.data.current_job_id).maybeSingle()
    : { data: null };
  return NextResponse.json({
    run: { ...run.data, progress: researchProgress(run.data) },
    worker: job ? { status: job.status, attempts: job.attempts, maxAttempts: job.max_attempts, runAfter: job.run_after, leaseUntil: job.locked_until, errorCode: job.error_code } : null,
    events: events.data ?? [], sources: sources.data ?? [], findings: findings.data ?? [],
  });
});

/** Actions : annuler (arrêt réel entre deux pages), mettre en pause, reprendre / relancer, ajouter une consigne. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { runId } = await params;
  const { notebookId } = await requireRoleFor("research_runs", runId, "editor");
  const body = await parseBody(req, deepResearchActionSchema);
  const db = createServiceClient();
  const { data: run } = await db.from("research_runs").select("status, usage_id, instructions").eq("id", runId).single();
  if (!run) throw new ApiError(404, "not_found");
  const active = (ACTIVE_STATUSES as readonly string[]).includes(run.status);
  const event = (type: string, message: string, data: object = {}) =>
    db.from("research_events").insert({ run_id: runId, notebook_id: notebookId, type, message, data: { ...data, user_id: user.id } });

  switch (body.action) {
    case "cancel": {
      if (!active && run.status !== "paused") throw new ApiError(409, "research_not_active");
      await db.from("research_runs").update({ cancel_requested: true, status: "cancelled", stage: "annulée", finished_at: new Date().toISOString() }).eq("id", runId);
      // job en file : annulé tout de suite ; job en cours : le worker s'arrête à la prochaine vérification
      await db.from("jobs").update({ status: "cancelled", cancel_requested: true, finished_at: new Date().toISOString() }).eq("target_id", runId).eq("kind", "deep_research").eq("status", "queued");
      await db.from("jobs").update({ cancel_requested: true }).eq("target_id", runId).eq("kind", "deep_research").eq("status", "running");
      if (run.usage_id) await db.rpc("settle_usage", { p_id: run.usage_id, p_status: "refunded" });
      await event("research.cancelled", "Recherche annulée par l'utilisateur.");
      break;
    }
    case "pause": {
      if (!active) throw new ApiError(409, "research_not_active");
      await db.from("research_runs").update({ pause_requested: true, stage: "pause demandée" }).eq("id", runId);
      await event("research.pause_requested", "Pause demandée : la recherche s'arrêtera à la fin de l'étape en cours.");
      break;
    }
    case "resume": {
      const { error } = await db.rpc("resume_deep_research", { p_run: runId, p_user: user.id });
      if (error) {
        if (error.message.includes("research_not_resumable")) throw new ApiError(409, "research_not_resumable");
        if (error.message.includes("research_busy")) throw new ApiError(409, "research_busy");
        throw error;
      }
      break;
    }
    case "instruct": {
      if (!active && run.status !== "paused") throw new ApiError(409, "research_not_active");
      const instructions = [...((run.instructions as string[] | null) ?? []), body.instruction].slice(-10);
      await db.from("research_runs").update({ instructions }).eq("id", runId);
      await event("research.instruction.added", `Consigne ajoutée : ${body.instruction}`.slice(0, 1000));
      break;
    }
  }
  log.info("deep_research.action", { run_id: runId, action: body.action, user_id: user.id });
  return NextResponse.json({ ok: true });
});
