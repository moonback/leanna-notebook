import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import { AI_FEATURES } from "@/lib/ai/features";

export const runtime = "nodejs";
const allowed = new Set<string>(AI_FEATURES.map((f) => f.id));
const schema = z.object({
  preferences: z.array(z.object({ feature: z.string(), modelId: z.string().trim().min(3).max(200) }).strict()).max(AI_FEATURES.length),
}).strict().superRefine((v, ctx) => {
  const seen = new Set<string>();
  for (const p of v.preferences) {
    if (!allowed.has(p.feature) || seen.has(p.feature)) ctx.addIssue({ code: "custom", message: "Fonctionnalité invalide ou dupliquée." });
    seen.add(p.feature);
  }
});

async function catalog() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ApiError(503, "openrouter_not_configured");
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { authorization: `Bearer ${key}`, "X-Title": "Leanna Notebook" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new ApiError(502, "openrouter_catalog_unavailable");
  const body = await response.json() as { data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { modality?: string } }[] };
  return (body.data ?? []).map((m) => ({
    id: m.id, name: m.name ?? m.id, contextLength: m.context_length ?? null,
    promptPrice: m.pricing?.prompt ?? null, completionPrice: m.pricing?.completion ?? null,
    modality: m.architecture?.modality ?? null,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export const GET = handle(async () => {
  const user = await requireUser();
  const db = createServiceClient();
  const [{ data, error }, models] = await Promise.all([
    db.from("ai_model_preferences").select("feature_key, model_id, updated_at").eq("user_id", user.id),
    catalog(),
  ]);
  if (error) throw error;
  return NextResponse.json({ features: AI_FEATURES, models, defaultModelId: process.env.OPENROUTER_CHAT_MODEL ?? null, preferences: (data ?? []).map((p) => ({ feature: p.feature_key, modelId: p.model_id, updatedAt: p.updated_at })) });
});

export const PUT = handle(async (req: NextRequest) => {
  const user = await requireUser();
  const { preferences } = await parseBody(req, schema);
  const models = await catalog();
  const available = new Set(models.map((m) => m.id));
  if (preferences.some((p) => !available.has(p.modelId))) throw new ApiError(422, "unknown_openrouter_model");
  const db = createServiceClient();
  const rows = preferences.map((p) => ({ user_id: user.id, feature_key: p.feature, model_id: p.modelId, updated_at: new Date().toISOString() }));
  const { error } = await db.from("ai_model_preferences").upsert(rows, { onConflict: "user_id,feature_key" });
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
