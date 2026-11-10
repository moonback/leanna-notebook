import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { notebookCreateSchema } from "@/lib/validation";

/** Notebooks visibles par l'utilisateur (RLS : possédés, partagés, visités, mis en avant). */
export const GET = handle(async () => {
  await requireUser();
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("notebooks")
    .select("id, title, emoji, workspace_id, created_by, created_at, last_activity_at, sources(count)")
    .order("last_activity_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return NextResponse.json({ items: data });
});

/** Création dans le workspace personnel, avec plafond de notebooks du plan. */
export const POST = handle(async (req: NextRequest) => {
  const user = await requireUser();
  const { title } = await parseBody(req, notebookCreateSchema);
  const db = createServiceClient();
  const { data: ws, error } = await db
    .from("workspaces").select("id, plans(limits)").eq("owner_id", user.id).eq("kind", "personal").single();
  if (error || !ws) throw new ApiError(409, "no_workspace");
  const max = (ws.plans as unknown as { limits: { max_notebooks?: number } }).limits.max_notebooks;
  if (max !== undefined) {
    const { count } = await db.from("notebooks").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
    if ((count ?? 0) >= max) throw new ApiError(409, "max_notebooks", { limit: max });
  }
  const { data: nb, error: e2 } = await db
    .from("notebooks").insert({ workspace_id: ws.id, created_by: user.id, title }).select("id, title, created_at").single();
  if (e2) throw e2;
  log.info("notebook.created", { notebook_id: nb.id, user_id: user.id });
  return NextResponse.json({ notebook: nb }, { status: 201 });
});
