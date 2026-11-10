import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { notePatchSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

async function noteNotebook(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { data } = await createServiceClient().from("sources").select("notebook_id, workspace_id, kind").eq("id", id).single();
  if (!data || data.kind !== "note") throw new ApiError(404, "not_found");
  return data;
}

/** Contenu d'une note + ses citations (lecture sous RLS, lecteur et plus). */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  const { notebook_id } = await noteNotebook(id);
  const role = await requireRole(notebook_id, "viewer");
  const supabase = await createUserClient();
  const [{ data: note, error }, { data: citations }] = await Promise.all([
    supabase.from("sources").select("id, title, status, note_body, note_has_citations, updated_at").eq("id", id).single(),
    supabase.from("citations").select("marker, source_id, quote_text, char_start, char_end, verified").eq("note_id", id).order("marker"),
  ]);
  if (error) throw error;
  return NextResponse.json({
    note: { id: note.id, title: note.title, status: note.status, text: (note.note_body as { text?: string })?.text ?? "", locked: note.note_has_citations, updatedAt: note.updated_at },
    citations: citations ?? [], canEdit: role === "editor" || role === "owner",
  });
});

/**
 * Modification (éditeur). Une note issue du chat est verrouillée tant qu'elle porte des citations :
 * `unlock` les retire explicitement (sinon le texte modifié ne correspondrait plus aux extraits cités).
 * Toute modification du texte relance l'indexation (job ingest_source).
 */
export const PATCH = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const { notebook_id, workspace_id } = await noteNotebook(id);
  await requireRole(notebook_id, "editor");
  const body = await parseBody(req, notePatchSchema);
  const db = createServiceClient();
  const { data: current } = await db.from("sources").select("note_has_citations").eq("id", id).single();

  if (body.unlock) {
    await db.from("citations").delete().eq("note_id", id);
    await db.from("sources").update({ note_has_citations: false }).eq("id", id);
  } else if (current?.note_has_citations && body.text !== undefined) {
    throw new ApiError(409, "note_locked");
  }

  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.text !== undefined) { update.note_body = { text: body.text }; update.status = "pending"; }
  if (Object.keys(update).length) {
    const { error } = await db.from("sources").update(update).eq("id", id);
    if (error) throw error;
  }
  if (body.text !== undefined) {
    const { error } = await db.from("jobs").insert({ workspace_id, notebook_id, user_id: user.id, kind: "ingest_source", target_id: id });
    if (error) throw error;
  }
  return NextResponse.json({ ok: true, reindexing: body.text !== undefined });
});
