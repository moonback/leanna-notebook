"use client";
import * as React from "react";
import { Check, CircleCheck, Clock, ExternalLink, FileWarning, Link2, MessageSquareText, RotateCcw, Scale, ShieldQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Row = {
  id: string; attribute: string; category: string; kind: string; status: string; confidence: number; explanation: string;
  subject: { id: string; name: string; type: string } | null; a: { value_text: string; source_id: string } | null; b: { value_text: string; source_id: string } | null;
};
type Counts = { direct: number; divergence: number; obsolete: number; insufficient: number; toReview: number; resolved: number };
type Claim = { id: string; attribute_label: string; value_text: string; context: string | null; observed_at: string | null; confidence: number; quote_text: string; char_start: number; char_end: number; page: number | null; source_id: string; source: { title: string; origin_url: string | null; created_at: string } | null };
type Detail = {
  contradiction: Row & { a: Claim; b: Claim; detector: { deterministic?: { kind: string; reason: string }; llm?: { model: string; verdict: string } | null }; resolution_note: string | null; created_at: string };
  evidence: Array<{ id: string; source_id: string | null; note: string | null; created_at: string; source: { title: string } | null }>;
  reviews: Array<{ id: string; action: string; previous_status: string | null; new_status: string | null; note: string | null; created_at: string }>;
};

export const KIND: Record<string, { label: string; tone: "danger" | "warning" | "neutral" | "accent" }> = {
  direct: { label: "Contradiction directe", tone: "danger" }, divergence: { label: "Divergence", tone: "warning" },
  contextual: { label: "Contexte différent", tone: "accent" }, obsolete: { label: "Information obsolète", tone: "neutral" }, insufficient: { label: "Insuffisamment documentée", tone: "neutral" },
};
const STATUS: Record<string, string> = { open: "À vérifier", verified: "Vérifiée", confirmed: "Confirmée", rejected: "Détection rejetée", obsolete: "Obsolète", resolved: "Résolue" };
const CATEGORY: Record<string, string> = {
  date: "date", amount: "montant", quantity: "quantité", location: "lieu", responsibility: "responsabilité", statement: "déclaration",
  chronology: "chronologie", factual: "fait", obsolete: "version", version: "version",
};
const ACTION: Record<string, string> = {
  verify: "Marquée comme vérifiée", confirm: "Contradiction confirmée", reject: "Détection rejetée", mark_obsolete: "Signalée obsolète",
  resolve: "Résolue", reopen: "Rouverte", note: "Explication ajoutée", attach_source: "Source associée",
};

export function Contradictions({ notebookId, canEdit, sources, onOpenPassage }: {
  notebookId: string; canEdit: boolean; sources: { id: string; title: string }[]; onOpenPassage: (sourceId: string, start: number, end: number) => void;
}) {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [status, setStatus] = React.useState("open");
  const [kind, setKind] = React.useState("");
  const [failed, setFailed] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const titles = React.useMemo(() => new Map(sources.map((s) => [s.id, s.title])), [sources]);

  const load = React.useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page) });
    if (status) qs.set("status", status);
    if (kind) qs.set("kind", kind);
    try {
      const r = await fetch(`/api/v1/notebooks/${notebookId}/knowledge/contradictions?${qs}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setRows(j.contradictions); setCounts(j.counts); setTotal(j.total); setFailed(false);
    } catch { setFailed(true); }
  }, [notebookId, page, status, kind]);
  React.useEffect(() => { void load(); }, [load]);

  const cards: Array<{ key: string; label: string; value: number; icon: React.ReactNode; filter: () => void }> = counts ? [
    { key: "direct", label: "Contradictions directes", value: counts.direct, icon: <Scale />, filter: () => { setStatus("open"); setKind("direct"); } },
    { key: "divergence", label: "Divergences", value: counts.divergence, icon: <ShieldQuestion />, filter: () => { setStatus("open"); setKind("divergence"); } },
    { key: "obsolete", label: "Informations obsolètes", value: counts.obsolete, icon: <Clock />, filter: () => { setStatus(""); setKind("obsolete"); } },
    { key: "toReview", label: "Cas à vérifier", value: counts.toReview, icon: <FileWarning />, filter: () => { setStatus("open"); setKind(""); } },
    { key: "resolved", label: "Traitées", value: counts.resolved, icon: <CircleCheck />, filter: () => { setStatus("resolved"); setKind(""); } },
  ] : [];

  return (
    <div className="grid gap-5 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {counts ? cards.map((c) => (
          <button key={c.key} type="button" onClick={() => { c.filter(); setPage(0); }} className="grid gap-1 rounded-lg border bg-surface-raised p-3 text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-focus">
            <span aria-hidden className="text-text-subtle [&_svg]:size-4">{c.icon}</span>
            <span className="text-xl font-semibold tabular-nums">{c.value}</span><span className="text-xs text-text-muted">{c.label}</span>
          </button>
        )) : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filtrer par statut" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="h-8 rounded-md border border-border-input bg-surface-raised px-2 text-sm">
          <option value="">Tous les statuts</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Filtrer par nature" value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }} className="h-8 rounded-md border border-border-input bg-surface-raised px-2 text-sm">
          <option value="">Toutes les natures</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-xs text-text-muted">{total} cas</span>
      </div>
      {failed ? <Alert tone="danger" title="Contradictions indisponibles" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Réessayer</Button>} />
        : !rows ? <div className="grid gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        : rows.length === 0 ? (
          <EmptyState icon={<Scale />} title="Aucun cas pour ce filtre">
            Les affirmations extraites des sources sont comparées automatiquement (dates, montants, quantités, responsables…). Les écarts apparaîtront ici avec leurs passages exacts.
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r.id)} className="grid w-full gap-2 rounded-lg border bg-surface-raised p-3 text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-focus">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={KIND[r.kind]?.tone}>{KIND[r.kind]?.label ?? r.kind}</Badge>
                    <span className="text-xs text-text-muted">{CATEGORY[r.category] ?? r.category} · confiance {Math.round(r.confidence * 100)} % · {STATUS[r.status]}</span>
                  </span>
                  <span className="text-sm"><strong>{r.subject?.name ?? "Entité"}</strong> — {r.attribute.replace(/_/g, " ")}</span>
                  <span className="grid gap-1 text-sm sm:grid-cols-2">
                    <span className="truncate rounded bg-surface px-2 py-1">« {r.a?.value_text} » <span className="text-xs text-text-subtle">— {titles.get(r.a?.source_id ?? "") ?? "source"}</span></span>
                    <span className="truncate rounded bg-surface px-2 py-1">« {r.b?.value_text} » <span className="text-xs text-text-subtle">— {titles.get(r.b?.source_id ?? "") ?? "source"}</span></span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {total > 30 && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
          <span className="text-xs text-text-muted">Page {page + 1} / {Math.ceil(total / 30)}</span>
          <Button size="sm" variant="secondary" disabled={(page + 1) * 30 >= total} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
        </div>
      )}
      <ContradictionDialog id={open} canEdit={canEdit} sources={sources} onClose={() => setOpen(null)} onOpenPassage={(s, a, b) => { setOpen(null); onOpenPassage(s, a, b); }} onChanged={() => void load()} />
    </div>
  );
}

function ContradictionDialog({ id, canEdit, sources, onClose, onOpenPassage, onChanged }: {
  id: string | null; canEdit: boolean; sources: { id: string; title: string }[]; onClose: () => void; onOpenPassage: (s: string, a: number, b: number) => void; onChanged: () => void;
}) {
  const [d, setD] = React.useState<Detail | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/v1/knowledge/contradictions/${id}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setD(await r.json()); setFailed(false);
    } catch { setFailed(true); }
  }, [id]);
  React.useEffect(() => { setD(null); setNote(""); setSourceId(""); void load(); }, [load]);

  async function review(action: string) {
    setBusy(action);
    try {
      const r = await fetch(`/api/v1/knowledge/contradictions/${id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(note.trim() ? { note: note.trim() } : {}), ...(action === "attach_source" ? { sourceId } : {}) }),
      });
      if (!r.ok) throw new Error();
      toast({ title: ACTION[action] ?? "Décision enregistrée", tone: "success" });
      setNote(""); setSourceId("");
      await load(); onChanged();
    } catch { toast({ title: "Décision non enregistrée", tone: "error" }); } finally { setBusy(null); }
  }

  const c = d?.contradiction;
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={c ? `${c.subject?.name ?? "Entité"} — ${c.a.attribute_label}` : "Contradiction"} description={c ? `${KIND[c.kind]?.label ?? c.kind} · ${STATUS[c.status]}` : undefined}>
        {failed ? <Alert tone="danger" title="Cas indisponible (les sources ont peut-être été supprimées)." /> : !c ? <div className="grid gap-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : (
          <div className="grid max-h-[70dvh] gap-5 overflow-y-auto">
            <p className="text-sm">{c.explanation}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[c.a, c.b].map((claim, i) => (
                <section key={claim.id} className="grid gap-2 rounded-lg border p-3" aria-label={`Affirmation ${i === 0 ? "A" : "B"}`}>
                  <p className="text-base font-semibold">{claim.value_text}</p>
                  <p className="text-xs text-text-muted">{claim.source?.title ?? "Source"}{claim.page ? ` · p. ${claim.page}` : ""}{claim.observed_at ? ` · valable au ${claim.observed_at}` : ""}{claim.context ? ` · contexte : ${claim.context}` : ""}</p>
                  <button type="button" onClick={() => onOpenPassage(claim.source_id, claim.char_start, claim.char_end)} className="rounded-md border-l-2 border-accent bg-surface px-3 py-2 text-left font-serif text-xs leading-5 hover:bg-surface-sunken">« {claim.quote_text} »</button>
                  {claim.source?.origin_url && <a href={claim.source.origin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline"><ExternalLink className="size-3" aria-hidden /> Document original</a>}
                </section>
              ))}
            </div>
            <p className="text-xs text-text-subtle">
              Détection : comparaison structurée{c.detector.deterministic ? ` (${KIND[c.detector.deterministic.kind]?.label ?? c.detector.deterministic.kind})` : ""}
              {c.detector.llm ? ` puis qualification par ${c.detector.llm.model}` : " — non qualifiée par un modèle"} · confiance {Math.round(c.confidence * 100)} %
            </p>
            {c.resolution_note && <Alert tone="accent" title="Explication">{c.resolution_note}</Alert>}
            {d!.evidence.length > 0 && (
              <section className="grid gap-1"><h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sources associées</h4>
                <ul className="grid gap-1 text-sm">{d!.evidence.map((e) => <li key={e.id}><Link2 className="mr-1 inline size-3" aria-hidden />{e.source?.title ?? "Source supprimée"}{e.note ? ` — ${e.note}` : ""}</li>)}</ul>
              </section>
            )}
            {canEdit && (
              <section className="grid gap-3 rounded-lg border bg-surface p-3">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} aria-label="Explication (facultative)" placeholder="Explication ou justification de votre décision (facultatif)" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={busy === "verify"} onClick={() => void review("verify")}><Check aria-hidden /> Marquer comme vérifiée</Button>
                  <Button size="sm" variant="secondary" loading={busy === "confirm"} onClick={() => void review("confirm")}><Scale aria-hidden /> Confirmer la contradiction</Button>
                  <Button size="sm" variant="secondary" loading={busy === "reject"} onClick={() => void review("reject")}><X aria-hidden /> Rejeter la détection</Button>
                  <Button size="sm" variant="secondary" loading={busy === "mark_obsolete"} onClick={() => void review("mark_obsolete")}><Clock aria-hidden /> Information obsolète</Button>
                  <Button size="sm" variant="ghost" loading={busy === "resolve"} onClick={() => void review("resolve")}><CircleCheck aria-hidden /> Résolue</Button>
                  {c.status !== "open" && <Button size="sm" variant="ghost" loading={busy === "reopen"} onClick={() => void review("reopen")}><RotateCcw aria-hidden /> Rouvrir</Button>}
                  <Button size="sm" variant="ghost" disabled={!note.trim()} loading={busy === "note"} onClick={() => void review("note")}><MessageSquareText aria-hidden /> Ajouter l’explication</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Source à associer" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-8 min-w-0 max-w-72 flex-1 rounded-md border border-border-input bg-surface-raised px-2 text-sm">
                    <option value="">Associer une source supplémentaire…</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" disabled={!sourceId} loading={busy === "attach_source"} onClick={() => void review("attach_source")}><Link2 aria-hidden /> Associer</Button>
                </div>
              </section>
            )}
            <section className="grid gap-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Historique des décisions</h4>
              {d!.reviews.length === 0 ? <p className="text-xs text-text-muted">Aucune décision humaine pour l’instant.</p> : (
                <ol className="grid gap-1 text-xs">{d!.reviews.map((r) => (
                  <li key={r.id} className={cn("flex gap-2", r.new_status && "font-medium")}>
                    <time className="shrink-0 tabular-nums text-text-subtle">{new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time>
                    <span>{ACTION[r.action] ?? r.action}{r.previous_status && r.new_status ? ` (${STATUS[r.previous_status]} → ${STATUS[r.new_status]})` : ""}{r.note ? ` — ${r.note}` : ""}</span>
                  </li>
                ))}</ol>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
