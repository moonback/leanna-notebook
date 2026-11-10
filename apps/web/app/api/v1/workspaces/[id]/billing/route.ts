import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireUser } from "@/lib/api";
import { billing, BillingNotConfigured } from "@/lib/billing";
import { createUserClient } from "@/lib/supabase/server";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), planId: z.string().min(1).max(40) }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
]);

/** Abonnement du workspace : réservé à owner/admin (rôle lu sous RLS). */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const supabase = await createUserClient();
  const { data: member } = await supabase.from("workspace_members").select("role").eq("workspace_id", id).eq("user_id", user.id).maybeSingle();
  if (!member) throw new ApiError(404, "not_found");
  if (member.role !== "owner" && member.role !== "admin") throw new ApiError(403, "forbidden");

  const body = await parseBody(req, bodySchema);
  let provider;
  try { provider = billing(); } catch (e) {
    if (e instanceof BillingNotConfigured) throw new ApiError(501, "billing_not_configured");
    throw e;
  }
  try {
    if (body.action === "checkout") {
      const { url } = await provider.checkout({ workspaceId: id, planId: body.planId, userId: user.id, returnUrl: `${req.nextUrl.origin}/` });
      return NextResponse.json({ url, mode: provider.mode });
    }
    await provider.cancel({ workspaceId: id, userId: user.id });
    return NextResponse.json({ ok: true, mode: provider.mode });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "plan_invalid") throw new ApiError(422, "plan_invalid");
    if (m === "no_subscription") throw new ApiError(409, "no_subscription");
    throw e;
  }
});
