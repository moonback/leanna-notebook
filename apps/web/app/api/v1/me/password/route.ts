import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { sameOrigin } from "@/lib/api";
import { createUserClient, getUser } from "@/lib/supabase/server";

const schema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
}).strict();

const response = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user || !user.email) return response(401, "auth_required");
  const origin = request.headers.get("origin");
  if (origin && !sameOrigin(request, origin)) return response(403, "forbidden");

  let body: unknown;
  try { body = await request.json(); } catch { return response(400, "invalid_json"); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return response(422, "invalid_password");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response(500, "configuration_error");

  // Réauthentification isolée : ne remplace pas la session active de l'utilisateur.
  const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: verificationError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verificationError) return response(422, "current_password_invalid");

  const supabase = await createUserClient();
  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (updateError) {
    if (/weak|password.*(short|length|strength)/i.test(updateError.message)) return response(422, "weak_password");
    return response(500, "password_update_failed");
  }
  return NextResponse.json({ success: true });
}
