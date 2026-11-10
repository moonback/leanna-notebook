import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/api";
import { createOAuthState, googleDriveAuthorizationUrl } from "@/lib/google-drive";
import { createServiceClient } from "@/lib/supabase/server";

const COOKIE = "google_drive_oauth";
const CALLBACK = "/api/v1/integrations/google-drive/callback";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const { data, error } = await createServiceClient().from("google_drive_connections")
    .select("google_email").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "connection_status_failed" }, { status: 500 });
  return NextResponse.json({ connected: Boolean(data), email: data?.google_email ?? null });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const { state, nonce, verifier } = createOAuthState(user.id);
  const challenge = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challengeBase64 = Buffer.from(challenge).toString("base64url");
  const redirectUri = new URL(CALLBACK, request.nextUrl.origin).toString();
  const response = NextResponse.redirect(googleDriveAuthorizationUrl(redirectUri, state, challengeBase64), 303);
  response.cookies.set(COOKIE, JSON.stringify({ nonce, verifier }), {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax",
    path: CALLBACK, maxAge: 600,
  });
  return response;
}

export async function DELETE() {
  const user = await requireUser();
  const { error } = await createServiceClient().from("google_drive_connections").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "disconnect_failed" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
