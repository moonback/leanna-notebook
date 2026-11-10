import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireUser } from "@/lib/api";
import { createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/** Ouvre un notebook éditorial : le rôle viewer est accordé par une visite liée au flag is_featured. */
export const POST = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { data, error } = await (await createUserClient()).rpc("accept_featured_notebook", { p_notebook: id });
  if (error) {
    if (error.message.includes("featured_not_found")) throw new ApiError(404, "not_found");
    throw error;
  }
  return NextResponse.json({ notebookId: data });
});
