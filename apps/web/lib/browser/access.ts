import { createServiceClient } from "@/lib/supabase/server";
import { hasBrowserPlan } from "./access-plan";

/** Leanna Browser est réservé aux abonnements Pro : lit l'offre de l'espace personnel de l'utilisateur. */
export async function canUseBrowser(userId: string): Promise<boolean> {
  const { data } = await createServiceClient().from("workspaces").select("plan_id").eq("owner_id", userId).eq("kind", "personal").maybeSingle();
  return hasBrowserPlan(data?.plan_id as string | undefined);
}
