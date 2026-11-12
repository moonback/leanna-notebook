/**
 * Fonctions exécutées DANS les pages web, en monde JavaScript isolé (voir BrowserManager.runInPage).
 * Contraintes : chaque fonction est autonome (aucune fermeture, aucun import) car seul son code source
 * est transmis ; elle reçoit un argument JSON et renvoie du JSON. Ce qu'elle renvoie vient d'une page
 * non fiable et est revalidé côté Main (browser-extract.ts).
 */

// Fourni par le prélude Readability.js injecté juste avant le script d'extraction.
declare const Readability: (new (doc: Document, options?: Record<string, unknown>) => { parse(): { textContent?: string; title?: string; byline?: string; excerpt?: string; siteName?: string; publishedTime?: string } | null }) | undefined;

export type RawExtraction = {
  url: string; title: string; description: string; siteName: string; author: string; lang: string;
  publishedAt: string; canonicalUrl: string; text: string; method: "readability" | "fallback";
  headings: { level: number; text: string }[];
  links: { text: string; url: string }[];
  tables: { caption: string; rows: string[][] }[];
};

export function extractPageScript(options: { maxChars: number; maxLinks: number; maxTables: number; maxRows: number }): RawExtraction {
  const meta = (...selectors: string[]): string => {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.getAttribute("content")?.trim();
      if (value) return value;
    }
    return "";
  };
  const clip = (value: string | null | undefined, max: number): string => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

  // 1. Contenu principal : Readability sur un clone (le DOM de la page n'est pas modifié), sinon repli heuristique.
  let article: ReturnType<InstanceType<NonNullable<typeof Readability>>["parse"]> = null;
  try {
    if (typeof Readability === "function") article = new Readability(document.cloneNode(true) as Document, { charThreshold: 200 }).parse();
  } catch { article = null; }
  let text = article?.textContent ?? "";
  let method: "readability" | "fallback" = "readability";
  const mainRoot = document.querySelector("article, main, [role=main]") as HTMLElement | null;
  if (text.trim().length < 200) {
    method = "fallback";
    text = (mainRoot ?? document.body)?.innerText ?? "";
  }

  // 2. Date de publication : balises meta, <time>, puis JSON-LD.
  let publishedAt = meta('meta[property="article:published_time"]', 'meta[name="date"]', 'meta[itemprop="datePublished"]', 'meta[name="dc.date"]')
    || article?.publishedTime || document.querySelector("time[datetime]")?.getAttribute("datetime") || "";
  if (!publishedAt) {
    for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 10)) {
      const found = /"datePublished"\s*:\s*"([^"]{4,40})"/.exec(script.textContent ?? "");
      if (found) { publishedAt = found[1]; break; }
    }
  }

  const scope: ParentNode = mainRoot ?? document;
  const headings = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 60)
    .map((node) => ({ level: Number(node.tagName[1]), text: clip(node.textContent, 200) })).filter((item) => item.text);

  const seen = new Set<string>();
  const links: { text: string; url: string }[] = [];
  for (const anchor of Array.from(scope.querySelectorAll("a[href]")) as HTMLAnchorElement[]) {
    if (links.length >= options.maxLinks) break;
    const url = anchor.href;
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    links.push({ text: clip(anchor.textContent || anchor.getAttribute("aria-label") || anchor.title, 120), url: url.slice(0, 2048) });
  }

  const tables = (Array.from(document.querySelectorAll("table")) as HTMLTableElement[]).slice(0, options.maxTables).map((table) => ({
    caption: clip(table.caption?.textContent, 200),
    rows: Array.from(table.rows).slice(0, options.maxRows)
      .map((row) => Array.from(row.cells).slice(0, 12).map((cell) => clip(cell.textContent, 200))),
  })).filter((table) => table.rows.length > 0);

  return {
    url: location.href,
    title: clip(article?.title || document.title, 300),
    description: clip(meta('meta[name="description"]', 'meta[property="og:description"]') || article?.excerpt, 1000),
    siteName: clip(meta('meta[property="og:site_name"]') || article?.siteName, 120),
    author: clip(meta('meta[name="author"]', 'meta[property="article:author"]') || article?.byline, 200),
    lang: clip(document.documentElement.lang, 20),
    publishedAt: clip(publishedAt, 40),
    canonicalUrl: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href?.slice(0, 2048) ?? "",
    text: text.slice(0, options.maxChars),
    method, headings, links, tables,
  };
}

/** Texte actuellement sélectionné par l'utilisateur dans la page. */
export function selectionScript(options: { maxChars: number }): string {
  return (window.getSelection()?.toString() ?? "").slice(0, options.maxChars);
}
