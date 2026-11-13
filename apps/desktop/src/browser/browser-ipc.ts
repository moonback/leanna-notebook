import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { BrowserAgent } from "./browser-agent";
import type { BrowserDataStore } from "./browser-data-store";
import { extractPage, getSelection } from "./browser-extract";
import type { BrowserManager } from "./browser-manager";
import { BROWSER_COMMANDS, matchShortcut, type BrowserCommand } from "./browser-shortcuts";
import { isTabId } from "./browser-validation";

export type BrowserIpcDeps = {
  manager: BrowserManager;
  store: BrowserDataStore;
  /** Vrai uniquement pour le cadre principal de la fenêtre de l'application, sur son origine. */
  isTrusted: (event: IpcMainInvokeEvent) => boolean;
};

type Handler = (...args: unknown[]) => unknown;

const tab = (value: unknown): string => {
  if (!isTabId(value)) throw new Error("invalid_tab_id");
  return value;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Handlers `browser:*` du moteur et des données locales. Chaque argument est revalidé ici. */
export function browserHandlers({ manager, store }: BrowserIpcDeps): Record<string, Handler> {
  // L'agent ne reçoit qu'une façade de fonctions : aucun objet Electron, aucun accès au stockage.
  const agent = new BrowserAgent({
    getSettings: () => manager.getSettings(), getState: () => manager.getState(), getTab: (id) => manager.getTab(id),
    getActiveTabId: () => manager.getActiveTabId(), createTab: (options) => manager.createTab(options), closeTab: (id) => manager.closeTab(id),
    navigate: (id, url) => manager.navigate(id, url), goBack: (id) => manager.goBack(id), goForward: (id) => manager.goForward(id),
    reload: (id) => manager.reload(id), stop: (id) => manager.stop(id), waitForLoad: (id, timeout) => manager.waitForLoad(id, timeout),
    runInPage: (id, fn, arg) => manager.runInPage(id, fn, arg), capture: (id) => manager.capture(id),
    actInPage: (id, fn, arg) => manager.runInPage(id, fn, arg, [], 10_000, true),
    extract: (id, options) => extractPage(manager, id, options), selection: (id) => getSelection(manager, id),
  });
  // Une seule mission Browser peut contrôler l'état mutable de BrowserAgent à la fois.
  // Le propriétaire est déterminé par le renderer de confiance, jamais par Gemini.
  let agentOwner: "panel" | "voice" | null = null;
  const requestedOwner = (input: unknown): "panel" | "voice" => record(input).owner === "voice" ? "voice" : "panel";
  const assertAgentOwner = (input: unknown) => {
    if (agentOwner !== requestedOwner(input)) throw new Error("browser_agent_busy");
  };
  // Les tool calls d'une même mission sont également sérialisés dans Main.
  let agentQueue: Promise<unknown> = Promise.resolve();
  const enqueueAgent = <T>(operation: () => Promise<T> | T): Promise<T> => {
    const next = agentQueue.then(operation, operation);
    agentQueue = next.then(() => undefined, () => undefined);
    return next;
  };
  return {
    // Agent : le mode d'autonomie est lu dans les réglages à chaque appel, jamais fourni par l'appelant.
    agentStart: (input) => {
      const owner = requestedOwner(input);
      if (agentOwner && agentOwner !== owner) throw new Error("browser_agent_busy");
      agentOwner = owner;
      return agent.startMission(record(input).text, record(input).reset === true);
    },
    agentCall: (input) => { assertAgentOwner(input); return enqueueAgent(() => { assertAgentOwner(input); return agent.call(record(input).name, record(input).args); }); },
    agentResolve: (input) => { assertAgentOwner(input); return enqueueAgent(() => { assertAgentOwner(input); return agent.resolve(record(input).actionId, record(input).approve); }); },
    agentAbort: (input) => {
      assertAgentOwner(input);
      agent.abort(); agentOwner = null; return true;
    },
    agentEnd: (input) => enqueueAgent(() => {
      assertAgentOwner(input);
      agentOwner = null; return true;
    }),

    init: async () => {
      await manager.init();
      return { state: manager.getState(), settings: manager.getSettings() };
    },
    getState: () => manager.getState(),

    createTab: (input) => {
      const args = record(input);
      if (args.isPrivate !== undefined && typeof args.isPrivate !== "boolean") throw new Error("invalid_arguments");
      try {
        return manager.createTab({ url: args.url, isPrivate: args.isPrivate === true });
      } catch {
        return null;
      }
    },
    activateTab: (id) => manager.activateTab(tab(id)),
    closeTab: (id) => manager.closeTab(tab(id)),
    duplicateTab: (id) => {
      try { return manager.duplicateTab(tab(id)); } catch { return null; }
    },
    moveTab: (id, index) => typeof index === "number" && manager.moveTab(tab(id), index),

    navigate: (id, address) => manager.navigate(tab(id), address),
    goBack: (id) => manager.goBack(tab(id)),
    goForward: (id) => manager.goForward(tab(id)),
    reload: (id) => manager.reload(tab(id)),
    stop: (id) => manager.stop(tab(id)),
    setZoom: (id, direction) =>
      (direction === "in" || direction === "out" || direction === "reset") && manager.setZoom(tab(id), direction),
    runCommand: (command) =>
      BROWSER_COMMANDS.includes(command as BrowserCommand) && manager.runCommand(command as BrowserCommand),
    /** Touche pressée dans l'interface : même table de raccourcis que dans les onglets. */
    key: (input) => {
      const args = record(input);
      if (typeof args.key !== "string" || args.key.length > 20) return false;
      const command = matchShortcut({
        key: args.key, control: args.control === true, meta: args.meta === true, shift: args.shift === true, alt: args.alt === true,
      });
      return command ? manager.runCommand(command) : false;
    },

    setBounds: (bounds) => manager.setBounds(bounds),
    setVisible: (visible) => {
      if (typeof visible !== "boolean") throw new Error("invalid_arguments");
      manager.setVisible(visible);
      return true;
    },

    getSettings: () => manager.getSettings(),
    updateSettings: (patch) => manager.updateSettings(patch),

    getHistory: (query) => store.getHistory(query),
    removeVisit: (id) => store.removeVisit(id),
    clearHistory: (sinceMs) => store.clearHistory(sinceMs),

    getBookmarks: (query) => store.getBookmarks(query),
    addBookmark: (input) => {
      const args = record(input);
      return store.addBookmark(args.url, args.title, args.folder);
    },
    updateBookmark: (id, patch) => store.updateBookmark(id, patch),
    removeBookmark: (id) => store.removeBookmark(id),
    addFolder: (name) => store.addFolder(name),
    renameFolder: (from, to) => store.renameFolder(from, to),
    removeFolder: (name) => store.removeFolder(name),

    cancelDownload: (id) => typeof id === "string" && manager.cancelDownload(id),
    showDownloadInFolder: (id) => typeof id === "string" && manager.showDownloadInFolder(id),
    removeDownload: (id) => typeof id === "string" ? manager.removeDownload(id) : false,

    extractPage: (id, options) => extractPage(manager, tab(id), { full: record(options).full === true }),
    getSelection: (id) => getSelection(manager, tab(id)),

    getPermissions: () => store.getPermissions(),
    setPermission: (origin, permission, decision) => manager.setSitePermission(origin, permission, decision),
    clearBrowsingData: async () => { await manager.clearBrowsingData(); return true; },
  };
}

let registered = false;

/**
 * Enregistre les canaux une seule fois par processus (pas de listener dupliqué si la fenêtre est recréée).
 * Un émetteur non approuvé — n'importe quelle page distante — est rejeté avant toute lecture d'argument.
 */
export function registerBrowserIpc(
  deps: BrowserIpcDeps,
  extra: Record<string, Handler> = {},
  ipc: Pick<typeof ipcMain, "handle"> = ipcMain,
): string[] {
  if (registered) return [];
  registered = true;
  const handlers = { ...browserHandlers(deps), ...extra };
  for (const [name, handler] of Object.entries(handlers)) {
    ipc.handle(`browser:${name}`, async (event, ...args) => {
      if (!deps.isTrusted(event)) throw new Error("forbidden");
      return handler(...args);
    });
  }
  return Object.keys(handlers);
}
