import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Enregistrer une réponse du chat en note (D02) : la note reprend le texte et ses citations,
 * devient une source (D03) et reste verrouillée tant que les citations y sont attachées.
 */
export const POST = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const db = createServiceClient();
  const { data: msg } = await db.from("chat_messages").select("id, user_id, notebook_id, workspace_id, role, content, status").eq("id", id).single();
  // le message doit appartenir à l'utilisateur (historique privé)
  if (!msg || msg.user_id !== user.id) throw new ApiError(404, "not_found");
  await requireRole(msg.notebook_id, "editor");
  if (msg.role !== "assistant" || msg.status !== "complete" || !msg.content.trim()) throw new ApiError(422, "not_saveable");

  const firstLine = msg.content.replace(/\s*\[\d+\]/g, "").trim().split(/\n|(?<=[.!?])\s/)[0];
  const title = (firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine) || "Note";
  const { data: noteId, error } = await db.rpc("add_source", {
    p_notebook: msg.notebook_id, p_user: user.id, p_kind: "note", p_title: title, p_note_body: { text: msg.content },
    p_idempotency_key: `save-note:${user.id}:${msg.id}`, // un double clic ne crée pas deux notes
  });
  if (error) {
    if (String(error.message).includes("duplicate key")) throw new ApiError(409, "already_saved");
    throw error;
  }

  const { data: cites } = await db.from("citations").select("marker, chunk_id, source_id, quote_text, char_start, char_end, verified").eq("message_id", msg.id);
  if (cites?.length) {
    const { error: ce } = await db.from("citations").insert(cites.map((c) => ({ ...c, workspace_id: msg.workspace_id, notebook_id: msg.notebook_id, note_id: noteId })));
    if (ce) throw ce;
    await db.from("sources").update({ note_has_citations: true }).eq("id", noteId as string);
  }
  log.info("note.saved_from_chat", { notebook_id: msg.notebook_id, message_id: msg.id, citations: cites?.length ?? 0 });
  return NextResponse.json({ note: { id: noteId, title, citations: cites?.length ?? 0 } }, { status: 201 });
});
