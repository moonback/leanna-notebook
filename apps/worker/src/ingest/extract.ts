import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { PermanentError } from "../worker.ts";
import { FetchRefused, safeFetch } from "./ssrf.ts";
import { fromEpub, fromPptx, readZip } from "./office.ts";
import type { Transcriber } from "../ai/transcription.ts";
import { normalize, type ChunkTimeRange } from "./chunker.ts";
import { ocrWithGemini } from "../ai/ocr.ts";
import { spawn } from "node:child_process";

export type Extracted = { text: string; pageStarts: number[]; pageCount: number | null; title?: string; timeRanges?: ChunkTimeRange[] };

const MAX_WORDS = 500_000;

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
  if (acc.replace(/\s/g, "").length < 20 * Math.max(1, pages.length) / 10) { const text = await ocrWithGemini(buf, "application/pdf"); return { text, pageStarts: [0], pageCount: pages.length }; }
  return { text: acc, pageStarts, pageCount: pages.length };
}

function fromHtml(html: string): Extracted {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.textContent?.trim()) throw new PermanentError("empty_content", "Aucun texte principal trouvé sur cette page.");
  return { text: article.textContent, pageStarts: [], pageCount: null, title: article.title ?? undefined };
}

/** Texte brut d'une source, selon son type. Les erreurs attendues sont des PermanentError (code stable). */

function extractVideoAudio(video: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", ["-nostdin", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "mp3", "pipe:1"], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let total = 0;
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new PermanentError("video_transcode_unavailable")); }, 600000);
    child.stdout.on("data", (part: Buffer) => { total += part.length; if (total > 200 * 1024 * 1024) { child.kill("SIGKILL"); reject(new PermanentError("archive_too_large")); } else chunks.push(part); });
    child.on("error", () => { clearTimeout(timer); reject(new PermanentError("video_transcode_unavailable", "FFmpeg est absent du worker.")); });
    child.on("close", (code) => { clearTimeout(timer); if (code !== 0 || !total) reject(new PermanentError("video_transcode_unavailable")); else resolve(new Uint8Array(Buffer.concat(chunks))); });
    child.stdin.end(Buffer.from(video));
  });
}

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
    case "video": {
      if (!data.file) throw new PermanentError("file_missing");
      if (!transcriber) throw new PermanentError("transcription_not_configured");
      const audio = await extractVideoAudio(data.file);
      const transcript = await transcriber.transcribe(audio, "audio/mpeg");
      return finalize({ text: normalize(transcript.text), pageStarts: [], pageCount: null });
    }
    case "image": {
      if (!data.file) throw new PermanentError("file_missing");
      return finalize({ text: await ocrWithGemini(data.file, data.mimeType ?? "application/octet-stream"), pageStarts: [], pageCount: null });
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
      const mime = data.mimeType ?? "";
      if (mime === "application/rtf" || mime === "text/rtf") {
        const text = new TextDecoder().decode(data.file!)
          .replace(/\\'[0-9a-f]{2}/gi, (m) => String.fromCharCode(parseInt(m.slice(2), 16)))
          .replace(/\\par[d]?/g, "\n").replace(/\\tab/g, "\t")
          .replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, "").trim();
        return finalize({ text, pageStarts: [], pageCount: null });
      }
      if (mime === "application/vnd.oasis.opendocument.text" || mime === "application/vnd.hancom.hwpx") {
        const files = readZip(data.file!, (n) => n === "content.xml" || /^Contents\/section\d+\.xml$/.test(n));
        const text = Object.entries(files)
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([, xml]) => parseHTML(xml).document.textContent ?? "").join("\n\n");
        return finalize({ text, pageStarts: [], pageCount: null });
      }
      if (mime === "application/x-hwp") {
        throw new PermanentError("unsupported_type", "Le format HWP binaire doit être converti en HWPX, DOCX ou PDF avant import.");
      }
      readZip(data.file!, () => false); // plafonds anti « zip bomb » avant de confier l'archive à mammoth
      try {
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data.file!) });
        return finalize({ text: value, pageStarts: [], pageCount: null });
      } catch { throw new PermanentError("unreadable_file"); }
    }
    case "web": {
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
