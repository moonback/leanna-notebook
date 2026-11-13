import { describe, expect, it } from "vitest";
import { reembed, staleFilter } from "./reembed.ts";

describe("reembed", () => {
  it("filtre les chunks sans vecteur ou d'un autre modèle (valeur entre guillemets pour PostgREST)", () => {
    expect(staleFilter("openrouter:openai/text-embedding-3-large"))
      .toBe('embedding.is.null,embedding_model.is.null,embedding_model.neq."openrouter:openai/text-embedding-3-large"');
  });

  it("recalcule par lots jusqu'à épuisement et enregistre le nouveau modèle", async () => {
    let pending = Array.from({ length: 250 }, (_, i) => ({ id: `c${String(i).padStart(3, "0")}`, content: `texte ${i}` }));
    const writes: { rows: { id: string }[]; model: string }[] = [];
    const query = {
      select: () => query, or: () => query, order: () => query,
      limit: (n: number) => Promise.resolve({ data: pending.slice(0, n), error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ count: pending.length, error: null }), // countStale (head: true)
    };
    const db = {
      from: () => query,
      rpc: async (_name: string, args: { p_rows: { id: string }[]; p_model: string }) => {
        writes.push({ rows: args.p_rows, model: args.p_model });
        const ids = new Set(args.p_rows.map((r) => r.id));
        pending = pending.filter((c) => !ids.has(c.id));
        return { data: ids.size, error: null };
      },
    };
    const embedder = { model: "openrouter:m", embed: async (t: string[]) => t.map(() => Array(1024).fill(0.1)) };
    const done = await reembed(db as never, embedder, () => {});
    expect(done).toBe(250);
    expect(writes.map((w) => w.rows.length)).toEqual([100, 100, 50]);
    expect(writes.every((w) => w.model === "openrouter:m")).toBe(true);
  });
});
