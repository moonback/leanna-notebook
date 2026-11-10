import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/** H04 : crée un lien public révocable vers un artefact prêt, sans exposer ses sources. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");

  const db = createServiceClient();
  const { data: artifact } = await db.from("artifacts")
    .select("id, notebook_id, status")
    .eq("id", id)
    .single();
  if (!artifact || artifact.status !== "ready") throw new ApiError(404, "not_found");
  await requireRole(artifact.notebook_id, "editor");

  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data, error } = await db.from("share_links").insert({
    notebook_id: artifact.notebook_id,
    artifact_id: artifact.id,
    scope: "artifact",
    token_hash: `\\x${hash}`,
    created_by: user.id,
  }).select("id, created_at").single();
  if (error) throw error;

  const origin = process.env.APP_URL || req.nextUrl.origin;
  log.info("artifact.share_link.created", { artifact_id: id });
  return NextResponse.json({
    link: { id: data.id, url: `${origin}/a/${token}`, created_at: data.created_at },
  }, { status: 201 });
});
