import { NextResponse, type NextRequest } from "next/server";
import { handle, requireRole, requireUser } from "@/lib/api";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { graphFilters } from "@/lib/research";

type Params = { params: Promise<{ id: string }> };

/**
 * Graphe borné (les N entités les plus connectées + relations entre elles, calculé en base)
 * et indicateurs du notebook : volumes RÉELS du graphe, état d'extraction, contradictions, recherches en cours.
 */
export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "viewer");
  const f = graphFilters(req.nextUrl.searchParams);
  const supabase = await createUserClient();
  const [graph, states, contradictions, sources, research] = await Promise.all([
    // fonction réservée au serveur : le rôle a été vérifié juste au-dessus
    createServiceClient().rpc("knowledge_graph", {
      p_notebook: id, p_limit: f.limit, p_types: f.types, p_source: f.source, p_from: f.from, p_to: f.to, p_min_confidence: f.minConfidence,
    }),
    supabase.from("knowledge_source_state").select("status, extracted_at").eq("notebook_id", id),
    supabase.from("knowledge_contradictions").select("status, kind").eq("notebook_id", id),
    supabase.from("sources").select("id", { count: "exact", head: true }).eq("notebook_id", id),
    supabase.from("research_runs").select("id", { count: "exact", head: true }).eq("notebook_id", id)
      .in("status", ["queued", "planning", "searching", "reading", "extracting", "cross_checking", "writing"]),
  ]);
  if (graph.error) throw graph.error;
  const st = states.data ?? [];
  const cs = contradictions.data ?? [];
  const lastSync = st.map((s) => s.extracted_at as string | null).filter(Boolean).sort().pop() ?? null;
  return NextResponse.json({
    ...(graph.data as object),
    stats: {
      sources: sources.count ?? 0,
      extraction: { ready: st.filter((s) => s.status === "ready").length, pending: st.filter((s) => s.status === "queued" || s.status === "processing").length, failed: st.filter((s) => s.status === "failed").length },
      lastSync,
      contradictions: {
        open: cs.filter((c) => c.status === "open").length, total: cs.length,
        direct: cs.filter((c) => c.kind === "direct").length, divergence: cs.filter((c) => c.kind === "divergence").length,
        obsolete: cs.filter((c) => c.kind === "obsolete" || c.status === "obsolete").length,
        resolved: cs.filter((c) => ["verified", "confirmed", "rejected", "resolved"].includes(c.status as string)).length,
      },
      activeResearch: research.count ?? 0,
    },
    filters: f,
  });
});
