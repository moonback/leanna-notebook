import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient, createUserClient, getUser } from "@/lib/supabase/server";
import { fieldErrors, profilePatchSchema } from "@/lib/validation";

const PROFILE_COLUMNS = "id, display_name, locale, output_language, theme, web_notifications, dashboard_view, created_at";
const err = (status: number, error: string, extra?: object) => NextResponse.json({ error, ...extra }, { status });

/** Profil + workspaces de l'utilisateur (lecture sous RLS). */
export async function GET() {
  const user = await getUser();
  if (!user) return err(401, "auth_required");
  const supabase = await createUserClient();
  const [profile, workspaces] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).single(),
    supabase.from("workspaces").select("id, kind, name, plan_id"),
  ]);
  if (profile.error || workspaces.error) return err(500, "read_failed");
  return NextResponse.json({ email: user.email, profile: profile.data, workspaces: workspaces.data });
}

/** Mise à jour des préférences : liste blanche Zod, puis écriture service_role sur SA ligne uniquement. */
export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, "auth_required");
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return err(403, "forbidden");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, "invalid_json");
  }
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) return err(422, "validation", { fields: fieldErrors(parsed.error) });

  const { data, error } = await createServiceClient()
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) return err(500, "write_failed");
  return NextResponse.json({ profile: data });
}
