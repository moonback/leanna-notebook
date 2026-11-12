import { NextResponse, type NextRequest } from "next/server";
import { handle, parseBody, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { requireRoleFor } from "@/lib/ownership";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { relationUpdateSchema } from "@/lib/research";

type Params = { params: Promise<{ relationId: string }> };

/**
 * « Pourquoi ces deux entités sont-elles liées ? » : documents, passages exacts, pages, dates, confiance,
 * preuves qui confirment ou contredisent, autres relations entre la même paire, contradictions liées.
 */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { relationId } = await params;
  await requireRoleFor("knowledge_relations", relationId, "viewer");
  const supabase = await createUserClient();
  const { data: relation, error } = await supabase.from("knowledge_relations")
    .select("id, type, description, assertion, confidence, status, valid_from, valid_to, evidence_count, source_count, created_at, updated_at, source:knowledge_entities!source_entity_id(id, name, type), target:knowledge_entities!target_entity_id(id, name, type)")
    .eq("id", relationId).single();
  if (error) throw error;
  const ends = [(relation.source as unknown as { id: string }).id, (relation.target as unknown as { id: string }).id];
  const [evidence, parallel, contradictions] = await Promise.all([
    supabase.from("knowledge_evidence").select("id, source_id, chunk_id, quote_text, char_start, char_end, page, stance, created_at, source:sources(title, origin_url, created_at)").eq("relation_id", relationId).order("created_at").limit(100),
    supabase.from("knowledge_relations").select("id, type, assertion, confidence, status, evidence_count").neq("id", relationId)
      .or(`and(source_entity_id.eq.${ends[0]},target_entity_id.eq.${ends[1]}),and(source_entity_id.eq.${ends[1]},target_entity_id.eq.${ends[0]})`).limit(20),
    supabase.from("knowledge_contradictions").select("id, attribute, kind, status, explanation").in("subject_entity_id", ends).limit(10),
  ]);
  return NextResponse.json({ relation, evidence: evidence.data ?? [], parallel: parallel.data ?? [], contradictions: contradictions.data ?? [] });
});

/** Validation humaine d'une relation (confirmée / rejetée / à revoir). */
export const PATCH = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { relationId } = await params;
  const { notebookId } = await requireRoleFor("knowledge_relations", relationId, "editor");
  const body = await parseBody(req, relationUpdateSchema);
  const { error } = await createServiceClient().from("knowledge_relations").update({ status: body.status }).eq("id", relationId);
  if (error) throw error;
  log.info("knowledge.relation_review", { notebook_id: notebookId, relation_id: relationId, status: body.status, user_id: user.id });
  return NextResponse.json({ status: body.status });
});
