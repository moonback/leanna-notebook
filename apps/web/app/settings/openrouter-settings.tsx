"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surfaces";
import { AI_FEATURES } from "@/lib/ai/features";

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
  return `$${(Number(value) * 1_000_000).toFixed(2)}`;
};
const contextLabel = (value: number | null) => value == null ? "Non renseigné" : `${new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(value)} tokens`;

export function OpenRouterSettings() {
  const [models, setModels] = React.useState<Model[]>([]);
  const [preferences, setPreferences] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
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
  const modelsForFeature = (featureId: string) => {
    const compatible = models.filter((model) => model.compatibleFeatures.includes(featureId));
    const matches = compatible.filter((model) => !queryText || model.name.toLowerCase().includes(queryText) || model.id.toLowerCase().includes(queryText));
    const selected = compatible.find((model) => model.id === preferences[featureId]);
    return selected && !matches.some((model) => model.id === selected.id) ? [selected, ...matches] : matches;
  };
  const selectedCount = AI_FEATURES.filter((feature) => models.some((model) => model.id === preferences[feature.id] && model.compatibleFeatures.includes(feature.id))).length;
  const freeCount = models.filter((model) => model.isFree === true).length;

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
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-primary"><span className="size-2 rounded-full bg-primary" /> Configuration IA</div>
            <div><h2 className="text-xl font-semibold tracking-tight">Vos modèles OpenRouter</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">Choisissez un modèle adapté à chaque usage. Les modèles affichés sont filtrés selon leurs capacités réelles et leur coût est détaillé avant sélection.</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-surface/70 px-3 py-1.5 text-xs text-text-muted"><span className="size-2 rounded-full bg-success" /> Catalogue OpenRouter</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/60 p-3"><p className="text-2xl font-semibold tabular-nums">{AI_FEATURES.length}</p><p className="mt-0.5 text-xs text-text-muted">Fonctionnalités</p></div>
          <div className="rounded-xl border border-border/70 bg-background/60 p-3"><p className="text-2xl font-semibold tabular-nums">{selectedCount}<span className="text-sm font-normal text-text-muted">/{AI_FEATURES.length}</span></p><p className="mt-0.5 text-xs text-text-muted">Modèles configurés</p></div>
          <div className="col-span-2 rounded-xl border border-border/70 bg-background/60 p-3 sm:col-span-1"><p className="text-2xl font-semibold tabular-nums">{freeCount.toLocaleString("fr-FR")}</p><p className="mt-0.5 text-xs text-text-muted">Modèles gratuits au catalogue</p></div>
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-base font-semibold">Configuration par fonctionnalité</h3><p className="text-xs text-text-muted">Chaque choix est indépendant des autres.</p></div>
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Rechercher un modèle</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un modèle…" className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </label>
      </div>

      {loading ? <Card className="grid gap-3 p-6"><div className="h-4 w-40 animate-pulse rounded bg-border" /><div className="h-10 animate-pulse rounded-lg bg-border/70" /><div className="h-24 animate-pulse rounded-lg bg-border/50" /><p className="text-xs text-text-muted">Récupération des modèles et de leurs tarifs…</p></Card> : error && !models.length ? <Card className="border border-danger/30 p-5"><p role="alert" className="text-sm text-danger">{error}</p></Card> : (
        <div className="grid gap-3">
          {AI_FEATURES.map((feature, index) => {
            const compatible = modelsForFeature(feature.id);
            const allCompatible = models.filter((model) => model.compatibleFeatures.includes(feature.id));
            const selected = allCompatible.find((model) => model.id === preferences[feature.id]);
            const free = selected?.isFree === true;
            return (
              <Card key={feature.id} className="grid gap-4 border border-border/70 p-4 transition-colors hover:border-border sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-sm font-semibold text-primary">{String(index + 1).padStart(2, "0")}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{feature.label}</h4>{selected && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${free ? "bg-success/10 text-success" : selected.isFree === false ? "bg-warning/10 text-warning" : "bg-surface text-text-muted"}`}><span className="size-1.5 rounded-full bg-current" />{priceLabel(selected)}</span>}</div>
                    <p className="mt-0.5 text-xs leading-5 text-text-muted">{feature.description}</p>
                  </div>
                  <div className="hidden rounded-lg border border-border/60 px-2.5 py-1 text-[11px] text-text-subtle sm:block">{allCompatible.length} compatibles</div>
                </div>

                <div className="grid gap-2">
                  <label htmlFor={`model-${feature.id}`} className="text-xs font-medium text-text-muted">Modèle utilisé</label>
                  <select id={`model-${feature.id}`} aria-label={`Modèle compatible pour ${feature.label}`} value={preferences[feature.id] ?? ""} onChange={(e) => setPreferences((p) => ({ ...p, [feature.id]: e.target.value }))} className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
                    {!compatible.length && <option value="">Aucun modèle compatible trouvé</option>}
                    {compatible.map((model) => <option key={model.id} value={model.id}>{model.name} · {priceLabel(model)}</option>)}
                  </select>
                </div>

                {selected ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-background/70 p-3"><p className="text-[11px] text-text-subtle">Entrée / 1 M tokens</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(selected.promptPrice)}</p></div>
                    <div className="rounded-lg bg-background/70 p-3"><p className="text-[11px] text-text-subtle">Sortie / 1 M tokens</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(selected.completionPrice)}</p></div>
                    <div className="rounded-lg bg-background/70 p-3"><p className="text-[11px] text-text-subtle">Fenêtre de contexte</p><p className="mt-1 text-sm font-semibold tabular-nums">{contextLabel(selected.contextLength)}</p></div>
                    <div className="rounded-lg bg-background/70 p-3"><p className="text-[11px] text-text-subtle">Compatibilité</p><p className="mt-1 text-sm font-semibold">Texte ↔ texte</p></div>
                  </div>
                ) : <p className="rounded-lg border border-dashed border-border p-3 text-xs text-text-muted">{allCompatible.length ? "Aucun résultat pour cette recherche. Effacez le filtre pour revoir les modèles." : "Aucun modèle ne déclare actuellement les modalités texte en entrée et en sortie."}</p>}

                {selected && <div className="flex flex-col gap-1 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 break-all text-[11px] text-text-subtle">{selected.id}</p>
                  <p className="shrink-0 text-[11px] text-text-muted">Entrée : {selected.inputModalities.join(", ") || "—"} · Sortie : {selected.outputModalities.join(", ") || "—"}</p>
                </div>}
              </Card>
            );
          })}
        </div>
      )}

      {error && models.length > 0 && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">{notice}</p>}
      {!loading && models.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div><p className="text-sm font-medium">{selectedCount} / {AI_FEATURES.length} fonctionnalités configurées</p><p className="text-xs text-text-muted">{models.length.toLocaleString("fr-FR")} modèles dans le catalogue · actualisation du catalogue toutes les heures</p></div>
          <Button onClick={save} disabled={saving || !models.length || selectedCount !== AI_FEATURES.length}>{saving ? "Enregistrement…" : "Enregistrer les modifications"}</Button>
        </div>
      )}
    </div>
  );
}
