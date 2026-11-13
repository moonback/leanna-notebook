"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Un preload en bac à sable ne peut pas importer de module local : la liste est déclarée ici.
// `satisfies` + le test `Missing` ci-dessous garantissent qu'elle couvre exactement le contrat typé.
const BROWSER_METHODS = [
    "init", "getState", "createTab", "activateTab", "closeTab", "duplicateTab", "moveTab", "navigate", "goBack",
    "goForward", "reload", "stop", "setZoom", "runCommand", "key", "setBounds", "setVisible", "getSettings",
    "updateSettings", "getHistory", "removeVisit", "clearHistory", "getBookmarks", "addBookmark", "updateBookmark",
    "removeBookmark", "addFolder", "renameFolder", "removeFolder", "cancelDownload", "showDownloadInFolder",
    "removeDownload", "getPermissions", "setPermission", "clearBrowsingData", "extractPage", "getSelection",
    "agentStart", "agentCall", "agentResolve", "agentAbort", "agentEnd",
];
const allMethodsListed = true;
void allMethodsListed;
function subscribe(channel, callback) {
    const listener = (_event, payload) => callback(payload);
    electron_1.ipcRenderer.on(channel, listener);
    return () => electron_1.ipcRenderer.removeListener(channel, listener);
}
const browser = {
    ...Object.fromEntries(BROWSER_METHODS.map((method) => [
        method, (...args) => electron_1.ipcRenderer.invoke(`browser:${method}`, ...args),
    ])),
    onState: (callback) => subscribe("browser:state", callback),
    onCommand: (callback) => subscribe("browser:command", callback),
};
const api = {
    getVersion: () => electron_1.ipcRenderer.invoke("desktop:app-version"),
    checkForUpdates: () => electron_1.ipcRenderer.invoke("desktop:check-for-updates"),
    onUpdateStatus: (callback) => subscribe("desktop:update-status", callback),
    openFiles: (filters) => electron_1.ipcRenderer.invoke("desktop:open-files", filters),
    saveFile: (defaultPath, filters) => electron_1.ipcRenderer.invoke("desktop:save-file", { defaultPath, filters }),
    openExternal: (url) => electron_1.ipcRenderer.invoke("desktop:open-external", url),
    browser,
};
electron_1.contextBridge.exposeInMainWorld("leannaDesktop", api);
