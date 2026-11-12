import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopApi,
  DesktopBrowserState,
  DesktopBrowserVisit,
  DesktopBrowserBookmark,
  DesktopFileFilter,
  DesktopUpdateStatus,
} from "./shared/desktop-api";

const api: DesktopApi = {
  getVersion: () => ipcRenderer.invoke("desktop:app-version"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: DesktopUpdateStatus) => callback(status);
    ipcRenderer.on("desktop:update-status", listener);
    return () => ipcRenderer.removeListener("desktop:update-status", listener);
  },
  openFiles: (filters?: DesktopFileFilter[]) =>
    ipcRenderer.invoke("desktop:open-files", filters),
  saveFile: (defaultPath?: string, filters?: DesktopFileFilter[]) =>
    ipcRenderer.invoke("desktop:save-file", { defaultPath, filters }),
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url),

  getBrowserState: () => ipcRenderer.invoke("browser:get-state"),
  onBrowserState: (callback: (state: DesktopBrowserState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopBrowserState) => callback(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  },
  createBrowserTab: (url?: string, isPrivate = false) =>
    ipcRenderer.invoke("browser:create-tab", { url, isPrivate }),
  activateBrowserTab: (id: string) => ipcRenderer.invoke("browser:activate-tab", id),
  closeBrowserTab: (id: string) => ipcRenderer.invoke("browser:close-tab", id),
  navigateBrowserTab: (id: string, address: string) =>
    ipcRenderer.invoke("browser:navigate", { id, address }),
  browserGoBack: (id: string) => ipcRenderer.invoke("browser:go-back", id),
  browserGoForward: (id: string) => ipcRenderer.invoke("browser:go-forward", id),
  browserReload: (id: string) => ipcRenderer.invoke("browser:reload", id),
  browserStop: (id: string) => ipcRenderer.invoke("browser:stop", id),
  setBrowserBounds: (bounds) => ipcRenderer.invoke("browser:set-bounds", bounds),
  setBrowserVisible: (visible: boolean) => ipcRenderer.invoke("browser:set-visible", visible),
  getBrowserHistory: () => ipcRenderer.invoke("browser:get-history") as Promise<DesktopBrowserVisit[]>,
  clearBrowserHistory: () => ipcRenderer.invoke("browser:clear-history"),
  getBrowserBookmarks: () => ipcRenderer.invoke("browser:get-bookmarks") as Promise<DesktopBrowserBookmark[]>,
  addBrowserBookmark: (url: string, title: string) => ipcRenderer.invoke("browser:add-bookmark", { url, title }) as Promise<DesktopBrowserBookmark | null>,
  removeBrowserBookmark: (id: string) => ipcRenderer.invoke("browser:remove-bookmark", id),
};

contextBridge.exposeInMainWorld("leannaDesktop", api);
