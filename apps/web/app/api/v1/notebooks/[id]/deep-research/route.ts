import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { deepResearchCreateSchema, researchProgress } from "@/lib/research";
import { disabledFeatures } from "@/lib/ownership";

type Params = { params: Promise<{ id: string }> };

/** Historique des recherches approfondies du notebook (lecture sous RLS). */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "viewer");
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("research_runs")
    .select("id, question, depth, max_sources, report_format, status, stage, next_step, budget, spent, artifact_id, parent_run_id, error_code, created_at, finished_at")
    .eq("notebook_id", id).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return NextResponse.json({ runs: (data ?? []).map((r) => ({ ...r, progress: researchProgress(r) })) });
});

/** Lance une recherche approfondie : 202 immédiat, le worker exécute les étapes. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "editor");
  if ((await disabledFeatures(user.id)).includes("deep_research")) throw new ApiError(403, "feature_disabled");
  const body = await parseBody(req, deepResearchCreateSchema);
  const idem = req.headers.get("idempotency-key");
  const { data, error } = await createServiceClient().rpc("create_deep_research", {
    p_notebook: id, p_user: user.id, p_question: body.question, p_depth: body.depth, p_max_sources: body.maxSources,
    p_report_format: body.reportFormat, p_instructions: body.instructions ?? null, p_parent: body.parentRunId ?? null,
    p_idempotency_key: idem ? `${user.id}:${idem}`.slice(0, 200) : null,
  });
  if (error) {
    if (error.message.includes("research_not_found")) throw new ApiError(404, "not_found");
    throw error;
  }
  log.info("deep_research.requested", { notebook_id: id, run_id: data as string, user_id: user.id, depth: body.depth });
  return NextResponse.json({ runId: data, status: "queued" }, { status: 202 });
});
