import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ scope: z.enum(["full", "chat_only"]) }).strict();

/** Liens actifs du notebook (propriétaire). Le jeton n'est jamais stocké : on ne peut que révoquer. */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "owner");
  const { data, error } = await createServiceClient().from("share_links").select("id, scope, created_at")
    .eq("notebook_id", id).is("revoked_at", null).neq("scope", "artifact").order("created_at", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ links: data });
});

/**
 * H02 / H03 : lien de partage. `full` = lecture des sources + chat ; `chat_only` = chat seul,
 * le serveur refuse toute lecture de source ou de passage (rôle « chat »). L'URL n'est affichée qu'une fois.
 */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "owner");
  const { scope } = await parseBody(req, schema);
  const token = randomBytes(24).toString("base64url"); // 192 bits : non devinable
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data, error } = await createServiceClient().from("share_links")
    .insert({ notebook_id: id, scope, token_hash: `\\x${hash}`, created_by: user.id }).select("id, scope, created_at").single();
  if (error) throw error;
  log.info("share_link.created", { notebook_id: id, scope }); // jamais le jeton
  const origin = process.env.APP_URL || req.nextUrl.origin;
  return NextResponse.json({ link: { ...data, url: `${origin}/s/${token}` } }, { status: 201 });
});
