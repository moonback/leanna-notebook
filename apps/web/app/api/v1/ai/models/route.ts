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

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
};

function supportsModalities(model: OpenRouterModel, required: readonly string[], direction: "input" | "output") {
  const declared = direction === "input" ? model.architecture?.input_modalities : model.architecture?.output_modalities;
  if (Array.isArray(declared)) return required.every((modality) => declared.includes(modality));
  const modality = model.architecture?.modality;
  if (!modality) return false;
  const [input, output] = modality.split("->").map((part) => part.trim());
  const actual = direction === "input" ? input : output;
  return required.every((item) => actual === item || actual?.split("+").includes(item));
}

function compatibleFeatures(model: OpenRouterModel) {
  return AI_FEATURES.filter((feature) =>
    supportsModalities(model, feature.inputModalities, "input") &&
    supportsModalities(model, feature.outputModalities, "output")
  ).map((feature) => feature.id);
}

async function catalog() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ApiError(503, "openrouter_not_configured");
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { authorization: `Bearer ${key}`, "X-Title": "Leanna Notebook" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new ApiError(502, "openrouter_catalog_unavailable");
  const body = await response.json() as { data?: OpenRouterModel[] };
  return (body.data ?? []).map((m) => {
    const promptPrice = m.pricing?.prompt ?? null;
    const completionPrice = m.pricing?.completion ?? null;
    const isFree = promptPrice !== null && completionPrice !== null
      ? Number(promptPrice) === 0 && Number(completionPrice) === 0
      : null;
    return {
      id: m.id, name: m.name ?? m.id, contextLength: m.context_length ?? null,
      promptPrice, completionPrice,
      modality: m.architecture?.modality ?? null,
      inputModalities: m.architecture?.input_modalities ?? [],
      outputModalities: m.architecture?.output_modalities ?? [],
      compatibleFeatures: compatibleFeatures(m),
      isFree,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
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
  const byId = new Map(models.map((model) => [model.id, model]));
  for (const preference of preferences) {
    const model = byId.get(preference.modelId);
    if (!model) throw new ApiError(422, "unknown_openrouter_model");
    if (!model.compatibleFeatures.includes(preference.feature)) {
      throw new ApiError(422, "incompatible_openrouter_model_for_feature");
    }
  }
  const db = createServiceClient();
  const rows = preferences.map((p) => ({ user_id: user.id, feature_key: p.feature, model_id: p.modelId, updated_at: new Date().toISOString() }));
  const { error } = await db.from("ai_model_preferences").upsert(rows, { onConflict: "user_id,feature_key" });
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
