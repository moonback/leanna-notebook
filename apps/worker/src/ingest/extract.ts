import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { PermanentError } from "../worker.ts";
import { FetchRefused, safeFetch } from "./ssrf.ts";
import { fromEpub, fromPptx, readZip } from "./office.ts";
import type { Transcriber } from "../ai/transcription.ts";
import { normalize, type ChunkTimeRange } from "./chunker.ts";

export type Extracted = { text: string; pageStarts: number[]; pageCount: number | null; title?: string; timeRanges?: ChunkTimeRange[] };

const MAX_WORDS = 500_000;

type TikTokVideoData = { playAddr: string; title: string };

/** Extrait les métadonnées d'une vidéo publique depuis l'état JSON embarqué par TikTok. */
export function parseTikTokVideoData(html: string): TikTokVideoData {
  const script = html.match(/<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) throw new PermanentError("tiktok_unavailable", "TikTok n'a pas exposé les données de cette vidéo publique.");
  let root: unknown;
  try { root = JSON.parse(script.replace(/&quot;/g, '"').replace(/&amp;/g, "&")); }
  catch { throw new PermanentError("tiktok_unavailable", "Les métadonnées TikTok sont illisibles."); }

  const seen = new Set<object>();
  let found: TikTokVideoData | null = null;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value as object) || found) return;
    seen.add(value as object);
    const obj = value as Record<string, unknown>;
    const video = obj.video && typeof obj.video === "object" ? obj.video as Record<string, unknown> : null;
    const playAddr = video?.playAddr ?? video?.downloadAddr;
    if (typeof playAddr === "string" && /^https:\/\//i.test(playAddr)) {
      const desc = typeof obj.desc === "string" ? obj.desc : "";
      const author = obj.author && typeof obj.author === "object" && typeof (obj.author as Record<string, unknown>).uniqueId === "string"
        ? String((obj.author as Record<string, unknown>).uniqueId) : "";
      found = { playAddr, title: [author ? `TikTok @${author}` : "Vidéo TikTok", desc].filter(Boolean).join(" — ").slice(0, 300) };
      return;
    }
    for (const child of Object.values(obj)) visit(child);
  };
  visit(root);
  if (!found) throw new PermanentError("tiktok_unavailable", "Impossible de récupérer le média de cette vidéo TikTok.");
  return found;
}

async function fromTikTok(url: string, transcriber?: Transcriber | null): Promise<Extracted> {
  const startedAt = Date.now();
  const host = (() => { try { return new URL(url).hostname; } catch { return "invalid-url"; } })();
  console.info("[tiktok-ingest] start", { host, transcriberConfigured: Boolean(transcriber) });
  if (!transcriber) throw new PermanentError("transcription_not_configured", "Configurez DEEPGRAM_API_KEY pour transcrire les vidéos TikTok.");
  const parsed = new URL(url);
  if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) throw new PermanentError("url_refused");
  let page: Awaited<ReturnType<typeof safeFetch>>;
  try { page = await safeFetch(url); }
  catch (error) {
    console.warn("[tiktok-ingest] page_fetch_failed", { host, error: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - startedAt });
    if (error instanceof FetchRefused) throw new PermanentError("tiktok_unavailable", "TikTok refuse l'accès à cette vidéo (" + error.message + ").");
    throw error;
  }
  console.info("[tiktok-ingest] page_fetched", { contentType: page.contentType, bytes: page.body.length, elapsedMs: Date.now() - startedAt });
  if (!page.contentType.includes("html")) throw new PermanentError("tiktok_unavailable", "La page TikTok n'est pas accessible publiquement.");
  let metadata: TikTokVideoData;
  try { metadata = parseTikTokVideoData(page.body.toString("utf8")); }
  catch (error) { console.warn("[tiktok-ingest] metadata_parse_failed", { error: error instanceof Error ? error.message : String(error), htmlBytes: page.body.length }); throw error; }
  console.info("[tiktok-ingest] metadata_extracted", { titleLength: metadata.title.length, mediaHost: (() => { try { return new URL(metadata.playAddr).hostname; } catch { return "invalid"; } })() });
  let media: Awaited<ReturnType<typeof safeFetch>>;
  try { media = await safeFetch(metadata.playAddr, 5, 100 * 1024 * 1024, { referer: new URL(url).origin + "/", origin: new URL(url).origin, accept: "video/*,*/*;q=0.8", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" }); }
  catch (error) {
    console.warn("[tiktok-ingest] media_fetch_failed", { mediaHost: (() => { try { return new URL(metadata.playAddr).hostname; } catch { return "invalid"; } })(), error: error instanceof Error ? error.message : String(error), httpStatus: error instanceof FetchRefused ? error.status : undefined, elapsedMs: Date.now() - startedAt });
    if (error instanceof FetchRefused) throw new PermanentError("tiktok_unavailable", "Le fichier vidéo TikTok est inaccessible (HTTP " + (error.status ?? "refusé") + ").");
    throw error;
  }
  console.info("[tiktok-ingest] media_fetched", { contentType: media.contentType, bytes: media.body.length, elapsedMs: Date.now() - startedAt });
  if (!media.contentType.startsWith("video/") && !media.contentType.includes("octet-stream")) {
    throw new PermanentError("tiktok_media_invalid", "TikTok n'a pas fourni un fichier vidéo exploitable.");
  }
  const transcriptionStartedAt = Date.now();
  let transcript: Awaited<ReturnType<Transcriber["transcribe"]>>;
  try { transcript = await transcriber.transcribe(new Uint8Array(media.body), media.contentType.startsWith("video/") ? media.contentType.split(";")[0] : "video/mp4"); }
  catch (error) { console.error("[tiktok-ingest] transcription_failed", { model: transcriber.model, mediaBytes: media.body.length, mediaType: media.contentType, errorCode: error instanceof PermanentError ? error.code : undefined, error: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - transcriptionStartedAt }); throw error; }
  const text = transcript.segments.length ? transcript.segments.map((s) => normalize(s.text)).join("\n\n") : normalize(transcript.text);
  console.info("[tiktok-ingest] transcription_completed", { model: transcriber.model, segmentCount: transcript.segments.length, transcriptChars: text.length, elapsedMs: Date.now() - transcriptionStartedAt });
  if (!text.trim()) console.warn("[tiktok-ingest] empty_transcript", { segmentCount: transcript.segments.length, rawTextChars: transcript.text.length });
  const timeRanges: ChunkTimeRange[] = [];
  let offset = 0;
  for (const [index, segment] of transcript.segments.entries()) {
    const clean = normalize(segment.text);
    timeRanges.push({ char_start: offset, char_end: offset + clean.length, start_ms: segment.start_ms, end_ms: segment.end_ms });
    offset += clean.length + (index < transcript.segments.length - 1 ? 2 : 0);
  }
  try {
    const result = finalize({ text, pageStarts: [], pageCount: null, title: metadata.title, timeRanges });
    console.info("[tiktok-ingest] completed", { words: result.text.split(/\s+/).filter(Boolean).length, timeRanges: timeRanges.length, totalMs: Date.now() - startedAt });
    return result;
  } catch (error) { console.error("[tiktok-ingest] finalize_failed", { errorCode: error instanceof PermanentError ? error.code : undefined, transcriptChars: text.length, totalMs: Date.now() - startedAt }); throw error; }
}


function finalize(e: Extracted): Extracted {
  const words = e.text.split(/\s+/).filter(Boolean).length;
  if (words === 0) throw new PermanentError("empty_content", "Aucun texte exploitable dans cette source.");
  if (words > MAX_WORDS) throw new PermanentError("too_many_words", "Plus de 500 000 mots.");
  return e;
}

async function fromPdf(buf: Uint8Array): Promise<Extracted> {
  let pdf;
  try { pdf = await getDocumentProxy(buf); } catch (e) {
    throw new PermanentError(/password/i.test(String(e)) ? "protected_pdf" : "unreadable_file");
  }
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text as string[];
  const pageStarts: number[] = [];
  let acc = "";
  for (const p of pages) { pageStarts.push(acc.length); acc += p.trim() + "\n\n"; }
  // PDF scanné (pas de couche texte) : OCR non disponible à ce jalon → erreur explicite, pas de faux succès
  if (acc.replace(/\s/g, "").length < 20 * Math.max(1, pages.length) / 10) throw new PermanentError("needs_ocr", "PDF sans texte (scan) : l'OCR n'est pas encore disponible.");
  return { text: acc, pageStarts, pageCount: pages.length };
}

function fromHtml(html: string): Extracted {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.textContent?.trim()) throw new PermanentError("empty_content", "Aucun texte principal trouvé sur cette page.");
  return { text: article.textContent, pageStarts: [], pageCount: null, title: article.title ?? undefined };
}

/** Texte brut d'une source, selon son type. Les erreurs attendues sont des PermanentError (code stable). */
export async function extract(kind: string, data: { file?: Uint8Array; url?: string; noteText?: string; mimeType?: string }, transcriber?: Transcriber | null): Promise<Extracted> {
  switch (kind) {
    case "audio": {
      if (!transcriber) throw new PermanentError("transcription_not_configured", "La transcription audio n’est pas configurée côté serveur.");
      if (!data.file) throw new PermanentError("file_missing");
      const transcript = await transcriber.transcribe(data.file, data.mimeType ?? "application/octet-stream");
      let offset = 0;
      const timeRanges: ChunkTimeRange[] = [];
      const text = transcript.segments.length ? transcript.segments.map((segment, index) => {
        const clean = normalize(segment.text);
        const start = offset;
        offset += clean.length;
        timeRanges.push({ char_start: start, char_end: offset, start_ms: segment.start_ms, end_ms: segment.end_ms });
        if (index < transcript.segments.length - 1) offset += 2;
        return clean;
      }).join("\n\n") : normalize(transcript.text);
      return finalize({ text, pageStarts: [], pageCount: null, timeRanges });
    }
    case "note":
      return finalize({ text: data.noteText ?? "", pageStarts: [], pageCount: null });
    case "txt": case "md": case "csv": case "text":
      return finalize({ text: new TextDecoder("utf-8").decode(data.file), pageStarts: [], pageCount: null });
    case "pdf":
      return finalize(await fromPdf(data.file!));
    case "pptx": {
      const r = fromPptx(data.file!);
      return finalize({ text: r.text, pageStarts: r.pageStarts, pageCount: r.pageCount });
    }
    case "epub": {
      const r = fromEpub(data.file!);
      return finalize({ text: r.text, pageStarts: [], pageCount: null, title: r.title });
    }
    case "docx": {
      readZip(data.file!, () => false); // plafonds anti « zip bomb » avant de confier l'archive à mammoth
      try {
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data.file!) });
        return finalize({ text: value, pageStarts: [], pageCount: null });
      } catch { throw new PermanentError("unreadable_file"); }
    }
    case "web": {
      if (data.url && /(^|\.)tiktok\.com$/i.test(new URL(data.url).hostname)) return fromTikTok(data.url, transcriber);
      let res;
      try { res = await safeFetch(data.url!); } catch (e) {
        if (e instanceof FetchRefused) throw new PermanentError(e.message === "paywall" ? "paywall" : "url_refused", e.message);
        throw e; // réseau : nouvelle tentative
      }
      if (res.contentType.includes("pdf")) return finalize(await fromPdf(new Uint8Array(res.body)));
      if (!res.contentType.includes("html") && !res.contentType.includes("text/plain")) throw new PermanentError("unsupported_type");
      return finalize(res.contentType.includes("html") ? fromHtml(res.body.toString("utf8")) : { text: res.body.toString("utf8"), pageStarts: [], pageCount: null });
    }
    default:
      throw new PermanentError("unsupported_type", `Type non pris en charge à ce jalon : ${kind}`);
  }
}
