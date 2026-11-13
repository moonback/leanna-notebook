import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/**
 * Mise à jour d'un dépôt GitHub (éditeur) : relance l'ingestion. Le worker compare d'abord le dernier commit
 * à celui déjà indexé et ne retélécharge l'archive que s'il a changé. 202 immédiat ; le client suit `status`.
 */
export const POST = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const db = createServiceClient();
  const { data: src } = await db.from("sources").select("id, kind, status, notebook_id, workspace_id").eq("id", id).single();
  if (!src) throw new ApiError(404, "not_found");
  await requireRole(src.notebook_id, "editor");
  if (src.kind !== "github") throw new ApiError(422, "not_syncable");

  // Un seul traitement à la fois par source : un double clic ne crée pas deux jobs.
  const { data: active } = await db.from("jobs").select("id").eq("target_id", id).eq("kind", "ingest_source")
    .in("status", ["queued", "running"]).limit(1);
  if (!active?.length) {
    const { error } = await db.from("jobs").insert({ workspace_id: src.workspace_id, notebook_id: src.notebook_id, user_id: user.id,
      kind: "ingest_source", target_id: id });
    if (error) throw error;
    // « pending » : retour visuel immédiat ; le worker repasse la source en ready (inchangée ou réindexée).
    if (src.status === "ready" || src.status === "failed") await db.from("sources").update({ status: "pending", error_code: null }).eq("id", id);
  }
  log.info("sources.sync_requested", { source_id: id, user_id: user.id, already_running: Boolean(active?.length) });
  return NextResponse.json({ source: { id, status: "pending" } }, { status: 202 });
});
