import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const schema = z.object({
  enabled: z.boolean(),
  modelId: z.string().trim().min(3).max(200).nullable(),
  engine: z.enum(["mistral-ocr", "cloudflare-ai"]),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.modelId) {
    ctx.addIssue({ code: "custom", path: ["modelId"], message: "Sélectionnez un modèle OpenRouter pour activer l'OCR." });
  }
});

const defaults = { enabled: false, modelId: null as string | null, engine: "mistral-ocr" as const };

export const GET = handle(async () => {
  const user = await requireUser();
  const { data, error } = await createServiceClient().from("ai_ocr_preferences")
    .select("enabled,model_id,engine").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return NextResponse.json({ settings: data ? {
    enabled: data.enabled, modelId: data.model_id, engine: data.engine,
  } : defaults });
});

export const PUT = handle(async (req: NextRequest) => {
  const user = await requireUser();
  const settings = await parseBody(req, schema);
  if (!process.env.OPENROUTER_API_KEY) throw new ApiError(503, "openrouter_not_configured");
  if (settings.enabled && settings.modelId) {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "X-Title": "Leanna Notebook" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new ApiError(502, "openrouter_catalog_unavailable");
    const catalog = await response.json() as { data?: Array<{ id?: string; architecture?: { input_modalities?: string[]; output_modalities?: string[] } }> };
    const model = (catalog.data ?? []).find((item) => item.id === settings.modelId);
    if (!model) throw new ApiError(422, "unknown_openrouter_model");
    const input = model.architecture?.input_modalities ?? [];
    const output = model.architecture?.output_modalities ?? [];
    if (input.length && !input.includes("text")) throw new ApiError(422, "ocr_model_must_accept_text");
    if (output.length && !output.includes("text")) throw new ApiError(422, "ocr_model_must_return_text");
  }
  const { error } = await createServiceClient().from("ai_ocr_preferences").upsert({
    user_id: user.id, enabled: settings.enabled, model_id: settings.modelId,
    engine: settings.engine, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
  return NextResponse.json({ ok: true, settings });
});
