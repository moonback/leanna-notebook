import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, DesktopFileFilter } from "./shared/desktop-api";

const api: DesktopApi = {
  getVersion: () => ipcRenderer.invoke("desktop:app-version"),
  openFiles: (filters?: DesktopFileFilter[]) =>
    ipcRenderer.invoke("desktop:open-files", filters),
  saveFile: (defaultPath?: string, filters?: DesktopFileFilter[]) =>
    ipcRenderer.invoke("desktop:save-file", { defaultPath, filters }),
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url),
};

contextBridge.exposeInMainWorld("leannaDesktop", api);
