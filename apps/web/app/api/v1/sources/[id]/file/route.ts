import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/** Original source file (signed URL, five minutes). Audio is played by the source viewer. */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const db = createServiceClient();
  const { data: source } = await db.from("sources")
    .select("notebook_id, storage_path").eq("id", id).single();
  if (!source) throw new ApiError(404, "not_found");
  await requireRole(source.notebook_id, "viewer");
  if (!source.storage_path) throw new ApiError(404, "file_not_found");
  const { data, error } = await db.storage.from("sources").createSignedUrl(source.storage_path, 300);
  if (error || !data?.signedUrl) throw new ApiError(404, "file_not_found");
  return NextResponse.redirect(data.signedUrl, 302);
});
