import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { requireRoleFor } from "@/lib/ownership";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { entityActionSchema } from "@/lib/research";

type Params = { params: Promise<{ entityId: string }> };

/**
 * Fiche d'une entité : alias, passages exacts qui la mentionnent (provenance), affirmations,
 * voisinage (relations + entités voisines, pour déplier le graphe à la demande) et historique des fusions.
 */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { entityId } = await params;
  await requireRoleFor("knowledge_entities", entityId, "viewer");
  const supabase = await createUserClient();
  const rel = "id, type, description, assertion, confidence, status, evidence_count, source_count, valid_from, valid_to";
  const [entity, aliases, mentions, outgoing, incoming, claims, merges] = await Promise.all([
    supabase.from("knowledge_entities").select("id, name, type, description, properties, confidence, mention_count, source_count, first_seen_at, last_seen_at, created_at").eq("id", entityId).single(),
    supabase.from("knowledge_entity_aliases").select("id, alias, origin").eq("entity_id", entityId).order("alias"),
    supabase.from("knowledge_mentions").select("id, source_id, surface_form, quote_text, char_start, char_end, page, created_at, source:sources(title, origin_url, created_at)").eq("entity_id", entityId).order("created_at").limit(60),
    supabase.from("knowledge_relations").select(`${rel}, other:knowledge_entities!target_entity_id(id, name, type, confidence, mention_count, source_count)`).eq("source_entity_id", entityId).neq("status", "rejected").limit(150),
    supabase.from("knowledge_relations").select(`${rel}, other:knowledge_entities!source_entity_id(id, name, type, confidence, mention_count, source_count)`).eq("target_entity_id", entityId).neq("status", "rejected").limit(150),
    supabase.from("knowledge_claims").select("id, attribute, attribute_label, value_text, value_type, context, observed_at, confidence, source_id, quote_text, char_start, char_end, page").eq("subject_entity_id", entityId).order("attribute").limit(100),
    supabase.from("knowledge_merges").select("id, action, snapshot, reason, created_at").or(`target_entity_id.eq.${entityId},other_entity_id.eq.${entityId}`).order("created_at", { ascending: false }).limit(20),
  ]);
  if (entity.error) throw entity.error;
  return NextResponse.json({
    entity: entity.data, aliases: aliases.data ?? [], mentions: mentions.data ?? [], claims: claims.data ?? [], history: merges.data ?? [],
    relations: [
      ...(outgoing.data ?? []).map((r) => ({ ...r, direction: "out" as const })),
      ...(incoming.data ?? []).map((r) => ({ ...r, direction: "in" as const })),
    ],
  });
});

/** Résolution d'identité manuelle : fusion contrôlée avec une autre entité, ou séparation d'un alias. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { entityId } = await params;
  const { notebookId } = await requireRoleFor("knowledge_entities", entityId, "editor");
  const body = await parseBody(req, entityActionSchema);
  const db = createServiceClient();
  if (body.action === "merge") {
    const target = await requireRoleFor("knowledge_entities", body.intoId, "editor");
    if (target.notebookId !== notebookId) throw new ApiError(422, "invalid_merge");
    const { data, error } = await db.rpc("merge_knowledge_entities", { p_from: entityId, p_into: body.intoId, p_user: user.id, p_reason: body.reason ?? null });
    if (error) { if (error.message.includes("invalid_merge")) throw new ApiError(422, "invalid_merge"); throw error; }
    log.info("knowledge.merge", { notebook_id: notebookId, from: entityId, into: body.intoId, user_id: user.id });
    return NextResponse.json({ entityId: data });
  }
  const { data, error } = await db.rpc("split_knowledge_alias", { p_entity: entityId, p_alias_id: body.aliasId, p_user: user.id });
  if (error) { if (error.message.includes("invalid_split")) throw new ApiError(422, "invalid_split"); throw error; }
  log.info("knowledge.split", { notebook_id: notebookId, entity: entityId, user_id: user.id });
  return NextResponse.json({ entityId: data });
});
