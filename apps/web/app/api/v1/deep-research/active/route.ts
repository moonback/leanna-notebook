import { NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { createUserClient } from "@/lib/supabase/server";
import { ACTIVE_STATUSES, researchProgress } from "@/lib/research";

export const dynamic = "force-dynamic";

/**
 * Recherches approfondies de l'utilisateur à suivre, tous notebooks confondus (lecture sous RLS) :
 * en cours, en pause, ou terminées / échouées depuis moins de 10 minutes (pour signaler la fin).
 */
export const GET = handle(async () => {
  const user = await requireUser();
  const supabase = await createUserClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data, error } = await supabase.from("research_runs")
    .select("id, notebook_id, question, status, stage, next_step, budget, spent, artifact_id, started_at, finished_at, created_at, notebook:notebooks(title, emoji)")
    .eq("created_by", user.id)
    .or(`status.in.(${[...ACTIVE_STATUSES, "paused"].join(",")}),finished_at.gte.${since}`)
    .order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  return NextResponse.json({
    runs: (data ?? []).map(({ budget, spent, next_step, notebook, ...r }) => ({
      ...r, progress: researchProgress({ status: r.status, next_step, budget, spent }),
      notebookTitle: (notebook as unknown as { title: string | null } | null)?.title || "Notebook sans titre",
    })),
  }, { headers: { "cache-control": "no-store" } });
});
