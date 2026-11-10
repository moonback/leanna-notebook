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
const money = (value: string | null) => value == null ? "Tarif inconnu" : Number(value) === 0 ? "Gratuit" : `$${(Number(value) * 1_000_000).toFixed(2)} / 1 M tokens`;
const priceLabel = (model: Model) => model.isFree === true ? "Gratuit" : model.isFree === false ? "Payant" : "Tarif inconnu";

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
        next[feature.id] = savedIsCompatible
          ? savedModel
          : compatible.find((m: Model) => m.id === preferredDefault)?.id ?? compatible[0]?.id ?? "";
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
  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/ai/models", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences: AI_FEATURES.map((f) => ({ feature: f.id, modelId: preferences[f.id] })).filter((p) => p.modelId) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Enregistrement impossible.");
      setNotice("Préférences enregistrées. Les prochaines générations utiliseront ces modèles.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur inattendue."); }
    finally { setSaving(false); }
  }
  return <Card className="grid gap-5 p-5">
    <div className="grid gap-1"><h2 className="text-lg">Modèles IA · OpenRouter</h2><p className="text-sm text-text-muted">Chaque fonctionnalité ne propose que les modèles dont les modalités d’entrée et de sortie sont compatibles. Le coût est indiqué pour chaque modèle.</p></div>
    <label className="grid gap-1 text-sm"><span>Rechercher un modèle</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom ou identifiant du modèle" className="h-10 rounded-md border bg-transparent px-3" /></label>
    {loading ? <p className="text-sm text-text-muted">Chargement du catalogue OpenRouter…</p> : error && !models.length ? <p role="alert" className="text-sm text-danger">{error}</p> : <>
      <div className="grid gap-4">{AI_FEATURES.map((feature) => {
        const compatible = modelsForFeature(feature.id);
        const allCompatible = models.filter((model) => model.compatibleFeatures.includes(feature.id));
        const selected = allCompatible.find((model) => model.id === preferences[feature.id]);
        return <div key={feature.id} className="grid gap-2 border-b pb-4 last:border-0">
          <div><h3 className="text-sm font-medium">{feature.label}</h3><p className="text-xs text-text-muted">{feature.description}</p></div>
          <select aria-label={`Modèle compatible pour ${feature.label}`} value={preferences[feature.id] ?? ""} onChange={(e) => setPreferences((p) => ({ ...p, [feature.id]: e.target.value }))} className="h-10 w-full rounded-md border bg-surface px-3 text-sm">
            {!compatible.length && <option value="">Aucun modèle compatible trouvé</option>}
            {compatible.map((model) => <option key={model.id} value={model.id}>{model.name} — {priceLabel(model)} — {model.id}</option>)}
          </select>
          {selected && <p className="text-xs text-text-subtle">Tarif : {priceLabel(selected)} · Entrée : {money(selected.promptPrice)} · Sortie : {money(selected.completionPrice)} · Contexte : {selected.contextLength?.toLocaleString("fr-FR") ?? "inconnu"} tokens · Entrées : {selected.inputModalities.join(", ") || "inconnues"} · Sorties : {selected.outputModalities.join(", ") || "inconnues"}</p>}
          {!allCompatible.length && <p className="text-xs text-text-subtle">Aucun modèle du catalogue ne déclare les modalités requises (texte en entrée et en sortie).</p>}
          {allCompatible.length > 0 && !compatible.length && <p className="text-xs text-text-subtle">Aucun résultat pour cette recherche. Effacez le filtre pour revoir les modèles compatibles.</p>}
        </div>;
      })}</div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-text-subtle">{models.length.toLocaleString("fr-FR")} modèles au catalogue · filtrés selon leur compatibilité · catalogue mis en cache une heure</p><Button onClick={save} disabled={saving || !models.length || AI_FEATURES.some((f) => !preferences[f.id] || !models.some((m) => m.id === preferences[f.id] && m.compatibleFeatures.includes(f.id)))}>{saving ? "Enregistrement…" : "Enregistrer les modèles"}</Button></div>
    </>}
  </Card>;
}
