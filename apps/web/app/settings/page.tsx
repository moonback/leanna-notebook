import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/feedback";
import { Card } from "@/components/ui/surfaces";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { ProfileForm } from "../profile-form";
import { DeleteAccount } from "./delete-account";
import { PlanCard } from "./plan-card";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = { title: "Réglages · Notebook" };

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/settings");
  const supabase = await createUserClient();
  const [{ data: profile }, { data: workspaces }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("display_name, output_language, theme, web_notifications").eq("id", user.id).single(),
    supabase.from("workspaces").select("id, kind, name, plan_id").order("created_at"),
    supabase.from("plans").select("id, name, price_cents, currency, billing_interval, limits").order("price_cents"),
  ]);
  const personal = workspaces?.find((w) => w.kind === "personal");
  // Mêmes bornes que reserve_usage (date_trunc en UTC) ; crédits rendus exclus.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { data: usage } = personal
    ? await supabase.from("usage_ledger").select("feature, units, created_at").eq("workspace_id", personal.id).neq("status", "refunded").gte("created_at", monthStart)
    : { data: null };
  const limits = plans?.find((p) => p.id === personal?.plan_id)?.limits as { monthly_credits?: number; daily?: Record<string, number> } | undefined;

  return (
    <div className="min-h-dvh">
      <AppHeader><h1 className="truncate text-lg">Réglages</h1></AppHeader>
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6">
        <p className="text-sm text-text-muted">Connecté·e avec {user.email}</p>
        <SettingsTabs
          tabs={[
            {
              id: "preferences",
              label: "Préférences",
              content: (
                <Card className="grid gap-4 p-5">
                  <h2 className="text-lg">Préférences</h2>
                  {profile ? <ProfileForm initial={{ ...profile, theme: profile.theme as "light" | "dark" | "system" }} /> : <p role="alert" className="text-sm text-danger">Profil introuvable.</p>}
                </Card>
              ),
            },
            {
              id: "plan",
              label: "Offre",
              content: (
                <Card className="grid gap-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg">Offre</h2>
                    <Badge tone="warning">Paiement simulé</Badge>
                  </div>
                  {personal && plans ? <PlanCard workspaceId={personal.id} current={personal.plan_id} plans={plans} /> : <p role="alert" className="text-sm text-danger">Espace de travail introuvable.</p>}
                </Card>
              ),
            },
            {
              id: "usage",
              label: "Consommation",
              content: limits && usage ? <UsageCard limits={limits} usage={usage} dayStart={dayStart} /> : <p className="text-sm text-text-muted">Aucune donnée de consommation.</p>,
            },
            {
              id: "data",
              label: "Données",
              content: (
                <>
                  <Card className="grid gap-3 p-5">
                    <h2 className="text-lg">Vos données</h2>
                    <p className="text-sm text-text-muted">
                      Téléchargez une copie de vos données (profil, notebooks, sources, conversations, contenus générés, usage) au format JSON. Les fichiers d’origine sont accessibles par des liens valables 7 jours.
                    </p>
                    <div><Button asChild variant="secondary"><a href="/api/v1/me/export" download>Exporter mes données</a></Button></div>
                  </Card>
                  {user.email && (
                    <Card className="grid gap-4 border-danger/40 p-5">
                      <h2 className="text-lg text-danger">Zone dangereuse</h2>
                      <DeleteAccount email={user.email} />
                    </Card>
                  )}
                </>
              ),
            },
          ]}
        />
      </main>
    </div>
  );
}

const FEATURES: Record<string, string> = { chat: "Questions au chat", report: "Rapports", flashcards: "Fiches", quiz: "Quiz", mind_map: "Cartes mentales" };

/** K01 : consommation du mois et du jour, lue sous RLS dans le registre d'usage. */
function UsageCard({ limits, usage, dayStart }: { limits: { monthly_credits?: number; daily?: Record<string, number> }; usage: { feature: string; units: number; created_at: string }[]; dayStart: string }) {
  const used = usage.reduce((n, u) => n + u.units, 0);
  const today = (f: string) => usage.filter((u) => u.feature === f && u.created_at >= dayStart).length;
  return (
    <Card className="grid gap-4 p-5">
      <h2 className="text-lg">Consommation</h2>
      {limits.monthly_credits != null && (
        <div className="grid gap-2">
          <p className="flex justify-between text-sm"><span>Crédits du mois</span><span className="tabular-nums">{used} / {limits.monthly_credits}</span></p>
          <Progress value={Math.min(100, Math.round((used / limits.monthly_credits) * 100))} label="Crédits du mois utilisés" />
          <p className="text-xs text-text-subtle">Remis à zéro le 1er du mois (UTC). Une génération échouée ne consomme rien.</p>
        </div>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Utilisation aujourd’hui</caption>
        <thead><tr className="text-left text-text-muted"><th className="py-1 font-normal">Aujourd’hui</th><th className="py-1 text-right font-normal">Utilisé / limite</th></tr></thead>
        <tbody>
          {Object.entries(FEATURES).filter(([f]) => limits.daily?.[f] != null).map(([f, l]) => (
            <tr key={f} className="border-t"><td className="py-1.5">{l}</td><td className="py-1.5 text-right tabular-nums">{today(f)} / {limits.daily![f]}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
