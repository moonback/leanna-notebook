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
  if (!transcriber) throw new PermanentError("transcription_not_configured", "Configurez DEEPGRAM_API_KEY pour transcrire les vidéos TikTok.");
  const parsed = new URL(url);
  if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) throw new PermanentError("url_refused");
  let page;
  try { page = await safeFetch(url); }
  catch (error) {
    if (error instanceof FetchRefused) throw new PermanentError("tiktok_unavailable", "TikTok refuse l'accès à cette vidéo (" + error.message + ").");
    throw error;
  }
  if (!page.contentType.includes("html")) throw new PermanentError("tiktok_unavailable", "La page TikTok n'est pas accessible publiquement.");
  const metadata = parseTikTokVideoData(page.body.toString("utf8"));
  let media;
  try { media = await safeFetch(metadata.playAddr, 5, 100 * 1024 * 1024); }
  catch (error) {
    if (error instanceof FetchRefused) throw new PermanentError("tiktok_unavailable", "Le fichier vidéo TikTok est inaccessible (" + error.message + ").");
    throw error;
  }
  if (!media.contentType.startsWith("video/") && !media.contentType.includes("octet-stream")) {
    throw new PermanentError("tiktok_media_invalid", "TikTok n'a pas fourni un fichier vidéo exploitable.");
  }
  const transcript = await transcriber.transcribe(new Uint8Array(media.body), "video/mp4");
  const text = transcript.segments.length ? transcript.segments.map((s) => normalize(s.text)).join("\\n\\n") : normalize(transcript.text);
  const timeRanges: ChunkTimeRange[] = [];
  let offset = 0;
  for (const [index, segment] of transcript.segments.entries()) {
    const clean = normalize(segment.text);
    timeRanges.push({ char_start: offset, char_end: offset + clean.length, start_ms: segment.start_ms, end_ms: segment.end_ms });
    offset += clean.length + (index < transcript.segments.length - 1 ? 2 : 0);
  }
  return finalize({ text, pageStarts: [], pageCount: null, title: metadata.title, timeRanges });
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
