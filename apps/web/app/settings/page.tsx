import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard, Database, Gauge, Sparkles, TerminalSquare, ToggleLeft, User } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { ProfileForm } from "../profile-form";
import { DeleteAccount } from "./delete-account";
import { PlanCard } from "./plan-card";
import { SettingsTabs } from "./settings-tabs";
import { SettingsRow, SettingsSection } from "./settings-ui";
import { UsageCard, type PlanLimits } from "./usage-card";
import { OpenRouterSettings } from "./openrouter-settings";
import { OcrSettings } from "./ocr-settings";
import { ImageGenerationSettings } from "./image-generation-settings";
import { PasswordForm } from "./password-form";
import { SystemPromptsSettings } from "./system-prompts";
import { FeaturesSettings } from "./features-settings";
import type { OptionalFeature } from "@/lib/validation";

export const metadata: Metadata = { title: "Réglages · Notebook" };

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/settings");
  const supabase = await createUserClient();
  const [{ data: profile }, { data: workspaces }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("display_name, output_language, theme, web_notifications, disabled_features").eq("id", user.id).single(),
    supabase.from("workspaces").select("id, kind, name, plan_id").order("created_at"),
    supabase.from("plans").select("id, name, price_cents, currency, billing_interval, limits").order("price_cents"),
  ]);
  const personal = workspaces?.find((w) => w.kind === "personal");
  // Mêmes bornes que reserve_usage (date_trunc en UTC) ; crédits rendus exclus.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { data: usage } = personal
    ? await supabase.from("usage_ledger").select("feature, units, status, created_at").eq("workspace_id", personal.id).neq("status", "refunded").gte("created_at", monthStart)
    : { data: null };
  const currentPlan = plans?.find((p) => p.id === personal?.plan_id);
  const limits = currentPlan?.limits as PlanLimits | undefined;

  const name = profile?.display_name?.trim() || user.email?.split("@")[0] || "Compte";
  const initials = name.split(/\s+/).map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh var(--bg)">
      <AppHeader><h1 className="truncate text-lg">Réglages</h1></AppHeader>
      <main className="mobile-settings-main mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 sm:px-6">
        <section aria-label="Compte" className="mobile-settings-account flex flex-wrap items-center gap-4 rounded-lg border bg-surface-raised p-5 shadow-xs">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-pill bg-accent text-lg font-semibold text-on-accent">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{name}</p>
            <p className="truncate text-sm text-text-muted">{user.email}</p>
          </div>
          {currentPlan && <Badge tone="accent">Offre {currentPlan.name}</Badge>}
        </section>
        <SettingsTabs
          tabs={[
            {
              id: "preferences",
              label: "Préférences",
              description: "Profil, langue, apparence et notifications.",
              icon: <User />,
              content: profile ? <ProfileForm showPreferences initial={{ ...profile, theme: profile.theme as "light" | "dark" | "system" }} /> : <p role="alert" className="text-sm text-danger">Profil introuvable.</p>,
            },
            {
              id: "security",
              label: "Sécurité",
              description: "Protégez votre compte et modifiez votre mot de passe.",
              icon: <User />,
              content: <PasswordForm />,
            },
            {
              id: "plan",
              label: "Offre",
              description: "Comparez les offres et gérez votre abonnement.",
              icon: <CreditCard />,
              content: (
                <SettingsSection title="Abonnement" description="Votre offre détermine les crédits mensuels et les limites quotidiennes." action={<Badge tone="warning">Paiement simulé</Badge>}>
                  <div className="p-5">
                    {personal && plans ? <PlanCard workspaceId={personal.id} current={personal.plan_id} plans={plans} /> : <p role="alert" className="text-sm text-danger">Espace de travail introuvable.</p>}
                  </div>
                </SettingsSection>
              ),
            },
            {
              id: "usage",
              label: "Consommation",
              description: "Crédits du mois, détail par fonctionnalité, limites du jour et activité récente.",
              icon: <Gauge />,
              content: limits && usage ? <UsageCard limits={limits} usage={usage} dayStart={dayStart} /> : <p className="text-sm text-text-muted">Aucune donnée de consommation.</p>,
            },
            {
              id: "ai",
              label: "Intelligence artificielle",
              description: "Modèles OpenRouter, OCR des PDF scannés et génération d’images.",
              icon: <Sparkles />,
              content: <div className="mobile-settings-ai grid gap-5"><OpenRouterSettings /></div>,
            },
            {
              id: "features",
              label: "Fonctionnalités",
              description: "Activez ou désactivez la recherche approfondie, le graphe de connaissances, les contradictions, l’OCR des PDF scannés et la génération d’images.",
              icon: <ToggleLeft />,
              content: (
                <div className="grid gap-5">
                  <FeaturesSettings initial={(profile?.disabled_features ?? []) as OptionalFeature[]} />
                  <OcrSettings />
                  <ImageGenerationSettings />
                </div>
              ),
            },
            {
              id: "prompts",
              label: "Prompts système",
              description: "Personnalisez le comportement de l’assistant.",
              icon: <TerminalSquare />,
              content: <SystemPromptsSettings />,
            },
            {
              id: "data",
              label: "Données",
              description: "Exportez vos données ou supprimez votre compte.",
              icon: <Database />,
              content: (
                <>
                  <SettingsSection title="Vos données" description="Copie de vos données (profil, notebooks, sources, conversations, contenus générés, usage) au format JSON.">
                    <SettingsRow label="Export complet" description="Les fichiers d’origine sont accessibles par des liens valables 7 jours.">
                      <div className="md:flex md:justify-end"><Button asChild variant="secondary"><a href="/api/v1/me/export" download>Exporter mes données</a></Button></div>
                    </SettingsRow>
                  </SettingsSection>
                  {user.email && (
                    <SettingsSection tone="danger" title="Zone dangereuse" description="Ces actions sont définitives.">
                      <div className="p-5"><DeleteAccount email={user.email} /></div>
                    </SettingsSection>
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
