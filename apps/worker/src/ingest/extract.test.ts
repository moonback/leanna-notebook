import { describe, expect, it } from "vitest";
import { formatPdfPage } from "./extract.ts";

describe("formatPdfPage", () => {
  it("reconstruit les espaces et les lignes depuis les coordonnées PDF", () => {
    const items = [
      { str: "Leanna", transform: [1, 0, 0, 1, 10, 100], width: 30 },
      { str: "Notebook", transform: [1, 0, 0, 1, 43, 100], width: 40, hasEOL: true },
      { str: "Deuxième", transform: [1, 0, 0, 1, 10, 80], width: 40 },
      { str: "ligne", transform: [1, 0, 0, 1, 53, 80], width: 20 },
    ];
    expect(formatPdfPage(items)).toBe("Leanna Notebook\\nDeuxième ligne");
  });

  it("ne crée pas d'espace entre deux fragments contigus", () => {
    expect(formatPdfPage([
      { str: "ABC", transform: [1, 0, 0, 1, 0, 100], width: 20 },
      { str: "123", transform: [1, 0, 0, 1, 20, 100], width: 20 },
    ])).toBe("ABC123");
  });

  it("ignore les éléments vides et les pages sans texte", () => {
    expect(formatPdfPage([{ str: "" }, { str: "   " }])).toBe("");
  });
});
