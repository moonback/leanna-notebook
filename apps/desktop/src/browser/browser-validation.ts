/**
 * Validation partagée par les commandes Browser du processus Main.
 * Les pages distantes ne doivent jamais pouvoir choisir un protocole privilégié.
 */
export type BrowserBounds = { x: number; y: number; width: number; height: number };

const MAX_URL_LENGTH = 2048;
const MAX_COORDINATE = 10000;

/** Moteurs proposés dans les réglages. `%s` reçoit la requête encodée. */
export const SEARCH_ENGINES = {
  google: { label: "Google", home: "https://www.google.com/", search: "https://www.google.com/search?q=%s" },
  duckduckgo: { label: "DuckDuckGo", home: "https://duckduckgo.com/", search: "https://duckduckgo.com/?q=%s" },
  bing: { label: "Bing", home: "https://www.bing.com/", search: "https://www.bing.com/search?q=%s" },
  brave: { label: "Brave Search", home: "https://search.brave.com/", search: "https://search.brave.com/search?q=%s" },
  qwant: { label: "Qwant", home: "https://www.qwant.com/", search: "https://www.qwant.com/?q=%s" },
} as const;
export type SearchEngineId = keyof typeof SEARCH_ENGINES;

export function isSearchEngineId(value: unknown): value is SearchEngineId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, value);
}

export function searchUrl(query: string, engine: SearchEngineId = "google"): string {
  return SEARCH_ENGINES[engine].search.replace("%s", encodeURIComponent(query.trim().slice(0, 500)));
}

/** Seuls http(s) sont navigables : file:, javascript:, data:, chrome:, etc. sont refusés. */
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

/** Schémas tolérés uniquement dans les sous-cadres (jamais en navigation principale). */
export function isSafeSubframeUrl(value: unknown): boolean {
  if (isSafeBrowserUrl(value)) return true;
  return typeof value === "string" && /^(about:blank|about:srcdoc|blob:https?:|data:)/i.test(value);
}

/** Accepte une URL HTTP(S), un nom d'hôte ou une recherche textuelle. */
export function resolveBrowserAddress(value: unknown, engine: SearchEngineId = "google"): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f]/.test(input)) return null;

  // `localhost:3000` ressemble à un schéma pour l'analyseur d'URL : on le traite comme un hôte.
  const hostWithPort = /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d{1,5}(?:\/\S*)?$/i.test(input);

  // Une chaîne contenant un protocole explicite ne doit jamais être convertie en recherche.
  if (!hostWithPort && /^[a-z][a-z0-9+.-]*:/i.test(input)) {
    try {
      const url = new URL(input);
      return isSafeBrowserUrl(url.toString()) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  const looksLikeHost = /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|[^\s/]+\.[^\s/]+)(?::\d{1,5})?(?:\/[^\s]*)?$/i.test(input);
  if (looksLikeHost) {
    // Boucle locale : HTTP (serveurs de développement) ; tout le reste en HTTPS.
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(input);
    try {
      const url = new URL(`${local ? "http" : "https"}://${input}`);
      return isSafeBrowserUrl(url.toString()) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  return searchUrl(input, engine);
}

export function normalizeBrowserBounds(value: unknown): BrowserBounds | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const values = [input.x, input.y, input.width, input.height];
  if (!values.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x, y, width, height] = values as number[];
  if (width <= 0 || height <= 0 || width > MAX_COORDINATE || height > MAX_COORDINATE) return null;
  if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
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

export function isTabId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

/** Déplace un élément dans une copie du tableau (index d'arrivée borné). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** Permissions sans risque pour l'utilisateur : accordées sans question. */
const ALWAYS_ALLOWED = new Set(["fullscreen", "clipboard-sanitized-write", "pointerLock", "keyboardLock"]);
/** Permissions qu'un site peut demander ; toutes les autres sont refusées d'office. */
export const ASKABLE_PERMISSIONS = new Set(["media", "geolocation", "notifications", "clipboard-read"]);

/** Décision pour une demande de permission : choix mémorisé pour l'origine, sinon politique des réglages. */
export function decidePermission(
  permission: string, stored: "allow" | "deny" | null, policy: "ask" | "deny",
): "allow" | "deny" | "ask" {
  if (ALWAYS_ALLOWED.has(permission)) return "allow";
  if (!ASKABLE_PERMISSIONS.has(permission)) return "deny";
  if (stored) return stored;
  return policy === "deny" ? "deny" : "ask";
}

const RISKY_EXTENSIONS = new Set([
  "exe", "msi", "msix", "bat", "cmd", "com", "scr", "pif", "ps1", "vbs", "vbe", "js", "jse", "wsf", "wsh",
  "hta", "cpl", "jar", "lnk", "reg", "dll", "sys", "appx", "application", "gadget", "msc", "sh", "app",
  "dmg", "pkg", "deb", "rpm", "apk", "iso", "img", "docm", "xlsm", "pptm", "chm", "url", "scf",
]);

/** Fichier exécutable ou pouvant exécuter du code à l'ouverture (dernière extension, insensible à la casse). */
export function isRiskyDownload(filename: unknown): boolean {
  if (typeof filename !== "string") return true;
  const ext = filename.trim().replace(/[. ]+$/, "").split(".").pop()?.toLowerCase() ?? "";
  return RISKY_EXTENSIONS.has(ext);
}

/** Message lisible pour un code d'erreur réseau Chromium. */
export function describeLoadError(code: number, description: string): string {
  if (description.startsWith("ERR_CERT_") || (code <= -200 && code >= -299)) {
    return "Le certificat de sécurité de ce site n'est pas valide. La connexion a été bloquée.";
  }
  const known: Record<string, string> = {
    ERR_NAME_NOT_RESOLVED: "Adresse introuvable. Vérifiez l'orthographe du nom de domaine.",
    ERR_INTERNET_DISCONNECTED: "Aucune connexion Internet.",
    ERR_CONNECTION_REFUSED: "Le site a refusé la connexion.",
    ERR_CONNECTION_TIMED_OUT: "Le site met trop de temps à répondre.",
    ERR_TIMED_OUT: "Le site met trop de temps à répondre.",
    ERR_CONNECTION_RESET: "La connexion a été interrompue.",
    ERR_ADDRESS_UNREACHABLE: "Le site est injoignable.",
    ERR_SSL_PROTOCOL_ERROR: "La connexion sécurisée a échoué.",
    ERR_TOO_MANY_REDIRECTS: "Le site redirige en boucle.",
    ERR_BLOCKED_BY_CLIENT: "La navigation a été bloquée.",
    ERR_UNSAFE_REDIRECT: "Redirection non sécurisée bloquée.",
  };
  return known[description] ?? `La page n'a pas pu être chargée (${description || code}).`;
}
