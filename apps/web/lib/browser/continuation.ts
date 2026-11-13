import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Jeton de continuation d'une mission : la première requête d'un tour utilisateur réserve le quota,
 * les étapes d'outils suivantes présentent ce jeton signé. Sans lui, un client pourrait enchaîner des
 * appels au modèle sans jamais être compté. Le jeton porte le numéro d'étape : la limite ne se contourne pas.
 */
const TTL_MS = 15 * 60_000;

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("leanna-browser-continuation-v1").digest();
}

export function signContinuation(secret: string, userId: string, step: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, s: step, e: now + TTL_MS })).toString("base64url");
  return `${payload}.${createHmac("sha256", key(secret)).update(payload).digest("base64url")}`;
}

/** Étape portée par le jeton, ou null s'il est absent, falsifié, expiré ou émis pour un autre utilisateur. */
export function verifyContinuation(secret: string, token: string | undefined, userId: string, now = Date.now()): number | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", key(secret)).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; s?: unknown; e?: unknown };
    if (data.u !== userId || typeof data.e !== "number" || data.e < now) return null;
    return typeof data.s === "number" && Number.isInteger(data.s) && data.s >= 0 ? data.s : null;
  } catch {
    return null;
  }
}
