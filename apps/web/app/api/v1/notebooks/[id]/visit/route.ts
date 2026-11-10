import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ hidden: z.literal(true) }).strict();

/** Retire de l'accueil un notebook ouvert via un lien de partage, sans révoquer le lien. */
export const PATCH = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  await requireRole(id, "chat");
  await parseBody(req, schema);

  const { data, error } = await createServiceClient()
    .from("notebook_visits")
    .update({ hidden: true })
    .eq("notebook_id", id)
    .eq("user_id", user.id)
    .select("notebook_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "not_found");
  return new NextResponse(null, { status: 204 });
});
