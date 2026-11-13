import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserDataStore } from "./browser/browser-data-store";
import { registerBrowserIpc } from "./browser/browser-ipc";
import { BrowserManager } from "./browser/browser-manager";
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
const browserDataStore = new BrowserDataStore(app.getPath("userData"));

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

const PERMISSION_LABELS: Record<string, string> = {
  media: "la caméra et le microphone",
  geolocation: "votre position",
  notifications: "les notifications",
  "clipboard-read": "le contenu du presse-papiers",
};

// `dialog.*` est résolu à l'appel : les tests de bout en bout peuvent remplacer ces dialogues natifs.
const browserManager = new BrowserManager({
  store: browserDataStore,
  onState: (state) => sendToRenderer("browser:state", state),
  onCommand: (command) => sendToRenderer("browser:command", command),
  chooseSavePath: (window, filename) => dialog.showSaveDialogSync(window, {
    title: "Enregistrer le téléchargement",
    defaultPath: join(app.getPath("downloads"), filename),
  }) || null,
  confirmRiskyDownload: (window, filename) => dialog.showMessageBoxSync(window, {
    type: "warning",
    title: "Fichier potentiellement dangereux",
    message: `« ${filename} » peut exécuter du code sur votre ordinateur.`,
    detail: "Ne le conservez que si vous faites confiance à sa provenance. Leanna ne l'ouvrira jamais automatiquement.",
    buttons: ["Annuler", "Télécharger quand même"],
    defaultId: 0,
    cancelId: 0,
  }) === 1,
  askPermission: async (window, origin, permission) => {
    const result = await dialog.showMessageBox(window, {
      type: "question",
      title: "Demande d'autorisation",
      message: `${origin} souhaite utiliser ${PERMISSION_LABELS[permission] ?? permission}.`,
      buttons: ["Refuser", "Autoriser"],
      defaultId: 0,
      cancelId: 0,
      checkboxLabel: "Mémoriser mon choix pour ce site",
    });
    return { allow: result.response === 1, remember: result.checkboxChecked };
  },
});

/**
 * Seul le cadre principal de la fenêtre de l'application, sur son origine, peut appeler l'IPC.
 * Les onglets du navigateur n'ont pas de preload et échouent de toute façon à ce contrôle.
 */
function isTrustedRenderer(event: Electron.IpcMainInvokeEvent): boolean {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
  try {
    const frame = event.senderFrame;
    return Boolean(frame && frame === mainWindow.webContents.mainFrame && new URL(frame.url).origin === allowedOrigin);
  } catch {
    return false;
  }
}

/** Boîte « À propos » détaillée : versions, plateforme, serveur et dossier de données. */
async function showAboutDialog(): Promise<void> {
  const v = process.versions;
  const detail = [
    "Votre espace de recherche et de notes assisté par IA :",
    "sources, chat, Studio, navigateur intégré et assistant vocal.",
    "",
    `Version : ${app.getVersion()}${app.isPackaged ? "" : " (développement)"}`,
    `Électron : ${v.electron}`,
    `Chromium : ${v.chrome}`,
    `Node.js : ${v.node}`,
    `V8 : ${v.v8}`,
    `Plateforme : ${process.platform} ${process.arch} (${process.getSystemVersion()})`,
    `Langue : ${app.getLocale()}`,
    `Serveur : ${allowedOrigin}`,
    `Données locales : ${app.getPath("userData")}`,
    "",
    `© ${new Date().getFullYear()} Leanna Notebook. Tous droits réservés.`,
  ].join("\n");

  const buttons = ["Fermer", "Copier les informations", "Rechercher les mises à jour"];
  const options: Electron.MessageBoxOptions = {
    type: "info",
    title: "À propos de Leanna Notebook",
    message: "Leanna Notebook",
    detail,
    buttons,
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);

  if (result.response === 1) clipboard.writeText(`Leanna Notebook\n${detail}`);
  else if (result.response === 2) void checkForUpdates(mainWindow, true);
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
        { label: "À propos de Leanna Notebook", click: () => { void showAboutDialog(); } },
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
 * (Les téléchargements des onglets du navigateur sont gérés par BrowserManager, sur leurs propres sessions.)
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

    // Suspendre immédiatement le téléchargement : le dialogue natif est asynchrone.
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

  registerBrowserIpc({ manager: browserManager, store: browserDataStore, isTrusted: isTrustedRenderer });
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
  // Quitter la page du navigateur (ou recharger l'application) masque la vue native,
  // sinon elle resterait affichée par-dessus une autre page de l'application.
  mainWindow.webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) browserManager.setVisible(false);
  });
  mainWindow.on("closed", () => {
    browserManager.dispose();
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
