import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PermanentError } from "../worker.ts";
import { normalizeResearchResults, researchHandler } from "./handler.ts";

const job = { id: "j", kind: "research" as const, workspace_id: "w", notebook_id: "n", target_id: null,
  payload: { query: "énergie solaire" }, attempts: 1, max_attempts: 3, usage_id: null, cancel_requested: false };
const context = { progress: vi.fn(async () => {}), cancelled: vi.fn(async () => false) };

describe("Fast Research", () => {
  it("ne conserve que cinq URLs HTTP(S) uniques", () => {
    const results = normalizeResearchResults([
      { title: "A", url: "https://example.com/a#top", content: "  Premier   résultat " },
      { title: "A bis", url: "https://example.com/a", content: "doublon" },
      { title: "B", url: "javascript:alert(1)", content: "invalid" },
      ...Array.from({ length: 6 }, (_, i) => ({ title: `Page ${i}`, url: `https://site.test/${i}`, content: `Contenu ${i}` })),
    ]);
    expect(results).toHaveLength(5);
    expect(results[0]).toMatchObject({ url: "https://example.com/a", domain: "example.com", why: "Premier résultat" });
    expect(results.every((r) => r.url.startsWith("http"))).toBe(true);
  });

  it("appelle Tavily et renvoie une liste normalisée", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [
      { title: "Guide", url: "https://example.com/guide", content: "Présentation détaillée du sujet." },
    ] }), { status: 200, headers: { "content-type": "application/json" } }));
    const handler = researchHandler({} as SupabaseClient, "test-key", fetcher as unknown as typeof fetch);
    const result = await handler(job, context);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ query: "énergie solaire", provider: "tavily", results: [{ title: "Guide", domain: "example.com" }] });
    expect(context.progress).toHaveBeenCalledTimes(2);
  });

  it("échoue explicitement si la clé du fournisseur est absente", async () => {
    const handler = researchHandler({} as SupabaseClient, undefined);
    await expect(handler(job, context)).rejects.toMatchObject({ code: "research_not_configured" });
  });

  it("refuse une réponse vide sans la présenter comme une recherche réussie", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const handler = researchHandler({} as SupabaseClient, "test-key", fetcher as unknown as typeof fetch);
    await expect(handler(job, context)).rejects.toMatchObject({ code: "research_no_results" });
  });
});
