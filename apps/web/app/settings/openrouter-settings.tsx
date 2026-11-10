"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surfaces";
import { AI_FEATURES } from "@/lib/ai/features";

type Model = { id: string; name: string; contextLength: number | null; promptPrice: string | null; completionPrice: string | null; modality: string | null };
type Preference = { feature: string; modelId: string };
const money = (value: string | null) => value == null ? "—" : Number(value) === 0 ? "Gratuit" : `$${(Number(value) * 1_000_000).toFixed(2)} / 1 M tokens`;

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
      const defaultModel = data.models[0]?.id ?? "";
      for (const f of AI_FEATURES) next[f.id] ??= defaultModel;
      setPreferences(next);
    }).catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : models;
  }, [models, query]);
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
    <div className="grid gap-1"><h2 className="text-lg">Modèles IA · OpenRouter</h2><p className="text-sm text-text-muted">Choisissez indépendamment le modèle utilisé par chaque fonctionnalité. Le catalogue provient d’OpenRouter et la clé API reste exclusivement côté serveur.</p></div>
    <label className="grid gap-1 text-sm"><span>Rechercher un modèle</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom ou identifiant du modèle" className="h-10 rounded-md border bg-transparent px-3" /></label>
    {loading ? <p className="text-sm text-text-muted">Chargement du catalogue OpenRouter…</p> : error && !models.length ? <p role="alert" className="text-sm text-danger">{error}</p> : <>
      <div className="grid gap-4">{AI_FEATURES.map((feature) => <div key={feature.id} className="grid gap-2 border-b pb-4 last:border-0">
        <div><h3 className="text-sm font-medium">{feature.label}</h3><p className="text-xs text-text-muted">{feature.description}</p></div>
        <select aria-label={`Modèle pour ${feature.label}`} value={preferences[feature.id] ?? ""} onChange={(e) => setPreferences((p) => ({ ...p, [feature.id]: e.target.value }))} className="h-10 w-full rounded-md border bg-surface px-3 text-sm">
          {filtered.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.id}</option>)}
        </select>
        {preferences[feature.id] && (() => { const m = models.find((x) => x.id === preferences[feature.id]); return m ? <p className="text-xs text-text-subtle">Contexte : {m.contextLength?.toLocaleString("fr-FR") ?? "inconnu"} tokens · Entrée : {money(m.promptPrice)} · Sortie : {money(m.completionPrice)} · {m.modality ?? "modalité inconnue"}</p> : null; })()}
      </div>)}</div>
      {!filtered.length && <p className="text-sm text-text-muted">Aucun modèle ne correspond à cette recherche.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-text-subtle">{models.length.toLocaleString("fr-FR")} modèles disponibles · catalogue mis en cache une heure</p><Button onClick={save} disabled={saving || !models.length}>{saving ? "Enregistrement…" : "Enregistrer les modèles"}</Button></div>
    </>}
  </Card>;
}
