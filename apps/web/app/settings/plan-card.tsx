"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleCheck, CreditCard, Infinity as InfinityIcon, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type PlanLimits = {
  monthly_credits?: number;
  daily?: Record<string, number>;
  max_notebooks?: number;
  max_sources_per_notebook?: number;
  max_members_per_notebook?: number;
};
type Plan = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  billing_interval: string;
  limits?: unknown;
};

function formatPrice(plan: Plan) {
  if (plan.price_cents === 0) return { amount: "Gratuit", period: "sans abonnement" };
  const amount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: plan.currency,
    maximumFractionDigits: 2,
  }).format(plan.price_cents / 100);
  const interval = plan.billing_interval === "year" || plan.billing_interval === "yearly" || plan.billing_interval === "annual"
    ? " / an"
    : plan.billing_interval === "week" ? " / semaine" : " / mois";
  return { amount, period: interval };
}

function limitRows(limits?: PlanLimits | null) {
  if (!limits) return [];
  const rows: { label: string; value: string }[] = [];
  if (limits.monthly_credits != null) rows.push({ label: "Crédits mensuels", value: limits.monthly_credits.toLocaleString("fr-FR") });
  if (limits.max_notebooks != null) rows.push({ label: "Notebooks", value: String(limits.max_notebooks) });
  if (limits.max_sources_per_notebook != null) rows.push({ label: "Sources / notebook", value: String(limits.max_sources_per_notebook) });
  if (limits.max_members_per_notebook != null) rows.push({ label: "Membres / notebook", value: String(limits.max_members_per_notebook) });
  return rows;
}

/** Présentation des offres. La facturation reste en démonstration tant que le paiement réel n'est pas intégré. */
export function PlanCard({ workspaceId, current, plans }: { workspaceId: string; current: string; plans: Plan[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function act(body: object, key: string, ok: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/billing`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Action impossible");
      }
      toast({ title: ok, tone: "success" });
      router.refresh();
    } catch (error) {
      toast({
        title: "Action impossible",
        description: error instanceof Error && error.message !== "Action impossible" ? error.message : "Réessayez dans un instant.",
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  const activePlan = plans.find((plan) => plan.id === current);
  const sortedPlans = [...plans].sort((a, b) => a.price_cents - b.price_cents);
  const activeLimits = limitRows(activePlan?.limits as PlanLimits | null | undefined);

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/70 via-surface-raised to-surface-raised p-5 sm:p-6">
        <div aria-hidden className="absolute -right-10 -top-12 size-44 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-on-accent shadow-sm"><CreditCard size={20} /></span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Votre abonnement</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">{activePlan?.name ?? "Offre indisponible"}</h3>
              <p className="mt-1 text-sm text-text-muted">{activePlan ? "Cette offre est actuellement associée à votre espace personnel." : "Nous n’avons pas pu identifier votre offre actuelle."}</p>
            </div>
          </div>
          <Badge tone="success"><span className="inline-flex items-center gap-1"><CircleCheck size={12} /> Offre active</span></Badge>
        </div>
        {activePlan && (
          <div className="relative mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-accent/15 pt-4">
            <div>
              <p className="text-xs text-text-subtle">Tarif affiché</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">{formatPrice(activePlan).amount}<span className="ml-1 text-sm font-normal text-text-muted">{formatPrice(activePlan).period}</span></p>
            </div>
            {activeLimits.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeLimits.slice(0, 2).map((item) => (
                  <span key={item.label} className="rounded-lg border border-border/70 bg-surface-raised/80 px-3 py-2 text-xs text-text-muted">
                    <strong className="mr-1 text-text">{item.value}</strong>{item.label.toLowerCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold">Comparer les offres</h3>
          <p className="mt-1 text-sm text-text-muted">Choisissez le niveau de ressources adapté à votre utilisation.</p>
        </div>
        <p className="text-xs text-text-subtle">{plans.length} offre{plans.length > 1 ? "s" : ""} disponible{plans.length > 1 ? "s" : ""}</p>
      </div>

      <ul className="grid items-stretch gap-3 xl:grid-cols-2">
        {sortedPlans.map((plan) => {
          const active = plan.id === current;
          const price = formatPrice(plan);
          const limits = limitRows(plan.limits as PlanLimits | null | undefined);
          const isBusy = busy === plan.id || busy === "cancel";
          return (
            <li key={plan.id} className={cn(
              "relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface-raised transition-shadow hover:shadow-sm",
              active ? "border-accent ring-1 ring-accent/20" : "border-border",
            )}>
              <div className={cn("flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-5", active ? "border-accent/20 bg-accent-soft/35" : "border-border bg-surface/50")}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", active ? "bg-accent text-on-accent" : "bg-surface-sunken text-text-muted")}>
                    {plan.price_cents > 0 ? <Zap size={17} /> : <Sparkles size={17} />}
                  </span>
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold">{plan.name}</h4>
                    <p className="text-xs text-text-subtle">{plan.price_cents === 0 ? "Pour commencer" : "Pour aller plus loin"}</p>
                  </div>
                </div>
                {active && <Badge tone="success">Votre offre</Badge>}
              </div>
              <div className="flex flex-1 flex-col p-4 sm:p-5">
                <div className="mb-4">
                  <p className="text-2xl font-semibold tabular-nums">{price.amount}<span className="ml-1 text-sm font-normal text-text-muted">{price.period}</span></p>
                </div>
                <div className="grid gap-2 border-t border-border py-4">
                  {limits.length > 0 ? limits.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-text-muted">{item.label}</span>
                      <span className="font-medium tabular-nums">{item.value}</span>
                    </div>
                  )) : (
                    <p className="text-xs text-text-subtle">Les limites détaillées ne sont pas renseignées pour cette offre.</p>
                  )}
                </div>
                <div className="mt-auto pt-1">
                  {active ? (
                    <div className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-success-soft/60 px-3 text-sm font-medium text-success"><Check size={16} /> Offre actuellement active</div>
                  ) : plan.price_cents > 0 ? (
                    <Button className="w-full gap-2" disabled={busy !== null} loading={busy === plan.id} onClick={() => act({ action: "checkout", planId: plan.id }, plan.id, `Offre ${plan.name} activée`)}>
                      Choisir cette offre <ArrowRight size={15} />
                    </Button>
                  ) : (
                    <Button className="w-full" variant="secondary" disabled={busy !== null} loading={busy === "cancel"} onClick={() => act({ action: "cancel" }, "cancel", "Retour à l’offre gratuite")}>
                      Revenir à l’offre gratuite
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft/40 p-4">
        <InfinityIcon size={17} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Mode démonstration</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">La sélection d’une offre met à jour votre formule dans l’application, mais aucun paiement ni prélèvement réel n’est effectué. Le paiement en ligne sera disponible lorsqu’un prestataire de facturation sera intégré.</p>
        </div>
      </div>
    </div>
  );
}
