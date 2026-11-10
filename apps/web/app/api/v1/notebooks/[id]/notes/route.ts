import { NextResponse, type NextRequest } from "next/server";
import { handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";
import { noteCreateSchema } from "@/lib/validation";

/** Nouvelle note (D01) : une source `note`, indexée par le worker puis citable comme les autres. */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "editor");
  const { title, text } = await parseBody(req, noteCreateSchema);
  const { data, error } = await createServiceClient().rpc("add_source", {
    p_notebook: id, p_user: user.id, p_kind: "note", p_title: title, p_note_body: { text },
  });
  if (error) throw error;
  log.info("note.created", { notebook_id: id, source_id: data as string });
  return NextResponse.json({ note: { id: data, title, status: "pending" } }, { status: 201 });
});
