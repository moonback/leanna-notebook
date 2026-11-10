import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
type CopyResult = { notebook_id: string; files: { bucket: string; from: string; to: string }[] };

/**
 * Copie d'un notebook dans l'espace personnel de l'appelant (H05).
 * Autorisée au propriétaire, ou à tout lecteur (rôle « viewer » et plus, jamais « chat ») si le propriétaire
 * a activé « autoriser les copies ». Reprend sources prêtes, passages, guides et artefacts prêts ; pas les
 * conversations, notes ni partages. Les fichiers sont dupliqués dans Storage ; en cas d'échec, la copie est annulée.
 */
export const POST = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const role = await requireRole(id, "viewer");
  const db = createServiceClient();

  const { data: src } = await db.from("notebooks").select("title, allow_copies").eq("id", id).single();
  if (!src) throw new ApiError(404, "not_found");
  if (role !== "owner" && !src.allow_copies) throw new ApiError(403, "copies_disabled");

  const { data: ws } = await db.from("workspaces").select("id, plans(limits)").eq("owner_id", user.id).eq("kind", "personal").single();
  if (!ws) throw new ApiError(409, "no_workspace");
  const max = (ws.plans as unknown as { limits: { max_notebooks?: number } }).limits.max_notebooks;
  if (max !== undefined) {
    const { count } = await db.from("notebooks").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
    if ((count ?? 0) >= max) throw new ApiError(409, "max_notebooks", { limit: max });
  }

  const title = `Copie de ${src.title || "Notebook sans titre"}`.slice(0, 200);
  const { data, error } = await db.rpc("copy_notebook", { p_src: id, p_user: user.id, p_ws: ws.id, p_title: title });
  if (error) throw error;
  const result = data as CopyResult;

  try {
    for (const f of result.files) {
      const { error: ce } = await db.storage.from(f.bucket).copy(f.from, f.to);
      if (ce) throw ce;
    }
  } catch (e) {
    // Annulation : supprimer le notebook copié (cascade) et les fichiers déjà dupliqués.
    await db.from("notebooks").delete().eq("id", result.notebook_id);
    const byBucket = new Map<string, string[]>();
    for (const f of result.files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.to]);
    for (const [bucket, paths] of byBucket) await db.storage.from(bucket).remove(paths);
    log.error("notebook.copy_failed", { notebook_id: id, error: e instanceof Error ? e.message : String(e) });
    throw new ApiError(500, "copy_failed");
  }

  await db.from("audit_log").insert({ workspace_id: ws.id, actor_id: user.id, action: "notebook.copy", target_type: "notebook", target_id: result.notebook_id, meta: { source_notebook_id: id } });
  log.info("notebook.copied", { source: id, notebook_id: result.notebook_id, files: result.files.length });
  return NextResponse.json({ notebook: { id: result.notebook_id, title } }, { status: 201 });
});
