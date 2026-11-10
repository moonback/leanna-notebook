import type { DesktopFileFilter } from "./desktop-api";

export interface NormalizedFileFilter {
  name: string;
  extensions: string[];
}

/** Accept only bounded HTTPS URLs for opening in the system browser. */
export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Sanitize renderer-provided file filters before passing them to Electron. */
export function normalizeFilters(value: unknown): NormalizedFileFilter[] {
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
