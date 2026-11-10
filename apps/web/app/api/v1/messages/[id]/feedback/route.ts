import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  value: z.union([z.literal(1), z.literal(-1), z.null()]),
  reason: z.string().trim().max(2000, "2 000 caractères maximum.").optional(),
}).strict();

/** Pouce haut / bas (C09) sur une réponse de SA conversation ; null retire l'avis. */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { value, reason } = await parseBody(req, schema);
  const db = createServiceClient();
  const { data: msg } = await db.from("chat_messages").select("user_id, notebook_id, role").eq("id", id).single();
  if (!msg || msg.user_id !== user.id || msg.role !== "assistant") throw new ApiError(404, "not_found");
  await requireRole(msg.notebook_id, "chat");
  const { error } = await db.from("chat_messages").update({ feedback: value, feedback_reason: value === -1 ? reason || null : null }).eq("id", id);
  if (error) throw error;
  log.info("chat.feedback", { message_id: id, value, with_reason: Boolean(reason) });
  return NextResponse.json({ feedback: value });
});
