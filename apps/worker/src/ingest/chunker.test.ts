import { describe, expect, it } from "vitest";
import { chunk, normalize } from "./chunker.ts";

const para = (n: number) => Array.from({ length: n }, (_, i) => `Phrase numéro ${i} sur l'éclairage scénique et le protocole DMX.`).join(" ");

describe("normalize", () => {
  it("unifie fins de ligne et espaces, garde les paragraphes", () => {
    expect(normalize("a\r\n\r\n\r\nb  \t c d")).toBe("a\n\nb c d");
  });
});

describe("chunk", () => {
  const text = normalize([para(30), para(30), para(5)].join("\n\n"));
  const chunks = chunk(text, { maxChars: 800, overlapChars: 150, pageStarts: [0, 1500] });

  it("respecte l'invariant d'offset (base des citations)", () => {
    for (const c of chunks) expect(text.slice(c.char_start, c.char_end)).toBe(c.content);
  });
  it("couvre tout le texte, sans dépasser la taille, dans l'ordre", () => {
    expect(chunks[0].char_start).toBe(0);
    expect(chunks.at(-1)!.char_end).toBe(text.length);
    for (const [i, c] of chunks.entries()) {
      expect(c.content.length).toBeLessThanOrEqual(800);
      expect(c.ordinal).toBe(i);
      if (i) expect(c.char_start).toBeLessThanOrEqual(chunks[i - 1].char_end); // chevauchement ou contigu
    }
  });
  it("ne coupe pas au milieu d'une phrase", () => {
    for (const c of chunks.slice(0, -1)) expect(c.content).toMatch(/[.!?…]$/);
  });
  it("renseigne la page", () => {
    expect(chunks[0].page_start).toBe(1);
    expect(chunks.at(-1)!.page_start).toBe(2);
  });
  it("associe les horodatages audio aux chunks qui recouvrent chaque segment", () => {
    const transcript = "Bonjour tout le monde.\\n\\nBienvenue dans ce cours.";
    const timed = chunk(transcript, { maxChars: 30, overlapChars: 0, timeRanges: [
      { char_start: 0, char_end: 22, start_ms: 420, end_ms: 1800 },
      { char_start: 24, char_end: transcript.length, start_ms: 2000, end_ms: 3250 },
    ] });
    expect(timed[0]).toMatchObject({ time_start_ms: 420, time_end_ms: 1800 });
    expect(timed.at(-1)).toMatchObject({ time_start_ms: 2000, time_end_ms: 3250 });
  });
  it("gère texte vide et phrase géante", () => {
    expect(chunk("")).toEqual([]);
    const huge = "x".repeat(2000);
    const c = chunk(huge, { maxChars: 800 });
    expect(c.map((x) => x.content).join("")).toBe(huge);
  });
});
