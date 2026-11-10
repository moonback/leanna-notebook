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

export interface DesktopApi {
  getVersion(): Promise<string>;
  openFiles(filters?: DesktopFileFilter[]): Promise<DesktopFileSelection>;
  saveFile(defaultPath?: string, filters?: DesktopFileFilter[]): Promise<DesktopSaveSelection>;
  openExternal(url: string): Promise<{ opened: boolean }>;
}

declare global {
  interface Window {
    leannaDesktop?: DesktopApi;
  }
}
