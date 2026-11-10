import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"];

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}
function encryptionKey() {
  const key = Buffer.from(required("DRIVE_TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY_must_be_32_byte_base64");
  return key;
}
function sign(value: string) {
  return createHmac("sha256", required("DRIVE_OAUTH_STATE_SECRET")).update(value).digest("base64url");
}
export function createOAuthState(userId: string) {
  const nonce = randomBytes(24).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: userId, nonce, iat: Date.now() })).toString("base64url");
  return { state: `${payload}.${sign(payload)}`, nonce, verifier: randomBytes(48).toString("base64url") };
}
export function verifyOAuthState(state: string, nonce: string, userId: string) {
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub: string; nonce: string; iat: number };
    if (parsed.sub !== userId || parsed.nonce !== nonce || Date.now() - parsed.iat > 10 * 60_000 || parsed.iat > Date.now() + 30_000) return null;
    return parsed;
  } catch { return null; }
}
export function encryptRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((v) => v.toString("base64url")).join(".");
}
export function decryptRefreshToken(value: string) {
  const [iv, tag, encrypted, extra] = value.split(".");
  if (!iv || !tag || !encrypted || extra) throw new Error("invalid_drive_token_ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
export function googleDriveAuthorizationUrl(redirectUri: string, state: string, challenge: string) {
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
export async function exchangeGoogleCode(code: string, redirectUri: string, verifier: string) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: required("GOOGLE_CLIENT_ID"), client_secret: required("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier,
    }),
    cache: "no-store",
  });
  const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string; error?: string };
  if (!response.ok || !body.access_token) throw new Error(`google_token_exchange_failed:${body.error ?? response.status}`);
  return body;
}
export async function fetchGoogleIdentity(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error("google_identity_lookup_failed");
  const body = await response.json() as { sub?: string; email?: string; email_verified?: boolean };
  if (!body.sub || !body.email || body.email_verified !== true) throw new Error("google_identity_unverified");
  return { subject: body.sub, email: body.email };
}
export const GOOGLE_DRIVE_SCOPES = SCOPES;
