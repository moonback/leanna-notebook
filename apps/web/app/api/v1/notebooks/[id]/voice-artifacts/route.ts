import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  type: z.enum(["report", "flashcards", "quiz", "mind_map", "audio", "infographic", "timeline", "comparison", "glossary", "faq", "diagram", "editorial", "study_plan", "image"]),
  prompt: z.string().trim().min(3).max(4000),
  template: z.enum(["custom", "briefing", "study_guide", "faq", "blog_post", "specification", "action_plan", "practical_sheet", "detailed_guide"]).optional(),
  sourceIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();

/** Pont sécurisé entre Gemini Live et le moteur de génération asynchrone du Studio. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "editor");
  const body = await parseBody(req, schema);
  if (!process.env.OPENROUTER_API_KEY || (body.type !== "image" && !process.env.OPENROUTER_CHAT_MODEL)) {
    throw new ApiError(503, "ai_not_configured");
  }

  const db = createServiceClient();
  let sourceIds = [...new Set(body.sourceIds)];
  const [{ data: ready }, { data: deselected }] = await Promise.all([
    db.from("sources").select("id").eq("notebook_id", id).eq("status", "ready"),
    db.from("source_deselections").select("source_id").eq("notebook_id", id).eq("user_id", user.id),
  ]);
  const off = new Set((deselected ?? []).map((source) => source.source_id));
  const validIds = new Set((ready ?? []).filter((source) => !off.has(source.id)).map((source) => source.id));
  // Si Roxane n'a pas interrogé les sources pendant ce tour, on utilise toutes les sources prêtes et sélectionnées.
  if (!sourceIds.length) sourceIds = [...validIds];
  else sourceIds = sourceIds.filter((sourceId) => validIds.has(sourceId));
  if (!sourceIds.length) throw new ApiError(422, "no_sources");

  const { data: notebook } = await db.from("notebooks").select("output_language").eq("id", id).single();
  if (!notebook) throw new ApiError(404, "not_found");
  let options: Record<string, unknown> = {
    language: notebook.output_language ?? "fr",
    sourceScope: "selected",
  };

  if (body.template) options.template = body.template;
  if (body.type === "report") options.reportFormat = "document";

  if (body.type === "image") {
    const { data: prefs } = await db.from("ai_image_preferences")
      .select("enabled,default_model_id,default_orientation").eq("user_id", user.id).maybeSingle();
    if (prefs?.enabled === false) throw new ApiError(403, "image_generation_disabled");
    const modelId = prefs?.default_model_id || process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image";
    const catalogResponse = await fetch("https://openrouter.ai/api/v1/images/models", {
      headers: { authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "X-Title": "Leanna Notebook" },
      next: { revalidate: 1800 },
    });
    if (!catalogResponse.ok) throw new ApiError(502, "image_model_catalog_unavailable");
    const catalog = await catalogResponse.json() as { data?: { id?: string }[] };
    if (!(catalog.data ?? []).some((model) => model.id === modelId)) throw new ApiError(422, "unsupported_image_model");
    options = { ...options, modelId, orientation: prefs?.default_orientation ?? "landscape" };
  }

  const { data: artifactId, error } = await db.rpc("create_artifact", {
    p_notebook: id,
    p_user: user.id,
    p_type: body.type,
    p_options: options,
    p_custom_prompt: body.prompt,
    p_source_ids: sourceIds,
    p_idempotency_key: null,
  });
  if (error) throw error;
  log.info("voice.studio_artifact_requested", { notebook_id: id, artifact_id: artifactId, type: body.type });
  return NextResponse.json({ artifact: { id: artifactId, type: body.type, status: "queued" } }, { status: 202 });
});
