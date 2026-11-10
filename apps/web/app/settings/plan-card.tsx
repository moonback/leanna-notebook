"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Plan = { id: string; name: string; price_cents: number; currency: string; billing_interval: string };
const price = (p: Plan) => p.price_cents === 0 ? "Gratuit" : `${new Intl.NumberFormat("fr-FR", { style: "currency", currency: p.currency }).format(p.price_cents / 100)} / mois`;

/** Choix d'offre. La facturation est SIMULÉE tant que Stripe n'est pas branché (aucun paiement). */
export function PlanCard({ workspaceId, current, plans }: { workspaceId: string; current: string; plans: Plan[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function act(body: object, key: string, ok: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/billing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast({ title: ok, tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Action impossible", description: "Réessayez dans un instant.", tone: "error" });
    } finally { setBusy(null); }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-text-muted">Mode démonstration : changer d’offre ne déclenche aucun paiement.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => {
          const active = p.id === current;
          return (
            <li key={p.id} className={cn("grid gap-3 rounded-lg border p-4", active && "border-accent bg-accent-soft/40")}>
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-text-muted">{price(p)}</p>
              </div>
              {active ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-on-accent-soft"><Check className="size-4" aria-hidden /> Offre actuelle</p>
              ) : p.price_cents > 0 ? (
                <Button size="sm" loading={busy === p.id} onClick={() => act({ action: "checkout", planId: p.id }, p.id, `Offre ${p.name} activée`)}>Passer à {p.name}</Button>
              ) : (
                <Button size="sm" variant="secondary" loading={busy === "cancel"} onClick={() => act({ action: "cancel" }, "cancel", "Retour à l’offre gratuite")}>Revenir à l’offre gratuite</Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
