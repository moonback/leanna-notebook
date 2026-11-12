"use client";
import * as React from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { ArrowRight, Check, ChevronsDownUp, ChevronsUpDown, ExternalLink, Focus, GitMerge, Maximize2, Minimize2, Network, RefreshCw, ScanSearch, Scissors, Share2, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { Dialog, DialogContent, Tooltip } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Node = SimulationNodeDatum & { id: string; name: string; type: string; confidence: number; mention_count: number; source_count: number; degree: number; expandedBy?: string };
type Edge = { id: string; source_entity_id: string; target_entity_id: string; type: string; assertion: "explicit" | "inferred"; confidence: number; status: string; evidence_count: number; source_count: number; contested: boolean; expandedBy?: string };
type Link = SimulationLinkDatum<Node> & { edge: Edge };
type Stats = { sources: number; extraction: { ready: number; pending: number; failed: number }; lastSync: string | null; contradictions: { open: number; total: number }; activeResearch: number };
type Passage = { source_id: string; quote_text: string; char_start: number; char_end: number; page: number | null; source?: { title: string; origin_url: string | null; created_at: string } | null };

export const TYPE_LABEL: Record<string, string> = {
  person: "Personne", organization: "Organisation", company: "Entreprise", institution: "Institution", place: "Lieu", event: "Événement",
  date: "Date", product: "Produit", technology: "Technologie", concept: "Concept", document: "Document", project: "Projet", topic: "Sujet",
  law: "Loi / réglementation", other: "Autre",
};
// teintes moyennes lisibles sur fond clair comme sombre
const TYPE_COLOR: Record<string, string> = {
  person: "#3b82f6", organization: "#8b5cf6", company: "#a855f7", institution: "#6366f1", place: "#10b981", event: "#f59e0b",
  date: "#64748b", product: "#ec4899", technology: "#06b6d4", concept: "#94a3b8", document: "#a8a29e", project: "#84cc16", topic: "#14b8a6", law: "#ef4444",
};
const colorOf = (t: string) => TYPE_COLOR[t] ?? "#9ca3af";
const RELATION_LABEL: Record<string, string> = {
  works_for: "travaille pour", leads: "dirige", owns: "possède", funds: "finance", participates_in: "participe à", located_in: "est situé dans",
  created: "a créé", associated_with: "est associé à", involved_in: "est impliqué dans", related_to: "est lié à", announced: "a annoncé",
  replaced: "a remplacé", contradicts: "contredit", confirms: "confirme", precedes: "précède", succeeds: "succède à",
};
export const relLabel = (t: string) => RELATION_LABEL[t] ?? t.replace(/_/g, " ");
const radius = (n: Node) => 6 + Math.min(14, Math.sqrt(n.degree * 3 + n.mention_count));

/** Communautés par propagation d'étiquettes (déterministe) : regroupe visuellement les entités très connectées. */
export function communities(nodes: { id: string }[], edges: { source_entity_id: string; target_entity_id: string }[]): Map<string, string> {
  const label = new Map(nodes.map((n) => [n.id, n.id]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) { adj.get(e.source_entity_id)?.push(e.target_entity_id); adj.get(e.target_entity_id)?.push(e.source_entity_id); }
  const order = [...label.keys()].sort();
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const id of order) {
      const counts = new Map<string, number>();
      for (const nb of adj.get(id) ?? []) { const l = label.get(nb)!; counts.set(l, (counts.get(l) ?? 0) + 1); }
      if (!counts.size) continue;
      const best = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
      if (best !== label.get(id)) { label.set(id, best); changed = true; }
    }
    if (!changed) break;
  }
  return label;
}
const COMMUNITY_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#65a30d", "#dc2626", "#4f46e5", "#0d9488"];

export function KnowledgeGraph({ notebookId, canEdit, sources, onOpenPassage, onShowContradictions }: {
  notebookId: string; canEdit: boolean; sources: { id: string; title: string }[];
  onOpenPassage: (sourceId: string, start: number, end: number) => void; onShowContradictions?: () => void;
}) {
  const [nodes, setNodes] = React.useState<Node[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);
  const [totals, setTotals] = React.useState<{ entities: number; relations: number } | null>(null);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [types, setTypes] = React.useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [minConfidence, setMinConfidence] = React.useState(0);
  const [hideInferred, setHideInferred] = React.useState(false);
  const [limit, setLimit] = React.useState(150);
  const [byCommunity, setByCommunity] = React.useState(false);
  const [indirect, setIndirect] = React.useState(false);
  const [selection, setSelection] = React.useState<{ kind: "node" | "edge"; id: string } | null>(null);
  const [reindexing, setReindexing] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const activeFilters = (sourceFilter ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0) + (minConfidence > 0 ? 1 : 0) + (hideInferred ? 1 : 0) + (byCommunity ? 1 : 0) + (limit !== 150 ? 1 : 0);
  function resetFilters() { setSourceFilter(""); setFrom(""); setTo(""); setMinConfidence(0); setHideInferred(false); setByCommunity(false); setLimit(150); }
  React.useEffect(() => {
    if (!fullscreen || filtersOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, filtersOpen]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: String(limit), minConfidence: String(minConfidence) });
    if (types.size) qs.set("types", [...types].join(","));
    if (sourceFilter) qs.set("source", sourceFilter);
    if (from) qs.set("from", from);
    if (to) qs.set("to", `${to}T23:59:59Z`);
    try {
      const r = await fetch(`/api/v1/notebooks/${notebookId}/knowledge?${qs}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json() as { nodes: Node[]; edges: Edge[]; totals: { entities: number; relations: number }; stats: Stats };
      setNodes((old) => {
        const prev = new Map(old.map((n) => [n.id, n]));   // conserve les positions déjà calculées
        return j.nodes.map((n) => ({ ...n, x: prev.get(n.id)?.x, y: prev.get(n.id)?.y }));
      });
      setEdges(j.edges); setTotals(j.totals); setStats(j.stats); setError(false);
    } catch { setError(true); } finally { setLoading(false); }
  }, [notebookId, limit, minConfidence, types, sourceFilter, from, to]);
  React.useEffect(() => { void load(); }, [load]);
  // extraction en cours : le graphe se complète tout seul
  React.useEffect(() => {
    if (!stats?.extraction.pending) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [stats?.extraction.pending, load]);

  const visibleEdges = React.useMemo(() => edges.filter((e) => !hideInferred || e.assertion === "explicit"), [edges, hideInferred]);
  const community = React.useMemo(() => (byCommunity ? communities(nodes, visibleEdges) : null), [byCommunity, nodes, visibleEdges]);
  const communityColor = React.useMemo(() => {
    const ids = [...new Set(community?.values() ?? [])];
    return new Map(ids.map((id, i) => [id, COMMUNITY_COLORS[i % COMMUNITY_COLORS.length]!]));
  }, [community]);

  async function expand(nodeId: string) {
    const r = await fetch(`/api/v1/knowledge/entities/${nodeId}`, { cache: "no-store" });
    if (!r.ok) return toast({ title: "Relations indisponibles", tone: "error" });
    const j = await r.json() as { relations: Array<{ id: string; type: string; assertion: "explicit" | "inferred"; confidence: number; status: string; evidence_count: number; source_count: number; direction: "in" | "out"; other: Omit<Node, "degree"> }> };
    setNodes((old) => {
      const have = new Set(old.map((n) => n.id));
      const center = old.find((n) => n.id === nodeId);
      const fresh = j.relations.filter((rel) => rel.other && !have.has(rel.other.id)).map((rel) => ({ ...rel.other, degree: 1, expandedBy: nodeId, x: center?.x, y: center?.y }));
      return [...old, ...fresh.filter((n, i, a) => a.findIndex((x) => x.id === n.id) === i)];
    });
    setEdges((old) => {
      const have = new Set(old.map((e) => e.id));
      return [...old, ...j.relations.filter((rel) => !have.has(rel.id) && rel.other).map((rel) => ({
        id: rel.id, type: rel.type, assertion: rel.assertion, confidence: rel.confidence, status: rel.status, evidence_count: rel.evidence_count,
        source_count: rel.source_count, contested: false, expandedBy: nodeId,
        source_entity_id: rel.direction === "out" ? nodeId : rel.other.id, target_entity_id: rel.direction === "out" ? rel.other.id : nodeId,
      }))];
    });
  }
  function collapse(nodeId: string) {
    setNodes((old) => old.filter((n) => n.expandedBy !== nodeId));
    setEdges((old) => old.filter((e) => e.expandedBy !== nodeId));
  }
  async function focusEntity(id: string) {
    if (!nodes.some((n) => n.id === id)) {
      const r = await fetch(`/api/v1/knowledge/entities/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json() as { entity: Omit<Node, "degree"> };
      setNodes((old) => [...old, { ...j.entity, degree: 0, expandedBy: "search" }]);
      await expand(id);
    }
    setSelection({ kind: "node", id });
  }
  async function reindex() {
    setReindexing(true);
    try {
      const r = await fetch(`/api/v1/notebooks/${notebookId}/knowledge/reindex`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) throw new Error();
      toast({ title: "Réindexation lancée", description: `${j.queued} source(s) en file d’extraction.`, tone: "success" });
      void load();
    } catch { toast({ title: "Réindexation impossible", tone: "error" }); } finally { setReindexing(false); }
  }

  const presentTypes = [...new Set([...nodes.map((n) => n.type), ...types])].sort();
  const empty = !loading && !error && nodes.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-col", fullscreen ? "fixed inset-0 z-[45] bg-surface-raised" : "h-full")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b px-3 py-2 sm:px-4">
        {stats && (
          <>
            <dl className="flex items-center gap-1.5">
              <Stat label="Sources" value={stats.sources} />
              <Stat label="Entités" value={totals?.entities ?? 0} />
              <Stat label="Relations" value={totals?.relations ?? 0} />
              {onShowContradictions && (
                <Stat
                  label="Contradictions"
                  value={stats.contradictions.open}
                  icon={<TriangleAlert className="size-3" aria-hidden />}
                  warn={stats.contradictions.open > 0}
                  onClick={onShowContradictions}
                  title="Voir les contradictions à vérifier"
                />
              )}
            </dl>
            {stats.extraction.pending > 0 && (
              <span role="status" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                <span className="relative flex size-2" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-accent" />
                </span>
                {stats.extraction.pending} source{stats.extraction.pending > 1 ? "s" : ""} en cours d’analyse
              </span>
            )}
            {stats.extraction.failed > 0 && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
                <TriangleAlert className="size-3" aria-hidden />
                {stats.extraction.failed} échec{stats.extraction.failed > 1 ? "s" : ""} d’extraction
              </span>
            )}
            {stats.activeResearch > 0 && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-surface px-2.5 py-1 text-xs text-text-muted">
                <ScanSearch className="size-3" aria-hidden />
                {stats.activeResearch} recherche{stats.activeResearch > 1 ? "s" : ""} en cours
              </span>
            )}
            <span className="hidden whitespace-nowrap text-[11px] text-text-muted xl:inline" title="Dernière synchronisation">
              Synchronisé : {stats.lastSync ? new Date(stats.lastSync).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "jamais"}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <EntitySearch notebookId={notebookId} onPick={(id) => void focusEntity(id)} />
          <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
            <Button size="sm" variant="secondary" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal aria-hidden /> Filtres{activeFilters > 0 && <Badge>{activeFilters}</Badge>}
            </Button>
            <DialogContent title="Filtres du graphe" description="Affinez les entités et relations affichées." size="md">
              <div className="grid gap-4">
                <label className="grid gap-1 text-sm">Source
                  <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-9 rounded-md border border-border-input bg-surface-raised px-2 text-sm">
                    <option value="">Toutes les sources</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm">Du <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-border-input bg-surface-raised px-2 text-sm" /></label>
                  <label className="grid gap-1 text-sm">Au <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-border-input bg-surface-raised px-2 text-sm" /></label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm">Confiance des relations
                    <select value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} className="h-9 rounded-md border border-border-input bg-surface-raised px-2 text-sm">
                      <option value={0}>Toutes</option><option value={0.5}>≥ 50 %</option><option value={0.8}>≥ 80 %</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">Nombre de nœuds
                    <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-9 rounded-md border border-border-input bg-surface-raised px-2 text-sm">
                      {[50, 150, 300, 500].map((n) => <option key={n} value={n}>{n} max</option>)}
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hideInferred} onChange={(e) => setHideInferred(e.target.checked)} /> Faits déclarés seulement</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={byCommunity} onChange={(e) => setByCommunity(e.target.checked)} /> Regrouper par communauté</label>
                <div className="flex justify-between gap-2 border-t pt-4">
                  <Button variant="ghost" onClick={resetFilters}>Réinitialiser</Button>
                  <Button onClick={() => setFiltersOpen(false)}>Terminé</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Tooltip label={fullscreen ? "Quitter le plein écran" : "Plein écran"}>
            <Button size="icon-sm" variant="ghost" aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"} aria-pressed={fullscreen} onClick={() => setFullscreen((v) => !v)}>
              {fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </Button>
          </Tooltip>
          {canEdit && (
            <Tooltip label="Réindexer">
              <Button size="icon-sm" variant="ghost" aria-label="Réindexer" loading={reindexing} onClick={() => void reindex()}><RefreshCw aria-hidden /></Button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[320px] min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          {error ? <div className="p-6"><Alert tone="danger" title="Graphe indisponible" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Réessayer</Button>} /></div>
            : loading && nodes.length === 0 ? <div className="grid h-full place-items-center p-6"><Skeleton className="size-48 rounded-full" /></div>
            : empty ? (
              <EmptyState icon={<Network />} title={types.size || sourceFilter || from || to ? "Aucune entité pour ces filtres" : "Le graphe est vide pour l’instant"}>
                {stats?.extraction.pending ? `${stats.extraction.pending} source(s) en cours d’analyse : les entités apparaîtront automatiquement.`
                  : "Le graphe se construit automatiquement à partir des sources indexées (entités, relations et passages qui les justifient)."}
              </EmptyState>
            ) : (
              <GraphCanvas nodes={nodes} edges={visibleEdges} selection={selection} indirect={indirect}
                colorFor={(n) => (community ? communityColor.get(community.get(n.id) ?? "") ?? colorOf(n.type) : colorOf(n.type))}
                onSelect={setSelection} onExpand={(id) => void expand(id)} />
            )}
        </div>
        {presentTypes.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t bg-surface-raised px-3 py-2" role="group" aria-label="Légende : filtrer par type d’entité">
            <span className="mr-1 text-xs font-medium text-text-muted">Légende</span>
            {presentTypes.map((t) => (
              <button key={t} type="button" aria-pressed={types.has(t)} onClick={() => setTypes((old) => { const n = new Set(old); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-pill border px-2.5 text-xs", types.has(t) ? "border-accent bg-accent-soft text-on-accent-soft" : "text-text-muted hover:border-border-strong")}>
                <span aria-hidden className="size-2 rounded-full" style={{ background: colorOf(t) }} />{TYPE_LABEL[t] ?? t}
              </button>
            ))}
            {types.size > 0 && <button type="button" className="text-xs text-accent underline-offset-2 hover:underline" onClick={() => setTypes(new Set())}>Tout afficher</button>}
          </div>
        )}
        </div>
        {selection && (
          <aside className="max-h-[50dvh] min-h-0 w-full shrink-0 overflow-y-auto border-t bg-surface-raised lg:max-h-none lg:w-[360px] lg:border-l lg:border-t-0" aria-label="Détails">
            {selection.kind === "node"
              ? <EntityPanel key={selection.id} id={selection.id} canEdit={canEdit} notebookId={notebookId} inGraph={(id) => nodes.some((n) => n.id === id)} expanded={nodes.some((n) => n.expandedBy === selection.id)}
                  indirect={indirect} onToggleIndirect={() => setIndirect((v) => !v)} onExpand={() => void expand(selection.id)} onCollapse={() => collapse(selection.id)}
                  onClose={() => setSelection(null)} onOpenPassage={onOpenPassage} onSelectRelation={(id) => setSelection({ kind: "edge", id })} onSelectEntity={(id) => void focusEntity(id)}
                  onChanged={(next) => { void load(); setSelection(next ? { kind: "node", id: next } : null); }} />
              : <RelationPanel key={selection.id} id={selection.id} canEdit={canEdit} onClose={() => setSelection(null)} onOpenPassage={onOpenPassage}
                  onSelectEntity={(id) => void focusEntity(id)} onSelectRelation={(id) => setSelection({ kind: "edge", id })} onChanged={() => void load()} />}
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon, warn, onClick, title }: { label: string; value: number; icon?: React.ReactNode; warn?: boolean; onClick?: () => void; title?: string }) {
  return (
    <div className={cn("relative flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-surface px-2.5 py-1 text-xs", warn && "border-danger/30 bg-danger/5", onClick && "transition-colors hover:bg-surface-raised")}>
      <dd className={cn("order-2 font-semibold tabular-nums", warn ? "text-danger" : "text-text")}>{value.toLocaleString("fr-FR")}</dd>
      <dt className="order-1 flex items-center gap-1 text-text-muted">{icon}{label}</dt>
      {onClick && <button type="button" onClick={onClick} title={title} aria-label={title ?? label} className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-accent" />}
    </div>
  );
}

function EntitySearch({ notebookId, onPick, placeholder = "Rechercher une entité…", exclude }: { notebookId: string; onPick: (id: string, name: string) => void; placeholder?: string; exclude?: string }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Array<{ id: string; name: string; type: string; source_count: number }>>([]);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/notebooks/${notebookId}/knowledge/entities?q=${encodeURIComponent(q.trim())}&pageSize=8`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { entities: [] })).then((j) => { setResults(j.entities); setOpen(true); }).catch(() => undefined);
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, notebookId]);
  const list = results.filter((r) => r.id !== exclude);
  return (
    <div className="relative w-full max-w-64">
      <ScanSearch aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
      <Input role="combobox" aria-expanded={open && list.length > 0} aria-controls="kg-search-list" aria-label={placeholder} value={q} placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} className="h-8 pl-8" />
      {open && list.length > 0 && (
        <ul id="kg-search-list" role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-surface-raised py-1 shadow-card">
          {list.map((r) => (
            <li key={r.id} role="option" aria-selected={false}>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(r.id, r.name); setQ(""); setOpen(false); }}>
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: colorOf(r.type) }} /><span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="text-xs text-text-subtle">{TYPE_LABEL[r.type] ?? r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Rendu SVG + simulation de forces : déplacement des nœuds, zoom molette/pincement, déplacement de la caméra. */
function GraphCanvas({ nodes, edges, selection, indirect, colorFor, onSelect, onExpand }: {
  nodes: Node[]; edges: Edge[]; selection: { kind: "node" | "edge"; id: string } | null; indirect: boolean;
  colorFor: (n: Node) => string; onSelect: (s: { kind: "node" | "edge"; id: string } | null) => void; onExpand: (id: string) => void;
}) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const sim = React.useRef<Simulation<Node, Link> | null>(null);
  const [size, setSize] = React.useState({ w: 800, h: 500 });
  const [view, setView] = React.useState({ x: 0, y: 0, k: 1 });
  const [, setFrame] = React.useState(0);
  const drag = React.useRef<{ kind: "node"; node: Node; moved: boolean } | { kind: "pan"; x: number; y: number; vx: number; vy: number } | null>(null);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<number | null>(null);
  const lastTap = React.useRef<{ id: string; t: number } | null>(null);

  React.useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, e!.contentRect.width), h: Math.max(240, e!.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byId = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const links = React.useMemo<Link[]>(() => edges.filter((e) => byId.has(e.source_entity_id) && byId.has(e.target_entity_id))
    .map((e) => ({ source: e.source_entity_id, target: e.target_entity_id, edge: e })), [edges, byId]);

  React.useEffect(() => {
    let raf = 0;
    const s = forceSimulation<Node, Link>(nodes)
      .force("link", forceLink<Node, Link>(links).id((d) => d.id).distance((l) => 60 + 40 / Math.max(1, l.edge.evidence_count)).strength(0.4))
      .force("charge", forceManyBody<Node>().strength(-180).distanceMax(500))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<Node>().radius((d) => radius(d) + 6))
      .alphaDecay(0.035)
      .on("tick", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setFrame((f) => f + 1)); });
    sim.current = s;
    return () => { s.stop(); cancelAnimationFrame(raf); };
  }, [nodes, links]);

  const fit = React.useCallback(() => {
    if (!nodes.length) return;
    const xs = nodes.map((n) => n.x ?? 0), ys = nodes.map((n) => n.y ?? 0);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(2, Math.max(0.15, Math.min(size.w / (maxX - minX + 120), size.h / (maxY - minY + 120))));
    setView({ k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k });
  }, [nodes, size]);
  React.useEffect(() => { const t = setTimeout(fit, 900); return () => clearTimeout(t); }, [nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // voisinage du nœud sélectionné (1 saut, ou 2 sauts pour les connexions indirectes)
  const focus = React.useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "edge") {
      const e = edges.find((x) => x.id === selection.id);
      return e ? new Set([e.source_entity_id, e.target_entity_id]) : null;
    }
    const adj = new Map<string, string[]>();
    for (const e of edges) { adj.set(e.source_entity_id, [...(adj.get(e.source_entity_id) ?? []), e.target_entity_id]); adj.set(e.target_entity_id, [...(adj.get(e.target_entity_id) ?? []), e.source_entity_id]); }
    const seen = new Set([selection.id]);
    let frontier = [selection.id];
    for (let hop = 0; hop < (indirect ? 2 : 1); hop++) {
      frontier = frontier.flatMap((id) => adj.get(id) ?? []).filter((id) => !seen.has(id));
      frontier.forEach((id) => seen.add(id));
    }
    return seen;
  }, [selection, edges, indirect]);

  const toWorld = (cx: number, cy: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    return { x: (cx - rect.left - size.w / 2 - view.x) / view.k, y: (cy - rect.top - size.h / 2 - view.y) / view.k };
  };
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const px = cx - rect.left - size.w / 2, py = cy - rect.top - size.h / 2;
    setView((v) => {
      const k = Math.min(4, Math.max(0.1, v.k * factor));
      return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
    });
  };

  return (
    <div ref={wrap} className="absolute inset-0 touch-none select-none overflow-hidden bg-surface"
      // le pan du graphe ne doit pas déclencher le balayage entre onglets mobiles du notebook
      onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
      onWheel={(e) => zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12)}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y); drag.current = null; return; }
        if (!drag.current) drag.current = { kind: "pan", x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, d / pinch.current); pinch.current = d; return;
        }
        const d = drag.current;
        if (d?.kind === "pan") setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
        if (d?.kind === "node") { const p = toWorld(e.clientX, e.clientY); d.node.fx = p.x; d.node.fy = p.y; d.moved = true; sim.current?.alphaTarget(0.25).restart(); }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        const d = drag.current;
        drag.current = null;
        if (d?.kind === "node") {
          sim.current?.alphaTarget(0); d.node.fx = null; d.node.fy = null;
          if (!d.moved) {
            // double clic / double tap détecté ici : la capture du pointeur empêche un dblclick fiable sur le nœud
            const now = Date.now(), prev = lastTap.current;
            if (prev && prev.id === d.node.id && now - prev.t < 350) { lastTap.current = null; onExpand(d.node.id); }
            else { lastTap.current = { id: d.node.id, t: now }; onSelect({ kind: "node", id: d.node.id }); }
          }
        }
        else if (d?.kind === "pan" && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 4 && (e.target as Element).tagName === "svg") onSelect(null);
      }}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}>
      <svg width={size.w} height={size.h} role="group" aria-label={`Graphe de connaissances : ${nodes.length} entités, ${links.length} relations`}>
        <defs>
          <marker id="kg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--border-strong)" /></marker>
        </defs>
        <g transform={`translate(${size.w / 2 + view.x},${size.h / 2 + view.y}) scale(${view.k})`}>
          {links.map((l) => {
            const s = l.source as Node, t = l.target as Node, e = l.edge;
            if (s.x == null || t.x == null) return null;
            const dim = focus && !(focus.has(s.id) && focus.has(t.id));
            const selected = selection?.kind === "edge" && selection.id === e.id;
            const dx = t.x - s.x!, dy = t.y! - s.y!, len = Math.hypot(dx, dy) || 1, rt = radius(t) + 2;
            return (
              <g key={e.id} className="cursor-pointer" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onSelect({ kind: "edge", id: e.id })} opacity={dim ? 0.12 : 0.35 + e.confidence * 0.65}>
                <line x1={s.x} y1={s.y} x2={t.x - (dx / len) * rt} y2={t.y! - (dy / len) * rt} stroke="transparent" strokeWidth={12} />
                <line x1={s.x} y1={s.y} x2={t.x - (dx / len) * rt} y2={t.y! - (dy / len) * rt} markerEnd="url(#kg-arrow)"
                  stroke={e.contested ? "var(--danger)" : selected ? "var(--accent)" : "var(--border-strong)"} strokeWidth={Math.min(6, 1 + Math.log2(1 + e.evidence_count)) / Math.sqrt(view.k)}
                  strokeDasharray={e.assertion === "inferred" ? "5 4" : undefined}><title>{`${s.name} ${relLabel(e.type)} ${t.name} — ${e.assertion === "inferred" ? "hypothèse (déduite)" : "déclarée"}, confiance ${Math.round(e.confidence * 100)} %${e.contested ? ", contestée" : ""}`}</title></line>
                {(selected || view.k > 1.6) && <text x={(s.x + t.x) / 2} y={(s.y! + t.y!) / 2} fontSize={10 / view.k} textAnchor="middle" fill="var(--text-muted)">{relLabel(e.type)}</text>}
              </g>
            );
          })}
          {nodes.map((n) => {
            if (n.x == null) return null;
            const dim = focus && !focus.has(n.id);
            const selected = selection?.kind === "node" && selection.id === n.id;
            const r = radius(n);
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.2 : 1} className="cursor-pointer" tabIndex={0} role="button"
                aria-label={`${n.name}, ${TYPE_LABEL[n.type] ?? n.type}, ${n.degree} relation(s)`} aria-pressed={selected}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect({ kind: "node", id: n.id }); } }}
                onPointerDown={(e) => { e.stopPropagation(); drag.current = { kind: "node", node: n, moved: false }; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement | null)?.setPointerCapture(e.pointerId); }}>
                <circle r={r} fill={colorFor(n)} fillOpacity={0.35 + n.confidence * 0.6} stroke={selected ? "var(--text)" : "var(--surface-raised)"} strokeWidth={selected ? 3 : 1.5} />
                {n.expandedBy && <circle r={r + 3} fill="none" stroke={colorFor(n)} strokeDasharray="2 3" strokeWidth={1} />}
                {(view.k > 0.55 || selected || n.degree > 3) && <text y={r + 11 / view.k} fontSize={11 / Math.max(0.7, view.k)} textAnchor="middle" fill="var(--text)" paintOrder="stroke" stroke="var(--surface)" strokeWidth={3 / view.k}>{n.name.length > 28 ? `${n.name.slice(0, 27)}…` : n.name}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <Button size="icon-sm" variant="secondary" aria-label="Zoomer" onClick={() => setView((v) => ({ ...v, k: Math.min(4, v.k * 1.25), x: v.x * 1.25, y: v.y * 1.25 }))}>+</Button>
        <Button size="icon-sm" variant="secondary" aria-label="Dézoomer" onClick={() => setView((v) => ({ ...v, k: Math.max(0.1, v.k / 1.25), x: v.x / 1.25, y: v.y / 1.25 }))}>−</Button>
        <Button size="icon-sm" variant="secondary" aria-label="Recentrer le graphe" onClick={fit}><Focus aria-hidden /></Button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden text-xs text-text-subtle sm:block">Glisser pour déplacer · molette pour zoomer · double-clic pour déplier · trait pointillé = relation déduite · rouge = contestée</p>
    </div>
  );
}

function PassageButton({ p, onOpenPassage }: { p: Passage; onOpenPassage: (sourceId: string, start: number, end: number) => void }) {
  return (
    <li className="grid gap-1">
      <button type="button" onClick={() => onOpenPassage(p.source_id, p.char_start, p.char_end)} className="rounded-md border-l-2 border-accent bg-surface px-3 py-2 text-left font-serif text-xs leading-5 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus">
        « {p.quote_text} »
      </button>
      <span className="flex flex-wrap items-center gap-x-2 text-2xs text-text-subtle">
        <span className="truncate">{p.source?.title ?? "Source"}</span>{p.page ? <span>p. {p.page}</span> : null}
        {p.source?.created_at && <span>ajoutée le {new Date(p.source.created_at).toLocaleDateString("fr-FR")}</span>}
        {p.source?.origin_url && <a href={p.source.origin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline"><ExternalLink className="size-3" aria-hidden />original</a>}
      </span>
    </li>
  );
}

type EntityDetail = {
  entity: { id: string; name: string; type: string; description: string | null; confidence: number; mention_count: number; source_count: number; first_seen_at: string | null; last_seen_at: string | null };
  aliases: Array<{ id: string; alias: string; origin: string }>;
  mentions: Array<Passage & { id: string; surface_form: string }>;
  claims: Array<Passage & { id: string; attribute_label: string; value_text: string; context: string | null; observed_at: string | null }>;
  relations: Array<{ id: string; type: string; assertion: string; confidence: number; status: string; evidence_count: number; direction: "in" | "out"; other: { id: string; name: string; type: string } | null }>;
  history: Array<{ id: string; action: string; snapshot: { merged?: { name: string }; alias?: string }; reason: string | null; created_at: string }>;
};

function EntityPanel({ id, canEdit, notebookId, inGraph, expanded, indirect, onToggleIndirect, onExpand, onCollapse, onClose, onOpenPassage, onSelectRelation, onSelectEntity, onChanged }: {
  id: string; canEdit: boolean; notebookId: string; inGraph: (id: string) => boolean; expanded: boolean; indirect: boolean; onToggleIndirect: () => void;
  onExpand: () => void; onCollapse: () => void; onClose: () => void; onOpenPassage: (s: string, a: number, b: number) => void;
  onSelectRelation: (id: string) => void; onSelectEntity: (id: string) => void; onChanged: (next: string | null) => void;
}) {
  const [d, setD] = React.useState<EntityDetail | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [merging, setMerging] = React.useState(false);
  const [confirm, confirmDialog] = useConfirm();
  React.useEffect(() => {
    fetch(`/api/v1/knowledge/entities/${id}`, { cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error(); setD(await r.json()); }).catch(() => setFailed(true));
  }, [id]);
  async function post(body: object, success: string) {
    const r = await fetch(`/api/v1/knowledge/entities/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast({ title: "Opération impossible", tone: "error" });
    toast({ title: success, tone: "success" });
    onChanged(j.entityId ?? null);
  }
  if (failed) return <PanelShell title="Entité" onClose={onClose}><Alert tone="danger" title="Entité indisponible (supprimée ou fusionnée)." /></PanelShell>;
  if (!d) return <PanelShell title="Entité" onClose={onClose}><div className="grid gap-2" aria-busy="true"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-20" /></div></PanelShell>;
  const e = d.entity;
  return (
    <PanelShell title={e.name} onClose={onClose}>
      {confirmDialog}
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-full" style={{ background: colorOf(e.type) }} />{TYPE_LABEL[e.type] ?? e.type}</span>
        <span>· confiance {Math.round(e.confidence * 100)} %</span><span>· {e.source_count} source(s)</span><span>· {e.mention_count} mention(s)</span><span>· {d.relations.length} relation(s)</span>
      </div>
      {e.description && <p className="text-sm">{e.description}</p>}
      <p className="text-2xs text-text-subtle">Première apparition {e.first_seen_at ? new Date(e.first_seen_at).toLocaleDateString("fr-FR") : "—"} · dernière {e.last_seen_at ? new Date(e.last_seen_at).toLocaleDateString("fr-FR") : "—"}</p>
      <div className="flex flex-wrap gap-2">
        {expanded ? <Button size="sm" variant="secondary" onClick={onCollapse}><ChevronsDownUp aria-hidden /> Replier</Button> : <Button size="sm" variant="secondary" onClick={onExpand}><ChevronsUpDown aria-hidden /> Déplier les relations</Button>}
        <Button size="sm" variant={indirect ? "soft" : "ghost"} aria-pressed={indirect} onClick={onToggleIndirect}><Share2 aria-hidden /> Connexions indirectes</Button>
      </div>
      {d.aliases.length > 1 && (
        <PanelSection title="Alias">
          <ul className="flex flex-wrap gap-1.5">
            {d.aliases.map((a) => (
              <li key={a.id} className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-xs">{a.alias}
                {canEdit && a.alias !== e.name && <button type="button" aria-label={`Séparer l’alias ${a.alias}`} title="Séparer : en faire une entité distincte" className="text-text-subtle hover:text-danger"
                  onClick={async () => { if (await confirm({ title: `Séparer « ${a.alias} » ?`, description: "Les mentions écrites sous cette forme deviendront une entité distincte.", confirmLabel: "Séparer" })) void post({ action: "split", aliasId: a.id }, "Alias séparé"); }}><Scissors className="size-3" aria-hidden /></button>}
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
      {canEdit && (merging ? (
        <div className="grid gap-2 rounded-md border p-2">
          <p className="text-xs text-text-muted">Fusionner « {e.name} » dans :</p>
          <EntitySearch notebookId={notebookId} exclude={e.id} placeholder="Entité cible…" onPick={async (target, name) => {
            if (await confirm({ title: `Fusionner dans « ${name} » ?`, description: "Mentions, alias, relations et affirmations seront rattachés à l’entité cible. L’opération est tracée dans l’historique.", confirmLabel: "Fusionner" })) void post({ action: "merge", intoId: target }, "Entités fusionnées");
          }} />
          <Button size="sm" variant="ghost" onClick={() => setMerging(false)}>Annuler</Button>
        </div>
      ) : <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setMerging(true)}><GitMerge aria-hidden /> Fusionner avec une autre entité…</Button>)}

      <PanelSection title={`Relations (${d.relations.length})`}>
        <ul className="grid gap-1">
          {d.relations.map((r) => r.other && (
            <li key={r.id} className="flex items-center gap-1 text-sm">
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => (inGraph(r.other!.id) ? onSelectRelation(r.id) : onSelectEntity(r.other!.id))}>
                {r.direction === "out" ? <>{relLabel(r.type)} <ArrowRight className="inline size-3" aria-hidden /> <strong>{r.other.name}</strong></> : <><strong>{r.other.name}</strong> {relLabel(r.type)} <ArrowRight className="inline size-3" aria-hidden /> ceci</>}
              </button>
              {r.assertion === "inferred" && <Badge tone="warning">hypothèse</Badge>}{r.status === "confirmed" && <Badge tone="success">validée</Badge>}
            </li>
          ))}
        </ul>
      </PanelSection>
      {d.claims.length > 0 && (
        <PanelSection title={`Affirmations (${d.claims.length})`}>
          <ul className="grid gap-3">{d.claims.map((c) => (
            <li key={c.id} className="grid gap-1"><span className="text-sm"><strong>{c.attribute_label}</strong> : {c.value_text}{c.context ? ` (${c.context})` : ""}{c.observed_at ? ` — ${c.observed_at}` : ""}</span>
              <ul><PassageButton p={c} onOpenPassage={onOpenPassage} /></ul></li>
          ))}</ul>
        </PanelSection>
      )}
      <PanelSection title={`Passages documentaires (${d.mentions.length})`}>
        <ul className="grid gap-3">{d.mentions.map((m) => <PassageButton key={m.id} p={m} onOpenPassage={onOpenPassage} />)}</ul>
      </PanelSection>
      {d.history.length > 0 && (
        <PanelSection title="Historique">
          <ul className="grid gap-1 text-xs text-text-muted">{d.history.map((h) => (
            <li key={h.id}>{new Date(h.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} — {h.action === "merge" ? `fusion de « ${h.snapshot.merged?.name ?? "?"} »` : `séparation de l’alias « ${h.snapshot.alias ?? "?"} »`}{h.reason ? ` (${h.reason})` : ""}</li>
          ))}</ul>
        </PanelSection>
      )}
    </PanelShell>
  );
}

type RelationDetail = {
  relation: { id: string; type: string; description: string | null; assertion: string; confidence: number; status: string; valid_from: string | null; valid_to: string | null; source_count: number; source: { id: string; name: string; type: string }; target: { id: string; name: string; type: string } };
  evidence: Array<Passage & { id: string; stance: "supports" | "contradicts" }>;
  parallel: Array<{ id: string; type: string; assertion: string; confidence: number }>;
  contradictions: Array<{ id: string; attribute: string; kind: string; status: string; explanation: string }>;
};

function RelationPanel({ id, canEdit, onClose, onOpenPassage, onSelectEntity, onSelectRelation, onChanged }: {
  id: string; canEdit: boolean; onClose: () => void; onOpenPassage: (s: string, a: number, b: number) => void; onSelectEntity: (id: string) => void; onSelectRelation: (id: string) => void; onChanged: () => void;
}) {
  const [d, setD] = React.useState<RelationDetail | null>(null);
  const [failed, setFailed] = React.useState(false);
  const load = React.useCallback(() => fetch(`/api/v1/knowledge/relations/${id}`, { cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error(); setD(await r.json()); }).catch(() => setFailed(true)), [id]);
  React.useEffect(() => { void load(); }, [load]);
  async function review(status: string) {
    const r = await fetch(`/api/v1/knowledge/relations/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!r.ok) return toast({ title: "Validation impossible", tone: "error" });
    void load(); onChanged();
  }
  if (failed) return <PanelShell title="Relation" onClose={onClose}><Alert tone="danger" title="Relation indisponible." /></PanelShell>;
  if (!d) return <PanelShell title="Relation" onClose={onClose}><div className="grid gap-2" aria-busy="true"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-20" /></div></PanelShell>;
  const r = d.relation;
  const supports = d.evidence.filter((e) => e.stance === "supports"), against = d.evidence.filter((e) => e.stance === "contradicts");
  return (
    <PanelShell title="Pourquoi ce lien ?" onClose={onClose}>
      <p className="text-sm">
        <button type="button" className="font-semibold hover:underline" onClick={() => onSelectEntity(r.source.id)}>{r.source.name}</button> {relLabel(r.type)}{" "}
        <button type="button" className="font-semibold hover:underline" onClick={() => onSelectEntity(r.target.id)}>{r.target.name}</button>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={r.assertion === "explicit" ? "accent" : "warning"}>{r.assertion === "explicit" ? "déclarée dans les sources" : "hypothèse déduite"}</Badge>
        <Badge>confiance {Math.round(r.confidence * 100)} %</Badge><Badge>{r.source_count} source(s)</Badge>
        {r.status === "confirmed" && <Badge tone="success">validée</Badge>}{r.status === "rejected" && <Badge tone="danger">rejetée</Badge>}
        {against.length > 0 && <Badge tone="danger">contestée</Badge>}
      </div>
      {r.description && <p className="text-sm text-text-muted">{r.description}</p>}
      {(r.valid_from || r.valid_to) && <p className="text-xs text-text-muted">Validité : {r.valid_from ?? "?"} → {r.valid_to ?? "?"}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={r.status === "confirmed" ? "soft" : "secondary"} onClick={() => void review("confirmed")}><Check aria-hidden /> Valider</Button>
          <Button size="sm" variant="ghost" onClick={() => void review("rejected")}><X aria-hidden /> Rejeter</Button>
          {r.status !== "unreviewed" && <Button size="sm" variant="ghost" onClick={() => void review("unreviewed")}>À revoir</Button>}
        </div>
      )}
      <PanelSection title={`Passages justificatifs (${supports.length})`}>
        <ul className="grid gap-3">{supports.map((e) => <PassageButton key={e.id} p={e} onOpenPassage={onOpenPassage} />)}</ul>
      </PanelSection>
      {against.length > 0 && <PanelSection title={`Passages contradictoires (${against.length})`}><ul className="grid gap-3">{against.map((e) => <PassageButton key={e.id} p={e} onOpenPassage={onOpenPassage} />)}</ul></PanelSection>}
      {d.parallel.length > 0 && (
        <PanelSection title="Autres relations entre ces entités">
          <ul className="grid gap-1 text-sm">{d.parallel.map((p) => <li key={p.id}><button type="button" className="hover:underline" onClick={() => onSelectRelation(p.id)}>{relLabel(p.type)}</button>{p.assertion === "inferred" && " (hypothèse)"}</li>)}</ul>
        </PanelSection>
      )}
      {d.contradictions.length > 0 && (
        <PanelSection title="Contradictions liées">
          <ul className="grid gap-1 text-sm">{d.contradictions.map((c) => <li key={c.id} className="flex gap-2"><TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />{c.explanation}</li>)}</ul>
        </PanelSection>
      )}
    </PanelShell>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 p-4">
      <div className="flex items-start justify-between gap-2"><h3 className="text-base font-semibold text-pretty">{title}</h3>
        <Button size="icon-sm" variant="ghost" aria-label="Fermer les détails" onClick={onClose}><X aria-hidden /></Button></div>
      {children}
    </div>
  );
}
function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h4>{children}</section>;
}
