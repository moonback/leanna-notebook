/** Normalisation unique du texte extrait : c'est la base de tous les offsets de citation. */
export function normalize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type Chunk = { ordinal: number; content: string; char_start: number; char_end: number; page_start: number | null; token_count: number; time_start_ms?: number; time_end_ms?: number };

/** Estimation de tokens sans tokenizer (≈ 4 caractères par token, prudent pour le français). */
export const estimateTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

/**
 * Découpe par paragraphes regroupés jusqu'à ~maxChars, avec chevauchement, sans couper une phrase.
 * Invariant : text.slice(c.char_start, c.char_end) === c.content (vérifié par les tests).
 * `pageStarts` : offset de début de chaque page (PDF) pour renseigner page_start.
 */
export type ChunkTimeRange = { char_start: number; char_end: number; start_ms: number; end_ms: number };

export function chunk(text: string, { maxChars = 1600, overlapChars = 240, pageStarts = [] as number[], timeRanges = [] as ChunkTimeRange[] } = {}): Chunk[] {
  if (!text) return [];
  // bornes de phrases/paragraphes : positions où l'on a le droit de couper
  const cuts: number[] = [0];
  const re = /(?<=[.!?…])\s+|\n+/g;
  for (let m; (m = re.exec(text)); ) cuts.push(m.index + m[0].length);
  cuts.push(text.length);

  const out: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start;
    for (const c of cuts) if (c > start && c - start <= maxChars) end = c;
    if (end === start) end = Math.min(text.length, start + maxChars); // phrase géante : coupe dure
    // on retire les blancs de bord sans casser l'invariant
    let s = start, e = end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) {
      const content = text.slice(s, e);
      let page: number | null = null;
      for (let p = 0; p < pageStarts.length; p++) if (pageStarts[p] <= s) page = p + 1;
      const overlapping = timeRanges.filter((r) => r.char_end > s && r.char_start < e);
      out.push({ ordinal: out.length, content, char_start: s, char_end: e, page_start: page, token_count: estimateTokens(content),
        ...(overlapping.length ? { time_start_ms: Math.min(...overlapping.map((r) => r.start_ms)), time_end_ms: Math.max(...overlapping.map((r) => r.end_ms)) } : {}) });
    }
    if (end >= text.length) break;
    // chevauchement : on repart sur une borne de phrase située ~overlapChars avant la fin
    let next = end;
    for (const c of cuts) if (c > start && c < end && end - c <= overlapChars) { next = c; break; }
    start = next > start ? next : end;
  }
  return out;
}
