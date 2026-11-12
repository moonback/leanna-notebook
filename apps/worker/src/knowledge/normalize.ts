// Normalisation déterministe : clés d'entités (résolution d'identité) et valeurs comparables
// (dates, montants, quantités). Aucune heuristique floue : une fusion automatique exige une clé identique.

export const ENTITY_TYPES = ["person", "organization", "company", "institution", "place", "event", "date", "product",
  "technology", "concept", "document", "project", "topic", "law", "other"] as const;

const TYPE_ALIASES: Record<string, string> = {
  personne: "person", people: "person", organisation: "organization", org: "organization", entreprise: "company",
  business: "company", lieu: "place", location: "place", country: "place", city: "place", evenement: "event",
  produit: "product", technologie: "technology", projet: "project", sujet: "topic", regulation: "law", loi: "law",
  reglementation: "law", legislation: "law",
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’`´]/g, "'").toLowerCase();

/** Type canonique (extensible : un type inconnu mais bien formé est conservé). */
export function canonicalType(raw: string): string {
  const t = fold(raw).trim().replace(/[\s-]+/g, "_").replace(/[^a-z_]/g, "");
  const mapped = TYPE_ALIASES[t] ?? t;
  return /^[a-z_]{2,30}$/.test(mapped) ? mapped : "other";
}

/** Groupe de résolution : une organisation, une entreprise et une institution peuvent désigner la même entité. */
export function typeGroup(type: string): string {
  return type === "organization" || type === "company" || type === "institution" ? "org" : type;
}

const ARTICLES = /^(?:l'|d'|le |la |les |du |de la |des |the |a |an )+/;
const ORG_DESCRIPTORS = /^(?:(?:l'|la |le )?(?:entreprise|societe|groupe|compagnie|firme|start-?up|organisation|association|company|firm|group|organization|corporation)\s+)+/;
const ORG_SUFFIXES = /[\s,]+(?:inc|incorporated|ltd|limited|llc|plc|sa|sas|sasu|sarl|gmbh|ag|nv|bv|corp|corporation|co|company|group|groupe)\.?$/;
const PERSON_TITLES = /^(?:(?:m|mr|mrs|ms|mme|mlle|dr|pr|prof|sir|dame|monsieur|madame|docteur|professeur)\.?\s+)+/;

/**
 * Clé normalisée d'un nom d'entité.
 * - Organisations : articles, descripteurs (« l'entreprise ») et suffixes juridiques retirés, espaces supprimés
 *   (« Open AI » = « OpenAI » = « l'entreprise OpenAI, Inc. »).
 * - Personnes : titres retirés, nom complet conservé (« Martin » ≠ « Paul Martin » : homonymes jamais fusionnés).
 */
export function entityKey(name: string, group: string): string {
  let s = fold(name).replace(/\s+/g, " ").trim();
  if (group === "org") {
    s = s.replace(ARTICLES, "").replace(ORG_DESCRIPTORS, "").replace(ARTICLES, "");
    for (let i = 0; i < 2; i++) s = s.replace(ORG_SUFFIXES, "");
    return s.replace(/[^a-z0-9]/g, "").slice(0, 200);
  }
  if (group === "person") s = s.replace(PERSON_TITLES, "");
  else s = s.replace(ARTICLES, "");
  return s.replace(/[^a-z0-9]+/g, " ").trim().slice(0, 200);
}

// ------------------------------------------------------------------ dates --
export type DateValue = { iso: string; precision: "day" | "month" | "quarter" | "year"; approx?: boolean };

const MONTHS: Record<string, number> = {
  janvier: 1, january: 1, jan: 1, fevrier: 2, february: 2, feb: 2, fev: 2, mars: 3, march: 3, mar: 3, avril: 4, april: 4, apr: 4, avr: 4,
  mai: 5, may: 5, juin: 6, june: 6, jun: 6, juillet: 7, july: 7, jul: 7, juil: 7, aout: 8, august: 8, aug: 8, septembre: 9, september: 9,
  sep: 9, sept: 9, octobre: 10, october: 10, oct: 10, novembre: 11, november: 11, nov: 11, decembre: 12, december: 12, dec: 12,
};
const APPROX = /\b(?:vers|environ|autour de|aux alentours de|debut|fin|mi|courant|around|about|approximately|circa|early|late|mid|c\.)\b/;
const pad = (n: number) => String(n).padStart(2, "0");
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

export function parseDate(raw: string): DateValue | null {
  const s = fold(raw).trim();
  const approx = APPROX.test(s) || undefined;
  let m: RegExpExecArray | null;
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s))) return { iso: `${m[1]}-${m[2]}-${m[3]}`, precision: "day", approx };
  if ((m = /\b(\d{4})-(\d{2})\b/.exec(s))) return { iso: `${m[1]}-${m[2]}`, precision: "month", approx };
  if ((m = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/.exec(s))) {
    const d = Number(m[1]), mo = Number(m[2]);   // convention française jj/mm/aaaa
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { iso: `${m[3]}-${pad(mo)}-${pad(d)}`, precision: "day", approx };
  }
  if ((m = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MONTH_NAMES})\\.?\\s+(\\d{4})\\b`).exec(s))) {
    return { iso: `${m[3]}-${pad(MONTHS[m[2]!]!)}-${pad(Number(m[1]))}`, precision: "day", approx };
  }
  if ((m = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`).exec(s))) {
    return { iso: `${m[3]}-${pad(MONTHS[m[1]!]!)}-${pad(Number(m[2]))}`, precision: "day", approx };
  }
  if ((m = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{4})\\b`).exec(s))) {
    return { iso: `${m[2]}-${pad(MONTHS[m[1]!]!)}`, precision: "month", approx };
  }
  if ((m = /\b(?:q|t)([1-4])\s+(\d{4})\b/.exec(s)) || (m = /\b([1-4])(?:er|e|eme|st|nd|rd|th)?\s+(?:trimestre|quarter)\s+(?:de\s+|of\s+)?(\d{4})\b/.exec(s))) {
    return { iso: `${m[2]}-Q${m[1]}`, precision: "quarter", approx };
  }
  if ((m = /\b(premier|deuxieme|second|troisieme|quatrieme|first|third|fourth)\s+(?:trimestre|quarter)\s+(?:de\s+|of\s+)?(\d{4})\b/.exec(s))) {
    const q = { premier: 1, first: 1, deuxieme: 2, second: 2, troisieme: 3, third: 3, quatrieme: 4, fourth: 4 }[m[1] as "premier"];
    return { iso: `${m[2]}-Q${q}`, precision: "quarter", approx };
  }
  if ((m = /\b(1[5-9]\d{2}|2[01]\d{2})\b/.exec(s))) return { iso: m[1]!, precision: "year", approx };
  return null;
}

const RANK = { year: 0, quarter: 1, month: 2, day: 3 } as const;
function truncate(d: DateValue, to: DateValue["precision"]): string {
  const y = d.iso.slice(0, 4);
  if (to === "year") return y;
  if (to === "quarter") return d.precision === "quarter" ? d.iso : `${y}-Q${Math.ceil(Number(d.iso.slice(5, 7)) / 3)}`;
  if (to === "month") return d.iso.slice(0, 7);
  return d.iso;
}

/** Deux dates sont compatibles si elles coïncident à la précision la plus grossière des deux. */
export function sameDate(a: DateValue, b: DateValue): boolean {
  const coarse = RANK[a.precision] <= RANK[b.precision] ? a.precision : b.precision;
  return truncate(a, coarse) === truncate(b, coarse);
}

// ---------------------------------------------------------- nombres/unités --
export type AmountValue = { value: number; currency: string | null; approx?: boolean };
export type QuantityValue = { value: number; unit: string; approx?: boolean };

const CURRENCIES: Array<[RegExp, string]> = [
  [/€|\beur\b|\beuros?\b/, "EUR"], [/\$|\busd\b|\bdollars?\b/, "USD"], [/£|\bgbp\b|\blivres? sterling\b|\bpounds?\b/, "GBP"],
  [/¥|\bjpy\b|\byens?\b/, "JPY"], [/\bchf\b|\bfrancs? suisses?\b/, "CHF"], [/\bcny\b|\byuans?\b|\brmb\b/, "CNY"],
];
// « billion » est lu au sens anglais (10⁹) ; le français « milliard » est explicite.
const MULTIPLIERS: Array<[RegExp, number]> = [
  [/^(?:trillions?|tn)\b/, 1e12], [/^(?:milliards?|mds?|mrds?|billions?|bn|b)\b/, 1e9], [/^(?:millions?|mio|mn|m)\b/, 1e6],
  [/^(?:mille|milliers?|thousands?|k)\b/, 1e3],
];
const IMPRECISE = /~|≈|plus de|moins de|pres de|more than|less than|over|under|nearly|almost/;

/** Lit un nombre écrit à la française ou à l'anglaise : « 1,5 », « 2 300 000 », « 2,300,000 », « 1.234,5 ». */
export function parseNumber(raw: string): { value: number; rest: string } | null {
  const m = /(-?\d[\d\s  .,']*)/.exec(raw);
  if (!m) return null;
  let t = m[1]!.replace(/[\s  ']/g, "").replace(/[.,]+$/, "");
  const lastComma = t.lastIndexOf(","), lastDot = t.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    t = t.split(dec === "," ? "." : ",").join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const value = Number(t);
  if (!Number.isFinite(value)) return null;
  return { value, rest: raw.slice(m.index + m[0].length) };
}

// Pour une quantité, « 5 m » est une unité (mètre), pas un multiplicateur : seules les formes longues comptent.
const LONG_MULTIPLIERS = MULTIPLIERS.map(([re, mult]) => [new RegExp(re.source.replace(/\|(?:tn|bn|b|mn|m|k)(?=[|)])/g, "")), mult] as [RegExp, number]);

function scaled(s: string, multipliers = MULTIPLIERS): { value: number; rest: string } | null {
  const n = parseNumber(s);
  if (!n) return null;
  let rest = n.rest.trim();
  let value = n.value;
  for (const [re, mult] of multipliers) {
    const mm = re.exec(rest);
    if (mm) { value *= mult; rest = rest.slice(mm[0].length).trim(); break; }
  }
  return { value, rest: rest.replace(/^(?:d'|de |of )/, "") };
}

export function parseAmount(raw: string): AmountValue | null {
  const s = fold(raw);
  const n = scaled(s);
  if (!n) return null;
  const currency = CURRENCIES.find(([re]) => re.test(s))?.[1] ?? null;
  return { value: n.value, currency, approx: APPROX.test(s) || IMPRECISE.test(s) || undefined };
}

export function parseQuantity(raw: string): QuantityValue | null {
  const s = fold(raw);
  const n = scaled(s, LONG_MULTIPLIERS);
  if (!n) return null;
  const unit = n.rest.replace(/[^a-z%°0-9 ]/g, " ").trim().split(/\s+/)[0]?.replace(/s$/, "") ?? "";
  return { value: n.value, unit: unit || "unite", approx: APPROX.test(s) || IMPRECISE.test(s) || undefined };
}

export type ValueType = "date" | "amount" | "quantity" | "place" | "person" | "organization" | "text";

/** Valeur normalisée stockée dans knowledge_claims.value_norm. `{}` si la valeur n'est pas interprétable. */
export function normalizeValue(type: ValueType, raw: string): Record<string, unknown> {
  if (type === "date") return parseDate(raw) ?? {};
  if (type === "amount") return parseAmount(raw) ?? {};
  if (type === "quantity") return parseQuantity(raw) ?? {};
  const group = type === "organization" ? "org" : type === "person" ? "person" : "text";
  return { key: entityKey(raw, group) };
}
