import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isSafeBrowserPermissionOrigin, isSafeBrowserUrl, isSearchEngineId, type SearchEngineId } from "./browser-validation";

export type BrowserVisit = { id: string; url: string; title: string; visitedAt: number };
export type BrowserBookmark = { id: string; url: string; title: string; folder: string; createdAt: number };
export type AgentMode = "observation" | "assistance" | "autonomous";
export type BrowserSettings = {
  searchEngine: SearchEngineId;
  /** Vide = page d'accueil du moteur de recherche. */
  homepage: string;
  restoreTabs: boolean;
  popups: "block" | "tab";
  cookies: "keep" | "clear-on-exit";
  permissions: "ask" | "deny";
  agentMode: AgentMode;
  /** Les actions sensibles sont toujours confirmées ; "every-action" confirme aussi les autres. */
  confirmations: "sensitive-only" | "every-action";
  aiPanelOpen: boolean;
};
export type BrowserDownload = {
  id: string; url: string; filename: string; path: string;
  state: "progressing" | "paused" | "completed" | "cancelled" | "interrupted";
  receivedBytes: number; totalBytes: number; startedAt: number; risky: boolean;
};
export type SessionTab = { url: string; title: string };
export type PermissionDecision = "allow" | "deny";

type BrowserData = {
  version: 2;
  settings: BrowserSettings;
  history: BrowserVisit[];
  bookmarks: BrowserBookmark[];
  folders: string[];
  session: { tabs: SessionTab[]; activeIndex: number };
  permissions: Record<string, Record<string, PermissionDecision>>;
  downloads: BrowserDownload[];
};

export const DEFAULT_SETTINGS: BrowserSettings = {
  searchEngine: "google", homepage: "", restoreTabs: true, popups: "tab", cookies: "keep",
  permissions: "ask", agentMode: "assistance", confirmations: "sensitive-only", aiPanelOpen: true,
};

const MAX_HISTORY = 2_000;
const MAX_BOOKMARKS = 500;
const MAX_FOLDERS = 50;
const MAX_DOWNLOADS = 200;
const MAX_TEXT = 300;
const MAX_FOLDER = 60;

const empty = (): BrowserData => ({
  version: 2, settings: { ...DEFAULT_SETTINGS }, history: [], bookmarks: [], folders: [],
  session: { tabs: [], activeIndex: 0 }, permissions: {}, downloads: [],
});

function cleanTitle(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_TEXT) : fallback.slice(0, MAX_TEXT);
}

function cleanFolder(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, MAX_FOLDER) : "";
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? value as T : fallback;

/** Ne retient que les champs connus et valides ; tout le reste retombe sur la valeur courante. */
export function sanitizeSettings(input: unknown, base: BrowserSettings = DEFAULT_SETTINGS): BrowserSettings {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const homepage = raw.homepage === "" ? "" : isSafeBrowserUrl(raw.homepage) ? raw.homepage : base.homepage;
  return {
    searchEngine: isSearchEngineId(raw.searchEngine) ? raw.searchEngine : base.searchEngine,
    homepage,
    restoreTabs: typeof raw.restoreTabs === "boolean" ? raw.restoreTabs : base.restoreTabs,
    popups: oneOf(raw.popups, ["block", "tab"] as const, base.popups),
    cookies: oneOf(raw.cookies, ["keep", "clear-on-exit"] as const, base.cookies),
    permissions: oneOf(raw.permissions, ["ask", "deny"] as const, base.permissions),
    agentMode: oneOf(raw.agentMode, ["observation", "assistance", "autonomous"] as const, base.agentMode),
    confirmations: oneOf(raw.confirmations, ["sensitive-only", "every-action"] as const, base.confirmations),
    aiPanelOpen: typeof raw.aiPanelOpen === "boolean" ? raw.aiPanelOpen : base.aiPanelOpen,
  };
}

/**
 * Stockage local atomique (userData/browser-data.json) : rien n'est envoyé au serveur.
 * Ne contient ni cookie, ni mot de passe, ni contenu de page.
 */
export class BrowserDataStore {
  private readonly filePath: string;
  private data: BrowserData = empty();
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "browser-data.json");
  }

  // ── Réglages ────────────────────────────────────────────────────────────
  async getSettings(): Promise<BrowserSettings> {
    await this.load();
    return { ...this.data.settings };
  }

  async updateSettings(patch: unknown): Promise<BrowserSettings> {
    await this.load();
    this.data.settings = sanitizeSettings(patch, this.data.settings);
    await this.persist();
    return { ...this.data.settings };
  }

  // ── Historique ──────────────────────────────────────────────────────────
  async getHistory(query?: unknown): Promise<BrowserVisit[]> {
    await this.load();
    const q = typeof query === "string" ? query.trim().toLowerCase().slice(0, 200) : "";
    const items = q
      ? this.data.history.filter((item) => item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q))
      : this.data.history;
    return items.map((item) => ({ ...item }));
  }

  async addVisit(url: unknown, title: unknown, isPrivate = false): Promise<void> {
    if (isPrivate || !isSafeBrowserUrl(url)) return;
    await this.load();
    const entry: BrowserVisit = { id: randomUUID(), url, title: cleanTitle(title, url), visitedAt: Date.now() };
    this.data.history = [entry, ...this.data.history.filter((item) => item.url !== url)].slice(0, MAX_HISTORY);
    await this.persist();
  }

  async removeVisit(id: unknown): Promise<boolean> {
    await this.load();
    const next = this.data.history.filter((item) => item.id !== id);
    if (next.length === this.data.history.length) return false;
    this.data.history = next;
    await this.persist();
    return true;
  }

  /** `sinceMs` : supprime les visites postérieures à cette date ; absent = tout l'historique. */
  async clearHistory(sinceMs?: unknown): Promise<number> {
    await this.load();
    const before = this.data.history.length;
    this.data.history = typeof sinceMs === "number" && Number.isFinite(sinceMs)
      ? this.data.history.filter((item) => item.visitedAt < sinceMs)
      : [];
    await this.persist();
    return before - this.data.history.length;
  }

  // ── Favoris ─────────────────────────────────────────────────────────────
  async getBookmarks(query?: unknown): Promise<{ bookmarks: BrowserBookmark[]; folders: string[] }> {
    await this.load();
    const q = typeof query === "string" ? query.trim().toLowerCase().slice(0, 200) : "";
    const bookmarks = q
      ? this.data.bookmarks.filter((item) => item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q))
      : this.data.bookmarks;
    return { bookmarks: bookmarks.map((item) => ({ ...item })), folders: [...this.data.folders] };
  }

  async addBookmark(url: unknown, title: unknown, folder?: unknown): Promise<BrowserBookmark | null> {
    if (!isSafeBrowserUrl(url)) return null;
    await this.load();
    const existing = this.data.bookmarks.find((item) => item.url === url);
    if (existing) return { ...existing };
    const entry: BrowserBookmark = {
      id: randomUUID(), url, title: cleanTitle(title, url), folder: this.ensureFolder(folder), createdAt: Date.now(),
    };
    this.data.bookmarks = [entry, ...this.data.bookmarks].slice(0, MAX_BOOKMARKS);
    await this.persist();
    return { ...entry };
  }

  async updateBookmark(id: unknown, patch: unknown): Promise<BrowserBookmark | null> {
    await this.load();
    const item = this.data.bookmarks.find((entry) => entry.id === id);
    if (!item || !patch || typeof patch !== "object") return null;
    const input = patch as { title?: unknown; folder?: unknown };
    if (typeof input.title === "string" && input.title.trim()) item.title = cleanTitle(input.title, item.url);
    if (typeof input.folder === "string") item.folder = this.ensureFolder(input.folder);
    await this.persist();
    return { ...item };
  }

  async removeBookmark(id: unknown): Promise<boolean> {
    await this.load();
    const next = this.data.bookmarks.filter((item) => item.id !== id);
    if (next.length === this.data.bookmarks.length) return false;
    this.data.bookmarks = next;
    await this.persist();
    return true;
  }

  async addFolder(name: unknown): Promise<string | null> {
    await this.load();
    const folder = cleanFolder(name);
    if (!folder) return null;
    this.ensureFolder(folder);
    await this.persist();
    return folder;
  }

  async renameFolder(from: unknown, to: unknown): Promise<boolean> {
    await this.load();
    const next = cleanFolder(to);
    if (typeof from !== "string" || !next || !this.data.folders.includes(from)) return false;
    this.data.folders = [...new Set(this.data.folders.map((name) => name === from ? next : name))];
    for (const item of this.data.bookmarks) if (item.folder === from) item.folder = next;
    await this.persist();
    return true;
  }

  /** Supprime le dossier ; ses favoris reviennent à la racine (aucune perte). */
  async removeFolder(name: unknown): Promise<boolean> {
    await this.load();
    if (typeof name !== "string" || !this.data.folders.includes(name)) return false;
    this.data.folders = this.data.folders.filter((folder) => folder !== name);
    for (const item of this.data.bookmarks) if (item.folder === name) item.folder = "";
    await this.persist();
    return true;
  }

  // ── Session d'onglets ───────────────────────────────────────────────────
  async getSession(): Promise<{ tabs: SessionTab[]; activeIndex: number }> {
    await this.load();
    return { tabs: this.data.session.tabs.map((tab) => ({ ...tab })), activeIndex: this.data.session.activeIndex };
  }

  async saveSession(tabs: SessionTab[], activeIndex: number): Promise<void> {
    await this.load();
    const clean = tabs.filter((tab) => isSafeBrowserUrl(tab.url)).slice(0, 30)
      .map((tab) => ({ url: tab.url, title: cleanTitle(tab.title, tab.url) }));
    this.data.session = { tabs: clean, activeIndex: Math.max(0, Math.min(activeIndex, clean.length - 1)) };
    await this.persist();
  }

  // ── Permissions par origine ─────────────────────────────────────────────
  async getPermission(origin: string, permission: string): Promise<PermissionDecision | null> {
    await this.load();
    return this.data.permissions[origin]?.[permission] ?? null;
  }

  async getPermissions(): Promise<Record<string, Record<string, PermissionDecision>>> {
    await this.load();
    return JSON.parse(JSON.stringify(this.data.permissions)) as Record<string, Record<string, PermissionDecision>>;
  }

  async setPermission(origin: unknown, permission: unknown, decision: unknown): Promise<boolean> {
    if (!isSafeBrowserPermissionOrigin(origin) || typeof permission !== "string" || !/^[a-z-]{1,40}$/i.test(permission)) return false;
    await this.load();
    if (decision === "allow" || decision === "deny") {
      (this.data.permissions[origin] ??= {})[permission] = decision;
    } else {
      delete this.data.permissions[origin]?.[permission];
      if (this.data.permissions[origin] && Object.keys(this.data.permissions[origin]).length === 0) delete this.data.permissions[origin];
    }
    await this.persist();
    return true;
  }

  // ── Téléchargements ─────────────────────────────────────────────────────
  async getDownloads(): Promise<BrowserDownload[]> {
    await this.load();
    return this.data.downloads.map((item) => ({ ...item }));
  }

  async upsertDownload(entry: BrowserDownload): Promise<void> {
    await this.load();
    this.data.downloads = [entry, ...this.data.downloads.filter((item) => item.id !== entry.id)].slice(0, MAX_DOWNLOADS);
    await this.persist();
  }

  /** Retire l'entrée de la liste ; le fichier sur disque n'est pas touché. */
  async removeDownload(id: unknown): Promise<boolean> {
    await this.load();
    const next = this.data.downloads.filter((item) => item.id !== id);
    if (next.length === this.data.downloads.length) return false;
    this.data.downloads = next;
    await this.persist();
    return true;
  }

  // ── Fichier ─────────────────────────────────────────────────────────────
  private ensureFolder(value: unknown): string {
    const folder = cleanFolder(value);
    if (folder && !this.data.folders.includes(folder) && this.data.folders.length < MAX_FOLDERS) this.data.folders.push(folder);
    return this.data.folders.includes(folder) ? folder : "";
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object") return;
      // Tolère le format v1 (history + bookmarks sans dossier) : rien n'est perdu à la mise à jour.
      const raw = parsed as Partial<BrowserData>;
      const data = empty();
      data.settings = sanitizeSettings(raw.settings);
      data.history = (Array.isArray(raw.history) ? raw.history : []).filter((item): item is BrowserVisit =>
        Boolean(item && typeof item.id === "string" && isSafeBrowserUrl(item.url) &&
          typeof item.title === "string" && Number.isFinite(item.visitedAt))).slice(0, MAX_HISTORY);
      data.folders = (Array.isArray(raw.folders) ? raw.folders : []).map(cleanFolder).filter(Boolean).slice(0, MAX_FOLDERS);
      data.bookmarks = (Array.isArray(raw.bookmarks) ? raw.bookmarks : []).filter((item): item is BrowserBookmark =>
        Boolean(item && typeof item.id === "string" && isSafeBrowserUrl(item.url) &&
          typeof item.title === "string" && Number.isFinite(item.createdAt))).slice(0, MAX_BOOKMARKS)
        .map((item) => ({ ...item, folder: data.folders.includes(item.folder) ? item.folder : "" }));
      const tabs = Array.isArray(raw.session?.tabs) ? raw.session.tabs : [];
      data.session = {
        tabs: tabs.filter((tab) => tab && isSafeBrowserUrl(tab.url)).slice(0, 30)
          .map((tab) => ({ url: tab.url, title: cleanTitle(tab.title, tab.url) })),
        activeIndex: Number.isInteger(raw.session?.activeIndex) ? raw.session!.activeIndex : 0,
      };
      if (raw.permissions && typeof raw.permissions === "object") {
        for (const [origin, entries] of Object.entries(raw.permissions)) {
          if (!isSafeBrowserPermissionOrigin(origin) || !entries || typeof entries !== "object") continue;
          for (const [permission, decision] of Object.entries(entries)) {
            if (decision === "allow" || decision === "deny") (data.permissions[origin] ??= {})[permission] = decision;
          }
        }
      }
      data.downloads = (Array.isArray(raw.downloads) ? raw.downloads : []).filter((item) =>
        Boolean(item && typeof item.id === "string" && typeof item.filename === "string" && typeof item.path === "string"))
        .slice(0, MAX_DOWNLOADS)
        // Un téléchargement « en cours » dans le fichier a été coupé par la fermeture de l'application.
        .map((item) => ({ ...item, state: item.state === "progressing" || item.state === "paused" ? "interrupted" as const : item.state }));
      this.data = data;
    } catch {
      this.data = empty();
    }
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, snapshot, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    });
    // L'erreur remonte : l'UI ne doit pas annoncer un enregistrement réussi.
    await this.writeQueue;
  }
}
