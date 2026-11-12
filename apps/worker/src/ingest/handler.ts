import type { SupabaseClient } from "@supabase/supabase-js";
import { PermanentError, type Handler } from "../worker.ts";
import type { Embedder } from "../ai/embeddings.ts";
import { chunk, normalize } from "./chunker.ts";
import { extract } from "./extract.ts";
import { enqueueSummaries } from "../studio/summaries.ts";
import type { Transcriber } from "../ai/transcription.ts";
import { openRouterPdfOcr, type PdfOcrEngine } from "../ai/ocr.ts";

const FTS_CONFIG: Record<string, string> = { fr: "french", en: "english", es: "spanish", de: "german", it: "italian", pt: "portuguese", nl: "dutch" };

/** Détection de langue minimale par mots outils (suffit pour choisir la config plein texte). */
export function detectLanguage(text: string): string {
  const sample = ` ${text.slice(0, 20000).toLowerCase()} `;
  const score = (words: string[]) => words.reduce((n, w) => n + (sample.split(` ${w} `).length - 1), 0);
  const fr = score(["le", "la", "les", "des", "est", "une", "dans", "pour"]);
  const en = score(["the", "and", "of", "is", "to", "in", "that", "for"]);
  return fr === 0 && en === 0 ? "simple" : fr >= en ? "fr" : "en";
}

/**
 * Job ingest_source : télécharge l'original, extrait page par page, découpe, embedde,
 * puis remplace les chunks en UNE transaction (replace_chunks). Les étapes sont publiées.
 */
export function ingestHandler(db: SupabaseClient, embedder: Embedder | null, opts: { summaries?: boolean; transcriber?: Transcriber | null } = {}): Handler {
  return async (job, ctx) => {
    const { data: src, error } = await db.from("sources").select("id, kind, storage_path, origin_url, notebook_id, workspace_id, created_by, note_body, mime_type")
      .eq("id", job.target_id!).single();
    if (error || !src) throw new PermanentError("source_not_found");
    if (src.workspace_id !== job.workspace_id || src.notebook_id !== job.notebook_id) throw new PermanentError("tenant_mismatch");

    await db.from("sources").update({ status: "processing", error_code: null }).eq("id", src.id);
    try {
      await ctx.progress(10, "lecture");
      let file: Uint8Array | undefined;
      if (src.storage_path) {
        const { data: blob, error: e } = await db.storage.from("sources").download(src.storage_path);
        if (e || !blob) throw new PermanentError("file_missing");
        file = new Uint8Array(await blob.arrayBuffer());
      }
      await ctx.progress(25, src.kind === "audio" ? "transcription" : "extraction");
      const ex = await extract(
        src.kind,
        { file, url: src.origin_url ?? undefined, noteText: (src.note_body as { text?: string } | null)?.text, mimeType: src.mime_type ?? undefined },
        opts.transcriber,
        async (page, total) => {
          const progress = 25 + Math.floor((page / Math.max(1, total)) * 25);
          await ctx.progress(progress, `extraction PDF · page ${page}/${total}`);
        },
        async (pdf, pageCount) => {
          if (!src.created_by) throw new PermanentError("needs_ocr", "Aucun propriétaire de source pour charger les réglages OCR.");
          const { data: ocrSettings, error: settingsError } = await db.from("ai_ocr_preferences")
            .select("enabled,model_id,engine").eq("user_id", src.created_by).maybeSingle();
          if (settingsError) throw settingsError;
          if (!ocrSettings?.enabled || !ocrSettings.model_id) {
            throw new PermanentError("needs_ocr", "PDF scanné : activez l'OCR OpenRouter dans Réglages > Intelligence artificielle.");
          }
          const apiKey = process.env.OPENROUTER_API_KEY;
          if (!apiKey) throw new PermanentError("ocr_not_configured", "OPENROUTER_API_KEY est absent côté worker.");
          await ctx.progress(50, `OCR OpenRouter · ${pageCount} page(s) · ${ocrSettings.engine}`);
          const ocr = openRouterPdfOcr({
            apiKey, model: ocrSettings.model_id,
            engine: ocrSettings.engine as PdfOcrEngine,
          });
          return ocr.extract(pdf, pageCount);
        },
      );
      const text = normalize(ex.text);
      const lang = detectLanguage(text);
      const chunks = chunk(text, { pageStarts: ex.pageStarts, timeRanges: ex.timeRanges });
      if (await ctx.cancelled()) return { cancelled: true };

      let vectors: number[][] | null = null;
      if (embedder) {
        vectors = [];
        const batchSize = 64;
        for (let offset = 0; offset < chunks.length; offset += batchSize) {
          if (await ctx.cancelled()) return { cancelled: true };
          const batch = chunks.slice(offset, offset + batchSize);
          const embedded = await embedder.embed(batch.map((c) => c.content));
          if (embedded.length !== batch.length) throw new Error("embeddings_count_mismatch");
          vectors.push(...embedded);
          const ratio = Math.min(1, (offset + batch.length) / Math.max(1, chunks.length));
          await ctx.progress(55 + Math.floor(ratio * 25), `vectorisation · ${Math.min(offset + batch.length, chunks.length)}/${chunks.length}`);
        }
      } else {
        await ctx.progress(80, "indexation plein texte");
      }

      await ctx.progress(85, "enregistrement");
      const { error: e2 } = await db.rpc("replace_chunks", {
        p_source: src.id,
        p_chunks: chunks.map((c, i) => ({ ...c, embedding: vectors ? `[${vectors[i].join(",")}]` : null, embedding_model: embedder?.model ?? null })),
        p_extracted_text: text, p_language: lang, p_fts_config: FTS_CONFIG[lang] ?? "simple",
        p_word_count: text.split(/\s+/).filter(Boolean).length, p_page_count: ex.pageCount,
      });
      if (e2) throw e2;
      if (ex.title && src.kind === "web") await db.from("sources").update({ title: ex.title.slice(0, 300) }).eq("id", src.id);
      if (opts.summaries) await enqueueSummaries(db, { workspace_id: src.workspace_id, notebook_id: src.notebook_id, source_id: src.kind === "note" ? undefined : src.id });
      return { chunks: chunks.length, embedded: Boolean(vectors), language: lang, pages: ex.pageCount };
    } catch (e) {
      const code = e instanceof PermanentError ? e.code : "temporary_error";
      await db.from("sources").update({ status: e instanceof PermanentError ? "failed" : "pending", error_code: code }).eq("id", src.id);
      throw e;
    }
  };
}
