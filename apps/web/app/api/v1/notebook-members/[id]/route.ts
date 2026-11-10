import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

async function member(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { data } = await createServiceClient().from("notebook_members").select("id, notebook_id, user_id, notebooks(workspace_id)").eq("id", id).single();
  if (!data) throw new ApiError(404, "not_found");
  return data as typeof data & { notebooks: { workspace_id: string } };
}

const patchSchema = z.object({ role: z.enum(["viewer", "editor"]) }).strict();

/** Changer le rôle d'un membre (propriétaire). */
export const PATCH = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  const m = await member(id);
  await requireRole(m.notebook_id, "owner");
  const { role } = await parseBody(req, patchSchema);
  const { error } = await createServiceClient().from("notebook_members").update({ role }).eq("id", id);
  if (error) throw error;
  return NextResponse.json({ member: { id, role } });
});

/** Retirer un accès (propriétaire) ou quitter un notebook partagé (le membre lui-même). Effet immédiat (RLS). */
export const DELETE = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const m = await member(id);
  if (m.user_id !== user.id) await requireRole(m.notebook_id, "owner");
  const db = createServiceClient();
  const { error } = await db.from("notebook_members").delete().eq("id", id);
  if (error) throw error;
  await db.from("audit_log").insert({ workspace_id: m.notebooks.workspace_id, actor_id: user.id, action: m.user_id === user.id ? "member.leave" : "member.remove", target_type: "notebook", target_id: m.notebook_id });
  return new NextResponse(null, { status: 204 });
});
