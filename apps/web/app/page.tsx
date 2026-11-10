import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { Dashboard, type NotebookRow } from "./dashboard";

/** S03 — Tableau de bord : notebooks visibles (RLS), triés par activité. */
export default async function HomePage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const supabase = await createUserClient();
  const [{ data: notebooks, error }, { data: profile }, { data: workspaces }] = await Promise.all([
    supabase.from("notebooks").select("id, title, emoji, workspace_id, created_by, created_at, last_activity_at, sources(count)")
      .order("last_activity_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("dashboard_view, display_name").eq("id", user.id).single(),
    supabase.from("workspaces").select("id").eq("owner_id", user.id),
  ]);
  const mine = new Set((workspaces ?? []).map((w) => w.id));
  const rows: NotebookRow[] = (notebooks ?? []).map((n) => ({
    id: n.id, title: n.title, emoji: n.emoji, createdAt: n.created_at, lastActivityAt: n.last_activity_at,
    sourceCount: (n.sources as unknown as { count: number }[])[0]?.count ?? 0,
    owned: mine.has(n.workspace_id),
  }));

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <Dashboard initial={rows} loadError={Boolean(error)} initialView={(profile?.dashboard_view as "grid" | "list") ?? "list"} name={profile?.display_name ?? null} />
    </div>
  );
}
