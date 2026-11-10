import "server-only";

// Connecteur OpenRouter (API compatible OpenAI) : chat en streaming + embeddings de requête.
// Les modèles viennent de la configuration ; aucun nom de modèle codé en dur.
// Surcharge réservée aux tests (serveur simulé) et aux proxys d'entreprise.
const BASE = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
export const EMBEDDING_DIM = 1024;

export class AiNotConfigured extends Error {}
export class AiUpstreamError extends Error {
  constructor(readonly status: number) { super(`openrouter_http_${status}`); }
}

function config() {
  const key = process.env.OPENROUTER_API_KEY;
  const chatModel = process.env.OPENROUTER_CHAT_MODEL || null;
  if (!key) throw new AiNotConfigured("OPENROUTER_API_KEY est requis.");
  return { key, chatModel, embedModel: process.env.OPENROUTER_EMBEDDINGS_MODEL || null };
}

function headers(key: string) {
  return {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    // en-têtes d'attribution optionnels d'OpenRouter
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "Notebook",
  };
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };

/** Vecteur de la question (null si aucun modèle d'embeddings configuré : recherche plein texte seule). */
export async function embedQuery(text: string): Promise<{ vector: number[]; model: string } | null> {
  const { key, embedModel } = config();
  const selectedModel = embedModel;
  if (!selectedModel) return null;
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST", headers: headers(key),
    body: JSON.stringify({ model: selectedModel, input: [text], dimensions: EMBEDDING_DIM }),
  });
  if (!res.ok) throw new AiUpstreamError(res.status);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const vector = json.data[0]?.embedding;
  if (!vector || vector.length !== EMBEDDING_DIM) throw new Error(`dimension d'embedding inattendue (${vector?.length})`);
  return { vector, model: `openrouter:${selectedModel}` };
}

/**
 * Chat en streaming : rend chaque fragment de texte, puis l'usage final.
 * `signal` permet d'interrompre la génération (bouton Stop / client déconnecté).
 */
export async function* streamChat(messages: ChatMessage[], opts: { signal?: AbortSignal; maxTokens?: number; model?: string } = {}):
  AsyncGenerator<{ type: "delta"; text: string } | { type: "usage"; usage: ChatUsage; model: string }> {
  const { key, chatModel } = config();
  const selectedModel = opts.model ?? chatModel;
  if (!selectedModel) throw new AiNotConfigured("Aucun modèle de conversation n’est configuré.");
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST", headers: headers(key), signal: opts.signal,
    body: JSON.stringify({ model: selectedModel, messages, stream: true, max_tokens: opts.maxTokens ?? 2000, usage: { include: true } }),
  });
  if (!res.ok || !res.body) throw new AiUpstreamError(res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let model = selectedModel;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue; // commentaires SSE « : OPENROUTER PROCESSING »
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let evt: { model?: string; error?: { code?: number }; choices?: { delta?: { content?: string } }[]; usage?: ChatUsage };
      try { evt = JSON.parse(data); } catch { continue; }
      if (evt.error) throw new AiUpstreamError(evt.error.code ?? 502);
      if (evt.model) model = evt.model;
      const text = evt.choices?.[0]?.delta?.content;
      if (text) yield { type: "delta", text };
      if (evt.usage) yield { type: "usage", usage: evt.usage, model };
    }
  }
}
