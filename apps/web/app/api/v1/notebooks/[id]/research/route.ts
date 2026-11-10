import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ query: z.string().trim().min(3).max(300), mode: z.literal("fast").default("fast"), scope: z.literal("web").default("web") }).strict();

/** Lance B17 ; le worker réalise la recherche et publie jusqu'à cinq résultats. */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "editor");
  if (!process.env.TAVILY_API_KEY) throw new ApiError(503, "research_not_configured");
  const body = await parseBody(req, schema);
  const idem = req.headers.get("idempotency-key");
  const { data, error } = await createServiceClient().rpc("create_research_job", {
    p_notebook: id, p_user: user.id, p_query: body.query, p_mode: body.mode,
    p_idempotency_key: idem ? `${user.id}:${id}:research:${idem}` : null,
  });
  if (error) throw error;
  log.info("research.requested", { notebook_id: id, job_id: data as string, user_id: user.id });
  return NextResponse.json({ jobId: data, status: "queued" }, { status: 202 });
});
