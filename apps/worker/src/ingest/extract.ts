import { getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { PermanentError } from "../worker.ts";
import { FetchRefused, safeFetch } from "./ssrf.ts";
import { fromEpub, fromPptx, readZip } from "./office.ts";
import type { Transcriber } from "../ai/transcription.ts";
import { normalize, type ChunkTimeRange } from "./chunker.ts";

export type Extracted = { text: string; pageStarts: number[]; pageCount: number | null; title?: string; timeRanges?: ChunkTimeRange[] };
export type PdfProgress = (page: number, total: number) => Promise<void> | void;
export type PdfOcr = (file: Uint8Array, pageCount: number) => Promise<string>;

export function parseOcrPages(recognized: string, pageCount: number): Pick<Extracted, "text" | "pageStarts" | "pageCount"> {
  const markers = [...recognized.matchAll(/^\[PAGE\s+(\d+)\]\s*$/gim)];
  if (!markers.length) {
    const text = normalize(recognized);
    if (!text) throw new PermanentError("ocr_empty_result");
    return { text, pageStarts: [0], pageCount };
  }
  const pages: string[] = [];
  for (let index = 0; index < markers.length; index++) {
    const marker = markers[index]!;
    const start = marker.index! + marker[0].length;
    const end = markers[index + 1]?.index ?? recognized.length;
    pages.push(normalize(recognized.slice(start, end)));
  }
  const pageStarts: number[] = [];
  let text = "";
  for (const [index, page] of pages.entries()) {
    if (index > 0) text += PDF_PAGE_SEPARATOR;
    pageStarts.push(text.length);
    text += page;
  }
  if (!text.replace(/[\s\p{C}]/gu, "")) throw new PermanentError("ocr_empty_result");
  return { text, pageStarts, pageCount };
}


const MAX_WORDS = 500_000;
const PDF_PAGE_SEPARATOR = "\n\n";

function finalize(e: Extracted): Extracted {
  const words = e.text.split(/\s+/).filter(Boolean).length;
  if (words === 0) throw new PermanentError("empty_content", "Aucun texte exploitable dans cette source.");
  if (words > MAX_WORDS) throw new PermanentError("too_many_words", "Plus de 500 000 mots.");
  return e;
}

type PdfTextItem = { str?: string; transform?: number[]; width?: number; hasEOL?: boolean };

/**
 * Reconstruit les lignes à partir des coordonnées PDF. L'ordre des items fourni par
 * PDF.js est conservé (important pour les colonnes) ; les coordonnées servent à
 * rétablir les espaces et les retours à la ligne sans aplatir tout le contenu.
 */
export function formatPdfPage(items: PdfTextItem[]): string {
  let output = "";
  let previousY: number | null = null;
  let previousEndX: number | null = null;

  for (const item of items) {
    const value = (item.str ?? "").replace(/[\t ]+/g, " ");
    if (!value) continue;
    const x = Number.isFinite(item.transform?.[4]) ? item.transform![4] : null;
    const y = Number.isFinite(item.transform?.[5]) ? item.transform![5] : null;
    const newLine = output.length > 0 && y !== null && previousY !== null && Math.abs(y - previousY) > 2.5;
    if (newLine) {
      output = output.trimEnd() + "\n";
    } else if (output.length > 0 && !output.endsWith("\n")) {
      const gap = x !== null && previousEndX !== null ? x - previousEndX : 0;
      if (gap > 18) output += " | ";
      else if (gap > 1.5 && !output.endsWith(" ")) output += " ";
    }
    output += value;
    if (item.hasEOL) output += "\n";
    previousY = y ?? previousY;
    previousEndX = x !== null ? x + (item.width ?? 0) : null;
  }
  return output.trim();
}

/**
 * Extraction page par page : évite de matérialiser simultanément les structures
 * de texte de toutes les pages. Le callback permet au worker de publier la progression.
 */
async function fromPdf(buf: Uint8Array, onProgress?: PdfProgress, ocr?: PdfOcr): Promise<Extracted> {
  let pdf;
  try {
    pdf = await getDocumentProxy(buf);
  } catch (e) {
    throw new PermanentError(/password/i.test(String(e)) ? "protected_pdf" : "unreadable_file");
  }

  const pageTexts: string[] = [];
  let extractedWords = 0;
  const pageCount = pdf.numPages;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      await onProgress?.(pageNumber, pageCount);
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const items = (content.items ?? []) as PdfTextItem[];
        const pageText = formatPdfPage(items);
        extractedWords += pageText.split(/\s+/).filter(Boolean).length;
        if (extractedWords > MAX_WORDS) throw new PermanentError("too_many_words", "Plus de 500 000 mots.");
        pageTexts.push(pageText);
      } finally {
        page.cleanup?.();
      }
    }
  } catch (e) {
    if (e instanceof PermanentError) throw e;
    throw new PermanentError("pdf_page_extraction_failed", e instanceof Error ? e.message.slice(0, 300) : undefined);
  } finally {
    pdf.cleanup?.();
  }

  const normalizedPages = pageTexts.map((page) => normalize(page));
  const pageStarts: number[] = [];
  let text = "";
  for (const [index, page] of normalizedPages.entries()) {
    if (index > 0) text += PDF_PAGE_SEPARATOR;
    pageStarts.push(text.length);
    text += page;
  }
  const printable = text.replace(/[\s\p{C}]/gu, "").length;
  if (printable < Math.max(20, pageCount * 2)) {
    if (!ocr) throw new PermanentError("needs_ocr", "PDF sans couche texte détectable : activez l'OCR OpenRouter dans les réglages pour traiter ce document.");
    const recognized = await ocr(buf, pageCount);
    return parseOcrPages(recognized, pageCount);
  }
  return { text, pageStarts, pageCount };
}

function fromHtml(html: string): Extracted {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.textContent?.trim()) throw new PermanentError("empty_content", "Aucun texte principal trouvé sur cette page.");
  return { text: article.textContent, pageStarts: [], pageCount: null, title: article.title ?? undefined };
}

/** Texte brut d'une source, selon son type. Les erreurs attendues sont des PermanentError (code stable). */
export async function extract(
  kind: string,
  data: { file?: Uint8Array; url?: string; noteText?: string; mimeType?: string },
  transcriber?: Transcriber | null,
  onPdfProgress?: PdfProgress,
  onPdfOcr?: PdfOcr,
): Promise<Extracted> {
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
      if (!data.file) throw new PermanentError("file_missing");
      return finalize(await fromPdf(data.file, onPdfProgress, onPdfOcr));
    case "pptx": {
      if (!data.file) throw new PermanentError("file_missing");
      const r = fromPptx(data.file);
      return finalize({ text: r.text, pageStarts: r.pageStarts, pageCount: r.pageCount });
    }
    case "epub": {
      if (!data.file) throw new PermanentError("file_missing");
      const r = fromEpub(data.file);
      return finalize({ text: r.text, pageStarts: [], pageCount: null, title: r.title });
    }
    case "docx": {
      if (!data.file) throw new PermanentError("file_missing");
      readZip(data.file, () => false); // plafonds anti « zip bomb » avant de confier l'archive à mammoth
      try {
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data.file) });
        return finalize({ text: value, pageStarts: [], pageCount: null });
      } catch { throw new PermanentError("unreadable_file"); }
    }
    case "web": {
      let res;
      try { res = await safeFetch(data.url!); } catch (e) {
        if (e instanceof FetchRefused) throw new PermanentError(e.message === "paywall" ? "paywall" : "url_refused", e.message);
        throw e; // réseau : nouvelle tentative
      }
      if (res.contentType.includes("pdf")) return finalize(await fromPdf(new Uint8Array(res.body), onPdfProgress, onPdfOcr));
      if (!res.contentType.includes("html") && !res.contentType.includes("text/plain")) throw new PermanentError("unsupported_type");
      return finalize(res.contentType.includes("html") ? fromHtml(res.body.toString("utf8")) : { text: res.body.toString("utf8"), pageStarts: [], pageCount: null });
    }
    default:
      throw new PermanentError("unsupported_type", `Type non pris en charge à ce jalon : ${kind}`);
  }
}
