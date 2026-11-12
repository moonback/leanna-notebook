const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

export function isTikTokUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && TIKTOK_HOSTS.has(url.hostname.toLowerCase()) &&
      !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}
