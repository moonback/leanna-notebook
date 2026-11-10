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

export interface DesktopApi {
  getVersion(): Promise<string>;
  checkForUpdates(): Promise<{ started: boolean }>;
  onUpdateStatus(callback: (status: DesktopUpdateStatus) => void): () => void;
  openFiles(filters?: DesktopFileFilter[]): Promise<DesktopFileSelection>;
  saveFile(defaultPath?: string, filters?: DesktopFileFilter[]): Promise<DesktopSaveSelection>;
  openExternal(url: string): Promise<{ opened: boolean }>;
}

declare global {
  interface Window {
    leannaDesktop?: DesktopApi;
  }
}
