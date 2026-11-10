import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

/**
 * Fournisseur de facturation. Même contrat que l'intégration Stripe à venir
 * (Checkout → webhook → subscriptions → workspaces.plan_id), pour qu'aucun écran ne change au branchement.
 */
export interface BillingProvider {
  readonly mode: "simulated" | "stripe";
  /** Démarre un abonnement ; renvoie l'URL où envoyer l'utilisateur. */
  checkout(input: { workspaceId: string; planId: string; userId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Annule à la fin de la période (un clic, sans parcours dissuasif). */
  cancel(input: { workspaceId: string; userId: string }): Promise<void>;
}

export class BillingNotConfigured extends Error {}

/**
 * SIMULATION — aucun paiement, aucune donnée bancaire. Active immédiatement le plan choisi
 * et l'écrit comme le ferait le webhook Stripe. Les lignes portent un identifiant `sim_…`.
 */
class SimulatedBilling implements BillingProvider {
  readonly mode = "simulated" as const;

  async checkout({ workspaceId, planId, userId, returnUrl }: { workspaceId: string; planId: string; userId: string; returnUrl: string }) {
    const db = createServiceClient();
    const { data: plan } = await db.from("plans").select("id, price_cents").eq("id", planId).eq("is_public", true).single();
    if (!plan || plan.price_cents === 0) throw new Error("plan_invalid");
    const periodEnd = new Date();
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    const { error } = await db.from("subscriptions").upsert({
      workspace_id: workspaceId, plan_id: planId, status: "active", seats: 1,
      stripe_subscription_id: `sim_${crypto.randomUUID()}`, current_period_end: periodEnd.toISOString(), cancel_at_period_end: false,
    }, { onConflict: "workspace_id" });
    if (error) throw error;
    await db.from("workspaces").update({ plan_id: planId }).eq("id", workspaceId);
    await db.from("audit_log").insert({ workspace_id: workspaceId, actor_id: userId, action: "billing.subscribe", meta: { plan_id: planId, simulated: true } });
    log.info("billing.simulated_checkout", { workspace_id: workspaceId, plan_id: planId });
    return { url: `${returnUrl}?billing=success` };
  }

  async cancel({ workspaceId, userId }: { workspaceId: string; userId: string }) {
    const db = createServiceClient();
    const { data: sub } = await db.from("subscriptions").select("id").eq("workspace_id", workspaceId).single();
    if (!sub) throw new Error("no_subscription");
    // simulation : fin de période immédiate pour pouvoir tester le retour au plan gratuit
    await db.from("subscriptions").update({ status: "canceled", cancel_at_period_end: true, current_period_end: new Date().toISOString() }).eq("id", sub.id);
    await db.from("workspaces").update({ plan_id: "free" }).eq("id", workspaceId);
    await db.from("audit_log").insert({ workspace_id: workspaceId, actor_id: userId, action: "billing.cancel", meta: { simulated: true } });
    log.info("billing.simulated_cancel", { workspace_id: workspaceId });
  }
}

export function billing(): BillingProvider {
  const mode = process.env.BILLING_MODE ?? "simulated";
  if (mode === "simulated") return new SimulatedBilling();
  // Stripe : Checkout + Customer Portal + webhook signé et idempotent (stripe_events) — à brancher avec les clés de test.
  throw new BillingNotConfigured("BILLING_MODE=stripe n'est pas encore branché.");
}
