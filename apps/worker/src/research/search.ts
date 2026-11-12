import { PermanentError } from "../worker.ts";
import { normalizeResearchResults } from "./handler.ts";

// Abstraction des moteurs de recherche web : Deep Research ne dépend que de cette interface.
// Un résultat n'est qu'une PISTE (titre, URL, extrait) : la page est toujours lue en entier ensuite.
export type SearchHit = { title: string; url: string; snippet: string; domain: string };
export type SearchProvider = { name: string; search: (query: string, opts: { max: number }) => Promise<SearchHit[]> };

/** Tavily (déjà utilisé par Fast Research). Erreurs de configuration = permanentes, le reste est réessayable. */
export function tavilyProvider(apiKey: string, fetcher: typeof fetch = fetch): SearchProvider {
  return {
    name: "tavily",
    async search(query, { max }) {
      const response = await fetcher("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, query, search_depth: "advanced", max_results: Math.min(10, max), include_answer: false, include_raw_content: false }),
        signal: AbortSignal.timeout(25_000),
      });
      if (response.status === 401 || response.status === 403 || response.status === 400) {
        throw new PermanentError("research_provider_config", `tavily_http_${response.status}`);
      }
      if (response.status === 429) throw new Error("search_rate_limited");
      if (!response.ok) throw new Error(`tavily_http_${response.status}`);
      const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
      return normalizeResearchResults(data.results, max).map((r) => ({ title: r.title, url: r.url, snippet: r.why, domain: r.domain }));
    },
  };
}

/** Fournisseur configuré côté worker ; null si aucun (la recherche échoue alors explicitement). */
export function searchProviderFromEnv(env = process.env): SearchProvider | null {
  return env.TAVILY_API_KEY ? tavilyProvider(env.TAVILY_API_KEY) : null;
}
