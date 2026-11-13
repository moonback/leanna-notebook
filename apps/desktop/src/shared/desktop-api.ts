export interface DesktopFileFilter {
  name: string;
  extensions: string[];
}

export interface DesktopFileSelection {
  canceled: boolean;
  filePaths: string[];
}

export interface DesktopSaveSelection {
  canceled: boolean;
  filePath?: string;
}

export interface DesktopUpdateStatus {
  status: "checking" | "not-available" | "available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

// ── Leanna Browser : DTO sérialisables échangés avec le renderer ─────────────
// Aucun objet Electron ne traverse ce contrat.

export interface DesktopBrowserTab {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPrivate: boolean;
  /** Zoom en pourcentage. */
  zoom: number;
  security: "secure" | "insecure" | "internal";
  error: { code: number; message: string; url: string } | null;
  crashed: boolean;
  blockedPopups: number;
}

export interface DesktopBrowserDownload {
  id: string;
  url: string;
  filename: string;
  path: string;
  state: "progressing" | "paused" | "completed" | "cancelled" | "interrupted";
  receivedBytes: number;
  totalBytes: number;
  startedAt: number;
  risky: boolean;
}

export interface DesktopBrowserState {
  activeTabId: string | null;
  tabs: DesktopBrowserTab[];
  fullscreen: boolean;
  downloads: DesktopBrowserDownload[];
}

export type DesktopBrowserBounds = { x: number; y: number; width: number; height: number };
export type DesktopAgentMode = "observation" | "assistance" | "autonomous";
export type DesktopSearchEngine = "google" | "duckduckgo" | "bing" | "brave" | "qwant";

export interface DesktopBrowserSettings {
  searchEngine: DesktopSearchEngine;
  homepage: string;
  restoreTabs: boolean;
  popups: "block" | "tab";
  cookies: "keep" | "clear-on-exit";
  permissions: "ask" | "deny";
  agentMode: DesktopAgentMode;
  confirmations: "sensitive-only" | "every-action";
  aiPanelOpen: boolean;
}

export interface DesktopPageContent {
  /** ok = contenu exploitable ; empty = page sans texte ; unavailable = page inaccessible (voir `reason`). */
  status: "ok" | "empty" | "unavailable";
  reason?: string;
  url: string;
  title: string;
  description: string;
  siteName: string;
  author: string;
  lang: string;
  publishedAt: string | null;
  canonicalUrl: string | null;
  text: string;
  truncated: boolean;
  totalChars: number;
  wordCount: number;
  method: "readability" | "fallback" | "none";
  headings: { level: number; text: string }[];
  links: { text: string; url: string }[];
  tables: { caption: string; rows: string[][] }[];
}

export interface DesktopSaveRequest {
  mode: "link" | "text" | "summary" | "selection";
  url: string;
  title: string;
  favicon: string | null;
  text?: string;
  summary?: string;
}

export type DesktopAgentOutcome =
  | { status: "ok"; tool: string; summary: string; result: Record<string, unknown>; image?: string; save?: DesktopSaveRequest }
  | { status: "confirmation_required"; tool: string; summary: string; actionId: string; reason: string }
  | { status: "refused" | "denied" | "error"; tool: string; summary: string; error: string; message: string };

export interface DesktopBrowserVisit { id: string; url: string; title: string; visitedAt: number }
export interface DesktopBrowserBookmark { id: string; url: string; title: string; folder: string; createdAt: number }
export type DesktopPermissionDecision = "allow" | "deny";

export type DesktopBrowserCommand =
  | "new-tab" | "close-tab" | "next-tab" | "previous-tab" | "duplicate-tab"
  | "reload" | "hard-reload" | "stop" | "back" | "forward"
  | "zoom-in" | "zoom-out" | "zoom-reset" | "fullscreen"
  | "focus-address" | "toggle-ai-panel" | "bookmark" | "show-history" | "show-downloads";

export interface DesktopKeyInput { key: string; control?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }

/** Méthodes appelables (canal `browser:<nom>`). Les deux abonnements sont à part. */
export interface DesktopBrowserInvokeApi {
  init(): Promise<{ state: DesktopBrowserState; settings: DesktopBrowserSettings }>;
  getState(): Promise<DesktopBrowserState>;
  createTab(input?: { url?: string; isPrivate?: boolean }): Promise<DesktopBrowserTab | null>;
  activateTab(id: string): Promise<boolean>;
  closeTab(id: string): Promise<boolean>;
  duplicateTab(id: string): Promise<DesktopBrowserTab | null>;
  moveTab(id: string, toIndex: number): Promise<boolean>;
  navigate(id: string, address: string): Promise<boolean>;
  goBack(id: string): Promise<boolean>;
  goForward(id: string): Promise<boolean>;
  reload(id: string): Promise<boolean>;
  stop(id: string): Promise<boolean>;
  setZoom(id: string, direction: "in" | "out" | "reset"): Promise<boolean>;
  runCommand(command: DesktopBrowserCommand): Promise<boolean>;
  key(input: DesktopKeyInput): Promise<boolean>;
  setBounds(bounds: DesktopBrowserBounds): Promise<boolean>;
  setVisible(visible: boolean): Promise<boolean>;
  getSettings(): Promise<DesktopBrowserSettings>;
  updateSettings(patch: Partial<DesktopBrowserSettings>): Promise<DesktopBrowserSettings>;
  getHistory(query?: string): Promise<DesktopBrowserVisit[]>;
  removeVisit(id: string): Promise<boolean>;
  clearHistory(sinceMs?: number): Promise<number>;
  getBookmarks(query?: string): Promise<{ bookmarks: DesktopBrowserBookmark[]; folders: string[] }>;
  addBookmark(input: { url: string; title: string; folder?: string }): Promise<DesktopBrowserBookmark | null>;
  updateBookmark(id: string, patch: { title?: string; folder?: string }): Promise<DesktopBrowserBookmark | null>;
  removeBookmark(id: string): Promise<boolean>;
  addFolder(name: string): Promise<string | null>;
  renameFolder(from: string, to: string): Promise<boolean>;
  removeFolder(name: string): Promise<boolean>;
  cancelDownload(id: string): Promise<boolean>;
  showDownloadInFolder(id: string): Promise<boolean>;
  removeDownload(id: string): Promise<boolean>;
  /** Contenu nettoyé et borné de l'onglet (`full` : texte complet, pour l'enregistrement dans le Notebook). */
  extractPage(id: string, options?: { full?: boolean }): Promise<DesktopPageContent>;
  getSelection(id: string): Promise<string>;
  /** Début d'un tour utilisateur pour l'agent (`reset` : nouvelle conversation). */
  agentStart(input: { text: string; reset?: boolean }): Promise<{ mission: number; mode: DesktopAgentMode }>;
  /** Appel d'outil proposé par le modèle : validé, soumis aux garde-fous, exécuté ou mis en attente. */
  agentCall(input: { name: string; args: unknown }): Promise<DesktopAgentOutcome>;
  /** Décision de l'utilisateur sur une action en attente de confirmation. */
  agentResolve(input: { actionId: string; approve: boolean }): Promise<DesktopAgentOutcome>;
  agentAbort(): Promise<boolean>;
  getPermissions(): Promise<Record<string, Record<string, DesktopPermissionDecision>>>;
  setPermission(origin: string, permission: string, decision: DesktopPermissionDecision | null): Promise<boolean>;
  clearBrowsingData(): Promise<boolean>;
}

export interface DesktopBrowserApi extends DesktopBrowserInvokeApi {
  onState(callback: (state: DesktopBrowserState) => void): () => void;
  onCommand(callback: (command: DesktopBrowserCommand) => void): () => void;
}

export interface DesktopApi {
  getVersion(): Promise<string>;
  checkForUpdates(): Promise<{ started: boolean }>;
  onUpdateStatus(callback: (status: DesktopUpdateStatus) => void): () => void;
  openFiles(filters?: DesktopFileFilter[]): Promise<DesktopFileSelection>;
  saveFile(defaultPath?: string, filters?: DesktopFileFilter[]): Promise<DesktopSaveSelection>;
  openExternal(url: string): Promise<{ opened: boolean }>;
  /** Leanna Browser. Chaque méthode correspond au canal IPC `browser:<méthode>`. */
  browser: DesktopBrowserApi;
}

declare global {
  interface Window {
    leannaDesktop?: DesktopApi;
  }
}
