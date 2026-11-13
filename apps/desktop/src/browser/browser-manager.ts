import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { BrowserWindow, WebContentsView, session, shell, type DownloadItem, type Session, type WebContents } from "electron";
import {
  DEFAULT_SETTINGS, type BrowserDataStore, type BrowserDownload, type BrowserSettings, type PermissionDecision,
} from "./browser-data-store";
import { matchShortcut, UI_COMMANDS, type BrowserCommand } from "./browser-shortcuts";
import {
  SEARCH_ENGINES, decidePermission, describeLoadError, isRiskyDownload, isSafeBrowserUrl, isSafeSubframeUrl,
  moveItem, normalizeBrowserBounds, resolveBrowserAddress, type BrowserBounds,
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
  /** Zoom en pourcentage (100 = taille réelle). */
  zoom: number;
  security: "secure" | "insecure" | "internal";
  error: { code: number; message: string; url: string } | null;
  crashed: boolean;
  blockedPopups: number;
};

export type BrowserState = {
  activeTabId: string | null;
  tabs: BrowserTabState[];
  fullscreen: boolean;
  downloads: BrowserDownload[];
};

type BrowserTab = {
  id: string;
  view: WebContentsView;
  partition: string;
  isPrivate: boolean;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  error: BrowserTabState["error"];
  crashed: boolean;
  blockedPopups: number;
  /** Onglet restauré mais pas encore chargé (chargement à la première activation). */
  pendingUrl: string | null;
  popupTimes: number[];
};

export type ManagerDeps = {
  store: BrowserDataStore;
  onState: (state: BrowserState) => void;
  /** Commande d'interface (focus de la barre d'adresse, panneaux…) à relayer au renderer. */
  onCommand: (command: BrowserCommand) => void;
  /** Dialogues natifs, injectés pour rester remplaçables en test. Les deux premiers sont synchrones. */
  chooseSavePath: (window: BrowserWindow, filename: string) => string | null;
  confirmRiskyDownload: (window: BrowserWindow, filename: string) => boolean;
  askPermission: (window: BrowserWindow, origin: string, permission: string) => Promise<{ allow: boolean; remember: boolean }>;
  onOpenVoice: () => void;
};

const DEFAULT_BOUNDS: BrowserBounds = { x: 0, y: 150, width: 1000, height: 600 };
const MAX_TABS = 30;
const NORMAL_PARTITION = "persist:leanna-browser";
/** Monde JavaScript isolé de celui de la page : elle ne peut ni lire ni modifier nos scripts. */
const ISOLATED_WORLD_ID = 4217;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * Possède toutes les WebContentsView distantes. Aucun objet WebContents ne quitte ce module :
 * le renderer et l'agent ne reçoivent que des états sérialisables.
 */
export class BrowserManager {
  private tabs: BrowserTab[] = [];
  private window: BrowserWindow | null = null;
  private launcherWindow: BrowserWindow | null = null;
  private launcherEnabled = true;
  private activeTabId: string | null = null;
  private bounds: BrowserBounds = DEFAULT_BOUNDS;
  private visible = false;
  private htmlFullscreen = false;
  private initialized: Promise<void> | null = null;
  private settings: BrowserSettings = { ...DEFAULT_SETTINGS };
  private downloads: BrowserDownload[] = [];
  private readonly liveDownloads = new Map<string, DownloadItem>();
  private permissionCache: Record<string, Record<string, PermissionDecision>> = {};
  private readonly configuredSessions = new WeakSet<Session>();
  private sessionTimer: NodeJS.Timeout | null = null;
  private publishTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: ManagerDeps) {}

  attach(window: BrowserWindow): void {
    this.window = window;
    this.createLauncherWindow(window);
    const reposition = () => this.positionLauncher();
    window.on("move", reposition);
    window.on("resize", reposition);
    window.on("maximize", reposition);
    window.on("unmaximize", reposition);
    window.on("enter-full-screen", () => { this.syncLauncherVisibility(); this.publish(); });
    window.on("leave-full-screen", () => { this.syncLauncherVisibility(); this.publish(); });
    window.on("minimize", () => this.syncLauncherVisibility());
    window.on("restore", () => { this.positionLauncher(); this.syncLauncherVisibility(); });
  }

  /** Charge réglages, téléchargements et permissions, puis restaure la session. Idempotent. */
  init(): Promise<void> {
    this.initialized ??= (async () => {
      const { store } = this.deps;
      this.settings = await store.getSettings();
      this.downloads = await store.getDownloads();
      this.permissionCache = await store.getPermissions();
      if (this.settings.cookies === "clear-on-exit") {
        const normal = session.fromPartition(NORMAL_PARTITION);
        await normal.clearStorageData().catch(() => undefined);
        await normal.clearCache().catch(() => undefined);
      }
      if (this.settings.restoreTabs) {
        const saved = await store.getSession();
        for (const tab of saved.tabs) this.createTab({ url: tab.url, title: tab.title, background: true, lazy: true });
        const active = this.tabs[saved.activeIndex] ?? this.tabs[0];
        if (active) this.activateTab(active.id);
      }
      if (this.tabs.length === 0) this.createTab({});
    })();
    return this.initialized;
  }

  getSettings(): BrowserSettings {
    return { ...this.settings };
  }

  async updateSettings(patch: unknown): Promise<BrowserSettings> {
    this.settings = await this.deps.store.updateSettings(patch);
    return this.getSettings();
  }

  getState(): BrowserState {
    return {
      activeTabId: this.activeTabId,
      tabs: this.tabs.map((tab) => this.toPublicState(tab)),
      fullscreen: Boolean(this.window && !this.window.isDestroyed() && this.window.isFullScreen()),
      downloads: this.downloads.map((item) => ({ ...item })),
    };
  }

  getTab(id: string): BrowserTabState | null {
    const tab = this.find(id);
    return tab ? this.toPublicState(tab) : null;
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  homeUrl(): string {
    return this.settings.homepage || SEARCH_ENGINES[this.settings.searchEngine].home;
  }

  resolveAddress(input: unknown): string | null {
    return resolveBrowserAddress(input, this.settings.searchEngine);
  }

  // ── Onglets ─────────────────────────────────────────────────────────────
  createTab(options: {
    url?: unknown; title?: string; isPrivate?: boolean; background?: boolean; lazy?: boolean; afterId?: string;
  }): BrowserTabState {
    if (!this.window || this.window.isDestroyed()) throw new Error("browser_window_unavailable");
    if (this.tabs.length >= MAX_TABS) throw new Error("browser_tab_limit");
    const url = options.url === undefined || options.url === null || options.url === ""
      ? this.homeUrl()
      : this.resolveAddress(options.url);
    if (!url || !isSafeBrowserUrl(url)) throw new Error("invalid_browser_url");

    const id = randomUUID();
    const isPrivate = options.isPrivate === true;
    // Sans préfixe « persist: », la partition est en mémoire : rien n'est écrit sur disque.
    const partition = isPrivate ? `leanna-browser-private-${id}` : NORMAL_PARTITION;
    const browserSession = session.fromPartition(partition);
    this.configureSession(browserSession);

    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        // Aucun preload : la page n'a ni ipcRenderer ni API de l'application.
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        navigateOnDragDrop: false,
      },
    });

    const tab: BrowserTab = {
      id, view, partition, isPrivate, url, title: options.title || "Nouvel onglet", favicon: null, loading: false,
      error: null, crashed: false, blockedPopups: 0, pendingUrl: options.lazy ? url : null, popupTimes: [],
    };
    const anchor = options.afterId ? this.tabs.findIndex((item) => item.id === options.afterId) : -1;
    this.tabs.splice(anchor >= 0 ? anchor + 1 : this.tabs.length, 0, tab);
    this.bindEvents(tab);
    if (!options.background || !this.activeTabId) this.activateTab(id);
    if (!options.lazy) this.load(tab, url);
    this.publish();
    return this.toPublicState(tab);
  }

  duplicateTab(id: string): BrowserTabState | null {
    const tab = this.find(id);
    if (!tab) return null;
    return this.createTab({ url: tab.pendingUrl ?? tab.url, isPrivate: tab.isPrivate, afterId: id });
  }

  moveTab(id: string, toIndex: number): boolean {
    const from = this.tabs.findIndex((tab) => tab.id === id);
    if (from < 0 || !Number.isInteger(toIndex)) return false;
    this.tabs = moveItem(this.tabs, from, toIndex);
    this.publish();
    return true;
  }

  activateTab(id: string): boolean {
    const next = this.find(id);
    if (!next || !this.window || this.window.isDestroyed()) return false;
    const previous = this.activeTabId ? this.find(this.activeTabId) : undefined;
    if (previous && previous !== next) this.detach(previous);
    this.activeTabId = id;
    if (this.visible) this.attachView(next);
    if (next.pendingUrl) {
      const url = next.pendingUrl;
      next.pendingUrl = null;
      this.load(next, url);
    }
    this.publish();
    return true;
  }

  closeTab(id: string): boolean {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return false;
    const [tab] = this.tabs.splice(index, 1);
    this.detach(tab);
    // Une WebContentsView ne détruit pas son WebContents : on le ferme explicitement.
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    if (tab.isPrivate) {
      const privateSession = session.fromPartition(tab.partition);
      void privateSession.clearStorageData().catch(() => undefined);
      void privateSession.clearCache().catch(() => undefined);
    }
    if (this.activeTabId === id) {
      this.activeTabId = null;
      const fallback = this.tabs[Math.min(index, this.tabs.length - 1)];
      if (fallback) this.activateTab(fallback.id);
    }
    this.publish();
    return true;
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  navigate(id: string, input: unknown): boolean {
    const tab = this.find(id);
    const url = this.resolveAddress(input);
    if (!tab || !url || !isSafeBrowserUrl(url)) return false;
    tab.pendingUrl = null;
    this.load(tab, url);
    return true;
  }

  goBack(id: string): boolean {
    const history = this.find(id)?.view.webContents.navigationHistory;
    if (!history?.canGoBack()) return false;
    history.goBack();
    return true;
  }

  goForward(id: string): boolean {
    const history = this.find(id)?.view.webContents.navigationHistory;
    if (!history?.canGoForward()) return false;
    history.goForward();
    return true;
  }

  reload(id: string, ignoreCache = false): boolean {
    const tab = this.find(id);
    if (!tab) return false;
    tab.crashed = false;
    if (tab.error && isSafeBrowserUrl(tab.error.url)) this.load(tab, tab.error.url);
    else if (ignoreCache) tab.view.webContents.reloadIgnoringCache();
    else tab.view.webContents.reload();
    return true;
  }

  stop(id: string): boolean {
    const tab = this.find(id);
    if (!tab) return false;
    tab.view.webContents.stop();
    return true;
  }

  setZoom(id: string, direction: "in" | "out" | "reset"): boolean {
    const tab = this.find(id);
    if (!tab) return false;
    const contents = tab.view.webContents;
    const current = contents.getZoomFactor();
    const next = direction === "reset" ? 1
      : direction === "in" ? ZOOM_STEPS.find((step) => step > current + 0.001) ?? current
      : [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? current;
    contents.setZoomFactor(next);
    this.publish();
    return true;
  }

  toggleFullscreen(): boolean {
    if (!this.window || this.window.isDestroyed()) return false;
    this.window.setFullScreen(!this.window.isFullScreen());
    return true;
  }

  /** Point d'entrée unique des raccourcis clavier (depuis un onglet ou depuis l'interface). */
  runCommand(command: BrowserCommand): boolean {
    if (UI_COMMANDS.has(command)) {
      if (command === "focus-address" && this.window && !this.window.isDestroyed()) this.window.webContents.focus();
      this.deps.onCommand(command);
      return true;
    }
    const id = this.activeTabId;
    const index = this.tabs.findIndex((tab) => tab.id === id);
    try {
      switch (command) {
        case "new-tab": this.createTab({}); this.deps.onCommand("focus-address"); return true;
        case "fullscreen": return this.toggleFullscreen();
        case "next-tab": case "previous-tab": {
          if (this.tabs.length < 2) return false;
          const step = command === "next-tab" ? 1 : -1;
          return this.activateTab(this.tabs[(index + step + this.tabs.length) % this.tabs.length].id);
        }
      }
      if (!id) return false;
      switch (command) {
        case "close-tab": return this.closeTab(id);
        case "duplicate-tab": return this.duplicateTab(id) !== null;
        case "reload": return this.reload(id);
        case "hard-reload": return this.reload(id, true);
        case "stop": return this.stop(id);
        case "back": return this.goBack(id);
        case "forward": return this.goForward(id);
        case "zoom-in": return this.setZoom(id, "in");
        case "zoom-out": return this.setZoom(id, "out");
        case "zoom-reset": return this.setZoom(id, "reset");
        default: return false;
      }
    } catch {
      return false;
    }
  }

  // ── Géométrie ───────────────────────────────────────────────────────────
  setBounds(input: unknown): boolean {
    const bounds = normalizeBrowserBounds(input);
    if (!bounds) return false;
    this.bounds = bounds;
    this.applyBounds();
    this.positionLauncher();
    return true;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    const active = this.activeTabId ? this.find(this.activeTabId) : undefined;
    if (active) {
      if (visible) this.attachView(active);
      else this.detach(active);
    }
    this.syncLauncherVisibility();
  }

  setLauncherEnabled(enabled: boolean): void {
    this.launcherEnabled = enabled;
    this.syncLauncherVisibility();
  }

  // ── Accès contrôlé au contenu (extraction, agent) ───────────────────────
  /**
   * Exécute une fonction autonome dans le monde isolé de l'onglet. `fn` ne doit rien capturer :
   * seul son code source est transmis, avec `arg` sérialisé en JSON.
   */
  async runInPage<A, R>(
    id: string, fn: (arg: A) => R | Promise<R>, arg: A, preludes: string[] = [], timeoutMs = 10_000,
    /** Vrai pour une action faite au nom de l'utilisateur (clic, saisie) : sans activation, Chromium saute l'entrée d'historique créée. */
    userGesture = false,
  ): Promise<R> {
    const tab = this.find(id);
    if (!tab || tab.crashed || tab.view.webContents.isDestroyed()) throw new Error("tab_unavailable");
    if (tab.pendingUrl) {
      const url = tab.pendingUrl;
      tab.pendingUrl = null;
      this.load(tab, url);
      await this.waitForLoad(id);
    }
    if (tab.error) throw new Error("page_load_failed");
    // Une seule source : avec plusieurs, Electron ne renvoie pas la valeur du dernier script.
    const sources = [{ code: `${preludes.map((code) => `${code}\n;`).join("")}(${fn.toString()})(${JSON.stringify(arg)})` }];
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        tab.view.webContents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD_ID, sources, userGesture) as Promise<R>,
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("page_script_timeout")), timeoutMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Attend la fin du chargement en cours (ou l'expiration du délai). */
  waitForLoad(id: string, timeoutMs = 20_000): Promise<void> {
    const tab = this.find(id);
    if (!tab) return Promise.resolve();
    const contents = tab.view.webContents;
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); contents.removeListener("did-stop-loading", done); resolve(); };
      const timer = setTimeout(done, timeoutMs);
      // Laisse au chargement le temps de démarrer avant de tester isLoading().
      setTimeout(() => { if (contents.isDestroyed() || !contents.isLoading()) done(); else contents.once("did-stop-loading", done); }, 60);
    });
  }

  /** Capture JPEG de la zone visible, réduite à 1024 px de large. L'onglet doit être affiché. */
  async capture(id: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
    const tab = this.find(id);
    if (!tab || tab.crashed) return null;
    if (this.activeTabId !== id) this.activateTab(id);
    let image = await tab.view.webContents.capturePage();
    if (image.isEmpty()) return null;
    if (image.getSize().width > 1024) image = image.resize({ width: 1024 });
    const { width, height } = image.getSize();
    return { dataUrl: `data:image/jpeg;base64,${image.toJPEG(70).toString("base64")}`, width, height };
  }

  // ── Téléchargements ─────────────────────────────────────────────────────
  cancelDownload(id: string): boolean {
    const item = this.liveDownloads.get(id);
    if (!item) return false;
    item.cancel();
    return true;
  }

  showDownloadInFolder(id: string): boolean {
    const entry = this.downloads.find((item) => item.id === id);
    if (!entry || entry.state !== "completed") return false;
    // Ouvre le dossier et sélectionne le fichier ; le fichier lui-même n'est jamais ouvert ni exécuté.
    shell.showItemInFolder(entry.path);
    return true;
  }

  async removeDownload(id: string): Promise<boolean> {
    if (this.liveDownloads.has(id)) return false;
    this.downloads = this.downloads.filter((item) => item.id !== id);
    await this.deps.store.removeDownload(id);
    this.publish();
    return true;
  }

  async clearBrowsingData(): Promise<void> {
    const normal = session.fromPartition(NORMAL_PARTITION);
    await normal.clearStorageData();
    await normal.clearCache();
  }

  async setSitePermission(origin: unknown, permission: unknown, decision: unknown): Promise<boolean> {
    const ok = await this.deps.store.setPermission(origin, permission, decision);
    if (ok) this.permissionCache = await this.deps.store.getPermissions();
    return ok;
  }

  dispose(): void {
    if (this.sessionTimer) { clearTimeout(this.sessionTimer); this.sessionTimer = null; void this.saveSession(); }
    for (const item of this.liveDownloads.values()) item.cancel();
    for (const tab of [...this.tabs]) {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    }
    this.tabs = [];
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) this.launcherWindow.close();
    this.launcherWindow = null;
    this.window = null;
    this.activeTabId = null;
    this.initialized = null;
  }

  // ── Interne ─────────────────────────────────────────────────────────────
  /**
   * Couche native indépendante du DOM React : les WebContentsView distantes sont compositées
   * au-dessus du renderer, donc un bouton HTML ne pourrait jamais rester au premier plan.
   */
  private createLauncherWindow(parent: BrowserWindow): void {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) return;
    const launcher = new BrowserWindow({
      parent, width: 76, height: 76, show: false, frame: false, transparent: true,
      backgroundColor: "#00000000", hasShadow: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, closable: false, focusable: false, skipTaskbar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.launcherWindow = launcher;
    launcher.setMenu(null);
    launcher.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    launcher.webContents.on("will-navigate", (event, url) => {
      if (url !== "leanna-launcher://open-voice") { event.preventDefault(); return; }
      event.preventDefault();
      if (this.visible && this.launcherEnabled && this.activeTabId) this.deps.onOpenVoice();
    });
    launcher.on("closed", () => { if (this.launcherWindow === launcher) this.launcherWindow = null; });
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}
      body{display:grid;place-items:center;font-family:Inter,Segoe UI,Arial,sans-serif}
      a{width:64px;height:64px;display:grid;place-items:center;border-radius:50%;text-decoration:none;outline:none;position:relative;isolation:isolate}
      a:focus-visible{outline:2px solid #c4b5fd;outline-offset:3px}
      .halo{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(135,92,255,.42),rgba(106,74,255,.12) 58%,transparent 74%);filter:blur(7px);animation:pulse 3.4s ease-in-out infinite}
      .orb{position:relative;width:54px;height:54px;border:1px solid rgba(205,190,255,.7);border-radius:50%;display:grid;place-items:center;color:white;font-size:23px;font-weight:600;background:radial-gradient(circle at 34% 25%,rgba(255,255,255,.85),rgba(194,177,255,.42) 9%,transparent 30%),radial-gradient(circle at 50% 55%,#7652ed 0%,#29265f 52%,#10142d 100%);box-shadow:0 0 16px rgba(143,111,255,.65),0 0 36px rgba(104,82,255,.32),inset 0 0 14px rgba(255,255,255,.16);transition:transform .2s ease,box-shadow .2s ease}
      a:hover .orb{transform:scale(1.08);box-shadow:0 0 22px rgba(166,139,255,.85),0 0 46px rgba(104,82,255,.48),inset 0 0 14px rgba(255,255,255,.2)}
      .orb:before,.orb:after{content:"";position:absolute;inset:-5px;border:1px solid rgba(177,153,255,.34);border-radius:50%;pointer-events:none}
      .orb:after{inset:-10px;border-color:rgba(177,153,255,.18)}
      @keyframes pulse{0%,100%{opacity:.62;transform:scale(.9)}50%{opacity:1;transform:scale(1.12)}}
      @media(prefers-reduced-motion:reduce){.halo{animation:none}}
    </style></head><body><a href="leanna-launcher://open-voice" aria-label="Ouvrir Leanna, assistant vocal" title="Ouvrir Leanna"><span class="halo"></span><span class="orb" aria-hidden="true">L</span></a></body></html>`;
    void launcher.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
      this.positionLauncher();
      this.syncLauncherVisibility();
    }).catch(() => undefined);
  }

  private positionLauncher(): void {
    const parent = this.window;
    const launcher = this.launcherWindow;
    if (!parent || parent.isDestroyed() || !launcher || launcher.isDestroyed() || this.htmlFullscreen) return;
    const scale = parent.webContents.getZoomFactor() || 1;
    const content = parent.getContentBounds();
    const width = 76;
    const height = 76;
    const margin = 14;
    const x = Math.round(content.x + (this.bounds.x + this.bounds.width) * scale - width - margin);
    const y = Math.round(content.y + (this.bounds.y + this.bounds.height) * scale - height - margin);
    launcher.setBounds({ x, y, width, height });
  }

  private syncLauncherVisibility(): void {
    const launcher = this.launcherWindow;
    const parent = this.window;
    if (!launcher || launcher.isDestroyed()) return;
    const shouldShow = Boolean(this.visible && this.launcherEnabled && this.activeTabId && parent
      && !parent.isDestroyed() && !parent.isMinimized() && !this.htmlFullscreen);
    if (shouldShow) {
      this.positionLauncher();
      if (!launcher.isVisible()) launcher.showInactive();
    } else if (launcher.isVisible()) launcher.hide();
  }

  private find(id: string): BrowserTab | undefined {
    return this.tabs.find((tab) => tab.id === id);
  }

  private tabOf(contents: WebContents | null): BrowserTab | undefined {
    return contents ? this.tabs.find((tab) => tab.view.webContents === contents) : undefined;
  }

  private load(tab: BrowserTab, url: string): void {
    tab.error = null;
    tab.crashed = false;
    tab.url = url;
    // Les échecs sont rapportés par did-fail-load ; la promesse rejetée ne doit pas remonter.
    void tab.view.webContents.loadURL(url).catch(() => undefined);
    this.publish();
  }

  private attachView(tab: BrowserTab): void {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      this.window.contentView.addChildView(tab.view);
      this.applyBounds();
    } catch { /* fenêtre en cours de fermeture */ }
  }

  private detach(tab: BrowserTab): void {
    if (!this.window || this.window.isDestroyed()) return;
    try { this.window.contentView.removeChildView(tab.view); } catch { /* déjà détachée */ }
  }

  private applyBounds(): void {
    const active = this.activeTabId ? this.find(this.activeTabId) : undefined;
    if (!active || !this.window || this.window.isDestroyed()) return;
    if (this.htmlFullscreen) {
      this.syncLauncherVisibility();
      const [width, height] = this.window.getContentSize();
      active.view.setBounds({ x: 0, y: 0, width, height });
      return;
    }
    // Le renderer mesure en pixels CSS ; la vue est positionnée en DIP : on corrige du zoom de l'application.
    const scale = this.window.webContents.getZoomFactor() || 1;
    active.view.setBounds({
      x: Math.round(this.bounds.x * scale), y: Math.round(this.bounds.y * scale),
      width: Math.round(this.bounds.width * scale), height: Math.round(this.bounds.height * scale),
    });
    this.positionLauncher();
  }

  private configureSession(browserSession: Session): void {
    if (this.configuredSessions.has(browserSession)) return;
    this.configuredSessions.add(browserSession);
    // Certains sites refusent un agent utilisateur qui annonce Electron.
    browserSession.setUserAgent(browserSession.getUserAgent().replace(/ (Electron|LeannaNotebook|@notebook\/desktop)\/\S+/gi, ""));

    browserSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      const tab = this.tabOf(contents);
      const origin = originOf(details.requestingUrl || contents.getURL());
      if (!tab || !origin) { callback(false); return; }
      void this.resolvePermission(tab, origin, permission).then(callback, () => callback(false));
    });
    browserSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => {
      const tab = this.tabOf(contents);
      const origin = originOf(requestingOrigin);
      if (!tab || !origin) return false;
      const stored = tab.isPrivate ? null : this.permissionCache[origin]?.[permission] ?? null;
      return decidePermission(permission, stored, this.settings.permissions) === "allow";
    });

    browserSession.on("will-download", (event, item, contents) => {
      const parent = this.window;
      const tab = this.tabOf(contents);
      if (!parent || parent.isDestroyed() || !tab) { event.preventDefault(); return; }
      const filename = basename(item.getFilename()) || "téléchargement";
      const risky = isRiskyDownload(filename);
      // Dialogues synchrones : le chemin doit être fixé avant la fin de ce gestionnaire,
      // sinon Electron choisirait lui-même l'emplacement.
      if (risky && !this.deps.confirmRiskyDownload(parent, filename)) { event.preventDefault(); return; }
      const path = this.deps.chooseSavePath(parent, filename);
      if (!path) { event.preventDefault(); return; }
      item.setSavePath(path);
      this.trackDownload(item, path, risky);
    });
  }

  private async resolvePermission(tab: BrowserTab, origin: string, permission: string): Promise<boolean> {
    const stored = tab.isPrivate ? null : this.permissionCache[origin]?.[permission] ?? null;
    const decision = decidePermission(permission, stored, this.settings.permissions);
    if (decision !== "ask") return decision === "allow";
    if (!this.window || this.window.isDestroyed()) return false;
    const answer = await this.deps.askPermission(this.window, origin, permission);
    // Jamais de mémorisation en navigation privée.
    if (answer.remember && !tab.isPrivate) await this.setSitePermission(origin, permission, answer.allow ? "allow" : "deny");
    return answer.allow;
  }

  private trackDownload(item: DownloadItem, path: string, risky: boolean): void {
    const entry: BrowserDownload = {
      id: randomUUID(), url: isSafeBrowserUrl(item.getURL()) ? item.getURL() : "", filename: basename(path), path,
      state: "progressing", receivedBytes: 0, totalBytes: item.getTotalBytes(), startedAt: Date.now(), risky,
    };
    this.liveDownloads.set(entry.id, item);
    this.downloads = [entry, ...this.downloads];
    void this.deps.store.upsertDownload({ ...entry }).catch(() => undefined);
    item.on("updated", (_event, state) => {
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      entry.state = state === "interrupted" ? "interrupted" : item.isPaused() ? "paused" : "progressing";
      this.publish();
    });
    item.once("done", (_event, state) => {
      this.liveDownloads.delete(entry.id);
      entry.receivedBytes = item.getReceivedBytes();
      entry.state = state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted";
      void this.deps.store.upsertDownload({ ...entry }).catch(() => undefined);
      this.publish();
    });
    this.publish();
  }

  private bindEvents(tab: BrowserTab): void {
    const contents = tab.view.webContents;

    // Aucune fenêtre secondaire : une pop-up devient un onglet, ou est bloquée.
    contents.setWindowOpenHandler(({ url, disposition }) => {
      const now = Date.now();
      tab.popupTimes = tab.popupTimes.filter((time) => now - time < 10_000);
      if (this.settings.popups === "block" || !isSafeBrowserUrl(url) || tab.popupTimes.length >= 3 || this.tabs.length >= MAX_TABS) {
        tab.blockedPopups += 1;
        this.publish();
      } else {
        tab.popupTimes.push(now);
        try {
          this.createTab({ url, isPrivate: tab.isPrivate, background: disposition === "background-tab", afterId: tab.id });
        } catch { tab.blockedPopups += 1; }
      }
      return { action: "deny" };
    });

    // Navigation et redirections : http(s) uniquement en cadre principal.
    contents.on("will-frame-navigate", (event) => {
      if (!(event.isMainFrame ? isSafeBrowserUrl(event.url) : isSafeSubframeUrl(event.url))) event.preventDefault();
    });
    contents.on("will-redirect", (event) => {
      if (!(event.isMainFrame ? isSafeBrowserUrl(event.url) : isSafeSubframeUrl(event.url))) event.preventDefault();
    });

    contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const command = matchShortcut(input);
      if (!command) return;
      event.preventDefault();
      this.runCommand(command);
    });

    contents.on("page-title-updated", (_event, title) => {
      tab.title = title.slice(0, 300) || tab.url;
      if (isSafeBrowserUrl(tab.url) && !tab.error) this.recordVisit(tab);
      this.publish();
    });
    contents.on("page-favicon-updated", (_event, favicons) => {
      tab.favicon = favicons.find((item) => isSafeBrowserUrl(item)) ?? null;
      this.publish();
    });
    contents.on("did-start-loading", () => { tab.loading = true; this.publish(); });
    contents.on("did-stop-loading", () => { tab.loading = false; this.publish(); });
    contents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) { tab.error = null; tab.blockedPopups = 0; }
    });
    const updateUrl = (_event: Electron.Event, url: string) => {
      if (isSafeBrowserUrl(url)) {
        tab.url = url;
        this.recordVisit(tab);
      }
      this.publish();
    };
    contents.on("did-navigate", (event, url) => { tab.favicon = null; updateUrl(event, url); });
    contents.on("did-navigate-in-page", (event, url, isMainFrame) => { if (isMainFrame) updateUrl(event, url); });
    contents.on("did-fail-load", (_event, code, description, validatedUrl, isMainFrame) => {
      // -3 = ERR_ABORTED : navigation remplacée ou arrêtée par l'utilisateur, pas une erreur à afficher.
      if (!isMainFrame || code === -3) return;
      tab.loading = false;
      tab.error = { code, message: describeLoadError(code, description), url: validatedUrl.slice(0, 2048) };
      this.publish();
    });
    // Le crash d'un onglet ne concerne que son processus : on le signale et on reste utilisable.
    contents.on("render-process-gone", () => {
      tab.loading = false;
      tab.crashed = true;
      this.publish();
    });
    contents.on("zoom-changed", (_event, direction) => { this.setZoom(tab.id, direction); });
    contents.on("enter-html-full-screen", () => { this.htmlFullscreen = true; this.applyBounds(); });
    contents.on("leave-html-full-screen", () => { this.htmlFullscreen = false; this.applyBounds(); });
  }

  private recordVisit(tab: BrowserTab): void {
    void this.deps.store.addVisit(tab.url, tab.title, tab.isPrivate).catch(() => undefined);
  }

  private toPublicState(tab: BrowserTab): BrowserTabState {
    const contents = tab.view.webContents;
    const alive = !contents.isDestroyed();
    const url = tab.pendingUrl ?? tab.url;
    const certificateError = Boolean(tab.error && tab.error.code <= -200 && tab.error.code >= -299);
    return {
      id: tab.id, url, title: tab.title, favicon: tab.favicon, loading: tab.loading,
      canGoBack: alive && contents.navigationHistory.canGoBack(),
      canGoForward: alive && contents.navigationHistory.canGoForward(),
      isPrivate: tab.isPrivate,
      zoom: alive ? Math.round(contents.getZoomFactor() * 100) : 100,
      security: !isSafeBrowserUrl(url) ? "internal" : url.startsWith("https://") && !certificateError ? "secure" : "insecure",
      error: tab.error, crashed: tab.crashed, blockedPopups: tab.blockedPopups,
    };
  }

  private async saveSession(): Promise<void> {
    const normal = this.tabs.filter((tab) => !tab.isPrivate);
    const active = normal.findIndex((tab) => tab.id === this.activeTabId);
    await this.deps.store.saveSession(
      normal.map((tab) => ({ url: tab.pendingUrl ?? tab.url, title: tab.title })), Math.max(0, active),
    ).catch(() => undefined);
  }

  /** Regroupe les rafales d'événements (progression, titres) en une seule publication. */
  private publish(): void {
    this.publishTimer ??= setTimeout(() => {
      this.publishTimer = null;
      this.deps.onState(this.getState());
    }, 30);
    if (!this.initialized) return;
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.sessionTimer = setTimeout(() => { this.sessionTimer = null; void this.saveSession(); }, 400);
  }
}
