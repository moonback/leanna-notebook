// Accès typé au pont Electron. Le contrat est la source unique partagée avec le processus Main
// (import de types uniquement : rien du paquet desktop n'est embarqué dans le bundle web).
import type { DesktopBrowserApi } from "../../../desktop/src/shared/desktop-api";

export type * from "../../../desktop/src/shared/desktop-api";

/** `null` hors de l'application desktop, ou avec une version desktop antérieure au navigateur. */
export function getBrowserApi(): DesktopBrowserApi | null {
  if (typeof window === "undefined") return null;
  return window.leannaDesktop?.browser ?? null;
}

type KeyLike = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

/**
 * Vrai si la touche est un raccourci du navigateur : l'interface doit alors l'intercepter tout de suite
 * (sinon Ctrl+W fermerait la fenêtre et Ctrl+R rechargerait l'application) et la transmettre à Main,
 * qui détient la table de référence. Un test vérifie que ce filtre lui est strictement équivalent.
 */
export function shouldForwardKey(event: KeyLike): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const mod = event.ctrlKey || event.metaKey;
  if (!mod && !event.altKey) return key === "F5" || key === "F6" || key === "F11";
  if (event.altKey && !mod) return key === "ArrowLeft" || key === "ArrowRight" || key === "d";
  if (!mod || event.altKey) return false;
  if (key === "Tab" || key === "PageDown" || key === "PageUp") return true;
  if (event.shiftKey) return ["r", "k", "l", "+", "="].includes(key);
  return ["t", "w", "r", "l", "d", "h", "j", "+", "=", "-", "0"].includes(key);
}

export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toLocaleString("fr-FR", { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}
