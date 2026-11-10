// Citations vérifiables via OpenRouter : le modèle cite les passages fournis par leur numéro [n].
// Le serveur n'accepte QUE les numéros réellement fournis ; tout autre numéro est retiré du texte.
export type Passage = { n: number; chunk_id: string; source_id: string; source_title: string; content: string; char_start: number; char_end: number; page_start: number | null };
export type Citation = { marker: number; n: number; chunk_id: string; source_id: string; source_title: string; quote_text: string; char_start: number; char_end: number; page_start: number | null; verified: boolean };

const MARKER = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g;

/** Bloc de contexte envoyé au modèle : une balise par passage, numérotée. */
export function formatPassages(passages: Passage[]): string {
  return passages
    .map((p) => `<passage n="${p.n}" source="${p.source_title.replace(/"/g, "'")}"${p.page_start ? ` page="${p.page_start}"` : ""}>\n${p.content}\n</passage>`)
    .join("\n\n");
}

/** Phrase du passage la plus proche du texte qui la cite (chevauchement de mots), pour l'extrait affiché. */
export function bestQuote(passage: Passage, claim: string): { text: string; start: number; end: number } {
  const words = (s: string) => new Set(s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").match(/\p{L}{4,}/gu) ?? []);
  const target = words(claim);
  const re = /[^.!?…\n]+[.!?…]?/g;
  let best = { text: passage.content, start: 0, end: passage.content.length, score: -1 };
  for (let m; (m = re.exec(passage.content)); ) {
    const sentence = m[0].trim();
    if (sentence.length < 12) continue;
    let score = 0;
    for (const w of words(sentence)) if (target.has(w)) score++;
    if (score > best.score) {
      const start = m.index + m[0].indexOf(sentence);
      best = { text: sentence, start, end: start + sentence.length, score };
    }
  }
  return { text: best.text, start: best.start, end: best.end };
}

/**
 * Transforme la réponse brute : renumérote les citations dans l'ordre d'apparition [1], [2]…,
 * supprime les numéros inventés, et renvoie les citations avec offsets absolus dans la source.
 */
export function resolveCitations(answer: string, passages: Passage[]): { text: string; citations: Citation[]; dropped: number } {
  const byN = new Map(passages.map((p) => [p.n, p]));
  const markerOf = new Map<number, number>(); // n fourni → numéro affiché
  const citations: Citation[] = [];
  let dropped = 0;

  const text = answer.replace(MARKER, (_, list: string, offset: number) => {
    const before = answer.slice(Math.max(0, offset - 240), offset);
    const claim = before.split(/(?<=[.!?…])\s/).pop() ?? before;
    const shown: number[] = [];
    for (const raw of list.split(",")) {
      const n = Number(raw.trim());
      const p = byN.get(n);
      if (!p) { dropped++; continue; }
      if (!markerOf.has(n)) {
        const marker = markerOf.size + 1;
        markerOf.set(n, marker);
        const q = bestQuote(p, claim);
        citations.push({
          marker, n, chunk_id: p.chunk_id, source_id: p.source_id, source_title: p.source_title,
          quote_text: q.text, char_start: p.char_start + q.start, char_end: p.char_start + q.end, page_start: p.page_start,
          verified: p.content.slice(q.start, q.end) === q.text,
        });
      }
      shown.push(markerOf.get(n)!);
    }
    return shown.length ? shown.map((m) => `[${m}]`).join("") : "";
  });
  return { text: text.replace(/ +([.,;:!?])/g, "$1"), citations, dropped };
}
