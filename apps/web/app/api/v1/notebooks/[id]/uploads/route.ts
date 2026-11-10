import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadRequestSchema, uploadTypeOf, UPLOAD_TYPES } from "@/lib/validation";

/**
 * URL d'upload signée (navigateur → Storage directement, sans passer par le serveur web).
 * Le chemin est imposé par le serveur : {workspace}/{notebook}/{uuid}/original.{ext}.
 */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "editor");
  const { filename, size } = await parseBody(req, uploadRequestSchema);
  const ext = uploadTypeOf(filename);
  if (!ext) throw new ApiError(415, "unsupported_type", { accepted: Object.keys(UPLOAD_TYPES) });

  const db = createServiceClient();
  const { data: nb } = await db.from("notebooks").select("workspace_id").eq("id", id).single();
  if (!nb) throw new ApiError(404, "not_found");
  const storagePath = `${nb.workspace_id}/${id}/${crypto.randomUUID()}/original.${ext}`;
  const { data, error } = await db.storage.from("sources").createSignedUploadUrl(storagePath);
  if (error) throw error;
  return NextResponse.json({ uploadUrl: data.signedUrl, token: data.token, storagePath, contentType: UPLOAD_TYPES[ext][0], size }, { status: 201 });
});
