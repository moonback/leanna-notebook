import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/** Lecture audio privée : URL signée limitée à une heure, après vérification du rôle sur le notebook. */
export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const db = createServiceClient();
  const { data: artifact } = await db.from("artifacts").select("notebook_id, status, content").eq("id", id).single();
  if (!artifact) throw new ApiError(404, "not_found");
  await requireRole(artifact.notebook_id, "viewer");
  if (artifact.status !== "ready") throw new ApiError(409, "artifact_not_ready");
  const path = (artifact.content as { audio_path?: unknown } | null)?.audio_path;
  if (typeof path !== "string" || !/^audio-overviews\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}-[0-9a-f]{16}\.mp3$/i.test(path)) {
    throw new ApiError(404, "audio_not_found");
  }
  const download = req.nextUrl.searchParams.get("download") === "1";\n  const { data, error } = await db.storage.from("artifacts").createSignedUrl(path, 3600, download ? { download: "audio-overview.mp3" } : undefined);
  if (error || !data?.signedUrl) throw new ApiError(404, "audio_not_found");
  return NextResponse.redirect(data.signedUrl, 302);
});
