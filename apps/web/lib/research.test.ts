import { describe, expect, it } from "vitest";
import { contradictionReviewSchema, deepResearchActionSchema, deepResearchCreateSchema, entityActionSchema, graphFilters, researchProgress } from "./research";
import { communities } from "@/app/notebook/[id]/knowledge-graph";

describe("progression Deep Research", () => {
  const run = (status: string, next_step: string, done = 0, iterations = 2) => ({ status, next_step, budget: { iterations }, spent: { iterations: done } });
  it("dérive la progression de l'étape persistée, jamais d'un minuteur", () => {
    expect(researchProgress(run("queued", "plan"))).toBe(0);
    expect(researchProgress(run("searching", "iterate", 0))).toBe(10);
    expect(researchProgress(run("cross_checking", "iterate", 1))).toBe(38);
    expect(researchProgress(run("extracting", "await_ingest", 2))).toBe(75);
    expect(researchProgress(run("writing", "write", 2))).toBe(88);
    expect(researchProgress(run("completed", "done", 2))).toBe(100);
  });
  it("n'affiche pas de réussite pour une recherche échouée ou annulée", () => {
    expect(researchProgress(run("failed", "done"))).toBe(0);
    expect(researchProgress(run("cancelled", "done"))).toBe(0);
  });
});

describe("validation des entrées", () => {
  it("applique des valeurs par défaut sûres et borne la création", () => {
    expect(deepResearchCreateSchema.parse({ question: "  Batteries sodium-ion  " })).toEqual({ question: "Batteries sodium-ion", depth: "deep", maxSources: 10, reportFormat: "structured" });
    expect(deepResearchCreateSchema.safeParse({ question: "ok", depth: "deep" }).success).toBe(false);
    expect(deepResearchCreateSchema.safeParse({ question: "Sujet", maxSources: 500 }).success).toBe(false);
    expect(deepResearchCreateSchema.safeParse({ question: "Sujet", depth: "ultra" }).success).toBe(false);
    expect(deepResearchCreateSchema.safeParse({ question: "Sujet", extra: 1 }).success).toBe(false);
  });
  it("n'accepte que les actions prévues", () => {
    expect(deepResearchActionSchema.safeParse({ action: "cancel" }).success).toBe(true);
    expect(deepResearchActionSchema.safeParse({ action: "instruct" }).success).toBe(false);
    expect(deepResearchActionSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(entityActionSchema.safeParse({ action: "merge", intoId: "pas-un-uuid" }).success).toBe(false);
  });
  it("exige une source pour l'association et un texte pour une explication", () => {
    expect(contradictionReviewSchema.safeParse({ action: "attach_source" }).success).toBe(false);
    expect(contradictionReviewSchema.safeParse({ action: "note" }).success).toBe(false);
    expect(contradictionReviewSchema.safeParse({ action: "confirm", note: "vu dans le rapport annuel" }).success).toBe(true);
  });
  it("borne les filtres du graphe et ignore les valeurs invalides", () => {
    const f = graphFilters(new URLSearchParams("limit=99999&types=person,DROP TABLE,place&source=x&minConfidence=7&from=pas-une-date"));
    expect(f).toEqual({ limit: 500, types: ["person", "place"], source: null, from: null, to: null, minConfidence: 1 });
    expect(graphFilters(new URLSearchParams("")).limit).toBe(150);
  });
});

describe("regroupement des entités", () => {
  it("regroupe les entités fortement connectées", () => {
    const nodes = ["a", "b", "c", "x", "y", "z"].map((id) => ({ id }));
    const e = (s: string, t: string) => ({ source_entity_id: s, target_entity_id: t });
    const c = communities(nodes, [e("a", "b"), e("b", "c"), e("a", "c"), e("x", "y"), e("y", "z"), e("x", "z")]);
    expect(c.get("a")).toBe(c.get("c"));
    expect(c.get("x")).toBe(c.get("z"));
    expect(c.get("a")).not.toBe(c.get("x"));
  });
});
