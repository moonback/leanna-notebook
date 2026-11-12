import type { ReactNode } from "react";
import { Badge, Progress } from "@/components/ui/feedback";
import { SettingsRow, SettingsSection } from "./settings-ui";

export type PlanLimits = {
  monthly_credits?: number;
  daily?: Record<string, number>;
  credit_cost?: Record<string, number>;
  max_notebooks?: number;
  max_sources_per_notebook?: number;
  max_members_per_notebook?: number;
};
export type UsageEntry = { feature: string; units: number; status: string; created_at: string };

const FEATURES: Record<string, string> = {
  chat: "Questions au chat",
  report: "Rapports",
  flashcards: "Fiches",
  quiz: "Quiz",
  mind_map: "Cartes mentales",
  data_table: "Tableaux de données",
  audio: "Résumés audio",
  slide_deck: "Présentations",
  infographic: "Infographies",
  video: "Vidéos",
  research: "Recherche",
  deep_research: "Recherche approfondie",
  image: "Images",
};
const label = (f: string) => FEATURES[f] ?? f;
const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const fmtTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Stat({ title, value, hint }: { title: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border bg-surface p-4">
      <p className="text-xs text-text-muted">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-subtle">{hint}</p>}
    </div>
  );
}

/** K01 : consommation du mois et du jour, lue sous RLS dans le registre d'usage (hors crédits rendus). */
export function UsageCard({ limits, usage, dayStart }: { limits: PlanLimits; usage: UsageEntry[]; dayStart: string }) {
  const now = new Date();
  const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysLeft = Math.max(1, Math.ceil((nextReset.getTime() - now.getTime()) / 86_400_000));

  const used = usage.reduce((n, u) => n + u.units, 0);
  const total = limits.monthly_credits;
  const remaining = total != null ? Math.max(0, total - used) : null;
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const pending = usage.filter((u) => u.status === "reserved").reduce((n, u) => n + u.units, 0);

  // Toutes les fonctionnalités : utilisées ce mois-ci, ou soumises à une limite / un coût.
  const keys = Array.from(new Set([
    ...usage.map((u) => u.feature),
    ...Object.keys(limits.daily ?? {}),
    ...Object.keys(limits.credit_cost ?? {}),
  ]));
  const rows = keys
    .map((f) => {
      const mine = usage.filter((u) => u.feature === f);
      return {
        f,
        calls: mine.length,
        credits: mine.reduce((n, u) => n + u.units, 0),
        today: mine.filter((u) => u.created_at >= dayStart).length,
        daily: limits.daily?.[f],
        cost: limits.credit_cost?.[f] ?? 1,
      };
    })
    .sort((a, b) => b.credits - a.credits || label(a.f).localeCompare(label(b.f), "fr"));

  const recent = [...usage].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8);
  const planLimits: [string, number | undefined][] = [
    ["Notebooks maximum", limits.max_notebooks],
    ["Sources par notebook", limits.max_sources_per_notebook],
    ["Membres par notebook", limits.max_members_per_notebook],
  ];

  return (
    <div className="grid gap-6">
      <SettingsSection title="Crédits du mois" description={`Remis à zéro le ${fmtDate(nextReset)} (UTC). Une génération échouée ne consomme rien.`}>
        <div className="grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat title="Utilisés" value={used} hint={total != null ? `sur ${total} crédits` : undefined} />
            <Stat title="Restants" value={remaining ?? "∞"} hint={total != null ? `${100 - pct} % disponible` : "Illimité"} />
            <Stat title="Prochaine remise à zéro" value={`${daysLeft} j`} hint={fmtDate(nextReset)} />
          </div>
          {total != null && (
            <div className="grid gap-1.5">
              <Progress value={pct} label="Crédits du mois utilisés" />
              <p className="flex justify-between text-xs text-text-subtle">
                <span>{pct} % utilisé</span>
                {pending > 0 && <span>{pending} crédit{pending > 1 ? "s" : ""} en cours de génération</span>}
              </p>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Détail par fonctionnalité" description="Utilisation du mois, coût en crédits et limite quotidienne.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Consommation par fonctionnalité</caption>
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th scope="col" className="px-5 py-2.5 font-medium">Fonctionnalité</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Coût</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Ce mois</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Crédits</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Aujourd’hui</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const full = r.daily != null && r.today >= r.daily;
                return (
                  <tr key={r.f} className="border-t transition-colors hover:bg-surface">
                    <th scope="row" className="px-5 py-2.5 text-left font-normal">{label(r.f)}</th>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">{r.cost}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.calls}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.credits}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {r.daily != null ? (
                        <span className="inline-flex items-center gap-2">
                          {full && <Badge tone="warning">Limite</Badge>}
                          {r.today} / {r.daily}
                        </span>
                      ) : (
                        <span className="text-text-subtle">{r.today} / ∞</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-surface/60 font-medium">
                <th scope="row" className="px-5 py-2.5 text-left font-medium">Total</th>
                <td />
                <td className="px-3 py-2.5 text-right tabular-nums">{usage.length}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{used}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{usage.filter((u) => u.created_at >= dayStart).length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SettingsSection>

      <SettingsSection title="Activité récente" description="Les dernières consommations de crédits.">
        {recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-muted">Aucune consommation ce mois-ci.</p>
        ) : (
          recent.map((u, i) => (
            <div key={`${u.created_at}-${i}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{label(u.feature)}</span>
              <Badge tone={u.status === "committed" ? "success" : "neutral"}>{u.status === "committed" ? "Terminé" : "En cours"}</Badge>
              <span className="w-24 text-right text-xs text-text-subtle">{fmtTime(u.created_at)}</span>
              <span className="w-14 text-right tabular-nums">−{u.units}</span>
            </div>
          ))
        )}
      </SettingsSection>

      <SettingsSection title="Limites de l’offre" description="Plafonds appliqués à votre espace de travail.">
        {planLimits.filter(([, v]) => v != null).map(([l, v]) => (
          <SettingsRow key={l} label={l}><p className="tabular-nums md:text-right">{v}</p></SettingsRow>
        ))}
        {total != null && <SettingsRow label="Crédits mensuels"><p className="tabular-nums md:text-right">{total}</p></SettingsRow>}
      </SettingsSection>
    </div>
  );
}
