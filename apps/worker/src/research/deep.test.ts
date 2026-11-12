import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetLeft, deepResearchHandler, interleave, passAllowance } from "./deep.ts";
import { canonicalize, pageMetadata, readPage } from "./reader.ts";
import { tavilyProvider } from "./search.ts";
import { FetchRefused } from "../ingest/ssrf.ts";

const article = (body: string) => `<!doctype html><html><head><title>Batteries sodium-ion</title>
<link rel="canonical" href="/articles/sodium?utm_source=x"><meta name="author" content="Claire Dupont">
<meta property="article:published_time" content="2024-05-02T08:00:00Z"></head>
<body><nav>Menu</nav><article><h1>Batteries sodium-ion</h1>${body}</article><footer>©</footer></body></html>`;
const paragraph = "<p>Les batteries sodium-ion utilisent un élément abondant et peu coûteux. Plusieurs industriels annoncent des lignes de production en Europe et en Asie, avec des densités énergétiques en progression régulière depuis trois ans.</p>";

describe("lecture des pages", () => {
  it("canonicalise les URL (fragment, paramètres de suivi, www, slash final)", () => {
    expect(canonicalize("https://www.Example.com/a/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/a?a=1&b=2");
    expect(canonicalize("https://example.com/")).toBe("https://example.com/");
  });
  it("extrait les métadonnées déclarées par la page", () => {
    expect(pageMetadata(article(paragraph), "https://news.test/x")).toEqual({
      canonical: "https://news.test/articles/sodium?utm_source=x", author: "Claire Dupont", publishedAt: "2024-05-02T08:00:00Z",
    });
  });
  it("lit le contenu principal complet, avec empreinte et URL canonique", async () => {
    const fetcher = vi.fn(async () => ({ url: "https://news.test/x", contentType: "text/html; charset=utf-8", body: Buffer.from(article(paragraph.repeat(4))) }));
    const page = await readPage("https://news.test/x", fetcher);
    if ("failed" in page) throw new Error(page.reason);
    expect(page).toMatchObject({ canonicalUrl: "https://news.test/articles/sodium", author: "Claire Dupont", docType: "html" });
    expect(page.text).toContain("sodium-ion utilisent un élément abondant");
    expect(page.text).not.toContain("Menu");
    expect(page.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejette les contenus trop pauvres, les types non pris en charge et les adresses refusées", async () => {
    const thin = await readPage("https://a.test", async () => ({ url: "https://a.test", contentType: "text/html", body: Buffer.from(article("<p>Accepter les cookies pour continuer à lire cet article.</p>")) }));
    expect(thin).toEqual({ failed: true, reason: "contenu trop pauvre" });
    const image = await readPage("https://a.test/i.png", async () => ({ url: "https://a.test/i.png", contentType: "image/png", body: Buffer.from("x") }));
    expect(image).toMatchObject({ failed: true });
    const ssrf = await readPage("http://169.254.169.254/", async () => { throw new FetchRefused("private_address"); });
    expect(ssrf).toEqual({ failed: true, reason: "page refusée (private_address)" });
    const down = await readPage("https://down.test", async () => { throw new Error("ECONNRESET"); });
    expect(down).toEqual({ failed: true, reason: "page injoignable" });
  });
});

describe("budget et couverture", () => {
  const run = { budget: { iterations: 2, subquestions: 5, queries: 10, pages: 20, tokens: 1000, minutes: 20 }, started_at: new Date(0).toISOString() };
  it("calcule le budget restant et détecte l'épuisement (tokens, durée, coût)", () => {
    expect(budgetLeft({ ...run, spent: { iterations: 1, queries: 4, pages: 12, tokens: 10 } }, 60_000)).toEqual({ iterations: 1, queries: 6, pages: 8, exhausted: false });
    expect(budgetLeft({ ...run, spent: { tokens: 1000 } }, 60_000).exhausted).toBe(true);
    expect(budgetLeft({ ...run, spent: {} }, 21 * 60_000).exhausted).toBe(true);
    expect(budgetLeft({ ...run, spent: { cost_usd: 2 } }, 60_000, 1.5).exhausted).toBe(true);
  });
  it("réserve du budget pour les tours de comblement des lacunes", () => {
    const deep = { iterations: 2, subquestions: 5, queries: 10, pages: 20, tokens: 1, minutes: 1 };
    const expert = { iterations: 3, subquestions: 7, queries: 18, pages: 36, tokens: 1, minutes: 1 };
    expect(passAllowance(deep, { queries: 10, pages: 20 })).toEqual({ queries: 5, pages: 10 });   // il reste un tour complet
    expect(passAllowance(expert, { queries: 18, pages: 36 })).toEqual({ queries: 6, pages: 12 });
    expect(passAllowance(expert, { queries: 2, pages: 30 })).toEqual({ queries: 2, pages: 12 });  // jamais plus que le restant
    expect(passAllowance({ ...deep, iterations: 1 }, { queries: 4, pages: 8 })).toEqual({ queries: 4, pages: 8 });
  });
  it("répartit les pages à lire entre les sous-questions", () => {
    const items = [..."aaaa"].map((_, i) => ({ id: `a${i}`, subquestion_id: "q1" })).concat([{ id: "b0", subquestion_id: "q2" }, { id: "c0", subquestion_id: "q3" }]);
    expect(interleave(items, 4).map((x) => x.id)).toEqual(["a0", "b0", "c0", "a1"]);
  });
});

describe("fournisseur de recherche", () => {
  it("normalise et déduplique les résultats Tavily", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [
      { title: "A", url: "https://a.test/x#1", content: "extrait" }, { title: "A", url: "https://a.test/x", content: "doublon" },
      { title: "B", url: "ftp://b.test", content: "refusé" },
    ] }), { status: 200 }));
    const hits = await tavilyProvider("k", fetcher as unknown as typeof fetch).search("sodium", { max: 6 });
    expect(hits).toEqual([{ title: "A", url: "https://a.test/x", snippet: "extrait", domain: "a.test" }]);
  });
  it("distingue erreur de configuration (permanente) et indisponibilité (réessayable)", async () => {
    const cfg = tavilyProvider("k", (async () => new Response("", { status: 401 })) as unknown as typeof fetch);
    await expect(cfg.search("x", { max: 3 })).rejects.toMatchObject({ code: "research_provider_config" });
    const busy = tavilyProvider("k", (async () => new Response("", { status: 503 })) as unknown as typeof fetch);
    await expect(busy.search("x", { max: 3 })).rejects.toThrow("tavily_http_503");
  });
});

describe("job deep_research", () => {
  const job = (step: string) => ({ id: "j", kind: "deep_research" as const, workspace_id: "w", notebook_id: "n", target_id: "r", payload: { step }, attempts: 1, max_attempts: 3, usage_id: null, cancel_requested: false });
  const ctx = { progress: vi.fn(async () => {}), cancelled: vi.fn(async () => false) };
  const dbWith = (run: object) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: run }) }) }) }) }) as unknown as SupabaseClient;

  it("n'exécute rien pour une recherche annulée ou terminée", async () => {
    const llm = vi.fn();
    const handler = deepResearchHandler({ db: dbWith({ id: "r", workspace_id: "w", notebook_id: "n", status: "cancelled", cancel_requested: true }), llm, search: null, embedder: null });
    expect(await handler(job("plan"), ctx)).toEqual({ skipped: "cancelled" });
    expect(llm).not.toHaveBeenCalled();
  });
  it("refuse une recherche d'un autre espace de travail", async () => {
    const handler = deepResearchHandler({ db: dbWith({ id: "r", workspace_id: "autre", notebook_id: "n", status: "queued" }), llm: null, search: null, embedder: null });
    await expect(handler(job("plan"), ctx)).rejects.toMatchObject({ code: "tenant_mismatch" });
  });
});
