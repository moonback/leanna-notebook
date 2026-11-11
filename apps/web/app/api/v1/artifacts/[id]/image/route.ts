import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
type Params = { params: Promise<{ id: string }> };
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser(); const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const db = createServiceClient();
  const { data: artifact } = await db.from("artifacts").select("notebook_id,storage_path,mime_type,type,status").eq("id", id).single();
  if (!artifact || artifact.type !== "image" || artifact.status !== "ready" || !artifact.storage_path) throw new ApiError(404, "image_not_found");
  await requireRole(artifact.notebook_id, "viewer");
  const { data, error } = await db.storage.from("artifacts").createSignedUrl(artifact.storage_path, 300);
  if (error || !data?.signedUrl) throw new ApiError(404, "image_not_found");
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, no-store" } });
});
