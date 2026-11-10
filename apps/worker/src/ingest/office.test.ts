import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { fromEpub, fromPptx, readZip } from "./office.ts";
import { PermanentError } from "../worker.ts";

const slide = (...paras: string[]) => `<p:sld><p:txBody>${paras.map((p) => `<a:p><a:r><a:t>${p}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sld>`;

describe("fromPptx", () => {
  const buf = zipSync({
    "ppt/slides/slide2.xml": strToU8(slide("Deuxième", "Art-Net &amp; sACN")),
    "ppt/slides/slide10.xml": strToU8(slide("Dixième")),
    "ppt/slides/slide1.xml": strToU8(slide("Titre du deck")),
    "ppt/notesSlides/notesSlide1.xml": strToU8(slide("Note orale")),
    "ppt/media/image1.png": new Uint8Array(10),
  });
  const r = fromPptx(buf);
  it("respecte l'ordre numérique des diapositives et décode les entités", () => {
    expect(r.pageCount).toBe(3);
    expect(r.text.indexOf("Titre du deck")).toBeLessThan(r.text.indexOf("Deuxième"));
    expect(r.text.indexOf("Deuxième")).toBeLessThan(r.text.indexOf("Dixième"));
    expect(r.text).toContain("Art-Net & sACN");
    expect(r.text).toContain("Notes : Note orale");
  });
  it("renseigne le début de chaque diapositive", () => {
    expect(r.text.slice(r.pageStarts[1])).toMatch(/^Diapositive 2/);
  });
});

describe("fromEpub", () => {
  it("lit les chapitres dans l'ordre du spine", () => {
    const buf = zipSync({
      "META-INF/container.xml": strToU8(`<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`),
      "OEBPS/content.opf": strToU8(`<package><metadata><dc:title>Guide lumière</dc:title></metadata><manifest><item id="c2" href="ch2.xhtml"/><item id="c1" href="ch1.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`),
      "OEBPS/ch1.xhtml": strToU8(`<html><body><h1>Chapitre 1</h1><p>Le DMX.</p></body></html>`),
      "OEBPS/ch2.xhtml": strToU8(`<html><body><h1>Chapitre 2</h1><p>Art-Net.</p></body></html>`),
    });
    const r = fromEpub(buf);
    expect(r.title).toBe("Guide lumière");
    expect(r.text.indexOf("Chapitre 1")).toBeLessThan(r.text.indexOf("Chapitre 2"));
  });
});

describe("readZip", () => {
  it("refuse une archive invalide", () => {
    expect(() => readZip(new Uint8Array([1, 2, 3]), () => true)).toThrow(PermanentError);
  });
  it("refuse une archive qui dépasse le plafond décompressé (zip bomb)", () => {
    const big = new Uint8Array(2 * 1024 * 1024); // 2 Mo de zéros : quelques Ko compressés
    const buf = zipSync({ "a.bin": big }, { level: 9 });
    expect(buf.length).toBeLessThan(20_000); // taux de compression d'une bombe
    try { readZip(buf, () => false, 1024 * 1024); throw new Error("devait échouer"); }
    catch (e) { expect((e as PermanentError).code).toBe("archive_too_large"); }
  });
});
