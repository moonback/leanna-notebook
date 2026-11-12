import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type BrowserVisit = {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
};

export type BrowserBookmark = {
  id: string;
  url: string;
  title: string;
  createdAt: number;
};

type BrowserData = {
  version: 1;
  history: BrowserVisit[];
  bookmarks: BrowserBookmark[];
};

const EMPTY: BrowserData = { version: 1, history: [], bookmarks: [] };
const MAX_HISTORY = 2_000;
const MAX_BOOKMARKS = 500;
const MAX_TEXT = 300;
const MAX_URL = 2_048;

function validHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URL) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function cleanTitle(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_TEXT)
    : fallback.slice(0, MAX_TEXT);
}

/** Stockage local atomique : aucun historique ni favori n'est envoyé au serveur. */
export class BrowserDataStore {
  private readonly filePath: string;
  private data: BrowserData = { ...EMPTY, history: [], bookmarks: [] };
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "browser-data.json");
  }

  async getHistory(): Promise<BrowserVisit[]> {
    await this.load();
    return this.data.history.map((item) => ({ ...item }));
  }

  async getBookmarks(): Promise<BrowserBookmark[]> {
    await this.load();
    return this.data.bookmarks.map((item) => ({ ...item }));
  }

  async addVisit(url: unknown, title: unknown, isPrivate = false): Promise<void> {
    if (isPrivate || !validHttpUrl(url)) return;
    await this.load();
    const entry: BrowserVisit = {
      id: randomUUID(),
      url,
      title: cleanTitle(title, url),
      visitedAt: Date.now(),
    };
    this.data.history = [entry, ...this.data.history.filter((item) => item.url !== url)].slice(0, MAX_HISTORY);
    await this.persist();
  }

  async addBookmark(url: unknown, title: unknown): Promise<BrowserBookmark | null> {
    if (!validHttpUrl(url)) return null;
    await this.load();
    const existing = this.data.bookmarks.find((item) => item.url === url);
    if (existing) return { ...existing };
    const entry: BrowserBookmark = {
      id: randomUUID(),
      url,
      title: cleanTitle(title, url),
      createdAt: Date.now(),
    };
    this.data.bookmarks = [entry, ...this.data.bookmarks].slice(0, MAX_BOOKMARKS);
    await this.persist();
    return { ...entry };
  }

  async removeBookmark(id: unknown): Promise<boolean> {
    if (typeof id !== "string" || id.length > 64) return false;
    await this.load();
    const next = this.data.bookmarks.filter((item) => item.id !== id);
    if (next.length === this.data.bookmarks.length) return false;
    this.data.bookmarks = next;
    await this.persist();
    return true;
  }

  async clearHistory(): Promise<void> {
    await this.load();
    this.data.history = [];
    await this.persist();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object") return;
      const raw = parsed as Partial<BrowserData>;
      const history = Array.isArray(raw.history) ? raw.history.filter((item): item is BrowserVisit =>
        Boolean(item && typeof item.id === "string" && validHttpUrl(item.url) &&
          typeof item.title === "string" && Number.isFinite(item.visitedAt)),
      ).slice(0, MAX_HISTORY) : [];
      const bookmarks = Array.isArray(raw.bookmarks) ? raw.bookmarks.filter((item): item is BrowserBookmark =>
        Boolean(item && typeof item.id === "string" && validHttpUrl(item.url) &&
          typeof item.title === "string" && Number.isFinite(item.createdAt)),
      ).slice(0, MAX_BOOKMARKS) : [];
      this.data = { version: 1, history, bookmarks };
    } catch {
      this.data = { ...EMPTY, history: [], bookmarks: [] };
    }
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      const directory = dirname(this.filePath);
      await mkdir(directory, { recursive: true });
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, snapshot, { encoding: "utf8", mode: 0o600 });
        await rename(temporaryPath, this.filePath);
      } catch (error) {
        // Laisser remonter l'erreur : l'UI ne doit pas annoncer un enregistrement réussi.
        throw error;
      }
    });
    await this.writeQueue;
  }
}
