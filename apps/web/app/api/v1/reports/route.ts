import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

const DAILY_LIMIT = 20; // anti-abus : un formulaire public ne doit pas remplir la file de modération

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("feedback"), category: z.enum(["bug", "idea", "other"]), body: z.string().trim().min(5, "Décrivez en quelques mots.").max(5000, "5 000 caractères maximum."), notebookId: z.string().uuid().optional() }).strict(),
  z.object({ kind: z.literal("abuse"), category: z.enum(["spam", "illegal", "harassment", "copyright", "other"]), body: z.string().trim().max(5000, "5 000 caractères maximum.").default(""), notebookId: z.string().uuid() }).strict(),
]);

/** J04 : avis sur le produit ou signalement d'un notebook, stocké pour modération (statut « open »). */
export const POST = handle(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  if (body.notebookId) await requireRole(body.notebookId, "chat"); // on ne signale que ce qu'on peut voir
  const db = createServiceClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) throw new ApiError(429, "too_many_reports");
  const { error } = await db.from("reports").insert({ reporter_id: user.id, kind: body.kind, category: body.category, body: body.body || null, notebook_id: body.notebookId ?? null });
  if (error) throw error;
  log.info("report.created", { kind: body.kind, category: body.category, notebook_id: body.notebookId ?? null });
  return NextResponse.json({ ok: true }, { status: 201 });
});
