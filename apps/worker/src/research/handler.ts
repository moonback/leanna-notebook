import type { SupabaseClient } from "@supabase/supabase-js";
import { PermanentError, type Handler } from "../worker.ts";

export type ResearchResult = { title: string; url: string; why: string; domain: string };

type TavilyResponse = { results?: Array<{ title?: string; url?: string; content?: string; score?: number }> };

/** Normalise et déduplique les résultats du fournisseur avant de les exposer à l'utilisateur. */
export function normalizeResearchResults(input: TavilyResponse["results"]): ResearchResult[] {
  const seen = new Set<string>();
  const output: ResearchResult[] = [];
  for (const item of input ?? []) {
    if (!item.url || !item.title) continue;
    let parsed: URL;
    try { parsed = new URL(item.url); } catch { continue; }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
    parsed.hash = "";
    const url = parsed.toString();
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const why = (item.content ?? "").replace(/\s+/g, " ").trim().slice(0, 360);
    output.push({ title: item.title.trim().slice(0, 240), url, why: why || "Page trouvée par la recherche web.", domain: parsed.hostname });
    if (output.length === 5) break;
  }
  return output;
}

/** B17 : recherche web rapide. Le worker ne télécharge pas les pages ; leur ingestion reste dans ingest_source. */
export function researchHandler(db: SupabaseClient, apiKey: string | undefined, fetcher: typeof fetch = fetch): Handler {
  return async (job, ctx) => {
    const query = typeof job.payload.query === "string" ? job.payload.query.trim() : "";
    if (query.length < 3 || query.length > 300) throw new PermanentError("invalid_research_query");
    if (!apiKey) throw new PermanentError("research_not_configured", "TAVILY_API_KEY absente côté worker.");

    await ctx.progress(10, "recherche web");
    if (await ctx.cancelled()) return { cancelled: true };
    const response = await fetcher("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", max_results: 10, include_answer: false, include_raw_content: false }),
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      throw new PermanentError("research_provider_config", `tavily_http_${response.status}`);
    }
    if (!response.ok) throw new Error(`tavily_http_${response.status}`);
    const data = await response.json() as TavilyResponse;
    const results = normalizeResearchResults(data.results);
    if (!results.length) throw new PermanentError("research_no_results");
    await ctx.progress(90, "classement des résultats");
    return { query, results, provider: "tavily", searchedAt: new Date().toISOString() };
  };
}
