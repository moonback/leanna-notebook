import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  type: z.enum(["report", "flashcards", "quiz", "mind_map", "audio"]),
  options: z.object({
    template: z.enum(["briefing", "study_guide", "faq"]).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    count: z.enum(["fewer", "standard", "more"]).optional(),
  }).strict().default({}),
  customPrompt: z.string().trim().max(4000, "4 000 caractères maximum.").optional(),
  sourceIds: z.array(z.string().uuid()).max(600).optional(),
}).strict();

/** Liste du Studio + progression des générations en cours (lecture sous RLS). */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "viewer");
  const supabase = await createUserClient();
  const [{ data: arts, error }, { data: reads }] = await Promise.all([
    supabase.from("artifacts").select("id, type, title, status, error_code, options, custom_prompt, created_at").eq("notebook_id", id).order("created_at", { ascending: false }),
    supabase.from("artifact_reads").select("artifact_id").eq("user_id", user.id),
  ]);
  if (error) throw error;
  const busy = (arts ?? []).filter((a) => ["queued", "scheduled", "generating"].includes(a.status)).map((a) => a.id);
  const { data: jobs } = busy.length ? await supabase.from("jobs").select("target_id, progress, stage").in("target_id", busy) : { data: [] };
  const progress = new Map((jobs ?? []).map((j) => [j.target_id, { progress: j.progress, stage: j.stage }]));
  const read = new Set((reads ?? []).map((r) => r.artifact_id));
  return NextResponse.json({ artifacts: (arts ?? []).map((a) => ({ ...a, ...progress.get(a.id), unread: a.status === "ready" && !read.has(a.id) })) });
});

/**
 * Lancer une génération : quota réservé + artefact + job en UNE transaction (create_artifact).
 * Réponse 202 immédiate ; le worker produit le contenu en arrière-plan.
 */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "editor");
  const body = await parseBody(req, createSchema);
  if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_CHAT_MODEL) throw new ApiError(503, "ai_not_configured");
  const idem = req.headers.get("idempotency-key");
  const { data, error } = await createServiceClient().rpc("create_artifact", {
    p_notebook: id, p_user: user.id, p_type: body.type, p_options: body.options, p_custom_prompt: body.customPrompt || null,
    p_source_ids: body.sourceIds ?? [], p_idempotency_key: idem ? `${user.id}:${id}:${idem}` : null,
  });
  if (error) throw error;
  log.info("artifact.requested", { notebook_id: id, artifact_id: data as string, type: body.type });
  return NextResponse.json({ artifact: { id: data, type: body.type, status: "queued" } }, { status: 202 });
});
