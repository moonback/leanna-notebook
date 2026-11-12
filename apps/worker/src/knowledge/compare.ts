import { createHash } from "node:crypto";
import { entityKey, parseDate, sameDate, type AmountValue, type DateValue, type QuantityValue, type ValueType } from "./normalize.ts";

// Première passe, sans LLM : quelles paires d'affirmations sont incompatibles sur leurs VALEURS NORMALISÉES ?
// Le LLM ne fait ensuite que qualifier les candidats (direct, contexte, obsolète…), jamais les découvrir seul.

export type Claim = {
  id: string; source_id: string; subject_entity_id: string; attribute: string; attribute_label: string;
  value_text: string; value_type: ValueType; value_norm: Record<string, unknown>; context: string | null;
  observed_at: string | null; confidence: number; quote_text: string;
};
export type Kind = "direct" | "divergence" | "contextual" | "obsolete" | "insufficient";
export type Category = "date" | "amount" | "quantity" | "location" | "responsibility" | "statement" | "chronology" | "factual" | "obsolete" | "version";
export type Candidate = {
  a: Claim; b: Claim; kind: Kind; category: Category; confidence: number; reason: string; fingerprint: string;
  /** Les valeurs non numériques (texte libre) doivent être confirmées par le LLM avant d'être retenues. */
  needsLlm: boolean;
};

type Verdict = { relation: "same" | "different" | "incomparable"; approx: boolean; detail: string };

const REL_TOLERANCE = 0.005;      // 0,5 % : arrondis de présentation
const APPROX_TOLERANCE = 0.15;    // une valeur « environ » couvre ±15 %

function compareNumbers(x: number, y: number, approx: boolean): "same" | "different" {
  const tolerance = approx ? APPROX_TOLERANCE : REL_TOLERANCE;
  const scale = Math.max(Math.abs(x), Math.abs(y), 1e-9);
  return Math.abs(x - y) / scale <= tolerance ? "same" : "different";
}

/** Compare deux valeurs de même type. Exporté pour les tests. */
export function compareValues(a: Claim, b: Claim): Verdict {
  if (a.value_type !== b.value_type) return { relation: "incomparable", approx: false, detail: "types différents" };
  const na = a.value_norm, nb = b.value_norm;
  switch (a.value_type) {
    case "date": {
      const da = (na.iso ? na : parseDate(a.value_text)) as DateValue | null;
      const db = (nb.iso ? nb : parseDate(b.value_text)) as DateValue | null;
      if (!da?.iso || !db?.iso) return { relation: "incomparable", approx: false, detail: "date non interprétable" };
      const approx = Boolean(da.approx || db.approx);
      return { relation: sameDate(da, db) ? "same" : "different", approx, detail: `${da.iso} / ${db.iso}` };
    }
    case "amount": {
      const x = na as AmountValue, y = nb as AmountValue;
      if (typeof x.value !== "number" || typeof y.value !== "number") return { relation: "incomparable", approx: false, detail: "montant non interprétable" };
      if (x.currency && y.currency && x.currency !== y.currency) return { relation: "incomparable", approx: false, detail: "devises différentes" };
      const approx = Boolean(x.approx || y.approx);
      return { relation: compareNumbers(x.value, y.value, approx), approx, detail: `${x.value} ${x.currency ?? ""} / ${y.value} ${y.currency ?? ""}`.trim() };
    }
    case "quantity": {
      const x = na as QuantityValue, y = nb as QuantityValue;
      if (typeof x.value !== "number" || typeof y.value !== "number") return { relation: "incomparable", approx: false, detail: "quantité non interprétable" };
      if (x.unit !== y.unit) return { relation: "incomparable", approx: false, detail: "unités différentes" };
      const approx = Boolean(x.approx || y.approx);
      return { relation: compareNumbers(x.value, y.value, approx), approx, detail: `${x.value} ${x.unit} / ${y.value} ${y.unit}` };
    }
    default: {
      const group = a.value_type === "organization" ? "org" : a.value_type === "person" ? "person" : "text";
      const ka = (na.key as string | undefined) ?? entityKey(a.value_text, group);
      const kb = (nb.key as string | undefined) ?? entityKey(b.value_text, group);
      if (!ka || !kb) return { relation: "incomparable", approx: false, detail: "valeur vide" };
      return { relation: ka === kb ? "same" : "different", approx: false, detail: `${a.value_text} / ${b.value_text}` };
    }
  }
}

const CATEGORY: Record<ValueType, Category> = {
  date: "date", amount: "amount", quantity: "quantity", place: "location", person: "responsibility", organization: "responsibility", text: "statement",
};
const contextKey = (s: string | null) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Empreinte stable d'une paire : indépendante des ids (régénérés à chaque ré-extraction) et de l'ordre. */
export function fingerprint(a: Claim, b: Claim): string {
  const side = (c: Claim) => `${c.source_id}|${JSON.stringify(c.value_norm)}|${c.value_text.toLowerCase().trim()}`;
  const [x, y] = [side(a), side(b)].sort();
  return createHash("sha256").update(`${a.subject_entity_id}|${a.attribute}|${x}|${y}`).digest("hex").slice(0, 40);
}

/** Classement déterministe d'une paire dont les valeurs diffèrent. */
export function classify(a: Claim, b: Claim, verdict: Verdict): Omit<Candidate, "a" | "b" | "fingerprint"> {
  const category = CATEGORY[a.value_type];
  const numeric = a.value_type === "date" || a.value_type === "amount" || a.value_type === "quantity";
  const ca = contextKey(a.context), cb = contextKey(b.context);
  if (ca && cb && ca !== cb) {
    return { kind: "contextual", category, confidence: 0.55, needsLlm: true,
      reason: `Valeurs différentes (${verdict.detail}) mais dans des contextes différents : « ${a.context} » / « ${b.context} ».` };
  }
  const oa = a.observed_at ? parseDate(a.observed_at) : null, ob = b.observed_at ? parseDate(b.observed_at) : null;
  if (oa && ob && !sameDate(oa, ob)) {
    return { kind: "obsolete", category: "version", confidence: 0.6, needsLlm: !numeric,
      reason: `Valeurs différentes (${verdict.detail}) relevées à des dates différentes (${oa.iso} / ${ob.iso}) : l'une peut remplacer l'autre.` };
  }
  if (verdict.approx || Math.min(a.confidence, b.confidence) < 0.4) {
    return { kind: "insufficient", category, confidence: 0.45, needsLlm: !numeric,
      reason: `Valeurs différentes (${verdict.detail}) mais au moins l'une est approximative ou peu étayée.` };
  }
  return numeric
    ? { kind: "direct", category, confidence: 0.85, needsLlm: false, reason: `Valeurs incompatibles pour « ${a.attribute_label} » : ${verdict.detail}.` }
    : { kind: "divergence", category, confidence: 0.5, needsLlm: true, reason: `Les sources divergent sur « ${a.attribute_label} » : ${verdict.detail}.` };
}

/**
 * Regroupe les affirmations par (entité, attribut) et compare chaque paire issue de SOURCES DIFFÉRENTES.
 * Deux affirmations d'un même document ne sont pas opposées (souvent une reformulation).
 */
export function findCandidates(claims: Claim[], maxPerGroup = 12): Candidate[] {
  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
    const k = `${c.subject_entity_id}|${c.attribute}`;
    const g = groups.get(k);
    if (g) g.push(c); else groups.set(k, [c]);
  }
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const group of groups.values()) {
    if (new Set(group.map((c) => c.source_id)).size < 2) continue;
    const capped = group.slice().sort((x, y) => y.confidence - x.confidence).slice(0, maxPerGroup);
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        const a = capped[i]!, b = capped[j]!;
        if (a.source_id === b.source_id) continue;
        const verdict = compareValues(a, b);
        if (verdict.relation !== "different") continue;
        const fp = fingerprint(a, b);
        if (seen.has(fp)) continue;
        seen.add(fp);
        out.push({ a, b, fingerprint: fp, ...classify(a, b, verdict) });
      }
    }
  }
  return out;
}
