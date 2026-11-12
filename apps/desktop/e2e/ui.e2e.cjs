// Parcours de bout en bout de l'INTERFACE : la vraie UI React (apps/web/app/browser) pilotée dans Electron,
// branchée sur le vrai moteur. Seule l'API serveur est simulée (modèle scripté, Notebook) — voir servers.cjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdir, mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { _electron: electron } = require("playwright-core");
const { startSite, startApp } = require("./servers.cjs");
const { buildUi } = require("./build-ui.cjs");

const MAIN = resolve(__dirname, "../dist/main.js");
const SHOTS = resolve(__dirname, "../e2e-artifacts");
const NOTEBOOK = "11111111-1111-4111-8111-111111111111";
let site, appServer, userData, electronApp, win, ui;

async function launch() {
  electronApp = await electron.launch({
    executablePath: require("electron"),
    args: [MAIN, `--user-data-dir=${userData}`],
    env: { ...process.env, LEANNA_WEB_URL: appServer.url },
  });
  win = await electronApp.firstWindow();
  await win.waitForSelector("[data-browser-ready=true]", { timeout: 20_000 });
}

const state = () => win.evaluate(() => window.leannaDesktop.browser.getState());
async function waitFor(predicate, message, timeout = 15_000) {
  const start = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() - start > timeout) assert.fail(`délai dépassé : ${message}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}
const activeTab = async () => { const s = await state(); return s.tabs.find((tab) => tab.id === s.activeTabId); };
const activeLoaded = (fragment) => waitFor(async () => {
  const tab = await activeTab();
  return tab && tab.url.includes(fragment) && !tab.loading ? tab : null;
}, `onglet actif sur ${fragment}`);
/** Capture de toute la fenêtre, vue native comprise (ce que voit réellement l'utilisateur). */
async function shot(name) {
  await mkdir(SHOTS, { recursive: true });
  const png = await electronApp.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString("base64"));
  await require("node:fs/promises").writeFile(join(SHOTS, `${name}.png`), Buffer.from(png, "base64"));
  // capturePage() de la fenêtre n'inclut pas la vue native : on capture aussi le contenu de l'onglet actif.
  const view = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const views = BrowserWindow.getAllWindows()[0].contentView.children;
    const last = views[views.length - 1];
    return last?.webContents ? (await last.webContents.capturePage()).toPNG().toString("base64") : null;
  });
  if (view) await require("node:fs/promises").writeFile(join(SHOTS, `${name}-page.png`), Buffer.from(view, "base64"));
}
/** Rend le focus clavier à l'interface (un clic réel le fait ; Playwright, lui, n'envoie pas d'événement OS). */
const focusUi = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.focus());
async function go(address, fragment = address) {
  await focusUi();
  const input = win.getByLabel("Adresse web ou recherche");
  await input.fill(address);
  await input.press("Enter");
  return activeLoaded(fragment);
}

test.before(async () => {
  site = await startSite();
  ui = await buildUi({ notebookId: NOTEBOOK });
  appServer = await startApp(ui);
  userData = await mkdtemp(join(tmpdir(), "leanna-ui-e2e-"));
  // Page d'accueil locale : le parcours ne dépend d'aucun site externe.
  await require("node:fs/promises").writeFile(join(userData, "browser-data.json"),
    JSON.stringify({ version: 2, settings: { homepage: `${site.url}/vide` } }));
  await launch();
  await activeLoaded("/vide");
});

test.after(async () => {
  await electronApp?.close().catch(() => undefined);
  await site?.close();
  await appServer?.close();
  await rm(userData, { recursive: true, force: true }).catch(() => undefined);
  await rm(ui.dir, { recursive: true, force: true }).catch(() => undefined);
});

test("interface : barre d'adresse, indicateur de sécurité, navigation et vue native alignée", async () => {
  const tab = await go(`${site.url}/article`, "/article");
  assert.equal(tab.title, "Les marées expliquées");
  assert.equal(await win.getByLabel("Adresse web ou recherche").inputValue(), `${site.url}/article`);
  assert.equal(await win.locator("[data-security]").getAttribute("data-security"), "insecure");
  assert.equal(await win.getByRole("tab", { selected: true }).innerText(), "Les marées expliquées");

  // La vue Chromium native occupe exactement la zone réservée par l'interface.
  const zone = await win.locator("[data-browser-viewport]").boundingBox();
  const view = await electronApp.evaluate(({ BrowserWindow }) => {
    const views = BrowserWindow.getAllWindows()[0].contentView.children;
    return views[views.length - 1].getBounds();
  });
  for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(view[key] - zone[key]) <= 1, `${key}: vue ${view[key]} / zone ${zone[key]}`);
  await shot("01-navigation");

  await win.getByLabel("Page précédente").click();
  await activeLoaded("/vide");
  await win.getByLabel("Page suivante").click();
  await activeLoaded("/article");
});

test("interface : recherche depuis la barre d'adresse avec le moteur configuré", async () => {
  await win.evaluate(() => window.leannaDesktop.browser.updateSettings({ searchEngine: "duckduckgo" }));
  const input = win.getByLabel("Adresse web ou recherche");
  await input.fill("marées bretagne");
  await input.press("Enter");
  const tab = await waitFor(async () => { const t = await activeTab(); return t.url.includes("duckduckgo.com") ? t : null; }, "recherche lancée");
  assert.match(tab.url, /duckduckgo\.com\/\?q=mar%C3%A9es(%20|\+)bretagne/);
  // Laisse le moteur de recherche finir sa propre redirection avant de naviguer ailleurs.
  await waitFor(async () => !(await activeTab()).loading, "fin du chargement de la recherche", 30_000);
  await go(`${site.url}/article`, "/article");
});

test("interface : onglets (nouveau, bascule, duplication, fermeture) et raccourcis clavier", async () => {
  await win.getByLabel("Nouvel onglet", { exact: true }).click();
  await waitFor(async () => (await state()).tabs.length === 2, "nouvel onglet");
  await go(`${site.url}/produit-a`, "/produit-a");
  assert.equal(await win.getByRole("tab").count(), 2);

  await win.getByRole("tab", { name: /marées/i }).click();
  await activeLoaded("/article");

  await win.getByLabel(/^Dupliquer l’onglet Les marées/).click({ force: true });
  await waitFor(async () => (await state()).tabs.filter((t) => t.url.includes("/article")).length === 2, "onglet dupliqué");

  // Raccourcis depuis l'interface : Ctrl+W ferme l'onglet (et non la fenêtre), Ctrl+L sélectionne l'adresse.
  await focusUi();
  await win.getByRole("tab", { selected: true }).focus();
  await win.keyboard.press("Control+w");
  await waitFor(async () => (await state()).tabs.length === 2, "Ctrl+W ferme l'onglet actif");
  assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await win.keyboard.press("Control+l");
  await waitFor(() => win.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Adresse web ou recherche"), "Ctrl+L");
  await win.keyboard.press("Control+Tab");
  const before = (await state()).activeTabId;
  await win.keyboard.press("Control+Tab");
  await waitFor(async () => (await state()).activeTabId !== before, "Ctrl+Tab change d'onglet");
  await shot("02-onglets");
});

test("interface : page d'erreur lisible et favoris depuis la barre d'adresse", async () => {
  const input = win.getByLabel("Adresse web ou recherche");
  await input.fill("http://127.0.0.1:9/");
  await input.press("Enter");
  await win.getByText("Impossible d’afficher cette page").waitFor();
  await shot("03-erreur");
  await win.getByRole("button", { name: "Réessayer" }).waitFor();
  await go(`${site.url}/article`, "/article");
  assert.equal(await win.getByText("Impossible d’afficher cette page").count(), 0);

  await win.getByLabel("Ajouter aux favoris").click();
  await win.getByLabel("Retirer des favoris").waitFor();
  const saved = await win.evaluate(() => window.leannaDesktop.browser.getBookmarks());
  assert.equal(saved.bookmarks[0].title, "Les marées expliquées");
});
