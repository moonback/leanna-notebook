import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { VOICE_SYSTEM_PROMPTS } from "@/lib/ai/prompts";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

const MODEL = "gemini-3.8-live";
const voiceSchema = z.object({ voice: z.enum(["Aoede", "Charon", "Fenrir", "Kore", "Puck", "Leda", "Orus", "Zephyr"]).default("Aoede"), persona: z.enum(["leanna", "roxane"]).default("leanna") }).strict();

/** Fournit un jeton Gemini Live à usage unique : la clé longue durée ne quitte jamais le serveur. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "viewer");
  const { voice, persona } = await parseBody(req, voiceSchema);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError(503, "voice_not_configured");

  const now = Date.now();
  const expiresAt = new Date(now + 30 * 60_000).toISOString();
  const newSessionExpiresAt = new Date(now + 60_000).toISOString();
  const { data: promptOverride } = await createServiceClient().from("ai_prompt_overrides")
    .select("content").eq("user_id", (await requireUser()).id).eq("prompt_key", `voice.${persona}`).maybeSingle();

  const config = {
    responseModalities: ["AUDIO"],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    systemInstruction: { parts: [{ text: [VOICE_SYSTEM_PROMPTS[persona], promptOverride?.content].filter(Boolean).join("\\n\\n") }] },
    ...(persona === "leanna" ? { tools: [{ functionDeclarations: [{
      name: "search_notebook_sources",
      description: "Recherche des passages pertinents dans les sources prêtes et sélectionnées du notebook courant. À appeler avant toute réponse documentaire.",
      parameters: {
        type: "OBJECT",
        properties: { query: { type: "STRING", description: "Question ou concepts à rechercher dans les documents." } },
        required: ["query"]
      }
    }] }] } : {})
  };

  // L'API REST attend `bidiGenerateContentSetup` (le SDK le nomme `liveConnectConstraints`), uniquement en v1alpha.
  const { responseModalities, speechConfig, ...setupRest } = config;
  const response = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: newSessionExpiresAt,
      bidiGenerateContentSetup: {
        model: `models/${MODEL}`,
        generationConfig: { responseModalities, speechConfig },
        ...setupRest
      }
    }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Gemini ephemeral token provisioning failed", response.status, detail.slice(0, 500));
    throw new ApiError(502, "voice_provider_unavailable");
  }
  const payload = await response.json() as { name?: string; expireTime?: string };
  if (!payload.name) throw new ApiError(502, "voice_provider_unavailable");
  return NextResponse.json({ token: payload.name, model: MODEL, config, expiresAt: payload.expireTime ?? expiresAt });
});
