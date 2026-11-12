import type { SupabaseClient } from "@supabase/supabase-js";
import type { Llm, LlmMessage } from "./llm.ts";
import { parseJson } from "../studio/generate.ts";

export type AiTask = "deep_research" | "knowledge_extraction" | "contradictions" | "report";

/** Modèle choisi par l'utilisateur dans Réglages > IA pour cette tâche ; sinon le modèle par défaut du worker. */
export async function preferredModel(db: SupabaseClient, userId: string | null | undefined, task: AiTask): Promise<string | undefined> {
  if (!userId) return undefined;
  const { data } = await db.from("ai_model_preferences").select("model_id").eq("user_id", userId).eq("feature_key", task).maybeSingle();
  return (data?.model_id as string | undefined) ?? undefined;
}

export type LlmUsage = { tokens: number; costUsd: number };

/** Lit l'usage renvoyé par OpenRouter (tokens, coût si exposé) pour les budgets et la traçabilité. */
export function usageOf(usage: unknown): LlmUsage {
  const u = (usage ?? {}) as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number; cost?: number };
  return { tokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0), costUsd: typeof u.cost === "number" ? u.cost : 0 };
}

/**
 * Appel JSON validé : une sortie illisible ou hors schéma est redemandée une fois avec l'erreur,
 * puis lève `invalid_model_output` (erreur réessayable par la file de jobs).
 */
export async function llmJson<T>(llm: Llm, messages: LlmMessage[], validate: (data: unknown) => T, opts: { model?: string; maxTokens?: number } = {}):
  Promise<{ data: T; model: string; usage: LlmUsage }> {
  let total: LlmUsage = { tokens: 0, costUsd: 0 };
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? messages : [...messages, { role: "user" as const, content: `Ta réponse précédente était invalide (${lastError}). Réponds UNIQUEMENT avec le JSON demandé.` }];
    const out = await llm(prompt, { json: true, model: opts.model, maxTokens: opts.maxTokens });
    const u = usageOf(out.usage);
    total = { tokens: total.tokens + u.tokens, costUsd: total.costUsd + u.costUsd };
    try {
      return { data: validate(parseJson(out.text)), model: out.model, usage: total };
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 200) : "json";
    }
  }
  throw new Error("invalid_model_output");
}
