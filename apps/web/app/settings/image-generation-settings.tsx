"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surfaces";

type Settings = {
  enabled: boolean; autoSuggestions: boolean; suggestionCount: number;
  defaultModelId: string | null; defaultOrientation: "landscape" | "portrait" | "square";
};
type ImageModel = { id: string; name: string; description?: string };
const defaults: Settings = { enabled: true, autoSuggestions: true, suggestionCount: 4, defaultModelId: null, defaultOrientation: "landscape" };

export function ImageGenerationSettings() {
  const [settings, setSettings] = React.useState<Settings>(defaults);
  const [models, setModels] = React.useState<ImageModel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/v1/ai/image-preferences", { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Préférences indisponibles."); return d.settings as Settings; }),
      fetch("/api/v1/ai/image-models", { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Catalogue image indisponible."); return d as { models: ImageModel[]; defaultModelId: string }; }),
    ]).then(([saved, catalog]) => {
      if (!active) return;
      setModels(catalog.models ?? []);
      setSettings({ ...saved, defaultModelId: saved.defaultModelId || catalog.defaultModelId || null });
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Chargement impossible."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/v1/ai/image-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Enregistrement impossible.");
      setNotice("Préférences de génération d’images enregistrées.");
    } catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }

  const toggle = (key: "enabled" | "autoSuggestions", label: string, description: string) => (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 p-4">
      <span className="grid gap-1"><span className="text-sm font-medium">{label}</span><span className="text-xs leading-5 text-text-muted">{description}</span></span>
      <input type="checkbox" checked={settings[key]} onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))} className="mt-1 size-4 accent-current" />
    </label>
  );

  return (
    <Card className="grid gap-4 p-5 sm:p-6">
      <div className="grid gap-1"><h3 className="text-lg font-semibold">Génération d’images</h3><p className="text-sm text-text-muted">Définissez le comportement par défaut du Studio. Ces préférences sont enregistrées sur votre compte.</p></div>
      {loading ? <p className="text-sm text-text-muted">Chargement des préférences et des modèles image…</p> : <>
        {toggle("enabled", "Autoriser la génération d’images", "Active ou désactive l’accès à la génération d’images dans le Studio.")}
        {toggle("autoSuggestions", "Proposer automatiquement des idées visuelles", "Analyse les sources du notebook à l’ouverture du dialogue pour proposer des concepts d’images pertinents.")}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm"><span className="font-medium">Modèle image par défaut</span><select value={settings.defaultModelId ?? ""} onChange={(e) => setSettings((s) => ({ ...s, defaultModelId: e.target.value || null }))} className="h-10 rounded-lg border border-border-input bg-surface-raised px-3">{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><span className="text-xs text-text-muted">Le modèle choisi sera présélectionné à chaque nouvelle génération.</span></label>
          <label className="grid gap-1.5 text-sm"><span className="font-medium">Orientation par défaut</span><select value={settings.defaultOrientation} onChange={(e) => setSettings((s) => ({ ...s, defaultOrientation: e.target.value as Settings["defaultOrientation"] }))} className="h-10 rounded-lg border border-border-input bg-surface-raised px-3"><option value="landscape">Paysage</option><option value="portrait">Portrait</option><option value="square">Carré</option></select></label>
          <label className="grid gap-1.5 text-sm sm:col-span-2"><span className="font-medium">Nombre d’idées proposées</span><select value={String(settings.suggestionCount)} onChange={(e) => setSettings((s) => ({ ...s, suggestionCount: Number(e.target.value) }))} className="h-10 rounded-lg border border-border-input bg-surface-raised px-3"><option value="3">3 idées</option><option value="4">4 idées</option><option value="5">5 idées</option></select></label>
        </div>
      </>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      <div className="flex justify-end border-t border-border/70 pt-3"><Button onClick={save} disabled={loading || saving || !models.length}>{saving ? "Enregistrement…" : "Enregistrer les préférences"}</Button></div>
    </Card>
  );
}
