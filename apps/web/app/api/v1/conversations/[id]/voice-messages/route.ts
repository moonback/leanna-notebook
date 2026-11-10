import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  userText: z.string().trim().min(1).max(4000),
  assistantText: z.string().trim().min(1).max(12000),
  sourceIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();

/** Enregistre un tour vocal dans le même historique que le chat écrit. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");

  const db = createServiceClient();
  const { data: conversation } = await db.from("conversations")
    .select("id, notebook_id, workspace_id, user_id")
    .eq("id", id).single();
  if (!conversation || conversation.user_id !== user.id) throw new ApiError(404, "not_found");
  await requireRole(conversation.notebook_id, "viewer");

  const body = await parseBody(req, schema);
  const sourceIds = [...new Set(body.sourceIds)];
  if (sourceIds.length) {
    const [{ data: ready }, { data: deselected }] = await Promise.all([
      db.from("sources").select("id").eq("notebook_id", conversation.notebook_id).eq("status", "ready").in("id", sourceIds),
      db.from("source_deselections").select("source_id").eq("notebook_id", conversation.notebook_id).eq("user_id", user.id),
    ]);
    const off = new Set((deselected ?? []).map((row) => row.source_id));
    const allowed = new Set((ready ?? []).filter((row) => !off.has(row.id)).map((row) => row.id));
    if (sourceIds.some((sourceId) => !allowed.has(sourceId))) throw new ApiError(422, "invalid_sources");
  }

  const base = {
    workspace_id: conversation.workspace_id,
    notebook_id: conversation.notebook_id,
    conversation_id: conversation.id,
    user_id: user.id,
    source_ids: sourceIds,
  };
  const now = Date.now();
  const { data, error } = await db.from("chat_messages").insert([
    { ...base, role: "user", content: body.userText, status: "complete", created_at: new Date(now).toISOString() },
    { ...base, role: "assistant", content: body.assistantText, status: "complete", created_at: new Date(now + 1).toISOString() },
  ]).select("id, role, content, status, created_at");
  if (error) throw error;

  await db.from("notebooks").update({ last_activity_at: new Date().toISOString() }).eq("id", conversation.notebook_id);
  return NextResponse.json({ messages: data }, { status: 201 });
});
