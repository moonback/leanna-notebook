import { app, BrowserWindow, dialog } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";

let checking = false;
let downloading = false;

function notify(window: BrowserWindow | null, status: string, details?: Record<string, unknown>): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send("desktop:update-status", { status, ...details });
  }
}

export function initializeAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    checking = true;
    notify(getWindow(), "checking");
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    checking = false;
    notify(getWindow(), "not-available", { version: info.version });
  });

  autoUpdater.on("update-available", async (info: UpdateInfo) => {
    checking = false;
    notify(getWindow(), "available", { version: info.version });
    const window = getWindow();
    if (!window || window.isDestroyed()) return;

    const answer = await dialog.showMessageBox(window, {
      type: "info",
      title: "Mise à jour disponible",
      message: `Leanna Notebook ${info.version} est disponible.`,
      detail: "Souhaitez-vous télécharger cette mise à jour maintenant ? Vous pourrez continuer à utiliser l'application pendant le téléchargement.",
      buttons: ["Télécharger", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
    });
    if (answer.response === 0) {
      try {
        downloading = true;
        notify(getWindow(), "downloading", { percent: 0 });
        await autoUpdater.downloadUpdate();
      } catch (error) {
        downloading = false;
        const detail = error instanceof Error ? error.message : String(error);
        notify(getWindow(), "error", { message: detail });
        const currentWindow = getWindow();
        const options = {
          type: "error" as const,
          title: "Téléchargement impossible",
          message: "La mise à jour n'a pas pu être téléchargée.",
          detail,
        };
        if (currentWindow && !currentWindow.isDestroyed()) {
          await dialog.showMessageBox(currentWindow, options);
        } else {
          await dialog.showMessageBox(options);
        }
      }
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.setProgressBar(progress.percent / 100);
    notify(window, "downloading", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", async (info: UpdateInfo) => {
    downloading = false;
    const progressWindow = getWindow();
    if (progressWindow && !progressWindow.isDestroyed()) progressWindow.setProgressBar(-1);
    notify(getWindow(), "downloaded", { version: info.version });
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    const answer = await dialog.showMessageBox(window, {
      type: "info",
      title: "Mise à jour prête",
      message: `Leanna Notebook ${info.version} a été téléchargée.`,
      detail: "Redémarrez l'application pour terminer l'installation. Vos données en ligne ne seront pas affectées.",
      buttons: ["Redémarrer maintenant", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
    });
    if (answer.response === 0) autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on("error", (error) => {
    const progressWindow = getWindow();
    if (progressWindow && !progressWindow.isDestroyed()) progressWindow.setProgressBar(-1);
    checking = false;
    downloading = false;
    notify(getWindow(), "error", { message: error.message });
  });

  // Délai pour laisser la fenêtre et la connexion réseau se stabiliser.
  setTimeout(() => { void checkForUpdates(getWindow(), false); }, 12_000);
}

export async function checkForUpdates(window: BrowserWindow | null, showUpToDate = true): Promise<void> {
  if (!app.isPackaged || checking || downloading) return;

  let notAvailableListener: (() => void) | undefined;
  if (showUpToDate) {
    notAvailableListener = () => {
      if (window && !window.isDestroyed()) {
        void dialog.showMessageBox(window, {
          type: "info",
          title: "Aucune mise à jour",
          message: "Vous utilisez la dernière version de Leanna Notebook.",
        });
      }
    };
    autoUpdater.once("update-not-available", notAvailableListener);
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    if (notAvailableListener) autoUpdater.removeListener("update-not-available", notAvailableListener);
    const detail = error instanceof Error ? error.message : String(error);
    notify(window, "error", { message: detail });
    if (showUpToDate && window && !window.isDestroyed()) {
      await dialog.showMessageBox(window, {
        type: "error",
        title: "Recherche impossible",
        message: "Impossible de vérifier les mises à jour.",
        detail,
      });
    }
  }
}
