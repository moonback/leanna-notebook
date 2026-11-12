import { describe, expect, it } from "vitest";
import { parseOcrPages } from "./extract.ts";

describe("parseOcrPages", () => {
  it("preserves page boundaries and offsets for PDF citations", () => {
    expect(parseOcrPages("[PAGE 1]\nPremière page\n[PAGE 2]\nDeuxième page", 2)).toEqual({
      text: "Première page\n\nDeuxième page",
      pageStarts: [0, 16],
      pageCount: 2,
    });
  });

  it("accepts a provider response without page markers as a single text segment", () => {
    expect(parseOcrPages("  Texte reconnu  ", 4)).toEqual({
      text: "Texte reconnu", pageStarts: [0], pageCount: 4,
    });
  });

  it("rejects an empty OCR result", () => {
    expect(() => parseOcrPages("[PAGE 1]\n   ", 1)).toThrowError();
  });
});
