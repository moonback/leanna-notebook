"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

type Result = { title: string; url: string; why: string; domain: string };
const errors: Record<string, string> = {
  research_not_configured: "La recherche web n’est pas configurée côté serveur (TAVILY_API_KEY).",
  research_no_results: "Aucun résultat exploitable pour cette recherche.",
  research_provider_config: "Le fournisseur de recherche refuse la configuration.",
  quota_daily_exceeded: "Quota quotidien de recherche atteint.",
  quota_monthly_exceeded: "Crédits mensuels épuisés.",
};

export function FastResearch({ notebookId, onImported, open, onOpenChange: setOpen }: { notebookId: string; onImported: () => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = React.useState("");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Result[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [searching, setSearching] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const busy = searching || importing;
  const [stage, setStage] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open || !jobId || !searching) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch(`/api/v1/research/${jobId}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "internal");
        if (stopped) return;
        setStage(j.job.stage ?? "Recherche en cours…");
        if (j.job.status === "succeeded") {
          setResults(j.results ?? []);
          setSelected(new Set((j.results ?? []).map((x: Result) => x.url)));
          setSearching(false);
          setStage("Recherche terminée");
          return;
        }
        if (j.job.status === "failed" || j.job.status === "cancelled") {
          setError(errors[j.job.errorCode] ?? "La recherche a échoué. Réessayez.");
          setSearching(false);
          return;
        }
        timer = setTimeout(poll, 1800);
      } catch (e) {
        if (!stopped) { setError(e instanceof Error ? e.message : "Recherche indisponible."); setSearching(false); }
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [open, jobId, searching]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true); setError(""); setResults([]); setSelected(new Set()); setJobId(null);
    try {
      const r = await fetch(`/api/v1/notebooks/${notebookId}/research`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ query, mode: "fast", scope: "web" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(errors[j.error] ?? "Impossible de lancer la recherche.");
      setJobId(j.jobId);
    } catch (e) { setError(e instanceof Error ? e.message : "Recherche indisponible."); setSearching(false); }
  }

  async function importSelected() {
    if (!jobId || !selected.size) return;
    setImporting(true); setError("");
    try {
      const r = await fetch(`/api/v1/research/${jobId}/import`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: [...selected] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(errors[j.error] ?? "Import impossible.");
      toast({ title: "Sources ajoutées", description: `${j.sources.length} source(s) en cours d’indexation.`, tone: "success" });
      onImported(); setOpen(false); setJobId(null); setResults([]); setQuery("");
    } catch (e) { setError(e instanceof Error ? e.message : "Import impossible."); }
    finally { setImporting(false); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent title="Recherche web rapide" description="Trouvez des pages pertinentes, puis choisissez celles à ajouter aux sources du notebook." size="lg" className="mobile-fast-research-dialog">
          <form onSubmit={search} className="mobile-fast-research-form flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field id="fast-research-query" label="Votre recherche">
                <Input value={query} maxLength={300} onChange={(e) => setQuery(e.target.value)} placeholder="Ex. : dernières avancées de l’énergie solaire" disabled={busy} />
              </Field>
            </div>
            <Button type="submit" disabled={busy || query.trim().length < 3} loading={searching && !jobId}>Rechercher</Button>
          </form>
          {busy && <p className="text-sm text-text-muted" role="status">{stage || "Recherche en cours…"}</p>}
          {error && <Alert tone="danger" title={error} />}
          {results.length > 0 && (
            <div className="mobile-fast-research-results max-h-[50dvh] space-y-2 overflow-y-auto">
              <div className="flex items-center justify-between text-sm text-text-muted"><span>{results.length} résultats (maximum 5)</span><span>{selected.size} sélectionné(s)</span></div>
              {results.map((r) => (
                <label key={r.url} className="mobile-fast-research-result flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-surface">
                  <input type="checkbox" checked={selected.has(r.url)} onChange={(e) => setSelected((old) => { const next = new Set(old); if (e.target.checked) next.add(r.url); else next.delete(r.url); return next; })} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-accent">{r.domain}</span>
                    <span className="mt-1 block text-sm text-text-muted">{r.why}</span>
                    <a href={r.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs underline" onClick={(e) => e.stopPropagation()}>{r.url}</a>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="mobile-fast-research-actions flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Fermer</Button>
            <Button type="button" disabled={busy || selected.size === 0} loading={importing} onClick={() => void importSelected()}>Importer la sélection ({selected.size})</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
