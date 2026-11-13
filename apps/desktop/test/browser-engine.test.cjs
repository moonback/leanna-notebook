const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const v = require("../dist/browser/browser-validation.js");
const { matchShortcut } = require("../dist/browser/browser-shortcuts.js");
const { BrowserDataStore, sanitizeSettings, DEFAULT_SETTINGS } = require("../dist/browser/browser-data-store.js");
const { browserHandlers, registerBrowserIpc } = require("../dist/browser/browser-ipc.js");

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), "leanna-browser-"));
  try { await run(new BrowserDataStore(directory), directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

// ── Validation d'URL ───────────────────────────────────────────────────────
test("seules les URL http(s) sans identifiants sont navigables", () => {
  assert.equal(v.isSafeBrowserUrl("https://example.com/a"), true);
  assert.equal(v.isSafeBrowserUrl("http://localhost:3000"), true);
  for (const value of [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "file:///etc/passwd",
    "file:///C:/Windows/system32", "chrome://settings", "about:blank", "blob:https://a.test/x", "view-source:https://a.test",
    "vbscript:x", "ftp://a.test/", "leanna://x", "https://user:secret@example.com", "https://", "//example.com",
    "https://example.com/\nheader", "https://example.com/" + "a".repeat(2100), "", null, 42, {},
  ]) assert.equal(v.isSafeBrowserUrl(value), false, String(value));
});

test("les sous-cadres tolèrent about:blank, blob: et data:, jamais file: ni javascript:", () => {
  for (const ok of ["https://a.test/", "about:blank", "about:srcdoc", "blob:https://a.test/1", "data:text/html,x"]) {
    assert.equal(v.isSafeSubframeUrl(ok), true, ok);
  }
  for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "chrome://gpu", null]) {
    assert.equal(v.isSafeSubframeUrl(bad), false, String(bad));
  }
});

test("la barre d'adresse distingue URL, hôte et recherche, selon le moteur choisi", () => {
  assert.equal(v.resolveBrowserAddress("https://example.com"), "https://example.com/");
  assert.equal(v.resolveBrowserAddress("example.com/docs"), "https://example.com/docs");
  assert.equal(v.resolveBrowserAddress("localhost:3000"), "http://localhost:3000/");
  assert.equal(v.resolveBrowserAddress("127.0.0.1:8080/x"), "http://127.0.0.1:8080/x");
  assert.equal(v.resolveBrowserAddress("example.com:8443"), "https://example.com:8443/");
  assert.equal(v.resolveBrowserAddress("meilleurs outils IA"), "https://www.google.com/search?q=meilleurs%20outils%20IA");
  assert.equal(v.resolveBrowserAddress("chat noir", "duckduckgo"), "https://duckduckgo.com/?q=chat%20noir");
  // Un schéma explicite dangereux n'est jamais transformé en recherche ni en navigation.
  for (const bad of ["javascript:alert(1)", "file:///C:/secret.txt", "data:text/html,x", "chrome://settings", "", "   ", 12]) {
    assert.equal(v.resolveBrowserAddress(bad), null, String(bad));
  }
});

test("les bornes de la vue sont finies, positives et bornées", () => {
  assert.deepEqual(v.normalizeBrowserBounds({ x: 1.4, y: 2.6, width: 800, height: 600 }), { x: 1, y: 3, width: 800, height: 600 });
  for (const value of [null, {}, { x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 10001, height: 10 }, { x: Infinity, y: 0, width: 10, height: 10 }]) {
    assert.equal(v.normalizeBrowserBounds(value), null);
  }
});

test("identifiants d'onglet et origines de permission stricts", () => {
  assert.equal(v.isTabId("3f2b8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"), true);
  for (const bad of ["", "abc", "../../etc", 5, null, "3f2b8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b; DROP"]) assert.equal(v.isTabId(bad), false);
  assert.equal(v.isSafeBrowserPermissionOrigin("https://example.com"), true);
  assert.equal(v.isSafeBrowserPermissionOrigin("https://example.com/path"), false);
  assert.equal(v.isSafeBrowserPermissionOrigin("file://"), false);
});

test("téléchargements à risque détectés sur la dernière extension", () => {
  for (const risky of ["setup.exe", "Facture.pdf.exe", "run.BAT", "macro.docm", "x.ps1", "app.msi", "lien.lnk", "script.js ", null]) {
    assert.equal(v.isRiskyDownload(risky), true, String(risky));
  }
  for (const safe of ["rapport.pdf", "photo.jpeg", "data.csv", "archive.zip", "exe.txt"]) assert.equal(v.isRiskyDownload(safe), false, safe);
});

test("erreurs de navigation lisibles, certificat signalé sans contournement", () => {
  assert.match(v.describeLoadError(-105, "ERR_NAME_NOT_RESOLVED"), /introuvable/i);
  assert.match(v.describeLoadError(-202, "ERR_CERT_AUTHORITY_INVALID"), /certificat/i);
  assert.match(v.describeLoadError(-999, "ERR_SOMETHING_NEW"), /ERR_SOMETHING_NEW/);
});

// ── Permissions ────────────────────────────────────────────────────────────
test("permissions : refus par défaut hors liste, choix mémorisé prioritaire, politique sinon", () => {
  assert.equal(v.decidePermission("fullscreen", null, "deny"), "allow");
  for (const never of ["hid", "serial", "usb", "openExternal", "midiSysex", "display-capture", "unknown"]) {
    assert.equal(v.decidePermission(never, "allow", "ask"), "deny", never);
  }
  assert.equal(v.decidePermission("media", null, "ask"), "ask");
  assert.equal(v.decidePermission("media", null, "deny"), "deny");
  assert.equal(v.decidePermission("media", "allow", "deny"), "allow");
  assert.equal(v.decidePermission("geolocation", "deny", "ask"), "deny");
});

// ── Onglets (ordre) et raccourcis ──────────────────────────────────────────
test("réordonner des onglets ne perd ni ne duplique rien", () => {
  assert.deepEqual(v.moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(v.moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(v.moveItem(["a", "b", "c"], 1, 99), ["a", "c", "b"]);
  assert.deepEqual(v.moveItem(["a", "b"], 7, 0), ["a", "b"]);
});

test("raccourcis clavier", () => {
  const cases = [
    [{ key: "t", control: true }, "new-tab"], [{ key: "T", control: true }, "new-tab"], [{ key: "w", meta: true }, "close-tab"],
    [{ key: "Tab", control: true }, "next-tab"], [{ key: "Tab", control: true, shift: true }, "previous-tab"],
    [{ key: "l", control: true }, "focus-address"], [{ key: "r", control: true }, "reload"], [{ key: "F5" }, "reload"],
    [{ key: "r", control: true, shift: true }, "hard-reload"], [{ key: "ArrowLeft", alt: true }, "back"],
    [{ key: "ArrowRight", alt: true }, "forward"], [{ key: "=", control: true }, "zoom-in"], [{ key: "-", control: true }, "zoom-out"],
    [{ key: "0", control: true }, "zoom-reset"], [{ key: "F11" }, "fullscreen"], [{ key: "d", control: true }, "bookmark"],
    [{ key: "h", control: true }, "show-history"], [{ key: "j", control: true }, "show-downloads"],
    [{ key: "t" }, null], [{ key: "c", control: true }, null], [{ key: "Enter" }, null],
  ];
  for (const [input, expected] of cases) assert.equal(matchShortcut(input), expected, JSON.stringify(input));
});

// ── Historique ─────────────────────────────────────────────────────────────
test("historique : persistance, exclusion du privé, recherche, suppression ciblée, par période et totale", async () => {
  await withStore(async (store, directory) => {
    await store.addVisit("https://example.com/a", "Alpha", false);
    await store.addVisit("https://private.example/", "Privé", true);
    await store.addVisit("javascript:alert(1)", "Injection", false);
    await store.addVisit("https://example.org/b", "Bravo", false);
    const reloaded = new BrowserDataStore(directory);
    const history = await reloaded.getHistory();
    assert.deepEqual(history.map((h) => h.title), ["Bravo", "Alpha"]);
    assert.deepEqual((await reloaded.getHistory("alph")).map((h) => h.url), ["https://example.com/a"]);
    assert.equal(await reloaded.removeVisit(history[0].id), true);
    assert.equal(await reloaded.removeVisit("inconnu"), false);
    assert.equal((await reloaded.getHistory()).length, 1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await reloaded.addVisit("https://example.net/c", "Charlie");
    const cutoff = (await reloaded.getHistory())[0].visitedAt;
    assert.equal(await reloaded.clearHistory(cutoff), 1, "seule la visite depuis la date limite disparaît");
    assert.deepEqual((await reloaded.getHistory()).map((h) => h.title), ["Alpha"]);
    await reloaded.addBookmark("https://example.com/", "Favori");
    assert.equal(await reloaded.clearHistory(), 1);
    assert.equal((await reloaded.getHistory()).length, 0);
    assert.equal((await reloaded.getBookmarks()).bookmarks.length, 1, "effacer l'historique ne touche pas aux favoris");
  });
});

// ── Favoris ────────────────────────────────────────────────────────────────
test("favoris : validation, déduplication, dossiers, renommage, recherche, suppression", async () => {
  await withStore(async (store, directory) => {
    assert.equal(await store.addBookmark("javascript:alert(1)", "Dangereux"), null);
    assert.equal(await store.addBookmark("file:///C:/x", "Local"), null);
    const first = await store.addBookmark("https://example.com/", "Exemple", "Veille");
    const duplicate = await store.addBookmark("https://example.com/", "Autre titre");
    assert.equal(duplicate.id, first.id);
    assert.equal(first.folder, "Veille");
    await store.addBookmark("https://docs.example.org/", "Documentation");

    const renamed = await store.updateBookmark(first.id, { title: "Exemple renommé", folder: "Lecture" });
    assert.equal(renamed.title, "Exemple renommé");
    assert.equal(renamed.folder, "Lecture");
    assert.equal(await store.renameFolder("Lecture", "À lire"), true);
    assert.equal(await store.renameFolder("Inexistant", "X"), false);

    const reloaded = await new BrowserDataStore(directory).getBookmarks();
    assert.equal(reloaded.bookmarks.find((b) => b.id === first.id).folder, "À lire");
    assert.ok(reloaded.folders.includes("À lire") && !reloaded.folders.includes("Lecture"));
    assert.deepEqual((await store.getBookmarks("docum")).bookmarks.map((b) => b.title), ["Documentation"]);

    assert.equal(await store.removeFolder("À lire"), true);
    assert.equal((await store.getBookmarks()).bookmarks.find((b) => b.id === first.id).folder, "", "le favori revient à la racine");
    assert.equal(await store.removeBookmark(first.id), true);
    assert.equal((await store.getBookmarks()).bookmarks.length, 1);
  });
});

// ── Réglages, session, permissions, téléchargements ────────────────────────
test("réglages : valeurs inconnues ou invalides ignorées", async () => {
  const s = sanitizeSettings({
    searchEngine: "evil", homepage: "javascript:alert(1)", restoreTabs: "oui", popups: "allow-all",
    agentMode: "root", confirmations: "never", extra: 1,
  });
  assert.deepEqual(s, DEFAULT_SETTINGS);
  await withStore(async (store, directory) => {
    const next = await store.updateSettings({ searchEngine: "duckduckgo", homepage: "https://example.com/", agentMode: "autonomous", popups: "block" });
    assert.equal(next.searchEngine, "duckduckgo");
    assert.equal(next.agentMode, "autonomous");
    const reloaded = await new BrowserDataStore(directory).getSettings();
    assert.deepEqual(reloaded, next);
    assert.equal((await store.updateSettings({ homepage: "" })).homepage, "");
  });
});

test("session d'onglets : seules les URL sûres sont restaurées", async () => {
  await withStore(async (store, directory) => {
    await store.saveSession([
      { url: "https://a.test/", title: "A" }, { url: "file:///etc/passwd", title: "X" }, { url: "https://b.test/", title: "B" },
    ], 2);
    const session = await new BrowserDataStore(directory).getSession();
    assert.deepEqual(session.tabs.map((t) => t.url), ["https://a.test/", "https://b.test/"]);
    assert.equal(session.activeIndex, 1);
  });
});

test("permissions par origine : mémorisation, retrait, origine invalide refusée", async () => {
  await withStore(async (store, directory) => {
    assert.equal(await store.setPermission("https://a.test", "media", "allow"), true);
    assert.equal(await store.setPermission("https://a.test/chemin", "media", "allow"), false);
    assert.equal(await store.setPermission("file://", "media", "allow"), false);
    const reloaded = new BrowserDataStore(directory);
    assert.equal(await reloaded.getPermission("https://a.test", "media"), "allow");
    assert.equal(await reloaded.getPermission("https://b.test", "media"), null);
    await reloaded.setPermission("https://a.test", "media", null);
    assert.deepEqual(await reloaded.getPermissions(), {});
  });
});

test("téléchargements : liste persistée, un transfert coupé devient « interrompu », suppression de l'entrée", async () => {
  await withStore(async (store, directory) => {
    const base = { url: "https://a.test/f.pdf", filename: "f.pdf", path: join(directory, "f.pdf"), receivedBytes: 1, totalBytes: 2, startedAt: 1, risky: false };
    await store.upsertDownload({ ...base, id: "1", state: "progressing" });
    await store.upsertDownload({ ...base, id: "2", state: "completed" });
    const reloaded = new BrowserDataStore(directory);
    const list = await reloaded.getDownloads();
    assert.equal(list.find((d) => d.id === "1").state, "interrupted");
    assert.equal(list.find((d) => d.id === "2").state, "completed");
    assert.equal(await reloaded.removeDownload("2"), true);
    assert.equal((await reloaded.getDownloads()).length, 1);
  });
});

test("fichier de données : format v1 relu sans perte, fichier corrompu toléré, aucun secret stocké", async () => {
  await withStore(async (_store, directory) => {
    const file = join(directory, "browser-data.json");
    await writeFile(file, JSON.stringify({
      version: 1,
      history: [{ id: "h", url: "https://old.test/", title: "Ancien", visitedAt: 5 }],
      bookmarks: [{ id: "b", url: "https://old.test/", title: "Ancien", createdAt: 5 }],
    }));
    const store = new BrowserDataStore(directory);
    assert.equal((await store.getHistory())[0].title, "Ancien");
    assert.equal((await store.getBookmarks()).bookmarks[0].folder, "");
    await store.addVisit("https://new.test/", "Nouveau");
    const raw = await readFile(file, "utf8");
    assert.equal(JSON.parse(raw).version, 2);
    // Seules ces sections existent : pas de cookie, de mot de passe, de jeton ni de contenu de page.
    assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),
      ["bookmarks", "downloads", "folders", "history", "permissions", "session", "settings", "version"]);
    assert.doesNotMatch(raw, /password|token|"value"/i);

    await writeFile(file, "{ ceci n'est pas du JSON");
    assert.deepEqual(await new BrowserDataStore(directory).getHistory(), []);
  });
});

// ── IPC ────────────────────────────────────────────────────────────────────
function fakeManager(calls) {
  const record = (name, result = true) => (...args) => { calls.push([name, ...args]); return result; };
  return {
    init: async () => undefined, getState: () => ({ activeTabId: null, tabs: [], fullscreen: false, downloads: [] }),
    getSettings: () => DEFAULT_SETTINGS, createTab: record("createTab", { id: "x" }), activateTab: record("activateTab"),
    closeTab: record("closeTab"), duplicateTab: record("duplicateTab"), moveTab: record("moveTab"), navigate: record("navigate"),
    goBack: record("goBack"), goForward: record("goForward"), reload: record("reload"), stop: record("stop"), setZoom: record("setZoom"),
    runCommand: record("runCommand"), setBounds: record("setBounds"), setVisible: record("setVisible"),
    cancelDownload: record("cancelDownload"), showDownloadInFolder: record("showDownloadInFolder"),
  };
}
const TAB = "3f2b8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

test("IPC : les arguments sont revalidés côté Main", () => {
  const calls = [];
  const h = browserHandlers({ manager: fakeManager(calls), store: {}, isTrusted: () => true });
  assert.equal(h.activateTab(TAB), true);
  assert.throws(() => h.activateTab("../../x"), /invalid_tab_id/);
  assert.throws(() => h.navigate({ id: TAB }, "https://a.test"), /invalid_tab_id/);
  assert.throws(() => h.setVisible("true"), /invalid_arguments/);
  assert.throws(() => h.createTab({ isPrivate: "yes" }), /invalid_arguments/);
  assert.equal(h.setZoom(TAB, "huge"), false);
  assert.equal(h.runCommand("rm -rf"), false);
  assert.equal(h.moveTab(TAB, "2"), false);
  assert.equal(h.key({ key: "t", control: true }), true);
  assert.equal(h.key({ key: "a" }), false);
  assert.equal(h.key({ key: "x".repeat(50), control: true }), false);
  assert.deepEqual(calls.map((c) => c[0]), ["activateTab", "runCommand"]);
});

test("IPC : un émetteur non approuvé est rejeté avant tout traitement, canaux enregistrés une seule fois", async () => {
  const calls = [];
  const registeredChannels = new Map();
  const ipc = { handle: (channel, fn) => { assert.equal(registeredChannels.has(channel), false, "canal dupliqué"); registeredChannels.set(channel, fn); } };
  let trusted = false;
  const deps = { manager: fakeManager(calls), store: {}, isTrusted: () => trusted };
  const names = registerBrowserIpc(deps, {}, ipc);
  assert.ok(names.includes("createTab") && names.includes("navigate"));
  assert.ok([...registeredChannels.keys()].every((c) => c.startsWith("browser:")));

  await assert.rejects(() => registeredChannels.get("browser:closeTab")({}, TAB), /forbidden/);
  await assert.rejects(() => registeredChannels.get("browser:navigate")({}, TAB, "https://evil.test"), /forbidden/);
  assert.equal(calls.length, 0, "aucune commande exécutée pour un émetteur non approuvé");

  trusted = true;
  assert.equal(await registeredChannels.get("browser:closeTab")({}, TAB), true);
  assert.deepEqual(registerBrowserIpc(deps, {}, ipc), [], "second enregistrement ignoré");
});
