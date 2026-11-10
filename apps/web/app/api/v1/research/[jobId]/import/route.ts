import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ jobId: string }> };
const schema = z.object({ urls: z.array(z.string().url()).min(1).max(5) }).strict();

/** Importe uniquement des URLs issues des résultats de CE job : pas de soumission d'URL arbitraire. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new ApiError(404, "not_found");
  const body = await parseBody(req, schema);
  const db = createServiceClient();
  const { data: job } = await db.from("jobs").select("id, notebook_id, workspace_id, kind, status, result")
    .eq("id", jobId).eq("kind", "research").maybeSingle();
  if (!job?.notebook_id || job.status !== "succeeded") throw new ApiError(404, "not_found");
  await requireRole(job.notebook_id, "editor");

  const stored = job.result as { result?: { results?: Array<{ title: string; url: string }> } } | null;
  const candidates = stored?.result?.results ?? [];
  const allowed = new Map(candidates.map((r) => [r.url, r.title]));
  const urls = [...new Set(body.urls)];
  if (urls.some((url) => !allowed.has(url))) throw new ApiError(422, "research_result_required");

  const { data: existing } = await db.from("sources").select("id, origin_url").eq("notebook_id", job.notebook_id).in("origin_url", urls);
  const existingUrls = new Set((existing ?? []).map((s) => s.origin_url));
  const imported: { id: string; title: string; status: string }[] = [];
  for (const url of urls) {
    if (existingUrls.has(url)) continue;
    const title = (allowed.get(url) ?? new URL(url).hostname).slice(0, 300);
    const idem = `${user.id}:${job.notebook_id}:research-import:${jobId}:${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
    const { data, error } = await db.rpc("add_source", {
      p_notebook: job.notebook_id, p_user: user.id, p_kind: "web", p_title: title, p_origin_url: url,
      p_storage_path: null, p_mime_type: null, p_size_bytes: null, p_note_body: null, p_idempotency_key: idem,
    });
    if (error) throw error;
    imported.push({ id: data as string, title, status: "pending" });
  }
  log.info("research.imported", { notebook_id: job.notebook_id, job_id: jobId, count: imported.length, skipped: urls.length - imported.length });
  return NextResponse.json({ sources: imported, skipped: urls.length - imported.length }, { status: 202 });
});
