import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { handle, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

function urlFor(req: NextRequest, slug: string) {
  return `${process.env.APP_URL || req.nextUrl.origin}/p/${slug}`;
}

/** État de publication (propriétaire). */
export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "owner");
  const { data, error } = await createServiceClient().from("notebooks").select("public_slug").eq("id", id).single();
  if (error) throw error;
  return NextResponse.json({ public: !!data.public_slug, url: data.public_slug ? urlFor(req, data.public_slug) : null });
});

/** Publie le notebook (idempotent : conserve le slug existant). */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "owner");
  const db = createServiceClient();
  const { data: cur, error: e1 } = await db.from("notebooks").select("public_slug").eq("id", id).single();
  if (e1) throw e1;
  let slug = cur.public_slug as string | null;
  if (!slug) {
    slug = randomBytes(18).toString("base64url"); // 144 bits : non devinable
    const { error } = await db.from("notebooks").update({ public_slug: slug, published_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    log.info("notebook.published", { notebook_id: id });
  }
  return NextResponse.json({ public: true, url: urlFor(req, slug) });
});

/** Dépublie : l'URL cesse de fonctionner immédiatement. */
export const DELETE = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "owner");
  const { error } = await createServiceClient().from("notebooks").update({ public_slug: null, published_at: null }).eq("id", id);
  if (error) throw error;
  log.info("notebook.unpublished", { notebook_id: id });
  return NextResponse.json({ public: false, url: null });
});
