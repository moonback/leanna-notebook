import { NextResponse, type NextRequest } from "next/server";
import { handle, requireRole, requireUser } from "@/lib/api";
import { createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
const STATUSES = ["open", "verified", "confirmed", "rejected", "obsolete", "resolved"];
const KINDS = ["direct", "divergence", "contextual", "obsolete", "insufficient"];

/** Contradictions du notebook (filtrables, paginées) avec les deux affirmations. */
export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "viewer");
  const sp = req.nextUrl.searchParams;
  const page = Math.max(0, Number(sp.get("page")) || 0);
  const size = 30;
  const supabase = await createUserClient();
  let q = supabase.from("knowledge_contradictions")
    .select("id, attribute, category, kind, status, confidence, explanation, updated_at, subject:knowledge_entities(id, name, type), a:knowledge_claims!claim_a_id(value_text, source_id), b:knowledge_claims!claim_b_id(value_text, source_id)", { count: "exact" })
    .eq("notebook_id", id).order("status").order("confidence", { ascending: false }).range(page * size, page * size + size - 1);
  const status = sp.get("status"), kind = sp.get("kind");
  if (status && STATUSES.includes(status)) q = q.eq("status", status);
  if (kind && KINDS.includes(kind)) q = q.eq("kind", kind);
  const [{ data, count, error }, all] = await Promise.all([q, supabase.from("knowledge_contradictions").select("status, kind").eq("notebook_id", id)]);
  if (error) throw error;
  const rows = (all.data ?? []) as Array<{ status: string; kind: string }>;
  const n = (pred: (r: { status: string; kind: string }) => boolean) => rows.filter(pred).length;
  return NextResponse.json({
    contradictions: data ?? [], total: count ?? 0, page, pageSize: size,
    counts: {
      direct: n((r) => r.kind === "direct" && r.status === "open"),
      divergence: n((r) => (r.kind === "divergence" || r.kind === "contextual") && r.status === "open"),
      obsolete: n((r) => r.kind === "obsolete" || r.status === "obsolete"),
      insufficient: n((r) => r.kind === "insufficient" && r.status === "open"),
      toReview: n((r) => r.status === "open"),
      resolved: n((r) => ["verified", "confirmed", "rejected", "resolved"].includes(r.status)),
    },
  });
});
