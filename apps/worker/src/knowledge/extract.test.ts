import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPayload, knowledgeExtractHandler, windowsOf, type KChunk } from "./extract.ts";
import { decide } from "./contradictions.ts";
import { findCandidates, type Claim } from "./compare.ts";
import { locateQuote } from "./provenance.ts";

const chunks: KChunk[] = [
  { id: "k1", ordinal: 0, char_start: 0, page_start: 1,
    content: "OpenAI a été fondée en 2015 à San Francisco. Sam Altman dirige l’entreprise OpenAI depuis 2019." },
  { id: "k2", ordinal: 1, char_start: 100, page_start: 2,
    content: "Selon le rapport, Open AI a levé 10 milliards de dollars auprès de Microsoft. Paul Martin, chercheur, l'a confirmé." },
];

const output = {
  entities: [
    { name: "OpenAI", type: "company", aliases: ["Open AI"] },
    { name: "Sam Altman", type: "person" },
    { name: "Microsoft", type: "company" },
    { name: "Paul Martin", type: "person" },
    { name: "Martin", type: "person" },                       // homonyme partiel : entité distincte
    { name: "Atlantis Corp", type: "company" },               // jamais mentionnée : sans provenance
  ],
  relations: [
    { source: "Sam Altman", target: "OpenAI", type: "leads", explicit: true, confidence: 0.9, passage: 1, quote: "Sam Altman dirige l'entreprise OpenAI" },
    { source: "Microsoft", target: "Open AI", type: "funds", explicit: true, confidence: 0.8, passage: 2, quote: "Open AI a levé 10 milliards de dollars auprès de Microsoft" },
    { source: "Microsoft", target: "OpenAI", type: "owns", explicit: true, confidence: 0.9, passage: 2, quote: "Microsoft possède OpenAI" },  // citation inventée
    { source: "Paul Martin", target: "OpenAI", type: "works for", explicit: false, confidence: 0.9, passage: 2, quote: "Paul Martin, chercheur, l'a confirmé" },
  ],
  claims: [
    { subject: "OpenAI", attribute: "founding date", value: "2015", value_type: "date", passage: 1, quote: "OpenAI a été fondée en 2015 à San Francisco" },
    { subject: "Atlantis Corp", attribute: "revenue", value: "3 M€", value_type: "amount", passage: 1, quote: "OpenAI a été fondée en 2015" },
    { subject: "OpenAI", attribute: "funding_amount", value: "10 milliards de dollars", value_type: "amount", passage: 7, quote: "10 milliards" },
  ],
};

describe("provenance", () => {
  it("retrouve un passage malgré apostrophes typographiques et espaces", () => {
    const at = locateQuote(chunks[0]!.content, "Sam  Altman dirige l'entreprise OpenAI");
    expect(at).not.toBeNull();
    expect(chunks[0]!.content.slice(at!.start, at!.end)).toBe("Sam Altman dirige l’entreprise OpenAI");
    expect(locateQuote(chunks[0]!.content, "Microsoft possède OpenAI")).toBeNull();
  });
});

describe("construction du graphe d'une source", () => {
  const payload = buildPayload([{ chunks, output }]);
  const names = payload.entities.map((e) => e.name);

  it("n'accepte que des éléments prouvés par un passage retrouvé", () => {
    expect(names).not.toContain("Atlantis Corp");
    expect(payload.relations.map((r) => r.type)).toEqual(["leads", "funds", "works_for"]);
    expect(payload.claims).toHaveLength(1);
    expect(payload.dropped).toBe(4);   // relation inventée, passage inexistant, entité et affirmation sans provenance
  });
  it("rattache les alias à une seule entité et garde les homonymes séparés", () => {
    const openai = payload.entities.find((e) => e.name === "OpenAI")!;
    expect(openai.key).toBe("openai");
    expect(payload.entities.filter((e) => e.type_group === "org" && e.key === "openai")).toHaveLength(1);
    expect(names).toEqual(expect.arrayContaining(["Paul Martin", "Martin"]));
    expect(payload.entities.find((e) => e.name === "Martin")!.key).not.toBe(payload.entities.find((e) => e.name === "Paul Martin")!.key);
  });
  it("calcule les offsets absolus dans le texte de la source", () => {
    const funds = payload.relations.find((r) => r.type === "funds") as { evidence: Array<{ char_start: number; quote: string; page: number }> };
    const full = chunks[0]!.content.padEnd(100) + chunks[1]!.content;
    const ev = funds.evidence[0]!;
    expect(full.slice(ev.char_start, ev.char_start + ev.quote.length)).toBe(ev.quote);
    expect(ev.page).toBe(2);
  });
  it("distingue relation déclarée et relation déduite", () => {
    const worksFor = payload.relations.find((r) => r.type === "works_for")!;
    expect(worksFor.assertion).toBe("inferred");
    expect(worksFor.confidence).toBeLessThanOrEqual(0.6);
  });
  it("normalise la valeur des affirmations", () => {
    expect(payload.claims[0]).toMatchObject({ attribute: "founding_date", value_norm: { iso: "2015", precision: "year" } });
  });
});

describe("fenêtres d'extraction", () => {
  it("échantillonne une source trop longue sous le budget", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, ordinal: i, char_start: i * 1000, page_start: null, content: "x".repeat(1000) }));
    const windows = windowsOf(many, 9000, 50_000);
    expect(windows.flat().length).toBeLessThanOrEqual(50);
    expect(windows.every((w) => w.reduce((n, c) => n + c.content.length, 0) <= 9000)).toBe(true);
  });
});

describe("décision combinée (déterministe + LLM)", () => {
  const base = (source: string, value: string, type: Claim["value_type"]): Claim => ({
    id: source, source_id: source, subject_entity_id: "e", attribute: "ceo", attribute_label: "dirigeant", value_text: value,
    value_type: type, value_norm: {}, context: null, observed_at: null, confidence: 0.9, quote_text: value,
  });
  it("un texte divergent n'est retenu qu'avec l'avis du modèle", () => {
    const [c] = findCandidates([base("A", "Marie Durand", "person"), base("B", "Jean Petit", "person")]);
    expect(decide(c!, null)).toBeNull();
    expect(decide(c!, { i: 0, verdict: "not_contradiction", explanation: "même personne", confidence: 0.8 })).toBeNull();
    expect(decide(c!, { i: 0, verdict: "direct", explanation: "deux dirigeants", confidence: 0.9 })).toMatchObject({ kind: "direct" });
  });
  it("le modèle ne peut pas effacer un écart chiffré mesuré", () => {
    const claims = [{ ...base("A", "mars 2024", "date"), attribute: "launch_date", value_norm: { iso: "2024-03", precision: "month" } },
      { ...base("B", "septembre 2024", "date"), attribute: "launch_date", value_norm: { iso: "2024-09", precision: "month" } }];
    const [c] = findCandidates(claims);
    expect(decide(c!, null)).toMatchObject({ kind: "direct" });
    expect(decide(c!, { i: 0, verdict: "not_contradiction", explanation: "x", confidence: 0.9 })).toMatchObject({ kind: "contextual" });
  });
});

describe("job knowledge_extract", () => {
  it("ignore une source supprimée entre-temps sans appeler le modèle", async () => {
    const llm = vi.fn();
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } as unknown as SupabaseClient;
    const job = { id: "j", kind: "knowledge_extract" as const, workspace_id: "w", notebook_id: "n", target_id: "s", payload: {}, attempts: 1, max_attempts: 3, usage_id: null, cancel_requested: false };
    const res = await knowledgeExtractHandler(db, llm)(job, { progress: vi.fn(async () => {}), cancelled: vi.fn(async () => false) });
    expect(res).toEqual({ skipped: "source_absente_ou_non_prete" });
    expect(llm).not.toHaveBeenCalled();
  });
});
