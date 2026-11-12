// Parcours de bout en bout : lance réellement Electron (Playwright) avec le vrai moteur de navigation.
// Exécution : pnpm --dir apps/desktop test:e2e
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdir, mkdtemp, rm, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { _electron: electron } = require("playwright-core");
const { startSite, startApp } = require("./servers.cjs");

const MAIN = resolve(__dirname, "../dist/main.js");
let site, appServer, userData, electronApp, win;

async function launch() {
  electronApp = await electron.launch({
    executablePath: require("electron"),
    args: [MAIN, `--user-data-dir=${userData}`],
    env: { ...process.env, LEANNA_WEB_URL: appServer.url },
  });
  win = await electronApp.firstWindow();
  await win.waitForLoadState("domcontentloaded");
}

/** Appelle window.leannaDesktop.browser.<method>(...args) depuis le renderer de confiance. */
const call = (method, ...args) => win.evaluate(([m, a]) => window.leannaDesktop.browser[m](...a), [method, args]);
const state = () => call("getState");

async function waitFor(predicate, message, timeout = 15_000) {
  const start = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() - start > timeout) assert.fail(`délai dépassé : ${message}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}
const tabByUrl = async (fragment) => (await state()).tabs.find((tab) => tab.url.includes(fragment));
const loaded = (fragment) => waitFor(async () => {
  const tab = await tabByUrl(fragment);
  return tab && !tab.loading ? tab : null;
}, `chargement de ${fragment}`);

/** Exécute du code dans le monde principal d'un onglet (comme le ferait le site lui-même). */
const inPage = (fragment, code) => electronApp.evaluate(async ({ webContents }, [frag, js]) => {
  const contents = webContents.getAllWebContents().find((item) => item.getURL().includes(frag));
  if (!contents) throw new Error(`onglet introuvable : ${frag}`);
  return contents.executeJavaScript(js, true);
}, [fragment, code]);

test.before(async () => {
  site = await startSite();
  appServer = await startApp();
  userData = await mkdtemp(join(tmpdir(), "leanna-e2e-"));
  await launch();
});

test.after(async () => {
  await electronApp?.close().catch(() => undefined);
  await site?.close();
  await appServer?.close();
  await rm(userData, { recursive: true, force: true }).catch(() => undefined);
});

test("moteur : le navigateur démarre avec un onglet et navigue réellement", async () => {
  await call("updateSettings", { homepage: `${site.url}/vide` });
  const { state: initial, settings } = await call("init");
  assert.equal(settings.agentMode, "assistance");
  assert.equal(initial.tabs.length, 1);
  await call("setVisible", true);
  await call("setBounds", { x: 0, y: 120, width: 900, height: 500 });

  const first = initial.tabs[0];
  assert.equal(await call("navigate", first.id, `${site.url}/article`), true);
  const tab = await loaded("/article");
  assert.equal(tab.title, "Les marées expliquées");
  assert.equal(tab.security, "insecure", "HTTP est signalé comme non sécurisé");
  assert.equal(tab.error, null);
});

test("navigation : retour, avant, rechargement, zoom, erreurs lisibles", async () => {
  const tab = await tabByUrl("/article");
  await call("navigate", tab.id, `${site.url}/produit-a`);
  await loaded("/produit-a");
  assert.equal((await state()).tabs.find((t) => t.id === tab.id).canGoBack, true);
  await call("goBack", tab.id);
  await loaded("/article");
  await call("goForward", tab.id);
  await loaded("/produit-a");
  const before = site.hits["/produit-a"];
  await call("reload", tab.id);
  await waitFor(() => site.hits["/produit-a"] > before, "rechargement");

  await call("setZoom", tab.id, "in");
  await waitFor(async () => (await state()).tabs.find((t) => t.id === tab.id).zoom === 110, "zoom avant");
  await call("setZoom", tab.id, "reset");
  await waitFor(async () => (await state()).tabs.find((t) => t.id === tab.id).zoom === 100, "zoom réinitialisé");

  await call("navigate", tab.id, "http://127.0.0.1:9/injoignable");
  const failed = await waitFor(async () => (await state()).tabs.find((t) => t.id === tab.id && t.error), "erreur de navigation");
  assert.match(failed.error.message, /refusé|injoignable|chargée/i);
  await call("navigate", tab.id, `${site.url}/article`);
  await loaded("/article");
});

test("HTTPS : indicateur sécurisé sur un vrai site, certificat invalide bloqué sans contournement", async (t) => {
  const created = await call("createTab", { url: "https://example.com/" });
  const result = await waitFor(async () => {
    const tab = (await state()).tabs.find((item) => item.id === created.id);
    return tab && !tab.loading ? tab : null;
  }, "chargement https://example.com", 30_000);
  if (result.error) { await call("closeTab", created.id); t.skip(`réseau indisponible : ${result.error.message}`); return; }
  assert.equal(result.security, "secure");
  assert.match(result.title, /Example/i);

  await call("navigate", created.id, "https://self-signed.badssl.com/");
  const bad = await waitFor(async () => {
    const tab = (await state()).tabs.find((item) => item.id === created.id);
    return tab && !tab.loading && tab.url.includes("badssl") ? tab : null;
  }, "certificat invalide", 30_000);
  assert.ok(bad.error, "la page au certificat invalide n'est pas affichée");
  assert.match(bad.error.message, /certificat/i);
  assert.equal(bad.security, "insecure");
  await call("closeTab", created.id);
});

test("onglets : créer, basculer, dupliquer, réordonner, fermer", async () => {
  const b = await call("createTab", { url: `${site.url}/produit-b` });
  await loaded("/produit-b");
  assert.equal((await state()).activeTabId, b.id);
  const a = await tabByUrl("/article");
  await call("activateTab", a.id);
  assert.equal((await state()).activeTabId, a.id);

  const copy = await call("duplicateTab", b.id);
  await waitFor(async () => (await state()).tabs.filter((t) => t.url.includes("/produit-b")).length === 2, "duplication");
  let order = (await state()).tabs.map((t) => t.id);
  assert.equal(order.indexOf(copy.id), order.indexOf(b.id) + 1, "le duplicata est placé juste après l'original");

  await call("moveTab", copy.id, 0);
  order = (await state()).tabs.map((t) => t.id);
  assert.equal(order[0], copy.id);
  assert.equal(new Set(order).size, order.length);

  await call("closeTab", copy.id);
  assert.equal((await state()).tabs.some((t) => t.id === copy.id), false);
  const count = await electronApp.evaluate(({ webContents }, fragment) =>
    webContents.getAllWebContents().filter((item) => item.getURL().includes(fragment)).length, "/produit-b");
  assert.equal(count, 1, "le WebContents de l'onglet fermé est libéré");
});

test("sécurité : aucune API Node, Electron ou IPC n'est exposée aux sites", async () => {
  const exposure = await inPage("/article", `({
    desktop: typeof window.leannaDesktop, require: typeof window.require, process: typeof window.process,
    module: typeof window.module, buffer: typeof window.Buffer, ipc: typeof window.ipcRenderer, electron: typeof window.electron,
  })`);
  for (const [name, type] of Object.entries(exposure)) assert.equal(type, "undefined", `${name} ne doit pas exister dans la page`);

  const prefs = await electronApp.evaluate(({ webContents }, fragment) => {
    const contents = webContents.getAllWebContents().find((item) => item.getURL().includes(fragment));
    const p = contents.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox, webSecurity: p.webSecurity, preload: p.preload ?? "" };
  }, "/article");
  assert.deepEqual(prefs, { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, preload: "" });
});

test("sécurité : un IPC venant d'un autre émetteur que l'application est rejeté", async () => {
  const outcome = await electronApp.evaluate(async ({ ipcMain, webContents }, fragment) => {
    const tab = webContents.getAllWebContents().find((item) => item.getURL().includes(fragment));
    const handler = ipcMain._invokeHandlers.get("browser:getState");
    try {
      await handler({ sender: tab, senderFrame: tab.mainFrame }, []);
      return "accepté";
    } catch (error) {
      return String(error.message);
    }
  }, "/article").catch((error) => `indisponible: ${error.message}`);
  assert.match(outcome, /forbidden/);
});

test("sécurité : schémas dangereux et redirections malveillantes bloqués", async () => {
  const tab = await tabByUrl("/article");
  for (const bad of ["file:///C:/Windows/win.ini", "javascript:alert(1)", "data:text/html,<h1>x</h1>", "chrome://gpu"]) {
    assert.equal(await call("navigate", tab.id, bad), false, bad);
    assert.equal(await call("createTab", { url: bad }), null, bad);
  }
  for (const path of ["/vers-fichier", "/vers-js"]) {
    await call("navigate", tab.id, `${site.url}${path}`);
    await waitFor(() => site.hits[path] >= 1, `requête ${path}`);
    await new Promise((done) => setTimeout(done, 500));
    const current = await electronApp.evaluate(({ webContents }, id) =>
      webContents.getAllWebContents().map((item) => item.getURL()).filter((url) => /^(file|javascript):/.test(url)), tab.id);
    assert.deepEqual(current, [], `aucun onglet n'a suivi la redirection ${path}`);
  }
  // Une page ne peut pas non plus naviguer d'elle-même vers un fichier local.
  await call("navigate", tab.id, `${site.url}/article`);
  await loaded("/article");
  await inPage("/article", "location.href = 'file:///C:/Windows/win.ini'; true").catch(() => undefined);
  await new Promise((done) => setTimeout(done, 400));
  assert.ok(await tabByUrl("/article"), "l'onglet est resté sur la page d'origine");
  // Une redirection légitime reste suivie.
  await call("navigate", tab.id, `${site.url}/vers-article`);
  await loaded("/article");
});

test("extraction : contenu principal, métadonnées, titres, liens, tableaux, date — borné et sans le bruit de la page", async () => {
  const tab = await tabByUrl("/article");
  const page = await call("extractPage", tab.id);
  assert.equal(page.status, "ok");
  assert.equal(page.url, `${site.url}/article`);
  assert.equal(page.title, "Les marées expliquées");
  assert.equal(page.description, "Pourquoi la mer monte et descend deux fois par jour.");
  assert.equal(page.publishedAt, "2026-03-14T08:00:00Z");
  assert.equal(page.author, "Camille Durand");
  assert.equal(page.canonicalUrl, "https://exemple-maree.test/marees");
  assert.equal(page.lang, "fr");
  assert.equal(page.method, "readability");
  assert.match(page.text, /attraction gravitationnelle de la Lune/);
  assert.match(page.text, /baie de Fundy/);
  assert.doesNotMatch(page.text, /Publicité|Mentions légales/, "navigation, publicité et pied de page exclus du texte principal");
  assert.doesNotMatch(page.text, /<\w+[^>]*>/, "aucun balisage HTML dans le contexte");
  assert.deepEqual(page.headings.map((h) => h.text), ["Les marées expliquées", "Le rôle de la Lune", "Quelques chiffres"]);
  assert.ok(page.links.some((l) => l.url === `${site.url}/produit-a`) && page.links.some((l) => l.url === "https://example.com/reference"));
  assert.deepEqual(page.tables[0], { caption: "Marnages", rows: [["Lieu", "Marnage"], ["Baie de Fundy", "16 m"], ["Mont-Saint-Michel", "14 m"]] });
  assert.ok(page.text.length <= 24_000);

  // Le script tourne en monde isolé : la page ne voit ni Readability ni nos fonctions.
  assert.equal(await inPage("/article", "typeof Readability + '/' + typeof extractPageScript"), "undefined/undefined");

  // Sélection de texte de l'utilisateur.
  await inPage("/article", "const r = document.createRange(); r.selectNodeContents(document.querySelector('h2')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); true");
  assert.equal(await call("getSelection", tab.id), "Le rôle de la Lune");
});

test("extraction : une page inaccessible ou vide est signalée, pas inventée", async () => {
  const tab = await call("createTab", { url: "http://127.0.0.1:9/hors-ligne" });
  await waitFor(async () => (await state()).tabs.find((t) => t.id === tab.id)?.error, "échec de chargement");
  const failed = await call("extractPage", tab.id);
  assert.deepEqual([failed.status, failed.reason, failed.text], ["unavailable", "page_load_failed", ""]);
  await call("navigate", tab.id, `${site.url}/vide`);
  await loaded("/vide");
  assert.equal((await call("extractPage", tab.id)).status, "empty");
  await call("closeTab", tab.id);
  await assert.rejects(call("extractPage", "pas-un-id"), /invalid_tab_id/);
});

test("pop-ups : ouvertes comme onglets, jamais comme fenêtres ; bloquées si le réglage le demande", async () => {
  const tab = await call("createTab", { url: `${site.url}/popup` });
  await loaded("/popup");
  const windowsBefore = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const tabsBefore = (await state()).tabs.length;
  await inPage("/popup", "document.getElementById('js').click(); true");
  await waitFor(async () => (await state()).tabs.length === tabsBefore + 1, "pop-up ouverte en onglet");
  assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), windowsBefore);

  // window.open vers un fichier local : ni onglet, ni fenêtre, ni chargement de file:.
  const afterPopup = (await state()).tabs.length;
  await inPage("/popup", "document.getElementById('bad').click(); true");
  await new Promise((done) => setTimeout(done, 500));
  assert.equal((await state()).tabs.length, afterPopup);
  assert.deepEqual(await electronApp.evaluate(({ webContents }) =>
    webContents.getAllWebContents().map((item) => item.getURL()).filter((url) => url.startsWith("file:"))), []);

  await call("updateSettings", { popups: "block" });
  const count = (await state()).tabs.length;
  await inPage("/popup", "document.getElementById('js').click(); true");
  await waitFor(async () => (await state()).tabs.find((t) => t.id === tab.id).blockedPopups === 1, "pop-up bloquée par réglage");
  assert.equal((await state()).tabs.length, count);
  await call("updateSettings", { popups: "tab" });
  for (const extra of (await state()).tabs.filter((t) => t.url.includes("/produit-a") || t.url.includes("/popup"))) await call("closeTab", extra.id);
});

test("résilience : le crash d'un onglet ne fait pas tomber l'application", async () => {
  const tab = await call("createTab", { url: `${site.url}/formulaires` });
  await loaded("/formulaires");
  await electronApp.evaluate(({ webContents }, fragment) => {
    webContents.getAllWebContents().find((item) => item.getURL().includes(fragment)).forcefullyCrashRenderer();
  }, "/formulaires");
  await waitFor(async () => (await state()).tabs.find((t) => t.id === tab.id)?.crashed, "onglet marqué comme planté");
  assert.ok(await tabByUrl("/article"), "les autres onglets sont intacts");
  assert.equal(await win.evaluate(() => typeof window.leannaDesktop.browser.getState), "function", "l'application répond toujours");
  await call("reload", tab.id);
  await waitFor(async () => {
    const current = (await state()).tabs.find((t) => t.id === tab.id);
    return current && !current.crashed && !current.loading;
  }, "onglet rechargé après crash");
  await call("closeTab", tab.id);
});

test("téléchargements : chemin choisi par l'utilisateur, fichier à risque confirmé, rien n'est exécuté", async () => {
  const target = join(userData, "telechargements");
  await mkdir(target, { recursive: true });
  // Les dialogues natifs ne sont pas pilotables : on les remplace dans le processus Main et on compte leurs appels.
  await electronApp.evaluate(({ dialog, shell }, dir) => {
    globalThis.__e2e = { saveDialogs: 0, riskPrompts: 0, opened: 0, acceptRisk: false };
    dialog.showSaveDialogSync = (_window, options) => {
      globalThis.__e2e.saveDialogs += 1;
      return `${dir}\\${options.defaultPath.split(/[\\/]/).pop()}`;
    };
    dialog.showMessageBoxSync = () => { globalThis.__e2e.riskPrompts += 1; return globalThis.__e2e.acceptRisk ? 1 : 0; };
    shell.openPath = async () => { globalThis.__e2e.opened += 1; return ""; };
    shell.openExternal = async () => { globalThis.__e2e.opened += 1; };
  }, target);
  const tab = await tabByUrl("/article");

  await call("navigate", tab.id, `${site.url}/notes.txt`);
  const done = await waitFor(async () => (await state()).downloads.find((d) => d.filename === "notes.txt" && d.state === "completed"), "téléchargement terminé");
  assert.equal(done.risky, false);
  assert.equal(await readFile(join(target, "notes.txt"), "utf8"), "contenu du fichier de test\n");

  // Fichier exécutable refusé par l'utilisateur : rien n'est écrit.
  await call("navigate", tab.id, `${site.url}/outil.exe`);
  await waitFor(() => electronApp.evaluate(() => globalThis.__e2e.riskPrompts === 1), "avertissement fichier à risque");
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await state()).downloads.some((d) => d.filename === "outil.exe"), false);
  await assert.rejects(readFile(join(target, "outil.exe")));

  // Accepté explicitement : enregistré, marqué à risque, jamais ouvert.
  await electronApp.evaluate(() => { globalThis.__e2e.acceptRisk = true; });
  await call("navigate", tab.id, `${site.url}/outil.exe`);
  const risky = await waitFor(async () => (await state()).downloads.find((d) => d.filename === "outil.exe" && d.state === "completed"), "exécutable enregistré");
  assert.equal(risky.risky, true);
  const counters = await electronApp.evaluate(() => globalThis.__e2e);
  assert.equal(counters.saveDialogs, 2, "un dialogue d'enregistrement par téléchargement accepté");
  assert.equal(counters.opened, 0, "aucun fichier téléchargé n'est ouvert ni exécuté");

  assert.equal(await call("removeDownload", risky.id), true);
  assert.equal((await state()).downloads.some((d) => d.id === risky.id), false);
  assert.equal((await readFile(join(target, "outil.exe"), "utf8")).startsWith("MZ"), true, "retirer l'entrée ne supprime pas le fichier");
});

test("navigation privée : session séparée, hors historique, non restaurée", async () => {
  const normal = await tabByUrl("/article") ?? await tabByUrl(site.url);
  await call("navigate", normal.id, `${site.url}/article`);
  await loaded("/article");
  await inPage("/article", "document.cookie = 'profil=normal; path=/'; true");
  const priv = await call("createTab", { url: `${site.altUrl}/produit-a`, isPrivate: true });
  assert.equal(priv.isPrivate, true);
  await waitFor(async () => { const t = (await state()).tabs.find((x) => x.id === priv.id); return t && !t.loading; }, "onglet privé chargé");
  const sessions = await electronApp.evaluate(({ webContents }) => webContents.getAllWebContents()
    .filter((item) => /produit-a|article/.test(item.getURL()))
    .map((item) => ({ url: item.getURL(), persistent: item.session.isPersistent() })));
  assert.equal(sessions.find((s) => s.url.includes("/article")).persistent, true);
  assert.equal(sessions.find((s) => s.url.includes("localhost")).persistent, false, "la session privée n'écrit rien sur disque");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await call("getHistory")).some((h) => h.url.includes("localhost")), false, "aucune trace dans l'historique");
});

test("persistance : favoris, historique, réglages et onglets restaurés après redémarrage", async () => {
  const tab = await tabByUrl("/article");
  await call("addBookmark", { url: `${site.url}/article`, title: "Marées", folder: "Science" });
  await call("updateSettings", { searchEngine: "duckduckgo", agentMode: "observation" });
  const b = await call("createTab", { url: `${site.url}/produit-b` });
  await loaded("/produit-b");
  await call("activateTab", tab.id);
  assert.ok((await call("getHistory")).some((h) => h.url.includes("/article")));
  const expected = (await state()).tabs.filter((t) => !t.isPrivate).map((t) => t.url);
  await new Promise((r) => setTimeout(r, 700)); // laisse la session s'écrire (débounce 400 ms)

  await electronApp.close();
  await launch();
  const { state: restored, settings } = await call("init");
  assert.deepEqual(restored.tabs.map((t) => t.url), expected, "mêmes onglets, même ordre, sans l'onglet privé");
  assert.equal(restored.tabs.find((t) => t.id === restored.activeTabId).url, `${site.url}/article`);
  assert.equal(settings.searchEngine, "duckduckgo");
  assert.equal(settings.agentMode, "observation");
  const { bookmarks, folders } = await call("getBookmarks");
  assert.equal(bookmarks[0].title, "Marées");
  assert.deepEqual(folders, ["Science"]);
  assert.ok((await call("getHistory", "marées")).length >= 1);
  assert.ok((await state()).downloads.some((d) => d.filename === "notes.txt"), "la liste des téléchargements est conservée");
  void b;
  await call("updateSettings", { agentMode: "assistance" });
});
