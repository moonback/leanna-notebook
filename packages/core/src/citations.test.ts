import { describe, expect, it } from "vitest";
import { bestQuote, formatPassages, resolveCitations, type Passage } from "./citations.ts";

const source = "Introduction. Le protocole DMX pilote jusqu'à 512 canaux par univers. Art-Net transporte le DMX sur Ethernet.";
const p = (n: number, start: number, end: number, id = `c${n}`): Passage => ({
  n, chunk_id: id, source_id: "s1", source_title: "guide.pdf", content: source.slice(start, end), char_start: start, char_end: end, page_start: 2,
});
const passages = [p(1, 0, 70), p(2, 70, source.length)];

describe("resolveCitations", () => {
  it("renumérote dans l'ordre d'apparition et calcule les offsets absolus", () => {
    const r = resolveCitations("Art-Net passe par Ethernet [2]. Un univers DMX compte 512 canaux [1].", passages);
    expect(r.text).toBe("Art-Net passe par Ethernet [1]. Un univers DMX compte 512 canaux [2].");
    expect(r.citations.map((c) => [c.marker, c.chunk_id])).toEqual([[1, "c2"], [2, "c1"]]);
    for (const c of r.citations) {
      expect(source.slice(c.char_start, c.char_end)).toBe(c.quote_text);
      expect(c.verified).toBe(true);
    }
    expect(r.citations[1].quote_text).toMatch(/512 canaux/);
  });

  it("supprime les numéros inventés et compte les rejets", () => {
    const r = resolveCitations("Affirmation sans source [7]. Autre [1, 9].", passages);
    expect(r.text).toBe("Affirmation sans source. Autre [1].");
    expect(r.dropped).toBe(2);
    expect(r.citations).toHaveLength(1);
  });

  it("réutilise le même numéro pour un passage cité deux fois", () => {
    const r = resolveCitations("A [1]. B [1].", passages);
    expect(r.text).toBe("A [1]. B [1].");
    expect(r.citations).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("formatPassages numérote et échappe les guillemets", () => {
    expect(formatPassages([{ ...passages[0], source_title: 'le "guide"' }])).toContain(`<passage n="1" source="le 'guide'" page="2">`);
  });
  it("bestQuote choisit la phrase la plus proche", () => {
    expect(bestQuote(passages[0], "combien de canaux dans un univers ?").text).toMatch(/512 canaux/);
  });
});
