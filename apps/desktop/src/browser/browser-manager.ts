import { randomUUID } from "node:crypto";
import { BrowserWindow, WebContentsView, session, type Session } from "electron";
import {
  isSafeBrowserUrl,
  normalizeBrowserBounds,
  resolveBrowserAddress,
  type BrowserBounds,
} from "./browser-validation";

export type BrowserTabState = {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPrivate: boolean;
  error?: string;
};

export type BrowserState = {
  activeTabId: string | null;
  tabs: BrowserTabState[];
};

type BrowserTab = BrowserTabState & {
  view: WebContentsView;
  partition: string;
};

const DEFAULT_BOUNDS: BrowserBounds = { x: 0, y: 150, width: 1000, height: 600 };
const MAX_TABS = 30;

/**
 * Owns all remote WebContentsViews. No WebContents object is returned to the renderer.
 * The normal browser profile is shared by normal tabs; private tabs use isolated
 * non-persistent partitions and are destroyed without session restoration.
 */
export class BrowserManager {
  private readonly tabs = new Map<string, BrowserTab>();
  private window: BrowserWindow | null = null;
  private activeTabId: string | null = null;
  private bounds: BrowserBounds = DEFAULT_BOUNDS;
  private readonly onState: (state: BrowserState) => void;
  private readonly onVisit: (visit: { url: string; title: string; isPrivate: boolean }) => void;
  private readonly configuredSessions = new WeakSet<Session>();

  constructor(
    onState: (state: BrowserState) => void,
    onVisit: (visit: { url: string; title: string; isPrivate: boolean }) => void = () => undefined,
  ) {
    this.onState = onState;
    this.onVisit = onVisit;
  }

  attach(window: BrowserWindow): void {
    this.window = window;
    this.publish();
  }

  getState(): BrowserState {
    return {
      activeTabId: this.activeTabId,
      tabs: [...this.tabs.values()].map(({ view: _view, partition: _partition, ...tab }) => ({ ...tab })),
    };
  }

  async createTab(input?: unknown, isPrivate = false): Promise<BrowserTabState> {
    if (!this.window || this.window.isDestroyed()) throw new Error("browser_window_unavailable");
    if (this.tabs.size >= MAX_TABS) throw new Error("browser_tab_limit");
    const id = randomUUID();
    const url = input === undefined || input === null || input === ""
      ? "https://www.google.com/"
      : resolveBrowserAddress(input);
    if (!url || !isSafeBrowserUrl(url)) throw new Error("invalid_browser_url");

    const partition = isPrivate ? `leanna-browser-private-${id}` : "persist:leanna-browser";
    const browserSession = session.fromPartition(partition);
    this.configureSession(browserSession);

    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    const tab: BrowserTab = {
      id,
      url: "about:blank",
      title: "Nouvel onglet",
      favicon: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      isPrivate,
      view,
      partition,
    };
    this.tabs.set(id, tab);
    this.bindEvents(tab);
    this.activateTab(id);
    this.publish();

    try {
      await view.webContents.loadURL(url);
    } catch (error) {
      tab.error = error instanceof Error ? error.message.slice(0, 300) : "navigation_failed";
      tab.loading = false;
      this.publish();
    }
    return this.toPublicState(tab);
  }

  activateTab(id: string): boolean {
    const next = this.tabs.get(id);
    if (!next || !this.window || this.window.isDestroyed()) return false;
    const previous = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    if (previous) {
      try { this.window.contentView.removeChildView(previous.view); } catch { /* déjà détachée */ }
    }
    this.activeTabId = id;
    try {
      this.window.contentView.addChildView(next.view);
      next.view.setBounds(this.bounds);
    } catch {
      return false;
    }
    this.publish();
    return true;
  }

  async closeTab(id: string): Promise<boolean> {
    const tab = this.tabs.get(id);
    if (!tab) return false;
    const wasActive = this.activeTabId === id;
    if (wasActive && this.window && !this.window.isDestroyed()) {
      try { this.window.contentView.removeChildView(tab.view); } catch { /* déjà détachée */ }
    }
    this.tabs.delete(id);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.destroy();
    if (tab.isPrivate) {
      const privateSession = session.fromPartition(tab.partition);
      void privateSession.clearStorageData().catch(() => {});
      void privateSession.clearCache().catch(() => {});
    }
    if (wasActive) {
      this.activeTabId = null;
      const fallback = [...this.tabs.keys()].at(-1);
      if (fallback) this.activateTab(fallback);
    }
    this.publish();
    return true;
  }

  navigate(id: string, input: unknown): boolean {
    const tab = this.tabs.get(id);
    const url = resolveBrowserAddress(input);
    if (!tab || !url || !isSafeBrowserUrl(url)) return false;
    tab.error = undefined;
    void tab.view.webContents.loadURL(url).catch((error: unknown) => {
      tab.loading = false;
      tab.error = error instanceof Error ? error.message.slice(0, 300) : "navigation_failed";
      this.publish();
    });
    this.publish();
    return true;
  }

  async extractPage(id: string): Promise<{ url: string; title: string; text: string } | null> {
    const tab = this.tabs.get(id);
    if (!tab || !isSafeBrowserUrl(tab.url)) return null;
    try {
      const result = await tab.view.webContents.executeJavaScript(
        "(() => ({ title: document.title || location.href, text: document.body?.innerText || '' }))()",
        true,
      ) as { title?: unknown; text?: unknown };
      if (!result || typeof result.text !== "string") return null;
      return {
        url: tab.url,
        title: typeof result.title === "string" ? result.title.slice(0, 300) : tab.title,
        text: result.text.slice(0, 3_400_000),
      };
    } catch {
      return null;
    }
  }

  goBack(id: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab?.view.webContents.canGoBack()) return false;
    tab.view.webContents.goBack();
    return true;
  }

  goForward(id: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab?.view.webContents.canGoForward()) return false;
    tab.view.webContents.goForward();
    return true;
  }

  reload(id: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab) return false;
    tab.view.webContents.reload();
    return true;
  }

  stop(id: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab) return false;
    tab.view.webContents.stop();
    return true;
  }

  setBounds(input: unknown): boolean {
    const bounds = normalizeBrowserBounds(input);
    if (!bounds) return false;
    this.bounds = bounds;
    const active = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    if (active) active.view.setBounds(bounds);
    return true;
  }

  setVisible(visible: boolean): void {
    const active = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    if (!active || !this.window || this.window.isDestroyed()) return;
    if (visible) {
      this.window.contentView.addChildView(active.view);
      active.view.setBounds(this.bounds);
    } else {
      try { this.window.contentView.removeChildView(active.view); } catch { /* déjà détachée */ }
    }
  }

  async dispose(): Promise<void> {
    const all = [...this.tabs.keys()];
    for (const id of all) await this.closeTab(id);
    this.window = null;
    this.activeTabId = null;
  }

  private configureSession(browserSession: Session): void {
    if (this.configuredSessions.has(browserSession)) return;
    this.configuredSessions.add(browserSession);
    // Autorisations distantes refusées par défaut. Une UI de consentement par origine
    // sera ajoutée avant d'activer les permissions caméra/micro/géolocalisation.
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.on("will-download", (event, item) => {
      // Pas de téléchargement silencieux ni d'écriture automatique dans le profil.
      item.cancel();
      event.preventDefault();
    });
  }

  private bindEvents(tab: BrowserTab): void {
    const contents = tab.view.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeBrowserUrl(url)) void this.createTab(url, tab.isPrivate);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
      if (!isSafeBrowserUrl(url)) event.preventDefault();
    });
    contents.on("will-redirect", (event, url) => {
      if (!isSafeBrowserUrl(url)) event.preventDefault();
    });
    contents.on("page-title-updated", (_event, title) => {
      tab.title = title.slice(0, 300) || tab.url;
      if (isSafeBrowserUrl(tab.url)) {
        this.onVisit({ url: tab.url, title: tab.title, isPrivate: tab.isPrivate });
      }
      this.publish();
    });
    contents.on("page-favicon-updated", (_event, favicons) => {
      const candidate = favicons.find((item) => isSafeBrowserUrl(item));
      tab.favicon = candidate ?? null;
      this.publish();
    });
    contents.on("did-start-loading", () => {
      tab.loading = true;
      tab.error = undefined;
      this.publish();
    });
    contents.on("did-stop-loading", () => {
      tab.loading = false;
      tab.canGoBack = contents.canGoBack();
      tab.canGoForward = contents.canGoForward();
      this.publish();
    });
    const updateUrl = (_event: Electron.Event, url: string) => {
      if (isSafeBrowserUrl(url)) {
        tab.url = url;
        this.onVisit({ url, title: tab.title || url, isPrivate: tab.isPrivate });
      }
      tab.canGoBack = contents.canGoBack();
      tab.canGoForward = contents.canGoForward();
      this.publish();
    };
    contents.on("did-navigate", updateUrl);
    contents.on("did-navigate-in-page", updateUrl);
    contents.on("render-process-gone", () => {
      tab.loading = false;
      tab.error = "page_process_gone";
      this.publish();
    });
  }

  private toPublicState(tab: BrowserTab): BrowserTabState {
    const { view: _view, partition: _partition, ...state } = tab;
    return { ...state };
  }

  private publish(): void {
    this.onState(this.getState());
  }
}
