import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ jobId: string }> };

/** Lecture d'un job de recherche, limitée au notebook et au rôle éditeur. */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new ApiError(404, "not_found");
  const db = createServiceClient();
  const { data: job } = await db.from("jobs").select("id, notebook_id, kind, status, progress, stage, result, error_code")
    .eq("id", jobId).eq("kind", "research").maybeSingle();
  if (!job?.notebook_id) throw new ApiError(404, "not_found");
  await requireRole(job.notebook_id, "editor");
  const stored = job.result as { result?: { query?: string; results?: unknown[]; searchedAt?: string } } | null;
  return NextResponse.json({
    job: { id: job.id, status: job.status, progress: job.progress, stage: job.stage, errorCode: job.error_code },
    query: stored?.result?.query ?? null,
    results: stored?.result?.results ?? [],
    searchedAt: stored?.result?.searchedAt ?? null,
  });
});
