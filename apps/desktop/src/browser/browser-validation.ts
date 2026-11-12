/**
 * Validation partagée par les commandes Browser du processus Main.
 * Les pages distantes ne doivent jamais pouvoir choisir un protocole privilégié.
 */
export type BrowserBounds = { x: number; y: number; width: number; height: number };

const MAX_URL_LENGTH = 2048;
const MAX_COORDINATE = 10000;
const SEARCH_ENDPOINT = "https://www.google.com/search?q=";

export function isSafeBrowserUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Accepte une URL HTTP(S), un nom d'hôte ou une recherche textuelle. */
export function resolveBrowserAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f]/.test(input)) return null;

  // Une chaîne contenant un protocole explicite ne doit jamais être convertie en recherche.
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    try {
      const url = new URL(input);
      return isSafeBrowserUrl(url.toString()) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  // Un hôte explicite (y compris localhost et une adresse IPv4) est ouvert en HTTPS.
  const looksLikeHost = /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|[^\s/]+\.[^\s/]+)(?::\d{1,5})?(?:\/[^\s]*)?$/i.test(input);
  if (looksLikeHost) {
    const candidate = `https://${input}`;
    try {
      const url = new URL(candidate);
      return isSafeBrowserUrl(url.toString()) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  return SEARCH_ENDPOINT + encodeURIComponent(input);
}

export function normalizeBrowserBounds(value: unknown): BrowserBounds | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const values = [input.x, input.y, input.width, input.height];
  if (!values.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x, y, width, height] = values as number[];
  if (width <= 0 || height <= 0 || width > MAX_COORDINATE || height > MAX_COORDINATE) return null;
  if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function isSafeBrowserPermissionOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname) && !url.username && !url.password &&
      url.origin === value;
  } catch {
    return false;
  }
}
