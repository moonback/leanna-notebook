import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/research";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ sourceId: z.string().regex(UUID).optional() }).strict();

/** Réextraction du graphe pour toutes les sources prêtes, ou pour une seule. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "editor");
  const body = await parseBody(req, schema);   // corps JSON + contrôle d'origine (CSRF)
  const db = createServiceClient();
  const { data: nb } = await db.from("notebooks").select("workspace_id").eq("id", id).single();
  if (!nb) throw new ApiError(404, "not_found");
  let q = db.from("sources").select("id").eq("notebook_id", id).eq("status", "ready");
  if (body.sourceId) q = q.eq("id", body.sourceId);
  const { data: sources, error } = await q;
  if (error) throw error;
  const minute = new Date().toISOString().slice(0, 16);   // un double clic dans la même minute ne double pas les jobs
  for (const s of sources ?? []) {
    const { error: e } = await db.from("jobs").upsert({
      workspace_id: nb.workspace_id, notebook_id: id, user_id: user.id, kind: "knowledge_extract", target_id: s.id, priority: 150,
      idempotency_key: `knowledge_reindex:${s.id}:${minute}`,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (e) throw e;
    await db.from("knowledge_source_state").upsert({ source_id: s.id, notebook_id: id, status: "queued" }, { onConflict: "source_id" });
  }
  log.info("knowledge.reindex", { notebook_id: id, user_id: user.id, sources: sources?.length ?? 0 });
  return NextResponse.json({ queued: sources?.length ?? 0 }, { status: 202 });
});
