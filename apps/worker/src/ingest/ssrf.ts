import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { request as httpRequest } from "node:http";

/** Vrai si l'adresse est privée, locale, réservée ou de métadonnées cloud (v4 et v6). */
export function isForbiddenIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isForbiddenIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") ||
    v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

export class FetchRefused extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/**
 * GET protégé contre le SSRF : DNS résolu UNE fois, connexion à l'IP vérifiée (pas de rebinding),
 * ports 80/443, 5 redirections max revérifiées, taille et durée plafonnées.
 */
export async function safeFetch(rawUrl: string, redirects = 5, maxBytes = MAX_BYTES, extraHeaders: Record<string, string> = {}): Promise<{ url: string; contentType: string; body: Buffer }> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchRefused("scheme");
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchRefused("port");
  if (url.username || url.password) throw new FetchRefused("credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ip = isIP(host) ? host : (await lookup(host)).address;
  if (isForbiddenIp(ip)) throw new FetchRefused("private_address");

  const res = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const req = (url.protocol === "https:" ? request : httpRequest)({
      host: ip, servername: isIP(host) ? undefined : host, port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search, method: "GET", timeout: TIMEOUT_MS,
      headers: { host: url.host, "user-agent": "NotebookBot/0.1 (+import de source)", accept: "text/html,application/pdf,text/plain;q=0.9", ...extraHeaders },
    }, (r) => {
      const parts: Buffer[] = []; let size = 0;
      r.on("data", (d: Buffer) => { size += d.length; if (size > maxBytes) { req.destroy(new FetchRefused("too_large")); } else parts.push(d); });
      r.on("end", () => resolve({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(parts) }));
      r.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new FetchRefused("timeout")));
    req.on("error", reject);
    req.end();
  });

  if (res.status >= 300 && res.status < 400 && res.headers.location) {
    if (redirects <= 0) throw new FetchRefused("too_many_redirects");
    return safeFetch(new URL(String(res.headers.location), url).toString(), redirects - 1, maxBytes, extraHeaders);
  }
  if (res.status === 401 || res.status === 402 || res.status === 403) throw new FetchRefused("paywall", res.status);
  if (res.status >= 400) throw new FetchRefused(`http_${res.status}`);
  return { url: url.toString(), contentType: String(res.headers["content-type"] ?? ""), body: res.body };
}
