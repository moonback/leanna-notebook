import { PermanentError } from "../worker.ts";

/** OCR multimodal Gemini : la clé reste exclusivement dans le worker. */
export async function ocrWithGemini(file: Uint8Array, mimeType: string, env = process.env): Promise<string> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new PermanentError("ocr_not_configured");
  const model = env.OCR_MODEL || "gemini-2.5-flash";
  const base64 = Buffer.from(file).toString("base64");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: "Transcris fidèlement tout le texte lisible de ce document ou de cette image. Préserve les titres, paragraphes, tableaux et l'ordre de lecture. N'ajoute aucune explication. Si aucun texte n'est lisible, réponds uniquement : [AUCUN TEXTE LISIBILE]." },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if ([400, 401, 403, 404].includes(response.status)) throw new PermanentError("ocr_config", `gemini_http_${response.status}`);
  if (!response.ok) throw new Error(`gemini_ocr_http_${response.status}`);
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n").trim() ?? "";
  if (!text || text.includes("[AUCUN TEXTE LISIBILE]")) throw new PermanentError("empty_content");
  return text;
}
