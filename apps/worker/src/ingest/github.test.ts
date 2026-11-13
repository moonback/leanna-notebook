import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { buildRepoDocument, filePriority, fromGithub, isIndexable, latestGithubCommit, parseGithubUrl, readRepoZip, sameCommit } from "./github.ts";
import { chunk, normalizeCode } from "./chunker.ts";
import { FetchRefused } from "./ssrf.ts";

describe("parseGithubUrl", () => {
  it("reconnaît un dépôt, avec ou sans .git et référence", () => {
    expect(parseGithubUrl("https://github.com/acme/app")).toEqual({ owner: "acme", repo: "app" });
    expect(parseGithubUrl("https://github.com/acme/app.git")).toEqual({ owner: "acme", repo: "app" });
    expect(parseGithubUrl("https://github.com/acme/app/tree/feature/x")).toEqual({ owner: "acme", repo: "app", ref: "feature/x" });
  });
  it("refuse ce qui n'est pas un dépôt GitHub", () => {
    expect(parseGithubUrl("https://gitlab.com/acme/app")).toBeNull();
    expect(parseGithubUrl("http://github.com/acme/app")).toBeNull();
    expect(parseGithubUrl("https://github.com/acme")).toBeNull();
    expect(parseGithubUrl("https://github.com/acme/app/tree/a%22b")).toBeNull();
  });
});

describe("isIndexable", () => {
  it("garde le code et la doc, écarte dépendances, lockfiles, binaires et gros fichiers", () => {
    expect(isIndexable("src/main.ts", 100)).toBe(true);
    expect(isIndexable("README.md", 100)).toBe(true);
    expect(isIndexable("Dockerfile", 100)).toBe(true);
    expect(isIndexable("node_modules/x/index.js", 100)).toBe(false);
    expect(isIndexable("pnpm-lock.yaml", 100)).toBe(false);
    expect(isIndexable("public/logo.png", 100)).toBe(false);
    expect(isIndexable("dist/app.min.js", 100)).toBe(false);
    expect(isIndexable("src/huge.ts", 10_000_000)).toBe(false);
  });
  it("lit le README racine en premier, puis les manifestes, le code et enfin les tests", () => {
    const order = ["src/a.test.ts", "src/a.ts", "package.json", "docs/guide.md", "README.md"]
      .sort((a, b) => filePriority(a) - filePriority(b));
    expect(order).toEqual(["README.md", "package.json", "docs/guide.md", "src/a.ts", "src/a.test.ts"]);
  });
});

describe("buildRepoDocument", () => {
  const files = [
    { path: "src/index.ts", content: "export const a = 1;\n\n\n\nexport const b = 2;" },
    { path: "README.md", content: "# Demo\nUn projet de démonstration." },
  ];
  it("produit une vue d'ensemble puis une page par fichier, offsets exacts après normalisation", () => {
    const doc = buildRepoDocument({ owner: "acme", repo: "demo", commit: "abc1234" }, files, 3);
    expect(normalizeCode(doc.text)).toBe(doc.text);
    expect(doc.pageCount).toBe(3);
    expect(doc.github.files).toEqual(["(vue d'ensemble)", "README.md", "src/index.ts"]);
    expect(doc.text.slice(doc.pageStarts[0], doc.pageStarts[0]! + 30)).toContain("Dépôt GitHub acme/demo");
    expect(doc.text.slice(doc.pageStarts[1])).toMatch(/^=== Fichier : README\.md ===/);
    expect(doc.text.slice(doc.pageStarts[2])).toMatch(/^=== Fichier : src\/index\.ts ===/);
    expect(doc.text).toContain("3 ignoré(s)");
  });
  it("conserve l'indentation du code", () => {
    const doc = buildRepoDocument({ owner: "acme", repo: "demo" }, [{ path: "a.py", content: "def f():\r\n\tif x:   \n        return 1\n" }]);
    expect(doc.text).toContain("=== Fichier : a.py ===\ndef f():\n  if x:\n        return 1");
  });
  it("aucun chunk ne chevauche deux fichiers", () => {
    const doc = buildRepoDocument({ owner: "acme", repo: "demo" }, files);
    const chunks = chunk(doc.text, { pageStarts: doc.pageStarts, hardCuts: doc.pageStarts, maxChars: 80, overlapChars: 30 });
    for (const c of chunks) {
      expect(doc.text.slice(c.char_start, c.char_end)).toBe(c.content);
      const page = doc.pageStarts.filter((p) => p <= c.char_start).length;
      const nextStart = doc.pageStarts[page] ?? doc.text.length;
      expect(c.char_end).toBeLessThanOrEqual(nextStart);
      expect(c.page_start).toBe(page);
    }
  });
});

describe("readRepoZip / fromGithub", () => {
  const zip = zipSync({
    "acme-demo-1a2b3c4/README.md": strToU8("# Demo\nBonjour."),
    "acme-demo-1a2b3c4/src/app.py": strToU8("print('hi')"),
    "acme-demo-1a2b3c4/node_modules/x/index.js": strToU8("x"),
    "acme-demo-1a2b3c4/assets/logo.png": new Uint8Array([137, 80, 78, 71, 0, 1]),
    "acme-demo-1a2b3c4/data.json": new Uint8Array([123, 0, 125]),
  });
  it("retire le dossier racine, filtre et déduit le commit", () => {
    const r = readRepoZip(zip);
    expect(r.commit).toBe("1a2b3c4");
    expect(r.files.map((f) => f.path).sort()).toEqual(["README.md", "src/app.py"]);
    expect(r.skipped).toBe(3);
  });
  it("télécharge l'archive par l'API GitHub, hôtes restreints", async () => {
    const calls: { url: string; opts: { allowHosts?: string[] } | undefined }[] = [];
    const doc = await fromGithub("https://github.com/acme/demo/tree/main", (async (url: string, _r?: number, opts?: { allowHosts?: string[] }) => {
      calls.push({ url, opts });
      return { url, contentType: "application/zip", body: Buffer.from(zip) };
    }) as never);
    expect(calls[0]!.url).toBe("https://api.github.com/repos/acme/demo/zipball/main");
    expect(calls[0]!.opts?.allowHosts).toEqual(["api.github.com", "codeload.github.com"]);
    expect(doc.title).toBe("acme/demo");
    expect(doc.github).toMatchObject({ owner: "acme", repo: "demo", ref: "main", commit: "1a2b3c4" });
  });
  it("dépôt introuvable → erreur permanente lisible", async () => {
    await expect(fromGithub("https://github.com/acme/nope", (async () => { throw new FetchRefused("http_404"); }) as never))
      .rejects.toMatchObject({ code: "github_not_found" });
  });
});

describe("mise à jour d'un dépôt", () => {
  const sha = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b";
  it("lit le SHA du dernier commit de la référence", async () => {
    let called = "";
    const latest = await latestGithubCommit("https://github.com/acme/demo/tree/main", (async (url: string) => {
      called = url;
      return { url, contentType: "application/vnd.github.sha", body: Buffer.from(`${sha}\n`) };
    }) as never);
    expect(called).toBe("https://api.github.com/repos/acme/demo/commits/main");
    expect(latest).toBe(sha);
  });
  it("renvoie null si GitHub est injoignable (on réimporte alors par prudence)", async () => {
    expect(await latestGithubCommit("https://github.com/acme/demo", (async () => { throw new Error("réseau"); }) as never)).toBeNull();
  });
  it("compare le commit court de l'archive au SHA complet", () => {
    expect(sameCommit("1a2b3c4", sha)).toBe(true);
    expect(sameCommit("ffffff1", sha)).toBe(false);
    expect(sameCommit(null, sha)).toBe(false);
    expect(sameCommit("1a2b3c4", null)).toBe(false);
  });
});
