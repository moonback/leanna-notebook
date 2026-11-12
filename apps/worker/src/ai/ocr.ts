import { PermanentError } from "../worker.ts";

export type PdfOcrEngine = "mistral-ocr" | "cloudflare-ai";

export type PdfOcrConfig = {
  apiKey: string;
  model: string;
  engine: PdfOcrEngine;
  baseUrl?: string;
};

const MAX_OCR_PDF_BYTES = 40 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 32_000;

/**
 * OCR through OpenRouter's PDF file-parser plugin. The selected downstream
 * model is user-configurable; Mistral OCR is the recommended engine for scans.
 */
export function openRouterPdfOcr(config: PdfOcrConfig, request: typeof fetch = fetch) {
  return {
    model: config.model,
    async extract(pdf: Uint8Array, pageCount: number): Promise<string> {
      if (pdf.byteLength > MAX_OCR_PDF_BYTES) {
        throw new PermanentError("ocr_file_too_large", "Ce PDF dépasse la limite OCR de 40 Mo. Réduisez sa taille ou scindez-le en plusieurs fichiers.");
      }
      const base = (config.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
      const fileData = `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
      const response = await request(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
          "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
          "X-Title": "Leanna Notebook",
        },
        signal: AbortSignal.timeout(10 * 60 * 1000),
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Effectue une transcription OCR fidèle et exhaustive du PDF joint.",
                  `Le document contient ${pageCount} page(s).`,
                  "Transcris toutes les pages dans l'ordre, sans résumé, sans interprétation et sans ajout.",
                  "Commence chaque page par un marqueur seul sur sa ligne au format [PAGE 1], [PAGE 2], etc.",
                  "Conserve les titres, paragraphes, listes, tableaux (en lignes séparées avec des colonnes séparées par |), dates, nombres et accents.",
                  "Si une zone est réellement illisible, indique [illisible] à cet endroit. N'invente jamais le texte manquant.",
                  "Ne renvoie aucune introduction, conclusion, explication ni bloc Markdown autour de la transcription.",
                ].join("\n"),
              },
              { type: "file", file: { filename: "document.pdf", file_data: fileData } },
            ],
          }],
          plugins: [{ id: "file-parser", pdf: { engine: config.engine } }],
        }),
      });
      if ([400, 401, 403, 404, 413, 415, 422].includes(response.status)) {
        throw new PermanentError("ocr_provider_rejected", `OpenRouter OCR a refusé le document (HTTP ${response.status}). Vérifiez le modèle et le moteur sélectionnés.`);
      }
      if (!response.ok) throw new Error(`openrouter_ocr_http_${response.status}`);
      const payload = await response.json() as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
        error?: { message?: string };
      };
      if (payload.error) throw new Error(payload.error.message ?? "openrouter_ocr_failed");
      const choice = payload.choices?.[0];
      if (choice?.finish_reason === "length") {
        throw new PermanentError("ocr_output_truncated", "La transcription OCR a dépassé la limite de sortie du modèle. Scindez le PDF en fichiers plus petits ou choisissez un modèle avec une sortie plus longue.");
      }
      const content = choice?.message?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content) ? content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") : "";
      if (!text.trim()) throw new PermanentError("ocr_empty_result", "OpenRouter n'a renvoyé aucun texte OCR exploitable.");
      return text.trim();
    },
  };
}
