import { PermanentError } from "../worker.ts";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type Llm = (messages: LlmMessage[], opts?: { json?: boolean; maxTokens?: number; model?: string }) => Promise<{ text: string; model: string; usage: unknown }>;

/** Client OpenRouter (non streamé) pour les générations du Studio. Modèle et clé viennent de la configuration. */
export function llmFromEnv(env = process.env): Llm | null {
  const key = env.OPENROUTER_API_KEY;
  const model = env.OPENROUTER_CHAT_MODEL || null;
  if (!key) return null;
  const base = env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

  return async (messages, opts = {}) => {
    const selectedModel = opts.model ?? model;
    if (!selectedModel) throw new PermanentError("ai_not_configured", "Aucun modèle OpenRouter n’est configuré.");
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "X-Title": "Notebook" },
        body: JSON.stringify({
          model: selectedModel, messages, max_tokens: opts.maxTokens ?? 4000, usage: { include: true },
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
    if (res && [400, 401, 402, 403, 404].includes(res.status)) throw new PermanentError("ai_config", `openrouter_http_${res.status}`);
    if (!res?.ok) throw new Error(`openrouter_http_${res?.status}`);
    const json = (await res.json()) as { model?: string; usage?: unknown; choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("openrouter_empty");
    return { text, model: json.model ?? selectedModel, usage: json.usage ?? null };
  };
}
