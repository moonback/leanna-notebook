"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Card } from "@/components/ui/surfaces";
import { AI_FEATURES } from "@/lib/ai/features";
import { cn } from "@/lib/utils";

type Model = {
  id: string;
  name: string;
  contextLength: number | null;
  promptPrice: string | null;
  completionPrice: string | null;
  modality: string | null;
  inputModalities: string[];
  outputModalities: string[];
  compatibleFeatures: string[];
  isFree: boolean | null;
};
type Preference = { feature: string; modelId: string };
const priceLabel = (model: Model) => model.isFree === true ? "Gratuit" : model.isFree === false ? "Payant" : "Tarif inconnu";
const money = (value: string | null) => {
  if (value == null || !Number.isFinite(Number(value))) return "Inconnu";
  if (Number(value) === 0) return "0 $";
  return `${(Number(value) * 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} $`;
};
const compact = (value: number) => new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(value);
const contextLabel = (value: number | null) => value == null ? "Non renseigné" : `${compact(value)} tokens`;
const provider = (model: Model) => model.id.split("/")[0] ?? "";
/** Libellé d'option lisible : nom, tarif d'entrée par million de tokens, taille de contexte. */
const optionLabel = (model: Model) => [
  model.name.replace(/\s*\(free\)\s*$/i, ""),
  model.isFree === true ? "gratuit" : model.isFree === false ? `${money(model.promptPrice)} / 1 M` : null,
  model.contextLength ? `${compact(model.contextLength)} ctx` : null,
].filter(Boolean).join(" · ");
const FREE_ONLY_KEY = "openrouter-settings:free-only";

export function OpenRouterSettings() {
  const [models, setModels] = React.useState<Model[]>([]);
  const [preferences, setPreferences] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState("");
  const [freeOnly, setFreeOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  React.useEffect(() => {
    try { setFreeOnly(window.localStorage.getItem(FREE_ONLY_KEY) === "1"); } catch { /* stockage indisponible */ }
  }, []);
  const toggleFreeOnly = (value: boolean) => {
    setFreeOnly(value);
    try { window.localStorage.setItem(FREE_ONLY_KEY, value ? "1" : "0"); } catch { /* stockage indisponible */ }
  };
  React.useEffect(() => {
    let alive = true;
    fetch("/api/v1/ai/models", { cache: "no-store" }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Impossible de charger le catalogue OpenRouter.");
      if (!alive) return;
      setModels(data.models);
      const next: Record<string, string> = {};
      for (const p of data.preferences as Preference[]) next[p.feature] = p.modelId;
      for (const feature of AI_FEATURES) {
        const compatible = data.models.filter((m: Model) => m.compatibleFeatures.includes(feature.id));
        const savedModel = next[feature.id];
        const savedIsCompatible = savedModel && compatible.some((m: Model) => m.id === savedModel);
        const preferredDefault = feature.id === "chat" ? data.defaultModelId : null;
        next[feature.id] = savedIsCompatible ? savedModel : compatible.find((m: Model) => m.id === preferredDefault)?.id ?? compatible[0]?.id ?? "";
      }
      setPreferences(next);
    }).catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const queryText = query.trim().toLowerCase();
  /** Modèles proposés : filtrés par recherche et « gratuits uniquement » ; le modèle déjà choisi reste toujours visible. */
  const modelsForFeature = (featureId: string) => {
    const compatible = models.filter((model) => model.compatibleFeatures.includes(featureId));
    const matches = compatible.filter((model) => (!freeOnly || model.isFree === true)
      && (!queryText || model.name.toLowerCase().includes(queryText) || model.id.toLowerCase().includes(queryText)));
    const selected = compatible.find((model) => model.id === preferences[featureId]);
    return selected && !matches.some((model) => model.id === selected.id) ? [selected, ...matches] : matches;
  };
  const selectedCount = AI_FEATURES.filter((feature) => models.some((model) => model.id === preferences[feature.id] && model.compatibleFeatures.includes(feature.id))).length;
  const freeCount = models.filter((model) => model.isFree === true).length;
  const paidSelected = AI_FEATURES.filter((feature) => models.find((model) => model.id === preferences[feature.id])?.isFree === false).length;

  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/ai/models", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences: AI_FEATURES.map((f) => ({ feature: f.id, modelId: preferences[f.id] })).filter((p) => p.modelId) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Enregistrement impossible.");
      setNotice("Vos modèles IA ont bien été enregistrés.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur inattendue."); }
    finally { setSaving(false); }
  }

  return (
    <div className="grid gap-5">
      <Card className="relative isolate overflow-hidden border border-border/70 p-5 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 size-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-accent"><span className="size-2 rounded-full bg-accent" /> Configuration IA</div>
            <div><h2 className="text-xl font-semibold tracking-tight">Vos modèles OpenRouter</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">Choisissez un modèle adapté à chaque usage. Seuls les modèles compatibles avec la tâche sont proposés, avec leur tarif et leur taille de contexte.</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-surface/70 px-3 py-1.5 text-xs text-text-muted"><span className="size-2 rounded-full bg-success" /> Catalogue OpenRouter</div>
        </div>
        <dl className="mt-5 grid grid-cols-2 divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-bg/60 sm:grid-cols-4 sm:divide-x">
          {([["Fonctionnalités", AI_FEATURES.length], ["Configurées", `${selectedCount}/${AI_FEATURES.length}`], ["Modèles gratuits", freeCount.toLocaleString("fr-FR")], ["Tâches sur modèle payant", paidSelected]] as const).map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse px-4 py-3"><dt className="mt-0.5 text-xs text-text-muted">{label}</dt><dd className="text-2xl font-semibold tabular-nums">{value}</dd></div>
          ))}
        </dl>
      </Card>

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div><h3 className="text-base font-semibold">Configuration par fonctionnalité</h3><p className="text-xs text-text-muted">Chaque choix est indépendant des autres.</p></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor="free-only" className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch id="free-only" checked={freeOnly} onCheckedChange={toggleFreeOnly} />
            Gratuits uniquement
          </label>
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Rechercher un modèle</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un modèle…" className="h-10 w-full rounded-xl border border-border-input bg-surface-raised pl-9 pr-3 text-sm outline-none transition focus:border-focus focus:ring-2 focus:ring-accent/15" />
          </label>
        </div>
      </div>

      {loading ? <Card className="grid gap-3 p-6"><div className="h-4 w-40 animate-pulse rounded bg-border" /><div className="h-10 animate-pulse rounded-lg bg-border/70" /><div className="h-24 animate-pulse rounded-lg bg-border/50" /><p className="text-xs text-text-muted">Récupération des modèles et de leurs tarifs…</p></Card> : error && !models.length ? <Card className="border border-danger/30 p-5"><p role="alert" className="text-sm text-danger">{error}</p></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {AI_FEATURES.map((feature) => {
            const options = modelsForFeature(feature.id);
            const allCompatible = models.filter((model) => model.compatibleFeatures.includes(feature.id));
            const selected = allCompatible.find((model) => model.id === preferences[feature.id]);
            const free = selected?.isFree === true;
            const freeOptions = options.filter((m) => m.isFree === true);
            const otherOptions = options.filter((m) => m.isFree !== true);
            const hiddenByFilter = freeOnly && selected && selected.isFree !== true;
            return (
              <Card key={feature.id} className="flex min-w-0 flex-col gap-4 border border-border/70 p-4 transition-colors hover:border-border-strong sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold">{feature.label}</h4>
                    <p className="mt-0.5 text-xs leading-5 text-text-muted">{feature.description}</p>
                  </div>
                  {selected && <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", free ? "bg-success-soft text-success" : selected.isFree === false ? "bg-warning-soft text-warning" : "bg-surface text-text-muted")}><span className="size-1.5 rounded-full bg-current" />{priceLabel(selected)}</span>}
                </div>

                <div className="grid gap-2">
                  <label htmlFor={`model-${feature.id}`} className="flex items-center justify-between text-xs font-medium text-text-muted">
                    <span>Modèle utilisé</span>
                    <span className="font-normal text-text-subtle">{freeOnly ? `${allCompatible.filter((m) => m.isFree === true).length} gratuits` : `${allCompatible.length} compatibles`}</span>
                  </label>
                  <select id={`model-${feature.id}`} value={preferences[feature.id] ?? ""} onChange={(e) => setPreferences((p) => ({ ...p, [feature.id]: e.target.value }))} className="h-11 w-full rounded-xl border border-border-input bg-surface-raised px-3 text-sm outline-none transition focus:border-focus focus:ring-2 focus:ring-accent/15">
                    {!options.length && <option value="">{freeOnly ? "Aucun modèle gratuit compatible" : "Aucun modèle compatible trouvé"}</option>}
                    {freeOptions.length > 0 && <optgroup label="Gratuits">{freeOptions.map((model) => <option key={model.id} value={model.id}>{optionLabel(model)}</option>)}</optgroup>}
                    {otherOptions.length > 0 && <optgroup label={freeOnly ? "Modèle actuel (payant)" : "Payants"}>{otherOptions.map((model) => <option key={model.id} value={model.id}>{optionLabel(model)}</option>)}</optgroup>}
                  </select>
                  {hiddenByFilter && <p className="text-xs text-warning">Le modèle actuel est payant : choisissez un modèle gratuit ci-dessus pour cette tâche.</p>}
                </div>

                {selected ? (
                  <>
                    <dl className="grid grid-cols-3 divide-x divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-bg/60">
                      <div className="flex min-w-0 flex-col-reverse px-3 py-2.5"><dt className="text-[11px] text-text-subtle">Entrée / 1 M tokens</dt><dd className="truncate text-sm font-semibold tabular-nums">{money(selected.promptPrice)}</dd></div>
                      <div className="flex min-w-0 flex-col-reverse px-3 py-2.5"><dt className="text-[11px] text-text-subtle">Sortie / 1 M tokens</dt><dd className="truncate text-sm font-semibold tabular-nums">{money(selected.completionPrice)}</dd></div>
                      <div className="flex min-w-0 flex-col-reverse px-3 py-2.5"><dt className="text-[11px] text-text-subtle">Contexte</dt><dd className="truncate text-sm font-semibold tabular-nums">{contextLabel(selected.contextLength)}</dd></div>
                    </dl>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3 text-[11px] text-text-muted">
                      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-medium text-on-accent-soft">{provider(selected)}</span>
                      <span className="rounded-md bg-surface px-1.5 py-0.5">Entrée : {selected.inputModalities.join(", ") || "—"}</span>
                      <span className="rounded-md bg-surface px-1.5 py-0.5">Sortie : {selected.outputModalities.join(", ") || "—"}</span>
                      <span className="ml-auto min-w-0 truncate font-mono text-text-subtle" title={selected.id}>{selected.id}</span>
                    </div>
                  </>
                ) : <p className="rounded-lg border border-dashed border-border p-3 text-xs text-text-muted">{allCompatible.length ? "Aucun résultat pour ces filtres. Effacez la recherche ou désactivez « Gratuits uniquement »." : "Aucun modèle ne déclare actuellement les modalités nécessaires à cette tâche."}</p>}
              </Card>
            );
          })}
        </div>
      )}

      {error && models.length > 0 && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success">{notice}</p>}
      {!loading && models.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface-raised/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div><p className="text-sm font-medium">{selectedCount} / {AI_FEATURES.length} fonctionnalités configurées</p><p className="text-xs text-text-muted">{models.length.toLocaleString("fr-FR")} modèles dans le catalogue · actualisation du catalogue toutes les heures</p></div>
          <Button onClick={save} disabled={saving || !models.length || selectedCount !== AI_FEATURES.length}>{saving ? "Enregistrement…" : "Enregistrer les modifications"}</Button>
        </div>
      )}
    </div>
  );
}
