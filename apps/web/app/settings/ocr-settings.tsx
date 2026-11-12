"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surfaces";

type Model = { id: string; name: string; compatibleFeatures: string[] };
type OcrSettings = { enabled: boolean; modelId: string | null; engine: "mistral-ocr" | "cloudflare-ai" };

export function OcrSettings() {
  const [models, setModels] = React.useState<Model[]>([]);
  const [settings, setSettings] = React.useState<OcrSettings>({ enabled: false, modelId: null, engine: "mistral-ocr" });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/v1/ai/models", { cache: "no-store" }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Catalogue OpenRouter indisponible.");
        return body.models as Model[];
      }),
      fetch("/api/v1/ai/ocr", { cache: "no-store" }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Préférences OCR indisponibles.");
        return body.settings as OcrSettings;
      }),
    ]).then(([catalog, saved]) => {
      if (!alive) return;
      const compatible = catalog.filter((model) => model.compatibleFeatures.includes("chat"));
      setModels(compatible);
      setSettings({ ...saved, modelId: saved.modelId ?? compatible[0]?.id ?? null });
    }).catch((e) => alive && setError(e instanceof Error ? e.message : "Erreur inattendue."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/ai/ocr", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Enregistrement des réglages OCR impossible.");
      setNotice("Configuration OCR enregistrée.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur inattendue."); }
    finally { setSaving(false); }
  }

  return (
    <Card className="grid gap-4 border border-border/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-primary"><span className="size-2 rounded-full bg-primary" /> OCR des PDF scannés</div>
          <h3 className="mt-2 text-lg font-semibold">Reconnaissance de texte par OpenRouter</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">L'OCR se déclenche automatiquement uniquement lorsqu'un PDF ne contient pas de texte exploitable. Le modèle sélectionné restitue le texte page par page.</p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))} disabled={loading} />
          Activer l'OCR automatique
        </label>
      </div>

      {loading ? <p className="text-sm text-text-muted">Chargement du catalogue et des préférences…</p> : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Modèle OpenRouter</span>
            <select value={settings.modelId ?? ""} onChange={(e) => setSettings((s) => ({ ...s, modelId: e.target.value || null }))} disabled={!models.length} className="h-11 rounded-xl border border-border bg-surface px-3 outline-none focus:border-primary">
              {!models.length && <option value="">Aucun modèle texte disponible</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.id}</option>)}
            </select>
            <span className="text-xs text-text-muted">Choisissez un modèle texte compatible avec les entrées et sorties textuelles.</span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Moteur de lecture PDF</span>
            <select value={settings.engine} onChange={(e) => setSettings((s) => ({ ...s, engine: e.target.value as OcrSettings["engine"] }))} className="h-11 rounded-xl border border-border bg-surface px-3 outline-none focus:border-primary">
              <option value="mistral-ocr">Mistral OCR — recommandé pour les scans</option>
              <option value="cloudflare-ai">Cloudflare AI — conversion PDF en texte</option>
            </select>
            <span className="text-xs text-text-muted">Mistral OCR peut entraîner un coût de traitement par page facturé par OpenRouter. Cloudflare AI est indiqué comme gratuit dans leur documentation.</span>
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <p className="max-w-xl text-xs text-text-muted">La clé API reste côté serveur. Les préférences sont personnelles. Limite actuelle : 40 Mo par PDF OCR et 32 000 tokens de sortie par requête.</p>
        <Button onClick={save} disabled={loading || saving || (settings.enabled && (!settings.modelId || !models.length))}>{saving ? "Enregistrement…" : "Enregistrer les réglages OCR"}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    </Card>
  );
}
