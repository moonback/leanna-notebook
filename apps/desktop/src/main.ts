import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import type { DesktopFileFilter } from "./shared/desktop-api";

const WEB_URL = process.env.LEANNA_WEB_URL ?? "http://127.0.0.1:3000";
const allowedOrigin = new URL(WEB_URL).origin;
let mainWindow: BrowserWindow | null = null;

function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeFilters(value: unknown): Electron.FileFilter[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const filter = entry as Partial<DesktopFileFilter>;
    if (
      typeof filter.name !== "string" ||
      !Array.isArray(filter.extensions) ||
      filter.extensions.length > 30 ||
      !filter.extensions.every(
        (extension) => typeof extension === "string" && /^[a-z0-9]{1,10}$/i.test(extension),
      )
    ) return [];
    return [{ name: filter.name.slice(0, 80), extensions: filter.extensions }];
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("desktop:app-version", () => app.getVersion());

  ipcMain.handle("desktop:open-files", async (event, filters: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return { canceled: true, filePaths: [] };
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: normalizeFilters(filters),
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  ipcMain.handle("desktop:save-file", async (event, options: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return { canceled: true };
    }
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
    if (!mainWindow || event.sender !== mainWindow.webContents || !isSafeExternalUrl(value)) {
      return { opened: false };
    }
    await shell.openExternal(value);
    return { opened: true };
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
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

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
    mainWindow = null;
  });

  if (app.isPackaged) {
    void dialog.showMessageBox({
      type: "info",
      title: "Leanna Notebook",
      message: "Le build desktop de production n'est pas encore configuré.",
      detail: "Lancez la version de développement avec pnpm desktop:dev.",
    }).then(() => app.quit());
    return;
  }

  void mainWindow.loadURL(WEB_URL);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
