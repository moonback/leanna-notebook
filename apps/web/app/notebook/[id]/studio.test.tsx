import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cardsToCsv, Markdown } from "./studio";

describe("export CSV des fiches", () => {
  it("échappe guillemets, virgules et retours à la ligne ; BOM pour Excel", () => {
    const csv = cardsToCsv([{ key: "c0", front: 'Le "DMX", c’est ?', back: "512 canaux\npar univers" }]);
    expect(csv.startsWith("﻿Recto,Verso\r\n")).toBe(true);
    expect(csv).toContain('"Le ""DMX"", c’est ?","512 canaux\npar univers"');
  });
});

const cite = { marker: 1, source_id: "s1", quote_text: "Le DMX", char_start: 0, char_end: 6, verified: true };
const render = (text: string) => renderToStaticMarkup(<Markdown text={text} citations={[cite]} sourceTitle={() => "Guide"} />);

describe("Markdown du rapport", () => {
  it("n'interprète jamais le HTML du modèle", () => {
    const html = render("<img src=x onerror=alert(1)> texte");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("titres, listes, gras et pastille pour une citation connue ; numéro inconnu retiré", () => {
    const html = render("## Titre\n- point **fort** [1]\n- autre [7]");
    expect(html).toContain("<h3");
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain("<strong>fort</strong>");
    expect(html).not.toContain("[7]");
    expect(html).not.toContain("[1]");
  });
});
