import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { requireRoleFor } from "@/lib/ownership";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { contradictionReviewSchema } from "@/lib/research";

type Params = { params: Promise<{ contradictionId: string }> };
const claim = "id, attribute_label, value_text, value_type, value_norm, context, observed_at, confidence, quote_text, char_start, char_end, page, source_id, source:sources(title, origin_url, created_at)";

/** Fiche détaillée : affirmations opposées avec passages exacts, sources ajoutées, historique des décisions. */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { contradictionId } = await params;
  await requireRoleFor("knowledge_contradictions", contradictionId, "viewer");
  const supabase = await createUserClient();
  const { data: c, error } = await supabase.from("knowledge_contradictions")
    .select(`id, attribute, category, kind, status, confidence, explanation, detector, resolution_note, created_at, updated_at, subject:knowledge_entities(id, name, type), a:knowledge_claims!claim_a_id(${claim}), b:knowledge_claims!claim_b_id(${claim})`)
    .eq("id", contradictionId).single();
  if (error) throw error;
  const [evidence, reviews] = await Promise.all([
    supabase.from("contradiction_evidence").select("id, source_id, note, created_at, source:sources(title)").eq("contradiction_id", contradictionId).order("created_at"),
    supabase.from("contradiction_reviews").select("id, action, previous_status, new_status, note, created_at, user_id").eq("contradiction_id", contradictionId).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ contradiction: c, evidence: evidence.data ?? [], reviews: reviews.data ?? [] });
});

/** Décision humaine (vérifiée, confirmée, rejetée, obsolète, résolue, note, source ajoutée) — jamais de suppression. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { contradictionId } = await params;
  const { notebookId } = await requireRoleFor("knowledge_contradictions", contradictionId, "editor");
  const body = await parseBody(req, contradictionReviewSchema);
  const { data, error } = await createServiceClient().rpc("review_contradiction", {
    p_id: contradictionId, p_user: user.id, p_action: body.action, p_note: body.note ?? null, p_source: body.sourceId ?? null,
  });
  if (error) {
    if (error.message.includes("invalid_source")) throw new ApiError(422, "invalid_source");
    throw error;
  }
  log.info("knowledge.contradiction_review", { notebook_id: notebookId, contradiction_id: contradictionId, action: body.action, user_id: user.id });
  return NextResponse.json({ status: data });
});
