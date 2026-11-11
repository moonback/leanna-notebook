import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ImageModel = { id: string; name?: string; description?: string; architecture?: { input_modalities?: string[]; output_modalities?: string[] } };

export const GET = handle(async (_req: NextRequest) => {
  await requireUser();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ApiError(503, "openrouter_not_configured");
  const response = await fetch("https://openrouter.ai/api/v1/images/models", {
    headers: { authorization: "Bearer " + key, "X-Title": "Leanna Notebook" },
    next: { revalidate: 1800 },
  });
  if (!response.ok) throw new ApiError(502, "image_model_catalog_unavailable");
  const body = await response.json() as { data?: ImageModel[] };
  const models = (body.data ?? []).filter((m) => typeof m.id === "string").map((m) => ({
    id: m.id, name: m.name ?? m.id, description: m.description ?? "",
    inputModalities: m.architecture?.input_modalities ?? [],
    outputModalities: m.architecture?.output_modalities ?? [],
  }));
  const defaultModelId = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image";
  return NextResponse.json({ models, defaultModelId });
});
