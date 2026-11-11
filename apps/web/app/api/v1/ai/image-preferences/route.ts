import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const schema = z.object({
  enabled: z.boolean(),
  autoSuggestions: z.boolean(),
  suggestionCount: z.number().int().min(3).max(5),
  defaultModelId: z.string().trim().min(3).max(200).nullable(),
  defaultOrientation: z.enum(["landscape", "portrait", "square"]),
}).strict();

const defaults = {
  enabled: true, autoSuggestions: true, suggestionCount: 4,
  defaultModelId: null as string | null, defaultOrientation: "landscape" as const,
};

export const GET = handle(async () => {
  const user = await requireUser();
  const { data, error } = await createServiceClient().from("ai_image_preferences")
    .select("enabled,auto_suggestions,suggestion_count,default_model_id,default_orientation")
    .eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return NextResponse.json({ settings: data ? {
    enabled: data.enabled, autoSuggestions: data.auto_suggestions,
    suggestionCount: data.suggestion_count, defaultModelId: data.default_model_id,
    defaultOrientation: data.default_orientation,
  } : defaults });
});

export const PUT = handle(async (req: NextRequest) => {
  const user = await requireUser();
  const settings = await parseBody(req, schema);
  if (settings.defaultModelId) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new ApiError(503, "openrouter_not_configured");
    const response = await fetch("https://openrouter.ai/api/v1/images/models", {
      headers: { authorization: `Bearer ${key}`, "X-Title": "Leanna Notebook" },
      next: { revalidate: 1800 },
    });
    if (!response.ok) throw new ApiError(502, "image_model_catalog_unavailable");
    const catalog = await response.json() as { data?: { id?: string }[] };
    if (!(catalog.data ?? []).some((model) => model.id === settings.defaultModelId)) throw new ApiError(422, "unsupported_image_model");
  }
  const { error } = await createServiceClient().from("ai_image_preferences").upsert({
    user_id: user.id, enabled: settings.enabled, auto_suggestions: settings.autoSuggestions,
    suggestion_count: settings.suggestionCount, default_model_id: settings.defaultModelId,
    default_orientation: settings.defaultOrientation, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
  return NextResponse.json({ ok: true, settings });
});
