import { describe, expect, it } from "vitest";
import { findCandidates, fingerprint, type Claim } from "./compare.ts";
import { canonicalType, entityKey, normalizeValue, parseAmount, parseDate, parseQuantity, typeGroup, type ValueType } from "./normalize.ts";

let seq = 0;
const claim = (source: string, type: ValueType, value: string, extra: Partial<Claim> = {}): Claim => ({
  id: `c${++seq}`, source_id: source, subject_entity_id: "projet-x", attribute: "launch_date", attribute_label: "date de lancement",
  value_text: value, value_type: type, value_norm: normalizeValue(type, value), context: null, observed_at: null, confidence: 0.9,
  quote_text: `… ${value} …`, ...extra,
});

describe("résolution d'identité", () => {
  it("rapproche les variantes d'une organisation", () => {
    const k = (s: string) => entityKey(s, "org");
    expect(k("OpenAI")).toBe("openai");
    expect(k("Open AI")).toBe("openai");
    expect(k("l'entreprise OpenAI")).toBe("openai");
    expect(k("OpenAI, Inc.")).toBe("openai");
    expect(k("La Société Générale SA")).toBe(k("Société Générale"));
  });
  it("ne fusionne jamais des personnes sur un nom partiel (homonymes)", () => {
    expect(entityKey("Paul Martin", "person")).not.toBe(entityKey("Martin", "person"));
    expect(entityKey("Dr. Paul Martin", "person")).toBe(entityKey("Paul Martin", "person"));
    expect(entityKey("Paul Martin", "person")).not.toBe(entityKey("Pierre Martin", "person"));
  });
  it("normalise les types et regroupe les organisations", () => {
    expect(canonicalType("Entreprise")).toBe("company");
    expect(canonicalType("Loi")).toBe("law");
    expect(canonicalType("satellite")).toBe("satellite");   // extensible
    expect(typeGroup("company")).toBe(typeGroup("institution"));
    expect(typeGroup("person")).toBe("person");
  });
});

describe("normalisation des valeurs", () => {
  it("lit les dates françaises et anglaises avec leur précision", () => {
    expect(parseDate("15 mars 2024")).toEqual({ iso: "2024-03-15", precision: "day" });
    expect(parseDate("March 15, 2024")).toEqual({ iso: "2024-03-15", precision: "day" });
    expect(parseDate("en septembre 2024")).toEqual({ iso: "2024-09", precision: "month" });
    expect(parseDate("T2 2023")).toEqual({ iso: "2023-Q2", precision: "quarter" });
    expect(parseDate("premier trimestre 2024")).toEqual({ iso: "2024-Q1", precision: "quarter" });
    expect(parseDate("03/04/2024")).toEqual({ iso: "2024-04-03", precision: "day" });
    expect(parseDate("vers 2019")).toEqual({ iso: "2019", precision: "year", approx: true });
    expect(parseDate("sans date")).toBeNull();
  });
  it("lit les montants avec multiplicateurs et devises", () => {
    expect(parseAmount("1,5 million d'euros")).toMatchObject({ value: 1_500_000, currency: "EUR" });
    expect(parseAmount("1 500 000 €")).toMatchObject({ value: 1_500_000, currency: "EUR" });
    expect(parseAmount("$2.3bn")).toMatchObject({ value: 2_300_000_000, currency: "USD" });
    expect(parseAmount("2,300,000 dollars")).toMatchObject({ value: 2_300_000, currency: "USD" });
    expect(parseAmount("environ 40 M€")).toMatchObject({ value: 40_000_000, currency: "EUR", approx: true });
  });
  it("distingue unité et multiplicateur dans les quantités", () => {
    expect(parseQuantity("5 m")).toMatchObject({ value: 5, unit: "m" });
    expect(parseQuantity("3 millions d'habitants")).toMatchObject({ value: 3_000_000, unit: "habitant" });
    expect(parseQuantity("120 salariés")).toMatchObject({ value: 120, unit: "salarie" });
  });
});

describe("détection des contradictions — jeux déterministes", () => {
  it("1. deux documents confirmant la même date : aucune contradiction", () => {
    expect(findCandidates([claim("A", "date", "mars 2024"), claim("B", "date", "15 mars 2024")])).toEqual([]);
  });
  it("2. deux dates incompatibles : contradiction directe de date", () => {
    const [c, ...rest] = findCandidates([claim("A", "date", "mars 2024"), claim("B", "date", "septembre 2024")]);
    expect(rest).toHaveLength(0);
    expect(c).toMatchObject({ kind: "direct", category: "date", needsLlm: false });
  });
  it("3. deux montants différents pour une même opération : contradiction directe de montant", () => {
    const amounts = [
      claim("A", "amount", "12 millions d'euros", { attribute: "funding", attribute_label: "levée de fonds" }),
      claim("B", "amount", "18 M€", { attribute: "funding", attribute_label: "levée de fonds" }),
    ];
    expect(findCandidates(amounts)).toEqual([expect.objectContaining({ kind: "direct", category: "amount" })]);
  });
  it("faux positif évité : même montant écrit différemment", () => {
    const amounts = [
      claim("A", "amount", "1,5 million d'euros", { attribute: "funding" }),
      claim("B", "amount", "1 500 000 €", { attribute: "funding" }),
    ];
    expect(findCandidates(amounts)).toEqual([]);
  });
  it("4. affirmations opposées dans des contextes différents : incompatibilité contextuelle", () => {
    const [c] = findCandidates([
      claim("A", "quantity", "120 salariés", { attribute: "headcount", context: "en France" }),
      claim("B", "quantity", "450 salariés", { attribute: "headcount", context: "dans le monde" }),
    ]);
    expect(c).toMatchObject({ kind: "contextual", needsLlm: true });
  });
  it("5. ancienne information remplacée par une nouvelle : information obsolète", () => {
    const [c] = findCandidates([
      claim("A", "quantity", "120 salariés", { attribute: "headcount", observed_at: "2021" }),
      claim("B", "quantity", "300 salariés", { attribute: "headcount", observed_at: "2024" }),
    ]);
    expect(c).toMatchObject({ kind: "obsolete", category: "version" });
  });
  it("6. information insuffisamment documentée : valeur approximative", () => {
    const [c] = findCandidates([
      claim("A", "amount", "environ 10 M€", { attribute: "budget" }),
      claim("B", "amount", "13 M€", { attribute: "budget" }),
    ]);
    expect(c).toMatchObject({ kind: "insufficient" });
  });
  it("faux négatif évité : texte divergent confié au LLM, pas ignoré", () => {
    const [c] = findCandidates([
      claim("A", "person", "Marie Durand", { attribute: "ceo", attribute_label: "dirigeant" }),
      claim("B", "person", "Jean Petit", { attribute: "ceo", attribute_label: "dirigeant" }),
    ]);
    expect(c).toMatchObject({ kind: "divergence", category: "responsibility", needsLlm: true });
  });
  it("ignore les paires d'un même document et les attributs différents", () => {
    expect(findCandidates([claim("A", "date", "mars 2024"), claim("A", "date", "mai 2024")])).toEqual([]);
    expect(findCandidates([claim("A", "date", "mars 2024"), claim("B", "date", "mai 2024", { attribute: "end_date" })])).toEqual([]);
  });
  it("produit une empreinte stable, indépendante de l'ordre et des ids", () => {
    const a = claim("A", "date", "mars 2024"), b = claim("B", "date", "mai 2024");
    expect(fingerprint(a, b)).toBe(fingerprint({ ...b, id: "x" }, { ...a, id: "y" }));
  });
});
