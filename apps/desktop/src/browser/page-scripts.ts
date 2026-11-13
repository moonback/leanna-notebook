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

// ── Scripts de l'agent ─────────────────────────────────────────────────────

export type InteractiveElement = { ref: string; kind: string; label: string; href?: string };

/** Liste les éléments interactifs visibles et leur attribue un repère (e1, e2…) valable jusqu'au prochain appel. */
export function interactiveScript(options: { max: number }): InteractiveElement[] {
  const refs = new Map<string, Element>();
  (globalThis as unknown as { __leannaRefs?: Map<string, Element> }).__leannaRefs = refs;
  const out: InteractiveElement[] = [];
  const nodes = document.querySelectorAll("a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [contenteditable=true]");
  for (const node of Array.from(nodes) as HTMLElement[]) {
    if (out.length >= options.max) break;
    if (node.getClientRects().length === 0 || (node as HTMLInputElement).disabled) continue;
    const input = node as HTMLInputElement;
    const label = (node.innerText || node.getAttribute("aria-label") || input.placeholder || node.title || input.name || (input.type === "submit" ? input.value : "") || "")
      .replace(/\s+/g, " ").trim().slice(0, 100);
    if (!label) continue;
    const ref = `e${out.length + 1}`;
    refs.set(ref, node);
    const tag = node.tagName.toLowerCase();
    const href = tag === "a" ? (node as HTMLAnchorElement).href : "";
    out.push({ ref, kind: tag === "input" ? `input:${input.type}` : tag, label, ...(/^https?:/.test(href) ? { href: href.slice(0, 500) } : {}) });
  }
  return out;
}

export type ElementReport = {
  found: boolean; changed?: boolean; done?: boolean;
  tag?: string; type?: string; label?: string; href?: string; download?: boolean;
  inForm?: boolean; formMethod?: string; formAction?: string; formHasPassword?: boolean; formHasPayment?: boolean;
  fieldSensitive?: boolean; isSubmit?: boolean; signature?: string;
};

/**
 * Décrit un élément, ou agit dessus (clic, saisie). Quand `signature` est fournie, l'action n'a lieu que si
 * l'élément est toujours celui qui a été décrit puis approuvé : vérification et action se font dans le même
 * appel, ce qui empêche une page de substituer un autre élément entre l'inspection et le clic.
 */
export function elementScript(options: { element: string; action: "describe" | "click" | "type"; text?: string; submit?: boolean; signature?: string }): ElementReport {
  const refs = (globalThis as unknown as { __leannaRefs?: Map<string, Element> }).__leannaRefs;
  const wanted = options.element.replace(/\s+/g, " ").trim().toLowerCase();
  let node = (refs?.get(options.element) ?? null) as HTMLElement | null;
  if (node && !node.isConnected) node = null;
  if (!node) {
    const candidates = Array.from(document.querySelectorAll("a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [contenteditable=true]")) as HTMLElement[];
    node = candidates.find((item) => {
      const input = item as HTMLInputElement;
      return [item.innerText, item.getAttribute("aria-label"), input.placeholder, input.name, input.value]
        .some((value) => (value ?? "").replace(/\s+/g, " ").trim().toLowerCase() === wanted) && item.getClientRects().length > 0;
    }) ?? null;
  }
  if (!node) return { found: false };

  const input = node as HTMLInputElement;
  const tag = node.tagName.toLowerCase();
  const type = (input.type || "").toLowerCase();
  const form = (input.form ?? node.closest("form")) as HTMLFormElement | null;
  const autocomplete = (node.getAttribute("autocomplete") ?? "").toLowerCase();
  const fieldName = `${input.name ?? ""} ${node.id} ${autocomplete} ${node.getAttribute("aria-label") ?? ""} ${input.placeholder ?? ""}`.toLowerCase();
  const label = (node.innerText || node.getAttribute("aria-label") || input.placeholder || input.value || input.name || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const href = tag === "a" ? (node as HTMLAnchorElement).href.slice(0, 2048) : "";
  const report: ElementReport = {
    found: true, tag, type, label, href,
    download: node.hasAttribute("download"),
    inForm: Boolean(form),
    formMethod: (form?.method || "").toLowerCase(),
    formAction: form ? form.action.slice(0, 2048) : "",
    formHasPassword: Boolean(form?.querySelector("input[type=password]")),
    formHasPayment: Boolean(form?.querySelector('[autocomplete^="cc-"], [name*="card" i], [name*="cvv" i], [name*="cvc" i], [name*="iban" i]')),
    fieldSensitive: type === "password" || /cc-|card|carte|cvv|cvc|iban|ssn|secu|password|passwd|mot.?de.?passe|one-time-code|otp/.test(fieldName),
    isSubmit: type === "submit" || (tag === "button" && Boolean(form) && type !== "button" && type !== "reset"),
  };
  report.signature = [tag, type, label, href, report.formAction, report.formMethod].join("|");
  if (options.action === "describe") return report;
  if (options.signature !== undefined && options.signature !== report.signature) return { ...report, changed: true };

  node.scrollIntoView({ block: "center" });
  if (options.action === "click") {
    node.click();
    return { ...report, done: true };
  }
  const text = options.text ?? "";
  node.focus();
  if (tag === "input" || tag === "textarea") {
    // Le setter natif garde les bibliothèques d'interface (React…) synchronisées avec la valeur.
    const proto = tag === "input" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(node, text);
  } else if (tag === "select") {
    (node as unknown as HTMLSelectElement).value = text;
  } else if (node.isContentEditable) {
    node.textContent = text;
  } else {
    return { ...report, done: false };
  }
  node.dispatchEvent(new Event("input", { bubbles: true }));
  node.dispatchEvent(new Event("change", { bubbles: true }));
  if (options.submit) {
    if (form) form.requestSubmit();
    else for (const name of ["keydown", "keyup"]) node.dispatchEvent(new KeyboardEvent(name, { key: "Enter", code: "Enter", bubbles: true }));
  }
  return { ...report, done: true };
}

/** Tous les liens http(s) de la page, éventuellement filtrés. */
export function linksScript(options: { max: number; filter: string }): { text: string; url: string }[] {
  const filter = options.filter.toLowerCase();
  const seen = new Set<string>();
  const out: { text: string; url: string }[] = [];
  for (const anchor of Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[]) {
    if (out.length >= options.max) break;
    const url = anchor.href;
    const text = (anchor.innerText || anchor.getAttribute("aria-label") || anchor.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    if (filter && !text.toLowerCase().includes(filter) && !url.toLowerCase().includes(filter)) continue;
    seen.add(url);
    out.push({ text, url: url.slice(0, 2048) });
  }
  return out;
}

/** Occurrences d'un texte dans la page, avec leur contexte. */
export function findTextScript(options: { query: string; max: number }): { count: number; matches: string[] } {
  const text = (document.body?.innerText ?? "").replace(/\s+/g, " ");
  const haystack = text.toLowerCase();
  const needle = options.query.toLowerCase();
  const matches: string[] = [];
  let count = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
    count += 1;
    if (matches.length < options.max) matches.push(text.slice(Math.max(0, at - 100), at + needle.length + 100).trim());
    if (count >= 500) break;
  }
  return { count, matches };
}

export function scrollScript(options: { direction: "up" | "down" | "top" | "bottom" }): { scrollY: number; maxScroll: number } {
  const page = Math.round(window.innerHeight * 0.85);
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (options.direction === "top") window.scrollTo(0, 0);
  else if (options.direction === "bottom") window.scrollTo(0, max);
  else window.scrollBy(0, options.direction === "down" ? page : -page);
  return { scrollY: Math.round(window.scrollY), maxScroll: max };
}
