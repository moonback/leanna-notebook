import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { embedQuery } from "@/lib/ai/openrouter";
import { createServiceClient } from "@/lib/supabase/server";
import { githubFilePath, passageTitle, SOURCE_FILES_SELECT } from "@/lib/github-source";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ query: z.string().trim().min(2).max(2000) }).strict();

/** Recherche RAG isolée au notebook et au rôle de l'utilisateur ; seuls des extraits utiles sont renvoyés. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "viewer");
  const { query } = await parseBody(req, schema);
  const db = createServiceClient();
  const [{ data: ready }, { data: deselected }, { data: notebook }] = await Promise.all([
    db.from("sources").select(`id,title,fts_config,${SOURCE_FILES_SELECT}`).eq("notebook_id", id).eq("status", "ready"),
    db.from("source_deselections").select("source_id").eq("notebook_id", id).eq("user_id", user.id),
    db.from("notebooks").select("workspace_id").eq("id", id).single()
  ]);
  if (!notebook) throw new ApiError(404, "not_found");
  const off = new Set((deselected ?? []).map((x) => x.source_id));
  const selected = (ready ?? []).filter((s) => !off.has(s.id));
  if (!selected.length) throw new ApiError(422, "no_sources");

  const { data: usageId, error: usageError } = await db.rpc("reserve_usage", {
    p_ws: notebook.workspace_id, p_user: user.id, p_feature: "chat"
  });
  if (usageError) throw usageError;

  try {
    let vector: number[] | null = null;
    try { vector = (await embedQuery(query))?.vector ?? null; } catch { /* le plein texte reste disponible */ }
    const counts = new Map<string, number>();
    for (const source of selected) counts.set(source.fts_config, (counts.get(source.fts_config) ?? 0) + 1);
    const fts = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "simple";
    const { data: hits, error } = await db.rpc("match_chunks", {
      p_notebook: id,
      p_embedding: vector ? `[${vector.join(",")}]` : null,
      p_query: query,
      p_fts_config: fts,
      p_source_ids: selected.map((s) => s.id),
      p_k: 8
    });
    if (error) throw error;
    const byId = new Map(selected.map((s) => [s.id, s]));
    await db.rpc("settle_usage", { p_id: usageId, p_status: "committed" });
    return NextResponse.json({
      passages: (hits ?? []).map((h: { source_id: string; content: string; page_start: number | null; time_start_ms: number | null; char_start: number; char_end: number }, i: number) => ({
        number: i + 1,
        sourceId: h.source_id,
        title: passageTitle(byId.get(h.source_id), h.page_start),
        excerpt: h.content,
        page: githubFilePath(byId.get(h.source_id), h.page_start) ? null : h.page_start,
        timeStartMs: h.time_start_ms,
        charStart: h.char_start,
        charEnd: h.char_end
      }))
    });
  } catch (error) {
    await db.rpc("settle_usage", { p_id: usageId, p_status: "refunded" });
    throw error;
  }
});
