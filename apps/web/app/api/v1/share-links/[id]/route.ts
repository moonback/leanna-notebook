import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

/** Révoquer un lien (propriétaire) : effet immédiat, les visiteurs perdent l'accès (rôle recalculé à chaque requête). */
export const DELETE = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const db = createServiceClient();
  const { data: link } = await db.from("share_links").select("notebook_id").eq("id", id).is("revoked_at", null).single();
  if (!link) throw new ApiError(404, "not_found");
  await requireRole(link.notebook_id, "owner");
  const { error } = await db.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  log.info("share_link.revoked", { notebook_id: link.notebook_id });
  return new NextResponse(null, { status: 204 });
});
