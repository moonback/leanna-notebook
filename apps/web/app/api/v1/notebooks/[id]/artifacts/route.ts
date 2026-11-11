import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  type: z.enum(["report", "flashcards", "quiz", "mind_map", "audio", "infographic", "timeline", "comparison", "glossary", "faq", "diagram", "editorial", "study_plan", "image"]),
  options: z.object({
    template: z.enum(["custom", "briefing", "study_guide", "faq", "blog_post", "specification", "action_plan", "practical_sheet", "detailed_guide"]).optional(),
    language: z.enum(["fr", "en", "es", "de", "it", "pt", "nl"]).optional(),
    reportFormat: z.enum(["document", "interactive"]).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    count: z.enum(["fewer", "standard", "more"]).optional(),
    format: z.enum(["deep_dive", "brief", "critique", "debate"]).optional(),
    duration: z.enum(["short", "standard", "long"]).optional(),
    style: z.enum(["accessible", "professional", "dynamic"]).optional(),
    orientation: z.enum(["portrait", "landscape", "square"]).optional(),
    visualStyle: z.enum(["auto", "kawaii", "claymation", "sketchnote", "anime", "editorial", "storyboard", "bentogrid", "bricks", "scientific", "professional"]).optional(),
    detailLevel: z.enum(["concise", "standard", "detailed", "very_detailed"]).optional(),
    sourceScope: z.enum(["selected", "all"]).optional(),
    modelId: z.string().trim().min(3).max(200).optional(),
    aspectRatio: z.enum(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]).optional(),
    referenceArtifactId: z.string().uuid().optional(),
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
  if (!process.env.OPENROUTER_API_KEY || (body.type !== "image" && !process.env.OPENROUTER_CHAT_MODEL)) throw new ApiError(503, "ai_not_configured");
  if (body.type === "image") {
    const { data: imagePrefs } = await createServiceClient().from("ai_image_preferences")
      .select("enabled,default_model_id,default_orientation").eq("user_id", user.id).maybeSingle();
    if (imagePrefs?.enabled === false) throw new ApiError(403, "image_generation_disabled");
    const selectedModel = body.options.modelId || imagePrefs?.default_model_id || process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image";
    if (!body.options.modelId && imagePrefs?.default_orientation) body.options.orientation = imagePrefs.default_orientation;
    const catalogResponse = await fetch("https://openrouter.ai/api/v1/images/models", {
      headers: { authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "X-Title": "Leanna Notebook" },
      next: { revalidate: 1800 },
    });
    if (!catalogResponse.ok) throw new ApiError(502, "image_model_catalog_unavailable");
    const catalog = await catalogResponse.json() as { data?: { id?: string }[] };
    if (!(catalog.data ?? []).some((model) => model.id === selectedModel)) throw new ApiError(422, "unsupported_image_model");
    body.options.modelId = selectedModel;
  }
  let referenceImageId: string | null = null;
  if (body.type === "image" && body.options.referenceArtifactId) {
    const { data: reference } = await createServiceClient().from("artifacts").select("id").eq("id", body.options.referenceArtifactId).eq("notebook_id", id).eq("type", "image").eq("status", "ready").maybeSingle();
    if (!reference) throw new ApiError(422, "invalid_image_reference");
    referenceImageId = reference.id;
  }
  const idem = req.headers.get("idempotency-key");
  const { data, error } = await createServiceClient().rpc("create_artifact", {
    p_notebook: id, p_user: user.id, p_type: body.type, p_options: body.options, p_custom_prompt: body.customPrompt || null,
    p_source_ids: body.sourceIds ?? [], p_idempotency_key: idem ? `${user.id}:${id}:${idem}` : null,
  });
  if (error) throw error;
  if (referenceImageId) {
    const { error: parentError } = await createServiceClient().from("artifacts").update({ parent_id: referenceImageId }).eq("id", data as string);
    if (parentError) throw parentError;
  }
  log.info("artifact.requested", { notebook_id: id, artifact_id: data as string, type: body.type });
  return NextResponse.json({ artifact: { id: data, type: body.type, status: "queued" } }, { status: 202 });
});
