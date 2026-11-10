import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const STATES = { flashcards: ["got_it", "missed"], quiz: ["correct", "wrong"] } as const;
const schema = z.object({
  items: z.array(z.object({
    key: z.string().regex(/^[cq]\d{1,3}$/),
    state: z.enum(["got_it", "missed", "correct", "wrong"]),
    answer: z.number().int().min(0).max(9).optional(),
  }).strict()).min(1).max(100),
}).strict();

/** Fiches ou quiz prêt, visible par l'utilisateur ; renvoie les clés valides du contenu. */
async function studyArtifact(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { data: a } = await createServiceClient().from("artifacts").select("notebook_id, type, status, content").eq("id", id).single();
  if (!a) throw new ApiError(404, "not_found");
  await requireRole(a.notebook_id, "viewer");
  if (a.status !== "ready" || !(a.type in STATES)) throw new ApiError(422, "not_studyable");
  const items = (a.type === "flashcards" ? a.content?.cards : a.content?.questions) as { key: string }[] | undefined;
  return { type: a.type as keyof typeof STATES, keys: new Set((items ?? []).map((i) => i.key)) };
}

/** Progression personnelle (F02/F03) : « je savais / à revoir », réponses du quiz. Upsert idempotent. */
export const PUT = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const { type, keys } = await studyArtifact(id);
  const { items } = await parseBody(req, schema);
  if (items.some((i) => !keys.has(i.key) || !(STATES[type] as readonly string[]).includes(i.state))) throw new ApiError(422, "invalid_items");
  const { error } = await createServiceClient().from("study_progress").upsert(items.map((i) => ({
    artifact_id: id, user_id: user.id, item_key: i.key, state: i.state, answer: i.answer ?? null, updated_at: new Date().toISOString(),
  })));
  if (error) throw error;
  return new NextResponse(null, { status: 204 });
});

/** Recommencer : efface la progression de l'utilisateur sur cet artefact. */
export const DELETE = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await studyArtifact(id);
  const { error } = await createServiceClient().from("study_progress").delete().eq("artifact_id", id).eq("user_id", user.id);
  if (error) throw error;
  return new NextResponse(null, { status: 204 });
});
