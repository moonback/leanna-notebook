"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const WEB_URL = process.env.LEANNA_WEB_URL ?? "http://127.0.0.1:3000";
const allowedOrigin = new URL(WEB_URL).origin;
let mainWindow = null;
function isSafeExternalUrl(value) {
    if (typeof value !== "string" || value.length > 2048)
        return false;
    try {
        return new URL(value).protocol === "https:";
    }
    catch {
        return false;
    }
}
function normalizeFilters(value) {
    if (!Array.isArray(value))
        return [];
    return value.slice(0, 12).flatMap((entry) => {
        if (!entry || typeof entry !== "object")
            return [];
        const filter = entry;
        if (typeof filter.name !== "string" ||
            !Array.isArray(filter.extensions) ||
            filter.extensions.length > 30 ||
            !filter.extensions.every((extension) => typeof extension === "string" && /^[a-z0-9]{1,10}$/i.test(extension)))
            return [];
        return [{ name: filter.name.slice(0, 80), extensions: filter.extensions }];
    });
}
function registerApplicationMenu() {
    const viewItems = [
        { role: "reload", label: "Recharger" },
        ...(!electron_1.app.isPackaged ? [{ role: "toggleDevTools", label: "Outils de développement" }] : []),
        { type: "separator" },
        { role: "resetZoom", label: "Taille réelle" },
        { role: "zoomIn", label: "Agrandir" },
        { role: "zoomOut", label: "Réduire" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein écran" },
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate([
        {
            label: "Leanna Notebook",
            submenu: [
                { role: "about", label: "À propos de Leanna Notebook" },
                { type: "separator" },
                { role: "quit", label: "Quitter" },
            ],
        },
        {
            label: "Édition",
            submenu: [
                { role: "undo", label: "Annuler" },
                { role: "redo", label: "Rétablir" },
                { type: "separator" },
                { role: "cut", label: "Couper" },
                { role: "copy", label: "Copier" },
                { role: "paste", label: "Coller" },
                { role: "selectAll", label: "Tout sélectionner" },
            ],
        },
        { label: "Affichage", submenu: viewItems },
        {
            label: "Fenêtre",
            submenu: [
                { role: "minimize", label: "Réduire" },
                { role: "close", label: "Fermer" },
            ],
        },
    ]));
}
/**
 * Les exports déclenchés par le renderer passent par la boîte de dialogue
 * native « Enregistrer sous ». Aucun chemin local n'est choisi silencieusement.
 */
function registerNativeDownloadHandler() {
    const downloadSession = mainWindow?.webContents.session;
    if (!downloadSession)
        return;
    downloadSession.on("will-download", (event, item, contents) => {
        const parent = electron_1.BrowserWindow.fromWebContents(contents);
        if (!parent || contents !== mainWindow?.webContents) {
            item.cancel();
            return;
        }
        void electron_1.dialog.showSaveDialog(parent, {
            title: "Enregistrer le fichier",
            defaultPath: item.getFilename(),
        }).then((result) => {
            if (result.canceled || !result.filePath) {
                item.cancel();
                return;
            }
            item.setSavePath(result.filePath);
        }).catch(() => {
            item.cancel();
            void electron_1.dialog.showMessageBox(parent, {
                type: "error",
                title: "Téléchargement impossible",
                message: "Le fichier n'a pas pu être enregistré.",
            });
        });
    });
}
function registerIpcHandlers() {
    electron_1.ipcMain.handle("desktop:app-version", () => electron_1.app.getVersion());
    electron_1.ipcMain.handle("desktop:open-files", async (event, filters) => {
        if (!mainWindow || event.sender !== mainWindow.webContents) {
            return { canceled: true, filePaths: [] };
        }
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ["openFile", "multiSelections"],
            filters: normalizeFilters(filters),
        });
        return { canceled: result.canceled, filePaths: result.filePaths };
    });
    electron_1.ipcMain.handle("desktop:save-file", async (event, options) => {
        if (!mainWindow || event.sender !== mainWindow.webContents) {
            return { canceled: true };
        }
        const input = options && typeof options === "object"
            ? options
            : {};
        const result = await electron_1.dialog.showSaveDialog(mainWindow, {
            defaultPath: typeof input.defaultPath === "string" ? input.defaultPath.slice(0, 512) : undefined,
            filters: normalizeFilters(input.filters),
        });
        return { canceled: result.canceled, filePath: result.filePath };
    });
    electron_1.ipcMain.handle("desktop:open-external", async (event, value) => {
        if (!mainWindow || event.sender !== mainWindow.webContents || !isSafeExternalUrl(value)) {
            return { opened: false };
        }
        await electron_1.shell.openExternal(value);
        return { opened: true };
    });
}
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 960,
        minHeight: 640,
        show: false,
        backgroundColor: "#0b0d12",
        title: "Leanna Notebook",
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
        },
    });
    mainWindow.once("ready-to-show", () => mainWindow?.show());
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url))
            void electron_1.shell.openExternal(url);
        return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
        try {
            if (new URL(navigationUrl).origin !== allowedOrigin)
                event.preventDefault();
        }
        catch {
            event.preventDefault();
        }
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
    if (electron_1.app.isPackaged) {
        void electron_1.dialog.showMessageBox({
            type: "info",
            title: "Leanna Notebook",
            message: "Le build desktop de production n'est pas encore configuré.",
            detail: "Lancez la version de développement avec pnpm desktop:dev.",
        }).then(() => electron_1.app.quit());
        return;
    }
    void mainWindow.loadURL(WEB_URL);
}
electron_1.app.whenReady().then(() => {
    registerApplicationMenu();
    registerIpcHandlers();
    createMainWindow();
    registerNativeDownloadHandler();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
