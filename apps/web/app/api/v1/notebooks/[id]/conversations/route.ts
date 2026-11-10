import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/** Conversations de l'utilisateur dans ce notebook (privées : RLS user_id). */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "chat");
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("conversations").select("id, title, created_at, updated_at")
    .eq("notebook_id", id).order("updated_at", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ conversations: data });
});

/** Nouvelle conversation (le MVP n'en affiche qu'une, mais le modèle en permet plusieurs). */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "chat");
  const { title } = await parseBody(req, z.object({ title: z.string().trim().max(200).optional() }).strict());
  const db = createServiceClient();
  const { data: nb } = await db.from("notebooks").select("workspace_id").eq("id", id).single();
  if (!nb) throw new ApiError(404, "not_found");
  const { data, error } = await db.from("conversations")
    .insert({ workspace_id: nb.workspace_id, notebook_id: id, user_id: user.id, title: title || null })
    .select("id, title, created_at").single();
  if (error) throw error;
  return NextResponse.json({ conversation: data }, { status: 201 });
});
