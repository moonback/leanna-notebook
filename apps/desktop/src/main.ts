import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserManager } from "./browser/browser-manager";
import { BrowserDataStore } from "./browser/browser-data-store";
import { isAllowedWebUrl, isSafeExternalUrl, normalizeFilters } from "./shared/validation";
import { checkForUpdates, initializeAutoUpdater } from "./updater";

function resolveWebUrl(): string {
  let configuredUrl = process.env.LEANNA_WEB_URL;

  if (app.isPackaged && !configuredUrl) {
    try {
      const config = JSON.parse(
        readFileSync(join(__dirname, "build-config.json"), "utf8"),
      ) as { webUrl?: unknown };
      configuredUrl = typeof config.webUrl === "string" ? config.webUrl : undefined;
    } catch {
      throw new Error(
        "Configuration de production absente. Recréez l'installateur avec LEANNA_WEB_URL.",
      );
    }
  }

  configuredUrl ??= "http://127.0.0.1:3000";
  if (!isAllowedWebUrl(configuredUrl, !app.isPackaged)) {
    throw new Error(
      "LEANNA_WEB_URL must use HTTPS in production (localhost HTTP is development-only).",
    );
  }
  return configuredUrl;
}

const WEB_URL = resolveWebUrl();
const allowedOrigin = new URL(WEB_URL).origin;
let mainWindow: BrowserWindow | null = null;
let browserDataStore: BrowserDataStore | null = null;
const browserManager = new BrowserManager((state) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("browser:state", state);
  }
}, (visit) => {
  if (!visit.isPrivate) {
    void browserDataStore?.addVisit(visit.url, visit.title).catch(() => undefined);
  }
});

function isTrustedRenderer(event: Electron.IpcMainInvokeEvent): boolean {
  if (!mainWindow || event.sender !== mainWindow.webContents) return false;
  try {
    const frameUrl = event.senderFrame?.url;
    return Boolean(frameUrl && new URL(frameUrl).origin === allowedOrigin);
  } catch {
    return false;
  }
}

function registerApplicationMenu(): void {
  const viewItems: Electron.MenuItemConstructorOptions[] = [
    { role: "reload", label: "Recharger" },
    ...(!app.isPackaged ? [{ role: "toggleDevTools" as const, label: "Outils de développement" }] : []),
    { type: "separator" },
    { role: "resetZoom", label: "Taille réelle" },
    { role: "zoomIn", label: "Agrandir" },
    { role: "zoomOut", label: "Réduire" },
    { type: "separator" },
    { role: "togglefullscreen", label: "Plein écran" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Leanna Notebook",
      submenu: [
        { role: "about", label: "À propos de Leanna Notebook" },
        { type: "separator" },
        { role: "quit", label: "Quitter" },
        { type: "separator" },
        { label: "Rechercher les mises à jour…", click: () => { void checkForUpdates(mainWindow, true); } },
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
function registerNativeDownloadHandler(): void {
  const downloadSession = mainWindow?.webContents.session;
  if (!downloadSession) return;

  downloadSession.on("will-download", (event, item, contents) => {
    const parent = BrowserWindow.fromWebContents(contents);
    if (!parent || contents !== mainWindow?.webContents) {
      item.cancel();
      return;
    }

    item.pause();
    void dialog.showSaveDialog(parent, {
      title: "Enregistrer le fichier",
      defaultPath: item.getFilename(),
    }).then((result) => {
      if (result.canceled || !result.filePath) {
        item.cancel();
        return;
      }
      item.setSavePath(result.filePath);
      item.resume();
    }).catch(() => {
      item.cancel();
      if (!parent.isDestroyed()) {
        void dialog.showMessageBox(parent, {
          type: "error",
          title: "Téléchargement impossible",
          message: "Le fichier n'a pas pu être enregistré.",
        });
      }
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("desktop:app-version", () => app.getVersion());
  ipcMain.handle("desktop:check-for-updates", async (event) => {
    if (!isTrustedRenderer(event)) return { started: false };
    await checkForUpdates(mainWindow, true);
    return { started: true };
  });

  ipcMain.handle("desktop:open-files", async (event, filters: unknown) => {
    if (!isTrustedRenderer(event) || !mainWindow) {
      return { canceled: true, filePaths: [] };
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: normalizeFilters(filters),
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  ipcMain.handle("desktop:save-file", async (event, options: unknown) => {
    if (!isTrustedRenderer(event) || !mainWindow) return { canceled: true };
    const input = options && typeof options === "object"
      ? options as { defaultPath?: unknown; filters?: unknown }
      : {};
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath:
        typeof input.defaultPath === "string" ? input.defaultPath.slice(0, 512) : undefined,
      filters: normalizeFilters(input.filters),
    });
    return { canceled: result.canceled, filePath: result.filePath };
  });

  ipcMain.handle("desktop:open-external", async (event, value: unknown) => {
    if (!isTrustedRenderer(event) || !isSafeExternalUrl(value)) return { opened: false };
    await shell.openExternal(value);
    return { opened: true };
  });

  ipcMain.handle("browser:get-state", (event) =>
    isTrustedRenderer(event) ? browserManager.getState() : { activeTabId: null, tabs: [] },
  );
  ipcMain.handle("browser:get-history", async (event) =>
    isTrustedRenderer(event) && browserDataStore ? browserDataStore.getHistory() : [],
  );
  ipcMain.handle("browser:clear-history", async (event) => {
    if (!isTrustedRenderer(event) || !browserDataStore) return false;
    await browserDataStore.clearHistory();
    return true;
  });
  ipcMain.handle("browser:get-bookmarks", async (event) =>
    isTrustedRenderer(event) && browserDataStore ? browserDataStore.getBookmarks() : [],
  );
  ipcMain.handle("browser:add-bookmark", async (event, input: unknown) => {
    if (!isTrustedRenderer(event) || !browserDataStore || !input || typeof input !== "object") return null;
    const args = input as { url?: unknown; title?: unknown };
    return browserDataStore.addBookmark(args.url, args.title);
  });
  ipcMain.handle("browser:remove-bookmark", async (event, id: unknown) =>
    isTrustedRenderer(event) && browserDataStore ? browserDataStore.removeBookmark(id) : false,
  );
  ipcMain.handle("browser:create-tab", async (event, input: unknown) => {
    if (!isTrustedRenderer(event)) return null;
    const args = input && typeof input === "object"
      ? input as { url?: unknown; isPrivate?: unknown }
      : {};
    if (args.isPrivate !== undefined && typeof args.isPrivate !== "boolean") return null;
    try {
      return await browserManager.createTab(args.url, args.isPrivate === true);
    } catch {
      return null;
    }
  });
  ipcMain.handle("browser:activate-tab", (event, id: unknown) =>
    isTrustedRenderer(event) && typeof id === "string" && id.length <= 64
      ? browserManager.activateTab(id) : false,
  );
  ipcMain.handle("browser:close-tab", async (event, id: unknown) =>
    isTrustedRenderer(event) && typeof id === "string" && id.length <= 64
      ? browserManager.closeTab(id) : false,
  );
  ipcMain.handle("browser:navigate", (event, input: unknown) => {
    if (!isTrustedRenderer(event) || !input || typeof input !== "object") return false;
    const args = input as { id?: unknown; address?: unknown };
    return typeof args.id === "string" && args.id.length <= 64
      ? browserManager.navigate(args.id, args.address) : false;
  });
  ipcMain.handle("browser:go-back", (event, id: unknown) =>
    isTrustedRenderer(event) && typeof id === "string" && id.length <= 64
      ? browserManager.goBack(id) : false,
  );
  ipcMain.handle("browser:go-forward", (event, id: unknown) =>
    isTrustedRenderer(event) && typeof id === "string" && id.length <= 64
      ? browserManager.goForward(id) : false,
  );
  ipcMain.handle("browser:reload", (event, id: unknown) =>
    isTrustedRenderer(event) && typeof id === "string" && id.length <= 64
      ? browserManager.reload(id) : false,
  );
  ipcMain.handle("browser:stop", (event, id: unknown) =>
    isTrustedRenderer(event) && typeof id === "string" && id.length <= 64
      ? browserManager.stop(id) : false,
  );
  ipcMain.handle("browser:set-bounds", (event, bounds: unknown) =>
    isTrustedRenderer(event) ? browserManager.setBounds(bounds) : false,
  );
  ipcMain.handle("browser:set-visible", (event, visible: unknown) => {
    if (!isTrustedRenderer(event) || typeof visible !== "boolean") return false;
    browserManager.setVisible(visible);
    return true;
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0d12",
    title: "Leanna Notebook",
    icon: join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  browserManager.attach(mainWindow);

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      if (new URL(navigationUrl).origin !== allowedOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.on("closed", () => {
    void browserManager.dispose();
    mainWindow = null;
  });

  void mainWindow.loadURL(WEB_URL).catch(async (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    if (!mainWindow || mainWindow.isDestroyed()) return;

    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Notebook ne démarre pas",
      message: "Impossible de charger l'application web locale.",
      detail: `Vérifiez que Next.js est disponible sur ${WEB_URL}.\n\nDétail : ${detail}`,
      buttons: ["Quitter"],
    });
    app.quit();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    void dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Fenêtre Notebook interrompue",
      message: "Le processus d'affichage de Notebook s'est arrêté.",
      detail: `Raison : ${details.reason} (code ${details.exitCode}). Relancez pnpm desktop:dev.`,
    });
  });

  mainWindow.on("unresponsive", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    void dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Notebook ne répond plus",
      message: "La fenêtre ne répond plus.",
      detail: "Vous pouvez attendre quelques instants ou fermer puis relancer l'application.",
    });
  });
}

app.whenReady().then(() => {
  browserDataStore = new BrowserDataStore(app.getPath("userData"));
  registerApplicationMenu();
  registerIpcHandlers();
  createMainWindow();
  registerNativeDownloadHandler();
  initializeAutoUpdater(() => mainWindow);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
