const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanText, segmentText, boundSegments, buildPageContent, unavailablePage, extractPage, AI_CONTEXT_CHARS,
} = require("../dist/browser/browser-extract.js");

test("nettoyage : contrôles, caractères invisibles et blancs superflus retirés", () => {
  const raw = "Titre​‮ caché\r\n\r\n\r\n\r\nLigne   avec\tblancs insécables \n fin\u0000\u0007";
  assert.equal(cleanText(raw), "Titre caché\n\nLigne avec blancs insécables\nfin");
});

test("segmentation : segments bornés, aucun texte perdu", () => {
  const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraphe ${i} ` + "mot ".repeat(60).trim());
  const segments = segmentText(paragraphs.join("\n\n"), 500);
  assert.ok(segments.length > 10);
  assert.ok(segments.every((segment) => segment.length <= 500));
  assert.equal(segments.join("\n").replace(/\s+/g, " "), paragraphs.join(" ").replace(/\s+/g, " "));
  const long = segmentText("x".repeat(2600), 1000);
  assert.deepEqual(long.map((segment) => segment.length), [1000, 1000, 600]);
});

test("bornage : coupe sur une frontière de segment et le signale", () => {
  const segments = ["a".repeat(400), "b".repeat(400), "c".repeat(400)];
  assert.deepEqual(boundSegments(segments, 5000), { text: segments.join("\n\n"), truncated: false });
  const bounded = boundSegments(segments, 900);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.text, `${segments[0]}\n\n${segments[1]}`);
  assert.equal(boundSegments(["z".repeat(5000)], 100).text.length, 100);
});

test("contenu de page : jamais plus que la borne de contexte, même pour une page énorme", () => {
  const page = buildPageContent({ text: ("Phrase de test assez longue. ".repeat(40) + "\n\n").repeat(400), title: "Gros", method: "readability" },
    "https://a.test/gros", "Gros");
  assert.equal(page.status, "ok");
  assert.equal(page.truncated, true);
  assert.ok(page.text.length <= AI_CONTEXT_CHARS, `${page.text.length} caractères`);
  assert.ok(page.totalChars > 400_000);
});

test("contenu de page : le résultat du script est traité comme non fiable", () => {
  const page = buildPageContent({
    url: "https://evil.test/usurpation", title: 42, description: { toString: () => "x" }, text: "Texte suffisant pour être considéré comme un contenu réel de page.",
    publishedAt: "pas une date", canonicalUrl: "javascript:alert(1)", method: "autre",
    headings: [{ level: 9, text: "Titre" }, null, "x", { level: 2, text: "" }],
    links: [{ text: "ok", url: "https://a.test/x" }, { text: "js", url: "javascript:alert(1)" }, { text: "fichier", url: "file:///etc/passwd" }, 7],
    tables: [{ caption: "T", rows: [["a", "b"], "pas une ligne", [1, 2]] }, { rows: [] }, "x"],
  }, "https://a.test/page", "Titre de l'onglet");
  assert.equal(page.url, "https://a.test/page", "l'URL vient de l'onglet, pas de la page");
  assert.equal(page.title, "Titre de l'onglet");
  assert.equal(page.description, "");
  assert.equal(page.publishedAt, null);
  assert.equal(page.canonicalUrl, null);
  assert.equal(page.method, "fallback");
  assert.deepEqual(page.headings, [{ level: 3, text: "Titre" }]);
  assert.deepEqual(page.links, [{ text: "ok", url: "https://a.test/x" }]);
  assert.deepEqual(page.tables, [{ caption: "T", rows: [["a", "b"], [], ["", ""]] }]);
});

test("contenu de page : métadonnées valides conservées", () => {
  const page = buildPageContent({
    text: "Les marées sont causées par la Lune. ".repeat(5), title: "Marées", description: "Résumé", siteName: "Site", author: "C. Durand",
    lang: "fr", publishedAt: "2026-03-14T08:00:00Z", canonicalUrl: "https://a.test/marees", method: "readability",
  }, "https://a.test/m", "Onglet");
  assert.equal(page.title, "Marées");
  assert.equal(page.publishedAt, "2026-03-14T08:00:00Z");
  assert.equal(page.canonicalUrl, "https://a.test/marees");
  assert.equal(page.method, "readability");
  assert.ok(page.wordCount > 20);
});

test("page vide ou inaccessible : signalée, sans contenu inventé", async () => {
  assert.equal(buildPageContent({ text: "  " }, "https://a.test/", "Vide").status, "empty");
  assert.equal(buildPageContent(null, "https://a.test/", "X").status, "unavailable");
  const none = unavailablePage("https://a.test/", "X", "page_load_failed");
  assert.deepEqual([none.status, none.reason, none.text, none.links.length], ["unavailable", "page_load_failed", "", 0]);

  const manager = (tab, run) => ({ getTab: () => tab, waitForLoad: async () => undefined, runInPage: run });
  const base = { url: "https://a.test/", title: "T", loading: false, crashed: false, error: null };
  assert.equal((await extractPage(manager(null), "id")).reason, "tab_not_found");
  assert.equal((await extractPage(manager({ ...base, crashed: true }), "id")).reason, "tab_crashed");
  assert.equal((await extractPage(manager({ ...base, error: { code: -105, message: "x", url: "y" } }), "id")).reason, "page_load_failed");
  assert.equal((await extractPage(manager({ ...base, url: "about:blank" }), "id")).reason, "internal_page");
  const failing = await extractPage(manager(base, async () => { throw new Error("page_script_timeout"); }), "id");
  assert.deepEqual([failing.status, failing.reason], ["unavailable", "page_script_timeout"]);
});
