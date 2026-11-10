import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/** En-tête du notebook, réglages du chat, résumé et questions suggérées (C03), rôle courant. */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  const role = await requireRole(id, "chat");
  const supabase = await createUserClient();
  const [{ data }, { count: pending }, { count: readySources }] = await Promise.all([
    supabase.from("notebooks").select("id, title, emoji, created_at, last_activity_at, chat_style, chat_custom_prompt, response_length, overview, suggested_questions").eq("id", id).single(),
    createServiceClient().from("jobs").select("id", { count: "exact", head: true }).eq("notebook_id", id).eq("kind", "notebook_overview").in("status", ["queued", "running"]),
    // un compte, pas une liste : le rôle « chat » sait si le chat est utilisable sans voir les sources
    createServiceClient().from("sources").select("id", { count: "exact", head: true }).eq("notebook_id", id).eq("status", "ready"),
  ]);
  return NextResponse.json({ notebook: data, role, overviewPending: Boolean(pending), readySources: readySources ?? 0 });
});

const patchSchema = z.object({
  title: z.string().trim().max(200, "200 caractères maximum."),
  emoji: z.string().trim().max(16).nullable(),
  chat_style: z.enum(["default", "learning_guide", "custom"]),
  chat_custom_prompt: z.string().trim().max(4000, "4 000 caractères maximum.").nullable(),
  response_length: z.enum(["short", "default", "long"]),
  allow_copies: z.boolean(),
}).partial().strict().refine((v) => Object.keys(v).length > 0, "Aucune modification.")
  .refine((v) => v.chat_style !== "custom" || Boolean(v.chat_custom_prompt), { message: "Décrivez le rôle ou le style souhaité.", path: ["chat_custom_prompt"] });

/** Renommer, emoji, réglages du chat (éditeur et plus). */
export const PATCH = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  const role = await requireRole(id, "editor");
  const body = await parseBody(req, patchSchema);
  if (body.allow_copies !== undefined && role !== "owner") throw new ApiError(403, "forbidden"); // réservé au propriétaire
  const { data, error } = await createServiceClient().from("notebooks").update(body).eq("id", id).select("id, title, emoji, chat_style, chat_custom_prompt, response_length, allow_copies").single();
  if (error) throw error;
  return NextResponse.json({ notebook: data });
});

/** Suppression définitive (propriétaire) : base en cascade + fichiers du notebook dans Storage. */
export const DELETE = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "owner");
  const db = createServiceClient();
  const { data: nb } = await db.from("notebooks").select("workspace_id").eq("id", id).single();
  if (!nb) throw new ApiError(404, "not_found");
  const { data: files } = await db.from("sources").select("storage_path").eq("notebook_id", id).not("storage_path", "is", null);
  const { error } = await db.from("notebooks").delete().eq("id", id);
  if (error) throw error;
  const paths = (files ?? []).map((f) => f.storage_path as string);
  if (paths.length) {
    const { error: se } = await db.storage.from("sources").remove(paths);
    if (se) log.error("storage.purge_failed", { notebook_id: id, count: paths.length }); // à reprendre par le job purge_storage
  }
  await db.from("audit_log").insert({ workspace_id: nb.workspace_id, actor_id: user.id, action: "notebook.delete", target_type: "notebook", target_id: id });
  log.info("notebook.deleted", { notebook_id: id, files: paths.length });
  return new NextResponse(null, { status: 204 });
});
