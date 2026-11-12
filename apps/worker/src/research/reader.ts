import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import { PermanentError } from "../worker.ts";
import { FetchRefused, safeFetch } from "../ingest/ssrf.ts";
import { fromHtml, fromPdf } from "../ingest/extract.ts";
import { normalize } from "../ingest/chunker.ts";

export type Page = {
  url: string; canonicalUrl: string; title: string; author: string | null; publishedAt: string | null;
  docType: "html" | "pdf" | "text"; text: string; sha256: string;
};
export type PageFailure = { failed: true; reason: string };

export const MIN_CONTENT_CHARS = 600;     // en dessous : page trop pauvre (cookie wall, index, erreur déguisée)
export const MAX_CONTENT_CHARS = 200_000; // au-delà : tronqué pour l'analyse (la source complète reste ingérée)

/** URL comparable : sans fragment ni paramètres de suivi, hôte en minuscules, sans « / » final. */
export function canonicalize(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|ref_src$)/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

/** Métadonnées déclarées par la page (jamais devinées) : URL canonique, auteur, date de publication. */
export function pageMetadata(html: string, baseUrl: string): { canonical: string | null; author: string | null; publishedAt: string | null } {
  const { document } = parseHTML(html);
  const attr = (selector: string, name: string) => document.querySelector(selector)?.getAttribute(name)?.trim() || null;
  let canonical: string | null = null;
  const href = attr('link[rel="canonical"]', "href");
  if (href) {
    try { const u = new URL(href, baseUrl); if (u.protocol === "https:" || u.protocol === "http:") canonical = u.toString(); } catch { /* ignorée */ }
  }
  const author = attr('meta[name="author"]', "content") ?? attr('meta[property="article:author"]', "content");
  const published = attr('meta[property="article:published_time"]', "content") ?? attr('meta[name="date"]', "content")
    ?? attr('meta[itemprop="datePublished"]', "content") ?? attr('meta[name="dc.date"]', "content") ?? attr("time[datetime]", "datetime");
  return { canonical, author: author?.slice(0, 200) ?? null, publishedAt: published?.slice(0, 40) ?? null };
}

/**
 * Lit réellement une page (protection SSRF, redirections revérifiées, taille et délai plafonnés)
 * et en extrait le contenu principal. Un extrait de moteur de recherche n'est JAMAIS considéré comme une lecture.
 */
export async function readPage(url: string, fetcher = safeFetch): Promise<Page | PageFailure> {
  let res;
  try { res = await fetcher(url); } catch (e) {
    if (e instanceof FetchRefused) return { failed: true, reason: e.message === "paywall" ? "page réservée aux abonnés" : `page refusée (${e.message})` };
    return { failed: true, reason: "page injoignable" };
  }
  let text = "", title = "", docType: Page["docType"] = "html";
  let meta: ReturnType<typeof pageMetadata> = { canonical: null, author: null, publishedAt: null };
  try {
    if (res.contentType.includes("pdf")) {
      docType = "pdf";
      text = (await fromPdf(new Uint8Array(res.body))).text;
    } else if (res.contentType.includes("html")) {
      const html = res.body.toString("utf8");
      meta = pageMetadata(html, res.url);
      const ex = fromHtml(html);
      text = ex.text; title = ex.title ?? "";
    } else if (res.contentType.includes("text/plain")) {
      docType = "text";
      text = res.body.toString("utf8");
    } else {
      return { failed: true, reason: `type de contenu non pris en charge (${res.contentType.split(";")[0] || "inconnu"})` };
    }
  } catch (e) {
    return { failed: true, reason: e instanceof PermanentError ? `contenu illisible (${e.code})` : "contenu illisible" };
  }
  text = normalize(text).slice(0, MAX_CONTENT_CHARS);
  if (text.length < MIN_CONTENT_CHARS) return { failed: true, reason: "contenu trop pauvre" };
  return {
    url: res.url, canonicalUrl: canonicalize(meta.canonical ?? res.url), title: title.slice(0, 300), author: meta.author,
    publishedAt: meta.publishedAt, docType, text, sha256: createHash("sha256").update(text).digest("hex"),
  };
}
