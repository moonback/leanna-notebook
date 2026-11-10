import type { SupabaseClient } from "@supabase/supabase-js";
import { PermanentError, type Handler } from "../worker.ts";
import type { Embedder } from "../ai/embeddings.ts";
import { chunk, normalize } from "./chunker.ts";
import { extract } from "./extract.ts";
import { enqueueSummaries } from "../studio/summaries.ts";
import type { Transcriber } from "../ai/transcription.ts";

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
 * Job ingest_source : télécharge l'original depuis Storage (ou l'URL), extrait, découpe, embedde,
 * puis remplace les chunks en UNE transaction (replace_chunks). Statuts persistants à chaque étape.
 */
/** summaries : programme guide de source + résumé du notebook (seulement si un modèle est configuré). */
export function ingestHandler(db: SupabaseClient, embedder: Embedder | null, opts: { summaries?: boolean; transcriber?: Transcriber | null } = {}): Handler {
  return async (job, ctx) => {
    const { data: src, error } = await db.from("sources").select("id, kind, storage_path, origin_url, notebook_id, workspace_id, note_body, mime_type")
      .eq("id", job.target_id!).single();
    if (error || !src) throw new PermanentError("source_not_found");
    // le job et la source doivent appartenir au même tenant (défense en profondeur)
    if (src.workspace_id !== job.workspace_id || src.notebook_id !== job.notebook_id) throw new PermanentError("tenant_mismatch");

    console.log(`[ingest] job=${job.id} source=${src.id} kind=${JSON.stringify(src.kind)} origin_url=${src.origin_url ?? "-"} storage_path=${src.storage_path ?? "-"} mime=${src.mime_type ?? "-"}`);
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
      const ex = await extract(src.kind, { file, url: src.origin_url ?? undefined, noteText: (src.note_body as { text?: string } | null)?.text, mimeType: src.mime_type ?? undefined }, opts.transcriber);
      console.log(`[ingest] source=${src.id} kind=${src.kind} extraction OK (${ex.text.length} caractères)`);
      const text = normalize(ex.text);
      const lang = detectLanguage(text);
      const chunks = chunk(text, { pageStarts: ex.pageStarts, timeRanges: ex.timeRanges });
      if (await ctx.cancelled()) return { cancelled: true };

      await ctx.progress(55, embedder ? "vectorisation" : "indexation");
      const vectors = embedder ? await embedder.embed(chunks.map((c) => c.content)) : null;

      await ctx.progress(85, "enregistrement");
      const { error: e2 } = await db.rpc("replace_chunks", {
        p_source: src.id,
        p_chunks: chunks.map((c, i) => ({ ...c, embedding: vectors ? `[${vectors[i].join(",")}]` : null, embedding_model: embedder?.model ?? null })),
        p_extracted_text: text, p_language: lang, p_fts_config: FTS_CONFIG[lang] ?? "simple",
        p_word_count: text.split(/\s+/).filter(Boolean).length, p_page_count: ex.pageCount,
      });
      if (e2) throw e2;
      if (ex.title && src.kind === "web") await db.from("sources").update({ title: ex.title.slice(0, 300) }).eq("id", src.id);
      // une note s'ouvre dans son éditeur : pas de guide, mais elle compte dans le résumé du notebook
      if (opts.summaries) await enqueueSummaries(db, { workspace_id: src.workspace_id, notebook_id: src.notebook_id, source_id: src.kind === "note" ? undefined : src.id });
      return { chunks: chunks.length, embedded: Boolean(vectors), language: lang };
    } catch (e) {
      // statut persistant lisible par l'interface ; la décision de réessayer reste au worker
      const code = e instanceof PermanentError ? e.code : "temporary_error";
      console.error(`[ingest] ÉCHEC source=${src.id} kind=${src.kind} code=${code} permanent=${e instanceof PermanentError}`, e);
      await db.from("sources").update({ status: e instanceof PermanentError ? "failed" : "pending", error_code: code }).eq("id", src.id);
      throw e;
    }
  };
}
