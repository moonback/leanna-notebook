// Provenance : un passage n'est accepté que s'il est retrouvé tel quel (aux espaces, guillemets et casse près)
// dans le texte réellement extrait. On renvoie alors les offsets EXACTS du texte d'origine.

const canon = (ch: string) => {
  if (/\s/.test(ch)) return " ";
  if ("’‘`´ʼ".includes(ch)) return "'";
  if ("“”«»„".includes(ch)) return "\"";
  if ("–—‑".includes(ch)) return "-";
  return ch.toLowerCase();
};

/** Version canonique d'un texte + table de correspondance index canonique → index d'origine. */
function canonical(text: string): { s: string; map: number[] } {
  let s = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = canon(text[i]!);
    if (c === " " && (s.endsWith(" ") || s.length === 0)) continue;   // espaces fusionnés
    s += c;
    map.push(i);
  }
  return { s, map };
}

/** Position exacte de `quote` dans `text`, ou null si le passage n'y figure pas. */
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim().replace(/^["'«“\s]+|["'»”\s]+$/g, "").replace(/\s*(?:\.\.\.|…)\s*$/, "");
  if (q.length < 8) return null;   // trop court pour prouver quoi que ce soit
  const direct = text.indexOf(q);
  if (direct >= 0) return { start: direct, end: direct + q.length };
  const t = canonical(text), c = canonical(q).s.trim();
  const at = t.s.indexOf(c);
  if (at < 0) return null;
  return { start: t.map[at]!, end: t.map[at + c.length - 1]! + 1 };
}

/** Phrase (≤ 400 caractères) entourant une occurrence : extrait lisible pour une mention d'entité. */
export function sentenceAround(text: string, start: number, end: number): { start: number; end: number } {
  let s = start, e = end;
  while (s > 0 && start - s < 200 && !/[.!?\n]/.test(text[s - 1]!)) s--;
  while (e < text.length && e - end < 200 && !/[.!?\n]/.test(text[e]!)) e++;
  if (e < text.length && /[.!?]/.test(text[e]!)) e++;
  while (s < e && /\s/.test(text[s]!)) s++;
  return { start: s, end: e };
}

/** Occurrences (mot entier, sans accents ni casse) d'un nom dans un texte. */
export function findOccurrences(text: string, name: string, max = 3): Array<{ start: number; end: number }> {
  const fold = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const folded = fold(text);
  const needle = fold(name.trim());
  // NFD peut allonger le texte : on ne garde que les textes dont la longueur est stable (cas courant), sinon recherche simple
  const source = folded.length === text.length ? folded : text.toLowerCase();
  const target = folded.length === text.length ? needle : name.trim().toLowerCase();
  if (target.length < 2) return [];
  const out: Array<{ start: number; end: number }> = [];
  for (let i = source.indexOf(target); i >= 0 && out.length < max; i = source.indexOf(target, i + target.length)) {
    const before = source[i - 1], after = source[i + target.length];
    if ((before && /[\p{L}\p{N}]/u.test(before)) || (after && /[\p{L}\p{N}]/u.test(after))) continue;
    out.push({ start: i, end: i + target.length });
  }
  return out;
}
