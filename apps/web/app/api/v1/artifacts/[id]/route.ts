import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

async function artifactNotebook(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { data } = await createServiceClient().from("artifacts").select("notebook_id").eq("id", id).single();
  if (!data) throw new ApiError(404, "not_found");
  return data.notebook_id as string;
}

/** Contenu + citations ; marque l'artefact comme lu (fin du point « non lu »). */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(await artifactNotebook(id), "viewer");
  const supabase = await createUserClient();
  const [{ data: art, error }, { data: citations }, { data: progress }] = await Promise.all([
    supabase.from("artifacts").select("id, type, title, status, error_code, options, content, custom_prompt, created_at").eq("id", id).single(),
    supabase.from("citations").select("marker, source_id, quote_text, char_start, char_end, verified").eq("artifact_id", id).order("marker"),
    supabase.from("study_progress").select("item_key, state, answer").eq("artifact_id", id).eq("user_id", user.id),
  ]);
  if (error) throw error;
  if (art.status === "ready") await createServiceClient().from("artifact_reads").upsert({ artifact_id: id, user_id: user.id });
  return NextResponse.json({ artifact: art, citations: citations ?? [], progress: progress ?? [] });
});

/** Suppression (éditeur). */
export const DELETE = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(await artifactNotebook(id), "editor");
  const db = createServiceClient();
  const { data: imageVersions } = await db.from("artifact_image_versions").select("storage_path").eq("artifact_id", id);
  const { data: artifact } = await db.from("artifacts").select("storage_path,type").eq("id", id).single();
  const paths = [...new Set([artifact?.type === "image" ? artifact.storage_path : null, ...(imageVersions ?? []).map((v) => v.storage_path)].filter((p): p is string => Boolean(p)))];
  if (paths.length) {
    const { error: storageError } = await db.storage.from("artifacts").remove(paths);
    if (storageError) throw storageError;
  }
  const { error } = await db.from("artifacts").delete().eq("id", id);
  if (error) throw error;
  return new NextResponse(null, { status: 204 });
});
