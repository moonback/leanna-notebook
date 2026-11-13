import { randomUUID } from "node:crypto";
import { validateToolCall, type ToolArgs, type ToolSpec } from "./agent-tools";
import type { AgentMode, BrowserSettings } from "./browser-data-store";
import type { PageContent } from "./browser-extract";
import type { BrowserState, BrowserTabState } from "./browser-manager";
import {
  elementScript, findTextScript, interactiveScript, linksScript, scrollScript, type ElementReport,
} from "./page-scripts";
import { isSafeBrowserUrl, isTabId, searchUrl } from "./browser-validation";

/**
 * Agent de navigation : toutes les règles de sécurité sont appliquées ICI, dans le processus Main.
 * Le modèle ne fait que proposer des appels d'outils ; il ne peut ni changer de mode, ni approuver une
 * action, ni atteindre un objet Electron. Rien de ce module n'est journalisé (ni arguments, ni contenus).
 */

// ── Politique (fonctions pures) ────────────────────────────────────────────

/** Libellés d'éléments qui engagent l'utilisateur : paiement, achat, envoi, publication, compte, suppression, téléchargement. */
const SENSITIVE_LABEL = new RegExp([
  "pay(er|ez|ment)?\\b", "paiement", "acheter", "achat", "commander", "passer (la )?commande", "buy\\b", "purchase", "checkout", "place order", "order now",
  "r[ée]server", "book now", "s['’ ]?abonner", "subscribe", "d[ée]sabonner", "unsubscribe", "virement", "transf[eé]r", "donate", "faire un don",
  "envoyer", "send\\b", "publier", "publish", "poster\\b", "post\\b", "tweet", "partager", "share\\b", "r[ée]pondre", "reply",
  "supprimer", "delete", "remove", "effacer", "d[ée]sactiver", "deactivate", "r[ée]silier", "cancel (subscription|account)",
  "se connecter", "connexion", "sign ?in", "log ?in", "s['’ ]?inscrire", "sign ?up", "register", "cr[ée]er (un|mon) compte", "create account",
  "enregistrer les modifications", "save changes", "mettre [àa] jour", "update (account|profile|password)", "changer (le|de) mot de passe",
  "confirmer", "confirm\\b", "valider", "accepter", "accept\\b", "autoriser", "authorize", "allow\\b", "t[ée]l[ée]charger", "download", "installer", "install\\b",
].join("|"), "i");

export function classifyClick(report: ElementReport): string | null {
  if (report.download) return "téléchargement d'un fichier";
  if (report.label && SENSITIVE_LABEL.test(report.label)) return `action engageante (« ${report.label.slice(0, 60)} »)`;
  if (report.isSubmit && (report.formMethod === "post" || report.formHasPassword || report.formHasPayment)) return "envoi d'un formulaire";
  return null;
}

export function classifyType(report: ElementReport, submit: boolean): string | null {
  if (report.fieldSensitive) return "saisie dans un champ sensible (mot de passe, paiement ou donnée personnelle)";
  if (report.formHasPassword || report.formHasPayment) return "saisie dans un formulaire de connexion ou de paiement";
  if (submit && report.formMethod === "post") return "envoi d'un formulaire";
  return null;
}

/**
 * Registre des adresses « connues » d'une conversation : celles que l'utilisateur a écrites et celles
 * vues telles quelles sur les pages consultées. Une adresse que le modèle fabrique lui-même peut
 * transporter des données (exfiltration) : elle exige donc une confirmation.
 */
export class UrlLedger {
  private readonly urls = new Set<string>();
  private readonly hosts = new Set<string>();

  private static key(url: string): string | null {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private static host(value: string): string {
    return value.toLowerCase().replace(/^www\./, "");
  }

  private userText = "";

  /**
   * Vrai si ce texte figure tel quel dans une demande de l'utilisateur. Un texte que le modèle compose
   * lui-même peut contenir des données lues ailleurs : le saisir dans une page reviendrait à les lui transmettre.
   */
  isUserProvided(text: string): boolean {
    const wanted = text.replace(/\s+/g, " ").trim().toLowerCase();
    return wanted.length > 0 && wanted.length <= 300 && this.userText.includes(wanted);
  }

  /** Adresses et noms de domaine écrits par l'utilisateur. */
  addUserText(text: string): void {
    this.userText = `${this.userText}\n${text.replace(/\s+/g, " ").toLowerCase()}`.slice(-20_000);
    for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
      const key = UrlLedger.key(match[0].replace(/[.,;:!?]+$/, ""));
      if (key) { this.urls.add(key); this.hosts.add(UrlLedger.host(new URL(key).hostname)); }
    }
    for (const match of text.matchAll(/(?<![\w@/.-])((?:[a-z0-9-]+\.)+[a-z]{2,24})(?![\w-])/gi)) this.hosts.add(UrlLedger.host(match[1]));
  }

  /** Adresses relevées sur une page (liens, onglets ouverts) : elles ne peuvent pas contenir nos données. */
  addUrls(urls: Iterable<string>): void {
    for (const url of urls) {
      const key = UrlLedger.key(url);
      if (key && this.urls.size < 5_000) this.urls.add(key);
    }
  }

  isKnown(url: string): boolean {
    const key = UrlLedger.key(url);
    if (!key) return false;
    return this.urls.has(key) || this.hosts.has(UrlLedger.host(new URL(key).hostname));
  }
}

export type Decision = "allow" | "confirm" | "refuse";

/** Règle unique d'autorisation d'un appel d'outil. */
export function decide(input: {
  tool: ToolSpec; mode: AgentMode; confirmations: BrowserSettings["confirmations"]; sensitive: string | null; unknownUrl: boolean;
}): Decision {
  if (input.tool.readOnly) return "allow";
  if (input.mode === "observation") return "refuse";
  if (input.tool.name === "save_to_notebook" || input.sensitive || input.unknownUrl) return "confirm";
  if (input.mode === "assistance" || input.confirmations === "every-action") return "confirm";
  return "allow";
}

// ── Exécution ──────────────────────────────────────────────────────────────

export type SaveRequest = {
  mode: "link" | "text" | "summary" | "selection";
  url: string; title: string; favicon: string | null; text?: string; summary?: string;
};

export type AgentOutcome =
  | { status: "ok"; tool: string; summary: string; result: Record<string, unknown>; image?: string; save?: SaveRequest }
  | { status: "confirmation_required"; tool: string; summary: string; actionId: string; reason: string }
  | { status: "refused" | "denied" | "error"; tool: string; summary: string; error: string; message: string };

/** Ce dont l'agent a besoin du navigateur (BrowserManager en production, un simulacre dans les tests). */
export type AgentBrowser = {
  getSettings(): BrowserSettings;
  getState(): BrowserState;
  getTab(id: string): BrowserTabState | null;
  getActiveTabId(): string | null;
  createTab(options: { url?: unknown }): BrowserTabState;
  closeTab(id: string): boolean;
  navigate(id: string, url: unknown): boolean;
  goBack(id: string): boolean;
  goForward(id: string): boolean;
  reload(id: string): boolean;
  stop(id: string): boolean;
  waitForLoad(id: string, timeoutMs?: number): Promise<void>;
  runInPage<A, R>(id: string, fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  /** Comme runInPage, avec activation utilisateur : réservé aux actions (clic, saisie) déjà autorisées. */
  actInPage<A, R>(id: string, fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  capture(id: string): Promise<{ dataUrl: string; width: number; height: number } | null>;
  extract(id: string, options?: { full?: boolean }): Promise<PageContent>;
  selection(id: string): Promise<string>;
};

type Pending = { tool: ToolSpec; args: ToolArgs; tabId: string | null; signature?: string; summary: string; mission: number };

const MESSAGES: Record<string, string> = {
  observation_mode: "Mode observation : cette action n'est pas permise. L'utilisateur peut passer en mode assistance.",
  mission_aborted: "La mission a été interrompue par l'utilisateur.",
  user_denied: "L'utilisateur a refusé cette action.",
  no_active_tab: "Aucun onglet n'est ouvert.",
  tab_not_found: "Cet onglet n'existe pas (ou plus).",
  invalid_url: "Adresse refusée : seules les adresses http(s) complètes sont acceptées.",
  element_not_found: "Élément introuvable. Relis la page pour obtenir des repères à jour.",
  element_changed: "L'élément a changé depuis son inspection : action annulée par sécurité.",
  not_editable: "Cet élément n'accepte pas de saisie.",
  nothing_to_do: "Aucune page vers laquelle aller.",
  expired: "Cette demande de confirmation n'est plus valable.",
};

export class BrowserAgent {
  private ledger = new UrlLedger();
  private readonly pending = new Map<string, Pending>();
  private mission = 0;
  private aborted = false;

  constructor(private readonly browser: AgentBrowser) {}

  /** Nouveau tour utilisateur. `reset` démarre une conversation vierge (registre d'adresses vidé). */
  startMission(userText: unknown, reset = false): { mission: number; mode: AgentMode } {
    if (reset) this.ledger = new UrlLedger();
    this.mission += 1;
    this.aborted = false;
    this.pending.clear();
    if (typeof userText === "string") this.ledger.addUserText(userText.slice(0, 8_000));
    // Les pages que l'utilisateur a lui-même ouvertes sont des destinations connues.
    this.ledger.addUrls(this.browser.getState().tabs.map((tab) => tab.url));
    return { mission: this.mission, mode: this.browser.getSettings().agentMode };
  }

  /** Interruption immédiate : plus aucune action n'est exécutée et les confirmations en attente sont annulées. */
  abort(): void {
    this.aborted = true;
    this.pending.clear();
    const active = this.browser.getActiveTabId();
    if (active) this.browser.stop(active);
  }

  async call(name: unknown, rawArgs: unknown): Promise<AgentOutcome> {
    const label = typeof name === "string" ? name.slice(0, 64) : "?";
    const checked = validateToolCall(name, rawArgs);
    if (!checked.ok) return this.fail("refused", label, label, checked.error, `Appel d'outil invalide (${checked.error}).`);
    const { tool, args } = checked;
    if (this.aborted) return this.fail("refused", tool.name, tool.name, "mission_aborted");

    const settings = this.browser.getSettings();
    const tabId = this.resolveTab(tool, args);
    if (tabId instanceof Error) return this.fail("error", tool.name, tool.name, tabId.message);

    // Inspection préalable : ce que l'action va réellement toucher.
    let sensitive: string | null = null;
    let unknownUrl = false;
    let signature: string | undefined;
    let detail = "";
    try {
      if ((tool.name === "open_url" || tool.name === "new_tab") && typeof args.url === "string") {
        if (!isSafeBrowserUrl(args.url)) return this.fail("refused", tool.name, `Ouvrir ${String(args.url).slice(0, 80)}`, "invalid_url");
        unknownUrl = !this.ledger.isKnown(args.url);
      }
      if ((tool.name === "click_element" || tool.name === "type_text") && tabId && settings.agentMode !== "observation") {
        const report = await this.browser.runInPage(tabId, elementScript, { element: String(args.element), action: "describe" as const });
        if (!report.found) return this.fail("error", tool.name, `${tool.name === "click_element" ? "Cliquer sur" : "Saisir dans"} « ${String(args.element).slice(0, 60)} »`, "element_not_found");
        signature = report.signature;
        detail = report.label || String(args.element);
        sensitive = tool.name === "click_element" ? classifyClick(report) : classifyType(report, args.submit === true);
        if (tool.name === "type_text" && !sensitive && !this.ledger.isUserProvided(String(args.text))) {
          sensitive = "texte rédigé par l'assistant, absent de votre demande";
        }
      }
    } catch (error) {
      return this.fail("error", tool.name, tool.name, "page_unavailable", this.pageError(error));
    }

    const summary = this.summarize(tool, args, tabId, detail);
    const decision = decide({ tool, mode: settings.agentMode, confirmations: settings.confirmations, sensitive, unknownUrl });
    if (decision === "refuse") return this.fail("refused", tool.name, summary, "observation_mode");
    if (decision === "confirm") {
      const actionId = randomUUID();
      this.pending.clear(); // une seule action en attente à la fois
      this.pending.set(actionId, { tool, args, tabId, signature, summary, mission: this.mission });
      const reason = sensitive ?? (unknownUrl ? "adresse absente de votre demande et des pages consultées"
        : tool.name === "save_to_notebook" ? "enregistrement dans votre Notebook" : "validation de chaque action (mode assistance)");
      return { status: "confirmation_required", tool: tool.name, summary, actionId, reason };
    }
    return this.execute(tool, args, tabId, signature, summary);
  }

  /** Décision de l'utilisateur sur une action en attente. Seule une approbation explicite l'exécute. */
  async resolve(actionId: unknown, approve: unknown): Promise<AgentOutcome> {
    const entry = typeof actionId === "string" ? this.pending.get(actionId) : undefined;
    if (!entry || entry.mission !== this.mission || this.aborted) {
      return this.fail("error", entry?.tool.name ?? "?", entry?.summary ?? "", this.aborted ? "mission_aborted" : "expired");
    }
    this.pending.delete(actionId as string);
    if (approve !== true) return this.fail("denied", entry.tool.name, entry.summary, "user_denied");
    return this.execute(entry.tool, entry.args, entry.tabId, entry.signature, entry.summary);
  }

  // ── Interne ───────────────────────────────────────────────────────────────
  private fail(status: "refused" | "denied" | "error", tool: string, summary: string, error: string, message?: string): AgentOutcome {
    return { status, tool, summary, error, message: message ?? MESSAGES[error] ?? error };
  }

  private pageError(error: unknown): string {
    const code = error instanceof Error ? error.message : "";
    return code === "page_load_failed" ? "La page n'a pas pu être chargée." : code === "page_script_timeout" ? "La page ne répond pas." : "La page est inaccessible.";
  }

  private resolveTab(tool: ToolSpec, args: ToolArgs): string | null | Error {
    if (!("tab_id" in tool.parameters.properties)) return this.browser.getActiveTabId();
    if (typeof args.tab_id === "string") {
      return isTabId(args.tab_id) && this.browser.getTab(args.tab_id) ? args.tab_id : new Error("tab_not_found");
    }
    return this.browser.getActiveTabId() ?? new Error("no_active_tab");
  }

  private summarize(tool: ToolSpec, args: ToolArgs, tabId: string | null, detail: string): string {
    const title = (tabId && this.browser.getTab(tabId)?.title) || "la page";
    const short = (value: unknown, max = 80) => String(value ?? "").replace(/\s+/g, " ").slice(0, max);
    switch (tool.name) {
      case "open_url": return `Ouvrir ${short(args.url, 120)}`;
      case "new_tab": return args.url ? `Ouvrir un nouvel onglet sur ${short(args.url, 120)}` : "Ouvrir un nouvel onglet";
      case "close_tab": return `Fermer l'onglet « ${short(title, 60)} »`;
      case "go_back": return "Revenir à la page précédente";
      case "go_forward": return "Aller à la page suivante";
      case "reload": return "Recharger la page";
      case "get_page_content": return `Lire « ${short(title, 60)} »`;
      case "get_page_metadata": return `Lire les métadonnées de « ${short(title, 60)} »`;
      case "extract_links": return `Relever les liens de « ${short(title, 60)} »`;
      case "extract_tables": return `Relever les tableaux de « ${short(title, 60)} »`;
      case "find_text": return `Chercher « ${short(args.query, 60)} » dans la page`;
      case "click_element": return `Cliquer sur « ${short(detail || args.element, 60)} »`;
      case "type_text": return `Saisir « ${short(args.text, 60)} » dans « ${short(detail || args.element, 40)} »${args.submit ? " et valider" : ""}`;
      case "scroll_page": return "Faire défiler la page";
      case "take_screenshot": return "Capturer la page";
      case "get_active_tab": return "Consulter la liste des onglets";
      case "search_web": return `Rechercher « ${short(args.query, 80)} » sur le web`;
      case "compare_pages": return `Lire ${(args.tab_ids as string[]).length} onglets pour les comparer`;
      case "save_to_notebook": return `Ajouter « ${short(title, 60)} » au Notebook (${{ link: "lien seul", text: "contenu", summary: "contenu et synthèse", selection: "sélection" }[args.mode as string]})`;
      default: return tool.name;
    }
  }

  private tabInfo(id: string): Record<string, unknown> {
    const tab = this.browser.getTab(id);
    return tab
      ? { tab_id: id, url: tab.url, title: tab.title, ...(tab.error ? { status: "failed", error: tab.error.message } : { status: "loaded" }) }
      : { tab_id: id, status: "closed" };
  }

  private pageResult(page: PageContent, maxChars: number): Record<string, unknown> {
    if (page.status !== "ok") {
      return { status: page.status, url: page.url, title: page.title, reason: page.reason ?? "page sans contenu textuel", note: "Contenu indisponible : ne pas l'inventer." };
    }
    return {
      status: "ok", url: page.url, title: page.title, description: page.description, published_at: page.publishedAt,
      truncated: page.truncated || page.text.length > maxChars, headings: page.headings.slice(0, 30).map((h) => `${"#".repeat(h.level)} ${h.text}`),
      text: page.text.slice(0, maxChars),
    };
  }

  private async execute(tool: ToolSpec, args: ToolArgs, tabId: string | null, signature: string | undefined, summary: string): Promise<AgentOutcome> {
    if (this.aborted) return this.fail("refused", tool.name, summary, "mission_aborted");
    const ok = (result: Record<string, unknown>, extra: { image?: string; save?: SaveRequest } = {}): AgentOutcome =>
      ({ status: "ok", tool: tool.name, summary, result, ...extra });
    const b = this.browser;
    try {
      // Outils sans onglet cible.
      if (tool.name === "new_tab") {
        const tab = b.createTab({ url: args.url });
        await b.waitForLoad(tab.id);
        return ok(this.tabInfo(tab.id));
      }
      if (tool.name === "get_active_tab") {
        const state = b.getState();
        return ok({ active_tab_id: state.activeTabId, tabs: state.tabs.map((tab) => ({ tab_id: tab.id, title: tab.title, url: tab.url, active: tab.id === state.activeTabId })) });
      }
      if (tool.name === "compare_pages") {
        const pages = [];
        for (const id of args.tab_ids as string[]) {
          if (!isTabId(id) || !b.getTab(id)) return this.fail("error", tool.name, summary, "tab_not_found");
          const page = await b.extract(id);
          this.ledger.addUrls(page.links.map((link) => link.url));
          pages.push({ tab_id: id, ...this.pageResult(page, 6_000), tables: page.tables.slice(0, 3) });
        }
        return ok({ pages });
      }
      if (tool.name === "search_web") {
        const url = searchUrl(String(args.query), b.getSettings().searchEngine);
        const id = tabId ?? b.createTab({ url }).id;
        if (tabId) b.navigate(id, url);
        await b.waitForLoad(id);
        const results = await b.runInPage(id, linksScript, { max: 40, filter: "" }).catch(() => []);
        this.ledger.addUrls([url, ...results.map((link) => link.url)]);
        return ok({ ...this.tabInfo(id), results });
      }

      if (!tabId) return this.fail("error", tool.name, summary, "no_active_tab");
      switch (tool.name) {
        case "open_url":
          b.navigate(tabId, args.url);
          await b.waitForLoad(tabId);
          return ok(this.tabInfo(tabId));
        case "close_tab": b.closeTab(tabId); return ok({ closed: true });
        case "go_back": case "go_forward": {
          const moved = tool.name === "go_back" ? b.goBack(tabId) : b.goForward(tabId);
          if (!moved) return this.fail("error", tool.name, summary, "nothing_to_do");
          await b.waitForLoad(tabId);
          return ok(this.tabInfo(tabId));
        }
        case "reload": b.reload(tabId); await b.waitForLoad(tabId); return ok(this.tabInfo(tabId));
        case "get_page_content": {
          const page = await b.extract(tabId);
          const interactive = page.status === "unavailable" ? [] : await b.runInPage(tabId, interactiveScript, { max: 60 }).catch(() => []);
          this.ledger.addUrls([...page.links.map((link) => link.url), ...interactive.flatMap((item) => item.href ? [item.href] : [])]);
          return ok({ tab_id: tabId, ...this.pageResult(page, 24_000), interactive });
        }
        case "get_page_metadata": {
          const page = await b.extract(tabId);
          return ok({
            status: page.status, url: page.url, title: page.title, description: page.description, site_name: page.siteName, author: page.author,
            lang: page.lang, published_at: page.publishedAt, canonical_url: page.canonicalUrl, word_count: page.wordCount,
          });
        }
        case "extract_links": {
          const links = await b.runInPage(tabId, linksScript, { max: 150, filter: String(args.filter ?? "") });
          this.ledger.addUrls(links.map((link) => link.url));
          return ok({ url: b.getTab(tabId)?.url, count: links.length, links });
        }
        case "extract_tables": {
          const page = await b.extract(tabId);
          return ok({ status: page.status, url: page.url, tables: page.tables });
        }
        case "find_text": return ok({ url: b.getTab(tabId)?.url, ...(await b.runInPage(tabId, findTextScript, { query: String(args.query), max: 10 })) });
        case "scroll_page": return ok(await b.runInPage(tabId, scrollScript, { direction: args.direction as "up" | "down" | "top" | "bottom" }));
        case "take_screenshot": {
          const shot = await b.capture(tabId);
          if (!shot) return this.fail("error", tool.name, summary, "capture_failed", "La capture a échoué.");
          return ok({ captured: true, width: shot.width, height: shot.height, note: "Image affichée à l'utilisateur." }, { image: shot.dataUrl });
        }
        case "click_element": case "type_text": {
          const report = await b.actInPage(tabId, elementScript, {
            element: String(args.element), action: tool.name === "click_element" ? "click" as const : "type" as const,
            text: typeof args.text === "string" ? args.text : undefined, submit: args.submit === true, signature,
          });
          if (!report.found) return this.fail("error", tool.name, summary, "element_not_found");
          if (report.changed) return this.fail("error", tool.name, summary, "element_changed");
          if (!report.done) return this.fail("error", tool.name, summary, "not_editable");
          // Laisse une éventuelle navigation démarrer puis se terminer.
          await new Promise((resolve) => setTimeout(resolve, 250));
          await b.waitForLoad(tabId, 10_000);
          return ok({ done: true, element: report.label, ...this.tabInfo(tabId) });
        }
        case "save_to_notebook": {
          const tab = b.getTab(tabId);
          if (!tab || !isSafeBrowserUrl(tab.url)) return this.fail("error", tool.name, summary, "tab_not_found");
          const mode = args.mode as SaveRequest["mode"];
          const save: SaveRequest = { mode, url: tab.url, title: tab.title, favicon: tab.favicon };
          if (mode === "selection") {
            save.text = await b.selection(tabId);
            if (!save.text.trim()) return this.fail("error", tool.name, summary, "empty_selection", "Aucun texte n'est sélectionné dans la page.");
          } else if (mode !== "link") {
            const page = await b.extract(tabId, { full: true });
            if (page.status !== "ok") return this.fail("error", tool.name, summary, "page_unavailable", "Le contenu de la page est indisponible : rien n'a été enregistré.");
            save.title = page.title || tab.title;
            save.text = page.text;
            if (mode === "summary") save.summary = typeof args.summary === "string" ? args.summary : "";
          }
          // L'enregistrement lui-même est fait par l'application web (session de l'utilisateur) : voir agent-runner.
          return ok({ status: "approved_by_user" }, { save });
        }
        default: return this.fail("error", tool.name, summary, "unknown_tool");
      }
    } catch (error) {
      return this.fail("error", tool.name, summary, "page_unavailable", this.pageError(error));
    }
  }
}
