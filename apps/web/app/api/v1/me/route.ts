import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { log } from "@/lib/log";
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

const BUCKETS = ["sources", "artifacts", "exports"] as const;
type Db = ReturnType<typeof createServiceClient>;

/** Liste récursivement tous les fichiers sous un préfixe de bucket (les dossiers n'ont pas d'id). */
async function listFiles(db: Db, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw error;
    if (!data?.length) break;
    for (const e of data) {
      if (e.id) out.push(`${prefix}/${e.name}`);
      else out.push(...(await listFiles(db, bucket, `${prefix}/${e.name}`)));
    }
    if (data.length < 100) break;
  }
  return out;
}

const deleteSchema = z.object({ confirm: z.string().trim().min(1, "Saisissez votre adresse e-mail.") }).strict();

/**
 * Suppression définitive du compte (RGPD, art. 17) : confirmation par l'e-mail, puis suppression de l'utilisateur
 * auth. Les FK en cascade effacent profil, espaces possédés (notebooks, sources, chats, artefacts), appartenances ;
 * les liens « créé par » / « invité par » passent à NULL. Les fichiers Storage sont purgés ensuite.
 */
export async function DELETE(request: NextRequest) {
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
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return err(422, "validation", { fields: fieldErrors(parsed.error) });
  if (!user.email || parsed.data.confirm.toLowerCase() !== user.email.toLowerCase()) {
    return err(422, "validation", { fields: { confirm: "L’adresse saisie ne correspond pas à votre compte." } });
  }

  const db = createServiceClient();
  // Espaces possédés : à relever AVANT la suppression, les lignes disparaissent en cascade.
  const { data: owned, error: readError } = await db.from("workspaces").select("id").eq("owner_id", user.id);
  if (readError) return err(500, "read_failed");
  const workspaceIds = (owned ?? []).map((w) => w.id as string);

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) {
    log.error("account.delete_failed", { user_id: user.id });
    return err(500, "delete_failed");
  }

  let purged = 0;
  for (const ws of workspaceIds) {
    for (const bucket of BUCKETS) {
      try {
        const paths = await listFiles(db, bucket, ws);
        for (let i = 0; i < paths.length; i += 100) {
          const { error: se } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
          if (se) throw se;
        }
        purged += paths.length;
      } catch {
        log.error("storage.purge_failed", { workspace_id: ws, bucket }); // à reprendre par le job purge_storage
      }
    }
  }
  log.info("account.deleted", { user_id: user.id, workspaces: workspaceIds.length, files: purged });

  // Session locale invalidée côté navigateur (cookies) ; le jeton serveur n'existe plus.
  await (await createUserClient()).auth.signOut().catch(() => undefined);
  return new NextResponse(null, { status: 204 });
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
