import { unzipSync } from "fflate";
import { parseHTML } from "linkedom";
import { PermanentError } from "../worker.ts";

// Garde-fous anti « zip bomb » : un docx/pptx/epub honnête reste très en dessous.
const MAX_ENTRIES = 5000;
const MAX_UNCOMPRESSED = 150 * 1024 * 1024;

/** Décompresse uniquement les entrées utiles, avec plafonds de nombre et de taille. */
export function readZip(buf: Uint8Array, wanted: (name: string) => boolean, maxUncompressed = MAX_UNCOMPRESSED): Record<string, string> {
  let entries = 0, total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, {
      filter: (f) => {
        if (++entries > MAX_ENTRIES) throw new PermanentError("archive_too_large");
        total += f.originalSize;
        if (total > maxUncompressed) throw new PermanentError("archive_too_large");
        return wanted(f.name);
      },
    });
  } catch (e) {
    if (e instanceof PermanentError) throw e;
    throw new PermanentError("unreadable_file");
  }
  const dec = new TextDecoder("utf-8");
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, dec.decode(v)]));
}

const textOf = (xml: string) => parseHTML(`<root>${xml}</root>`).document.querySelector("root")?.textContent ?? "";

/** PPTX : une section par diapositive (ordre numérique), notes du présentateur incluses ; page = n° de diapositive. */
export function fromPptx(buf: Uint8Array): { text: string; pageStarts: number[]; pageCount: number } {
  const files = readZip(buf, (n) => /^ppt\/(slides|notesSlides)\/(slide|notesSlide)\d+\.xml$/.test(n));
  const num = (n: string) => Number(/(\d+)\.xml$/.exec(n)![1]);
  const slides = Object.keys(files).filter((n) => n.startsWith("ppt/slides/")).sort((a, b) => num(a) - num(b));
  if (slides.length === 0) throw new PermanentError("unreadable_file");
  const runs = (xml: string) => [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => textOf(m[1]));
  const paragraphs = (xml: string) => xml.split(/<\/a:p>/).map((p) => runs(p).join("")).filter((t) => t.trim()).join("\n");

  let text = "";
  const pageStarts: number[] = [];
  for (const s of slides) {
    pageStarts.push(text.length);
    const notes = files[`ppt/notesSlides/notesSlide${num(s)}.xml`];
    text += `Diapositive ${num(s)}\n${paragraphs(files[s])}${notes ? `\nNotes : ${paragraphs(notes)}` : ""}\n\n`;
  }
  return { text, pageStarts, pageCount: slides.length };
}

/** EPUB : chapitres dans l'ordre du « spine » déclaré par le fichier OPF. */
export function fromEpub(buf: Uint8Array): { text: string; title?: string } {
  const files = readZip(buf, (n) => /\.(xml|opf|x?html?)$/i.test(n));
  const container = files["META-INF/container.xml"];
  const opfPath = container && /full-path="([^"]+)"/.exec(container)?.[1];
  const opf = opfPath && files[opfPath];
  if (!opf) throw new PermanentError("unreadable_file");
  const base = opfPath!.includes("/") ? opfPath!.slice(0, opfPath!.lastIndexOf("/") + 1) : "";
  const manifest = new Map([...opf.matchAll(/<item\b[^>]*>/g)].map((m) => [/id="([^"]+)"/.exec(m[0])?.[1], /href="([^"]+)"/.exec(m[0])?.[1]]));
  const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => manifest.get(m[1])).filter(Boolean) as string[];
  const chapters = spine.map((href) => files[base + decodeURIComponent(href)]).filter(Boolean)
    .map((xhtml) => parseHTML(xhtml).document.body?.textContent ?? "").filter((t) => t.trim());
  if (chapters.length === 0) throw new PermanentError("empty_content");
  const title = /<dc:title[^>]*>([^<]+)<\/dc:title>/.exec(opf)?.[1]?.trim();
  return { text: chapters.join("\n\n"), title };
}
