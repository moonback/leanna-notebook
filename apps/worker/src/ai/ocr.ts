import { PermanentError } from "../worker.ts";

/** OCR multimodal via OpenRouter : la clé reste exclusivement dans le worker. */
export async function ocrWithOpenRouter(file: Uint8Array, mimeType: string, env = process.env): Promise<string> {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new PermanentError("ocr_not_configured");
  const model = env.OPENROUTER_OCR_MODEL || "google/gemini-2.5-flash";
  const base64 = Buffer.from(file).toString("base64");
  const isPdf = mimeType === "application/pdf";
  const mediaPart = isPdf
    ? { type: "file", file: { filename: "source.pdf", file_data: `data:application/pdf;base64,${base64}` } }
    : { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } };
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "HTTP-Referer": env.OPENROUTER_SITE_URL || "https://leanna-notebook.app",
      "X-Title": "Leanna Notebook OCR",
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Transcris fidèlement tout le texte lisible de ce document ou de cette image. Préserve les titres, paragraphes, tableaux et l'ordre de lecture. N'ajoute aucune explication. Si aucun texte n'est lisible, réponds uniquement : [AUCUN TEXTE LISIBILE]." },
          mediaPart,
        ],
      }],
      ...(isPdf ? { plugins: [{ id: "file-parser", pdf: { engine: env.OPENROUTER_PDF_ENGINE || "mistral-ocr" } }] } : {}),
      temperature: 0,
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if ([400, 401, 403, 404].includes(response.status)) throw new PermanentError("ocr_config", `openrouter_http_${response.status}`);
  if (!response.ok) throw new Error(`openrouter_ocr_http_${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> };
  const content = payload.choices?.[0]?.message?.content;
  const text = (typeof content === "string" ? content : content?.map((part) => part.text ?? "").join("\\n") ?? "").trim();
  if (!text || text.includes("[AUCUN TEXTE LISIBILE]")) throw new PermanentError("empty_content");
  return text;
}
