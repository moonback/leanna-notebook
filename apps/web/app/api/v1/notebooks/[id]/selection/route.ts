import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

/** Sélection personnelle des sources : on remplace l'ensemble des sources DÉcochées de l'utilisateur. */
export const PUT = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "chat");
  const { deselectedSourceIds } = await parseBody(req, z.object({ deselectedSourceIds: z.array(z.string().uuid()).max(600) }).strict());
  const db = createServiceClient();
  // seules les sources de CE notebook sont acceptées
  const { data: valid } = await db.from("sources").select("id").eq("notebook_id", id).in("id", deselectedSourceIds.length ? deselectedSourceIds : ["00000000-0000-0000-0000-000000000000"]);
  await db.from("source_deselections").delete().eq("notebook_id", id).eq("user_id", user.id);
  if (valid?.length) {
    const { error } = await db.from("source_deselections").insert(valid.map((v) => ({ user_id: user.id, source_id: v.id, notebook_id: id })));
    if (error) throw error;
  }
  return new NextResponse(null, { status: 204 });
});
