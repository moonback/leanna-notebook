import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import {
  encryptRefreshToken, exchangeGoogleCode, fetchGoogleIdentity, GOOGLE_DRIVE_SCOPES, verifyOAuthState,
} from "@/lib/google-drive";

const COOKIE = "google_drive_oauth";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookie = request.cookies.get(COOKIE)?.value;
  const clear = (url: URL) => {
    const response = NextResponse.redirect(url);
    response.cookies.delete(COOKIE);
    return response;
  };
  if (!code || !state || !cookie) return clear(new URL("/settings?drive=oauth_error", request.url));

  try {
    const stored = JSON.parse(cookie) as { nonce?: string; verifier?: string };
    if (!stored.nonce || !stored.verifier || !verifyOAuthState(state, stored.nonce, user.id)) {
      return clear(new URL("/settings?drive=state_error", request.url));
    }
    const redirectUri = new URL("/api/v1/integrations/google-drive/callback", request.nextUrl.origin).toString();
    const tokens = await exchangeGoogleCode(code, redirectUri, stored.verifier);
    const identity = await fetchGoogleIdentity(tokens.access_token!);
    const db = createServiceClient();
    let refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      const { data: existing } = await db.from("google_drive_connections")
        .select("refresh_token_ciphertext").eq("user_id", user.id).maybeSingle();
      if (existing?.refresh_token_ciphertext) {
        const { decryptRefreshToken } = await import("@/lib/google-drive");
        refreshToken = decryptRefreshToken(existing.refresh_token_ciphertext);
      }
    }
    if (!refreshToken) return clear(new URL("/settings?drive=refresh_token_missing", request.url));
    const { error } = await db.from("google_drive_connections").upsert({
      user_id: user.id, google_subject: identity.subject, google_email: identity.email,
      refresh_token_ciphertext: encryptRefreshToken(refreshToken),
      scopes: tokens.scope?.split(" ") ?? GOOGLE_DRIVE_SCOPES,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;
    return clear(new URL("/settings?drive=connected", request.url));
  } catch {
    return clear(new URL("/settings?drive=oauth_error", request.url));
  }
}
