import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

async function sourceNotebook(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { data } = await createServiceClient().from("sources").select("notebook_id, workspace_id, storage_path").eq("id", id).single();
  if (!data) throw new ApiError(404, "not_found");
  return data;
}

/** Visionneuse (S10) : texte extrait normalisé, base des offsets de citation. Lecteur et plus (pas le rôle chat). */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  const { notebook_id } = await sourceNotebook(id);
  await requireRole(notebook_id, "viewer");
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("sources")
    .select("id, kind, title, status, error_code, origin_url, word_count, page_count, extracted_text, guide, created_at").eq("id", id).single();
  if (error) throw error;
  const audioSegments = data.kind === "audio"
    ? await supabase.from("chunks")
        .select("ordinal, content, time_start_ms, time_end_ms")
        .eq("source_id", id)
        .not("time_start_ms", "is", null)
        .order("ordinal")
    : null;
  if (audioSegments?.error) throw audioSegments.error;
  return NextResponse.json({ source: data, audioSegments: audioSegments?.data ?? [] });
});

const renameSchema = z.object({ title: z.string().trim().min(1, "Titre requis.").max(300, "300 caractères maximum.") }).strict();

/** Renommer une source (éditeur). */
export const PATCH = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  const { notebook_id } = await sourceNotebook(id);
  await requireRole(notebook_id, "editor");
  const { title } = await parseBody(req, renameSchema);
  const { data, error } = await createServiceClient().from("sources").update({ title }).eq("id", id).select("id, title").single();
  if (error) throw error;
  return NextResponse.json({ source: data });
});

/** Suppression d'une source (éditeur) : chunks en cascade, fichier retiré de Storage. Les artefacts existants restent. */
export const DELETE = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  const { notebook_id, workspace_id, storage_path } = await sourceNotebook(id);
  await requireRole(notebook_id, "editor");
  const db = createServiceClient();
  const { error } = await db.from("sources").delete().eq("id", id);
  if (error) throw error;
  if (storage_path) await db.storage.from("sources").remove([storage_path]);
  // Le résumé du notebook ne doit plus citer la source supprimée : recalcul différé (même règle que le worker).
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_CHAT_MODEL) {
    const runAfter = new Date(Date.now() + 20_000).toISOString();
    const { data: q } = await db.from("jobs").select("id").eq("notebook_id", notebook_id).eq("kind", "notebook_overview").eq("status", "queued").limit(1);
    if (q?.length) await db.from("jobs").update({ run_after: runAfter }).eq("id", q[0].id);
    else await db.from("jobs").insert({ workspace_id, notebook_id, kind: "notebook_overview", target_id: notebook_id, priority: 150, run_after: runAfter });
  }
  return new NextResponse(null, { status: 204 });
});
