import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopApi,
  DesktopBrowserApi,
  DesktopBrowserCommand,
  DesktopBrowserInvokeApi,
  DesktopBrowserState,
  DesktopFileFilter,
  DesktopUpdateStatus,
} from "./shared/desktop-api";

// Un preload en bac à sable ne peut pas importer de module local : la liste est déclarée ici.
// `satisfies` + le test `Missing` ci-dessous garantissent qu'elle couvre exactement le contrat typé.
const BROWSER_METHODS = [
  "init", "getState", "createTab", "activateTab", "closeTab", "duplicateTab", "moveTab", "navigate", "goBack",
  "goForward", "reload", "stop", "setZoom", "runCommand", "key", "setBounds", "setVisible", "getSettings",
  "updateSettings", "setLauncherEnabled", "getHistory", "removeVisit", "clearHistory", "getBookmarks", "addBookmark", "updateBookmark",
  "removeBookmark", "addFolder", "renameFolder", "removeFolder", "cancelDownload", "showDownloadInFolder",
  "removeDownload", "getPermissions", "setPermission", "clearBrowsingData", "extractPage", "getSelection",
  "agentStart", "agentCall", "agentResolve", "agentAbort", "agentEnd",
] as const satisfies readonly (keyof DesktopBrowserInvokeApi)[];

type Missing = Exclude<keyof DesktopBrowserInvokeApi, typeof BROWSER_METHODS[number]>;
const allMethodsListed: Missing extends never ? true : never = true;
void allMethodsListed;

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const browser = {
  ...Object.fromEntries(BROWSER_METHODS.map((method) => [
    method, (...args: unknown[]) => ipcRenderer.invoke(`browser:${method}`, ...args),
  ])),
  onState: (callback: (state: DesktopBrowserState) => void) => subscribe("browser:state", callback),
  onCommand: (callback: (command: DesktopBrowserCommand) => void) => subscribe("browser:command", callback),
  onOpenVoice: (callback: () => void) => subscribe("browser:open-voice", callback),
} as unknown as DesktopBrowserApi;

const api: DesktopApi = {
  getVersion: () => ipcRenderer.invoke("desktop:app-version"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => subscribe("desktop:update-status", callback),
  openFiles: (filters?: DesktopFileFilter[]) =>
    ipcRenderer.invoke("desktop:open-files", filters),
  saveFile: (defaultPath?: string, filters?: DesktopFileFilter[]) =>
    ipcRenderer.invoke("desktop:save-file", { defaultPath, filters }),
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url),
  browser,
};

contextBridge.exposeInMainWorld("leannaDesktop", api);
