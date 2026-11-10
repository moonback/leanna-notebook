"use client";

import * as React from "react";
import { Check, ChevronRight, RotateCcw, Save, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surfaces";
import { Textarea } from "@/components/ui/field";
import { SYSTEM_PROMPT_CATALOG } from "@/lib/ai/prompt-catalog";

type Prompt = (typeof SYSTEM_PROMPT_CATALOG)[number];
type Overrides = Record<string, string>;

export function SystemPromptsSettings() {
  const [overrides, setOverrides] = React.useState<Overrides>({});
  const [draft, setDraft] = React.useState("");
  const [activeKey, setActiveKey] = React.useState<string>(SYSTEM_PROMPT_CATALOG[0].key);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  const active = SYSTEM_PROMPT_CATALOG.find((p) => p.key === activeKey) ?? SYSTEM_PROMPT_CATALOG[0];
  const saved = overrides[active.key] ?? "";
  const dirty = draft !== saved;
  const filtered = SYSTEM_PROMPT_CATALOG.filter((p) => (p.label + " " + p.group + " " + p.description).toLowerCase().includes(search.toLowerCase()));

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/settings/system-prompts", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error("Impossible de charger les prompts."); return r.json(); })
      .then((data: { overrides: Overrides }) => { if (!cancelled) { setOverrides(data.overrides ?? {}); setDraft(data.overrides?.[activeKey] ?? ""); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => { setDraft(overrides[active.key] ?? ""); setMessage(""); }, [active.key, overrides]);

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/settings/system-prompts", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: active.key, content: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      setOverrides((current) => ({ ...current, [active.key]: draft.trim() }));
      setMessage("Prompt enregistré.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur d’enregistrement."); }
    finally { setSaving(false); }
  }

  async function reset() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/settings/system-prompts?key=" + encodeURIComponent(active.key), { method: "DELETE" });
      if (!response.ok) throw new Error("Restauration impossible.");
      setOverrides((current) => { const next = { ...current }; delete next[active.key]; return next; });
      setDraft("");
      setMessage("Prompt par défaut restauré.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur."); }
    finally { setSaving(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden p-2">
        <div className="relative p-2">
          <Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
          <input aria-label="Rechercher un prompt" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="h-9 w-full rounded-md border border-border-input bg-surface-raised pl-9 pr-3 text-sm outline-none focus-visible:border-focus" />
        </div>
        <div className="grid gap-1">
          {filtered.map((prompt) => (
            <button key={prompt.key} type="button" onClick={() => setActiveKey(prompt.key)} className={`flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${active.key === prompt.key ? "bg-accent-soft text-text" : "text-text-muted hover:bg-surface-sunken hover:text-text"}`}>
              <span className="min-w-0"><span className="block font-medium">{prompt.label}</span><span className="block text-xs text-text-subtle">{prompt.group}</span></span>
              <ChevronRight className="size-4 shrink-0 opacity-60" />
            </button>
          ))}
          {!filtered.length && <p className="p-3 text-sm text-text-muted">Aucun prompt trouvé.</p>}
        </div>
      </Card>

      <Card className="grid min-w-0 gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /><h2 className="text-lg font-semibold">{active.label}</h2></div>
            <p className="mt-1 text-sm text-text-muted">{active.description}</p>
          </div>
          <Badge tone={saved ? "success" : "neutral"}>{saved ? "Personnalisé" : "Par défaut"}</Badge>
        </div>
        <details className="rounded-md border border-border-subtle bg-surface-sunken p-3 text-xs">
          <summary className="cursor-pointer font-medium text-text">Afficher le prompt système de référence</summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap font-mono leading-5 text-text-muted">{active.defaultPrompt}</pre>
        </details>
        <div className="rounded-md border border-border-subtle bg-surface-sunken p-3 text-xs text-text-muted">
          <div className="flex items-center gap-2 font-medium text-text"><ShieldCheck className="size-4" /> Instructions de référence</div>
          <p className="mt-1">Le prompt de référence est conservé dans le code. Votre texte personnalisé est ajouté à ces instructions et ne peut pas désactiver les règles de sécurité, les contrôles de sources ou le format technique requis.</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="system-prompt-editor" className="text-sm font-medium">Instructions personnalisées</label>
          <Textarea id="system-prompt-editor" value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} maxLength={12000} placeholder="Ajoutez ici les consignes spécifiques à cette fonctionnalité…" spellCheck={false} className="min-h-[360px] font-mono text-xs leading-5" disabled={loading} />
          <div className="flex items-center justify-between text-xs text-text-subtle"><span>Ajoutées au prompt système de référence</span><span className="tabular-nums">{draft.length.toLocaleString("fr-FR")} / 12 000</span></div>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {message && <p role="status" className="flex items-center gap-2 text-sm text-success"><Check className="size-4" />{message}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
          <Button variant="ghost" onClick={reset} disabled={saving || loading || !saved}><RotateCcw className="mr-2 size-4" />Réinitialiser</Button>
          <Button onClick={save} disabled={saving || loading || !dirty}><Save className="mr-2 size-4" />{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </div>
      </Card>
    </div>
  );
}
