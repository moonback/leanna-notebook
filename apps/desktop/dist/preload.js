"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    getVersion: () => electron_1.ipcRenderer.invoke("desktop:app-version"),
    openFiles: (filters) => electron_1.ipcRenderer.invoke("desktop:open-files", filters),
    saveFile: (defaultPath, filters) => electron_1.ipcRenderer.invoke("desktop:save-file", { defaultPath, filters }),
    openExternal: (url) => electron_1.ipcRenderer.invoke("desktop:open-external", url),
};
electron_1.contextBridge.exposeInMainWorld("leannaDesktop", api);
