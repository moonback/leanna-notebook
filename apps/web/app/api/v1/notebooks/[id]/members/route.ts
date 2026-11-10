import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide.").max(320),
  role: z.enum(["viewer", "editor"]),
}).strict();

/** Personnes ayant accès (H01) : réservé au propriétaire, seul à voir les adresses. */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "owner");
  const { data, error } = await createServiceClient().rpc("notebook_people", { p_nb: id });
  if (error) throw error;
  return NextResponse.json({ people: data });
});

/**
 * Inviter par email. Compte existant : accès immédiat (« Partagés avec moi »).
 * Sans compte : invitation en attente, rattachée à l'inscription. Aucun email n'est envoyé (pas de fournisseur configuré).
 */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "owner");
  const { email, role } = await parseBody(req, inviteSchema);
  const db = createServiceClient();
  const [{ data: nb }, { data: userId }, { count }] = await Promise.all([
    db.from("notebooks").select("workspace_id, created_by, workspaces(plans(limits))").eq("id", id).single(),
    db.rpc("user_id_by_email", { p_email: email }),
    db.from("notebook_members").select("id", { count: "exact", head: true }).eq("notebook_id", id),
  ]);
  if (!nb) throw new ApiError(404, "not_found");
  if (userId && userId === nb.created_by) throw new ApiError(409, "already_owner");
  const limit = (nb.workspaces as unknown as { plans: { limits: { max_members_per_notebook?: number } } } | null)?.plans?.limits?.max_members_per_notebook;
  if (limit != null && (count ?? 0) >= limit) throw new ApiError(409, "max_members");
  const { data: member, error } = await db.from("notebook_members")
    .insert({ notebook_id: id, role, invited_by: user.id, ...(userId ? { user_id: userId } : { invited_email: email }) })
    .select("id").single();
  if (error?.code === "23505") throw new ApiError(409, "already_member");
  if (error) throw error;
  await db.from("audit_log").insert({ workspace_id: nb.workspace_id, actor_id: user.id, action: "notebook.share", target_type: "notebook", target_id: id, meta: { role, pending: !userId } });
  log.info("notebook.shared", { notebook_id: id, role, pending: !userId }); // pas d'email dans les journaux
  return NextResponse.json({ member: { id: member.id, pending: !userId } }, { status: 201 });
});
