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

export interface DesktopBrowserTab {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPrivate: boolean;
  error?: string;
}

export interface DesktopBrowserState {
  activeTabId: string | null;
  tabs: DesktopBrowserTab[];
}

export type DesktopBrowserBounds = { x: number; y: number; width: number; height: number };

export interface DesktopBrowserVisit {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

export interface DesktopBrowserBookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

export interface DesktopApi {
  getVersion(): Promise<string>;
  checkForUpdates(): Promise<{ started: boolean }>;
  onUpdateStatus(callback: (status: DesktopUpdateStatus) => void): () => void;
  openFiles(filters?: DesktopFileFilter[]): Promise<DesktopFileSelection>;
  saveFile(defaultPath?: string, filters?: DesktopFileFilter[]): Promise<DesktopSaveSelection>;
  openExternal(url: string): Promise<{ opened: boolean }>;

  getBrowserState(): Promise<DesktopBrowserState>;
  onBrowserState(callback: (state: DesktopBrowserState) => void): () => void;
  createBrowserTab(url?: string, isPrivate?: boolean): Promise<DesktopBrowserTab | null>;
  activateBrowserTab(id: string): Promise<boolean>;
  closeBrowserTab(id: string): Promise<boolean>;
  navigateBrowserTab(id: string, address: string): Promise<boolean>;
  browserGoBack(id: string): Promise<boolean>;
  browserGoForward(id: string): Promise<boolean>;
  browserReload(id: string): Promise<boolean>;
  browserStop(id: string): Promise<boolean>;
  setBrowserBounds(bounds: DesktopBrowserBounds): Promise<boolean>;
  setBrowserVisible(visible: boolean): Promise<boolean>;
  getBrowserHistory(): Promise<DesktopBrowserVisit[]>;
  clearBrowserHistory(): Promise<boolean>;
  getBrowserBookmarks(): Promise<DesktopBrowserBookmark[]>;
  addBrowserBookmark(url: string, title: string): Promise<DesktopBrowserBookmark | null>;
  removeBrowserBookmark(id: string): Promise<boolean>;
}

declare global {
  interface Window {
    leannaDesktop?: DesktopApi;
  }
}
