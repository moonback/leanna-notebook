import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, DesktopFileFilter, DesktopUpdateStatus } from "./shared/desktop-api";

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
};

contextBridge.exposeInMainWorld("leannaDesktop", api);
