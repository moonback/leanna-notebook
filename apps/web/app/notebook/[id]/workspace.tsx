"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowUp, AudioLines, Bold, BookmarkPlus, BrainCircuit, Code, Eraser, Heading2, Italic, List, ListOrdered, Quote, Settings2, ThumbsDown, ThumbsUp, FileText, Globe, Inbox, Lock, NotebookPen, Pencil, Plus, Square, Sparkles, Trash2, Type, Upload, Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, FolderOpen, Telescope, Network, Scale, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert, Badge, EmptyState, Progress, Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogClose, DialogContent, Tooltip } from "@/components/ui/overlay";
import { useConfirm } from "@/components/ui/confirm";
import { Checkbox, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { ListRow, Panel } from "@/components/ui/surfaces";
import { Markdown } from "@/components/ui/markdown";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Studio } from "./studio";
import { NotebookActionsMenu } from "./notebook-actions-menu";
import { FastResearch } from "./fast-research";
import { VoiceAssistant } from "./voice-assistant";
import { DeepResearch } from "./deep-research";
import { KnowledgeGraph } from "./knowledge-graph";
import { Contradictions } from "./contradictions";
import type { NumberedVoicePassage } from "./voice-turn";

export type Role = "chat" | "viewer" | "editor" | "owner";
type Source = { id: string; kind: string; title: string; status: string; error_code: string | null; word_count: number | null };
type Cite = { marker: number; source_id: string; quote_text: string; char_start: number; char_end: number; verified: boolean };
type Overview = { text: string | null; questions: string[]; pending: boolean; readySources: number };
type Message = { id: string; role: "user" | "assistant"; content: string; status: string; citations?: Cite[]; feedback?: number | null; thoughts?: string | null };

const ERRORS: Record<string, string> = {
  protected_pdf: "PDF protégé : retirez la protection puis réimportez-le.",
  needs_ocr: "PDF scanné sans texte : la reconnaissance de texte n’est pas encore disponible.",
  unreadable_file: "Fichier illisible ou corrompu.",
  empty_content: "Aucun texte exploitable dans cette source.",
  too_many_words: "Source trop longue (plus de 500 000 mots).",
  paywall: "Page réservée aux abonnés : contenu inaccessible.",
  url_refused: "Adresse refusée ou injoignable.",
  unsupported_type: "Type de fichier non pris en charge.",
  transcription_not_configured: "La transcription audio n’est pas configurée côté serveur.",
  transcription_config: "Le service de transcription audio est mal configuré.",
  no_speech: "Aucune parole exploitable détectée dans ce fichier audio.",
  embeddings_config: "Indexation impossible : configuration des embeddings invalide.",
  file_missing: "Fichier introuvable : réimportez-le.",
  temporary_error: "Erreur temporaire : nouvelle tentative en cours.",
  lease_expired: "Le traitement a été interrompu. Supprimez puis réimportez la source.",
  archive_too_large: "Fichier compressé trop volumineux une fois décompressé.",
};
const KIND_ICON: Record<string, React.ReactNode> = { web: <Globe />, text: <Type />, note: <NotebookPen />, audio: <AudioLines /> };
const busyStatus = (s: string) => s === "pending" || s === "processing";

/** Vrai si la requête média correspond (suit le redimensionnement). Rendu serveur : vue bureau. */
function useMediaQuery(query: string): boolean {
  return React.useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

export function Workspace({ notebookId, initialTitle, role, allowCopies, disabledFeatures = [], browserEnabled = false }: { notebookId: string; initialTitle: string; role: Role; allowCopies: boolean; disabledFeatures?: string[]; browserEnabled?: boolean }) {
  const canEdit = role === "editor" || role === "owner";
  const [title, setTitle] = React.useState(initialTitle);
  const [titleSlot, setTitleSlot] = React.useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setTitleSlot(document.getElementById("app-header-title"));
    setActionsSlot(document.getElementById("app-header-notebook-actions"));
  }, []);
  const [sources, setSources] = React.useState<Source[] | null>(null);
  const [deselected, setDeselected] = React.useState<Set<string>>(new Set());
  const [loadError, setLoadError] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [researching, setResearching] = React.useState(false);
  const [viewer, setViewer] = React.useState<{ sourceId: string; range?: [number, number]; timeStartMs?: number } | null>(null);
  const [noteEditor, setNoteEditor] = React.useState<{ id?: string } | null>(null);
  const [renaming, setRenaming] = React.useState<Source | null>(null);
  const [mobileTab, setMobileTab] = React.useState("chat");
  const [center, setCenter] = React.useState<"chat" | "research" | "graph" | "contradictions">("chat");
  const [researchRun, setResearchRun] = React.useState<string | null>(null);
  // suivi flottant : « Suivre » ouvre l'onglet Recherche sur la bonne recherche (?research=<id> ou événement)
  React.useEffect(() => {
    const open = (runId: string) => {
      if (disabledFeatures.includes("deep_research")) return;
      setCenter("research"); setMobileTab("chat"); setResearchRun(runId);
    };
    const fromUrl = new URLSearchParams(window.location.search).get("research");
    if (fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl)) open(fromUrl);
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ notebookId: string; runId: string }>).detail;
      if (d?.notebookId === notebookId) open(d.runId);
    };
    window.addEventListener("notebook:open-research", onEvent);
    return () => window.removeEventListener("notebook:open-research", onEvent);
  }, [notebookId, disabledFeatures]);
  const mobileSwipeStart = React.useRef<{ x: number; y: number } | null>(null);
  const handleMobileSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    mobileSwipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleMobileSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = mobileSwipeStart.current;
    mobileSwipeStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    const tabs = ["sources", "chat", "studio"];
    const current = tabs.indexOf(mobileTab);
    const next = dx < 0 ? Math.min(tabs.length - 1, current + 1) : Math.max(0, current - 1);
    if (next !== current) setMobileTab(tabs[next]);
  };
  const [draft, setDraft] = React.useState<{ text: string } | null>(null); // question pré-remplie depuis le Studio
  const desktop = useMediaQuery("(min-width: 1024px)");
  const wideDesktop = useMediaQuery("(min-width: 1280px)");
  const [sourcesCollapsed, setSourcesCollapsed] = React.useState(false);
  const [studioCollapsed, setStudioCollapsed] = React.useState(false);
  const [sourcesWidth, setSourcesWidth] = React.useState(300);
  const [studioWidth, setStudioWidth] = React.useState(340);
  const [panelWidthsLoadedFor, setPanelWidthsLoadedFor] = React.useState<string | null>(null);
  const panelResize = React.useRef<{ side: "sources" | "studio"; startX: number; startWidth: number } | null>(null);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`notebook-workspace-panels:${notebookId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as { sourcesWidth?: number; studioWidth?: number };
        if (typeof parsed.sourcesWidth === "number" && Number.isFinite(parsed.sourcesWidth)) setSourcesWidth(Math.min(520, Math.max(220, parsed.sourcesWidth)));
        if (typeof parsed.studioWidth === "number" && Number.isFinite(parsed.studioWidth)) setStudioWidth(Math.min(560, Math.max(260, parsed.studioWidth)));
      }
    } catch { /* stockage local facultatif */ }
    setPanelWidthsLoadedFor(notebookId);
  }, [notebookId]);

  React.useEffect(() => {
    if (panelWidthsLoadedFor !== notebookId) return;
    try {
      window.localStorage.setItem(`notebook-workspace-panels:${notebookId}`, JSON.stringify({ sourcesWidth, studioWidth }));
    } catch { /* stockage local facultatif */ }
  }, [notebookId, panelWidthsLoadedFor, sourcesWidth, studioWidth]);

  const beginPanelResize = (side: "sources" | "studio", event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panelResize.current = { side, startX: event.clientX, startWidth: side === "sources" ? sourcesWidth : studioWidth };
  };
  const movePanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = panelResize.current;
    if (!active) return;
    const delta = event.clientX - active.startX;
    if (active.side === "sources") setSourcesWidth(Math.min(520, Math.max(220, active.startWidth + delta)));
    else setStudioWidth(Math.min(560, Math.max(260, active.startWidth - delta)));
  };
  const endPanelResize = () => { panelResize.current = null; };

  const [overview, setOverview] = React.useState<Overview | null>(null);
  const loadOverview = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/notebooks/${notebookId}`);
      if (!r.ok) return;
      const j = await r.json();
      setOverview({ text: j.notebook.overview, questions: j.notebook.suggested_questions ?? [], pending: j.overviewPending, readySources: j.readySources ?? 0 });
    } catch { /* le résumé est facultatif : le chat reste utilisable */ }
  }, [notebookId]);
  React.useEffect(() => { void loadOverview(); }, [loadOverview]);
  const ask = (text: string) => { setViewer(null); setDraft({ text }); setMobileTab("chat"); };

  const load = React.useCallback(async () => {
    if (role === "chat") return setSources([]);
    try {
      const res = await fetch(`/api/v1/notebooks/${notebookId}/sources`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setSources(json.sources);
      setDeselected(new Set(json.deselected));
      setLoadError(false);
    } catch { setLoadError(true); }
  }, [notebookId, role]);
  React.useEffect(() => { void load(); }, [load]);

  // Statuts persistants : on rafraîchit tant qu'une source est en traitement.
  const processing = sources?.some((s) => busyStatus(s.status));
  React.useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [processing, load]);
  // Le résumé est programmé juste après l'ingestion (puis différé) : on le suit tant qu'il est attendu.
  React.useEffect(() => {
    if (processing) return;
    const once = setTimeout(() => void loadOverview(), 2000);
    return () => clearTimeout(once);
  }, [processing, loadOverview]);
  React.useEffect(() => {
    if (!overview?.pending) return;
    const t = setInterval(() => void loadOverview(), 5000);
    return () => clearInterval(t);
  }, [overview?.pending, loadOverview]);

  async function saveSelection(next: Set<string>) {
    setDeselected(next);
    const res = await fetch(`/api/v1/notebooks/${notebookId}/selection`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ deselectedSourceIds: [...next] }) });
    if (!res.ok) toast({ title: "Sélection non enregistrée", tone: "error" });
  }

  async function rename(next: string) {
    const clean = next.trim();
    if (clean === title) return;
    const res = await fetch(`/api/v1/notebooks/${notebookId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: clean }) });
    if (res.ok) setTitle(clean); else toast({ title: "Renommage impossible", tone: "error" });
  }

  async function renameSource(id: string, title: string): Promise<string | null> {
    const res = await fetch(`/api/v1/sources/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    if (res.status === 422) return (await res.json()).fields?.title ?? "Titre invalide.";
    if (!res.ok) return "Renommage impossible. Réessayez.";
    setSources((xs) => xs?.map((x) => (x.id === id ? { ...x, title: title.trim() } : x)) ?? null);
    return null;
  }

  const [confirm, confirmDialog] = useConfirm();
  async function removeSource(s: Source) {
    if (!(await confirm({ title: `Supprimer la source « ${s.title} » ?`, description: "Les réponses passées gardent leurs extraits cités.", confirmLabel: "Supprimer" }))) return;
    const res = await fetch(`/api/v1/sources/${s.id}`, { method: "DELETE" });
    if (res.ok) { setSources((xs) => xs?.filter((x) => x.id !== s.id) ?? null); toast({ title: "Source supprimée", tone: "success" }); void loadOverview(); }
    else toast({ title: "Suppression impossible", tone: "error" });
  }

  const ready = (sources ?? []).filter((s) => s.status === "ready");
  const selectedCount = ready.filter((s) => !deselected.has(s.id)).length;
  const allSelected = ready.length > 0 && selectedCount === ready.length;

  const sourcesPanel = (
    <Panel id="sources" title="Sources" className="mobile-source-panel h-full" actions={canEdit && <span className="flex flex-wrap items-center gap-1"><Button size="sm" variant="soft" onClick={() => setAdding(true)}><Plus aria-hidden /> Ajouter</Button></span>}>
      {loadError ? (
        <div className="p-4"><Alert tone="danger" title="Sources indisponibles" action={<Button size="sm" variant="secondary" onClick={load}>Réessayer</Button>} /></div>
      ) : sources === null ? (
        <div className="grid gap-3 p-4" aria-busy="true" aria-label="Chargement des sources">
          {[0, 1, 2].map((i) => <div key={i} className="flex gap-3"><Skeleton className="size-7" /><Skeleton className="h-4 flex-1" /></div>)}
        </div>
      ) : role === "chat" ? (
        <p className="p-4 text-sm text-text-muted">Les sources de ce notebook ne sont pas consultables avec votre lien. Vous pouvez poser des questions.</p>
      ) : sources.length === 0 ? (
        <EmptyState icon={<Inbox />} title="Aucune source" action={canEdit && <Button onClick={() => setAdding(true)}><Plus aria-hidden /> Ajouter des sources</Button>}>
          Importez un PDF, une page web ou un texte : les réponses citeront ces documents.
        </EmptyState>
      ) : (
        <div className="grid gap-0.5 p-2">
          {ready.length > 0 && (
            <label className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-text-muted">
              <span>{selectedCount}/{ready.length} sélectionnée{selectedCount > 1 ? "s" : ""}</span>
              <span className="flex items-center gap-2">Tout
                <Checkbox checked={allSelected ? true : selectedCount === 0 ? false : "indeterminate"} aria-label="Tout sélectionner"
                  onCheckedChange={() => saveSelection(allSelected ? new Set(ready.map((s) => s.id)) : new Set())} />
              </span>
            </label>
          )}
          {sources.map((s) => (
            <div key={s.id} className="grid gap-1">
              <ListRow
                icon={KIND_ICON[s.kind] ?? <FileText />}
                title={s.kind === "note" ? <button className="w-full truncate text-left hover:underline" onClick={() => setNoteEditor({ id: s.id })}>{s.title}</button> : s.status === "ready" ? <button className="w-full truncate text-left hover:underline" onClick={() => setViewer({ sourceId: s.id })}>{s.title}</button> : s.title}
                meta={s.status === "failed" ? <span className="text-danger">{ERRORS[s.error_code ?? ""] ?? "Échec du traitement."}</span> : busyStatus(s.status) ? (s.status === "pending" ? "En attente de traitement…" : "Extraction et indexation…") : s.word_count ? `${s.word_count.toLocaleString("fr-FR")} mots` : undefined}
                trailing={
                  <span className="flex items-center gap-1">
                    {s.status === "failed" && <Badge tone="danger">Échec</Badge>}
                    {busyStatus(s.status) && <Badge tone="accent">En cours</Badge>}
                    {canEdit && s.kind !== "note" && <Button size="icon-sm" variant="ghost" aria-label={`Renommer ${s.title}`} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" onClick={() => setRenaming(s)}><Pencil aria-hidden /></Button>}
                    {canEdit && <Button size="icon-sm" variant="ghost" aria-label={`Supprimer ${s.title}`} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" onClick={() => removeSource(s)}><Trash2 aria-hidden /></Button>}
                    {s.status === "ready" && (
                      <Checkbox checked={!deselected.has(s.id)} aria-label={`Utiliser ${s.title} dans les réponses`}
                        onCheckedChange={(v) => { const n = new Set(deselected); if (v) n.delete(s.id); else n.add(s.id); void saveSelection(n); }} />
                    )}
                  </span>
                }
              />
              {busyStatus(s.status) && <div className="px-3 pb-1"><Progress label={`Traitement de ${s.title}`} /></div>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );

  const titles = new Map((sources ?? []).map((s) => [s.id, s.title]));
  const chatPanel = <Chat notebookId={notebookId} readyCount={role === "chat" ? (overview?.readySources ?? 0) : selectedCount} sourceTitle={(id) => titles.get(id)} canSaveNote={canEdit} onNoteSaved={() => void load()} onOpenCitation={(c) => setViewer({ sourceId: c.source_id, range: [c.char_start, c.char_end] })} onOpenPassage={(p) => setViewer({ sourceId: p.sourceId, range: [p.charStart, p.charEnd], timeStartMs: p.timeStartMs ?? undefined })} canViewSources={role !== "chat"} draft={draft} canConfigure={canEdit} overview={overview} />;

  const studioPanel = (
    <Studio notebookId={notebookId} canEdit={canEdit} sourceIds={ready.filter((s) => !deselected.has(s.id)).map((s) => s.id)} sourceTitle={(id) => titles.get(id)}
      onOpenCitation={role !== "chat" ? (c) => setViewer({ sourceId: c.source_id, range: [c.char_start, c.char_end] }) : undefined}
      onAsk={ask} onImported={() => void load()} promptSuggestions={!disabledFeatures.includes("prompt_suggestions")} audioOverview={!disabledFeatures.includes("audio_overview")} />
  );

  // Espaces centraux : Chat, Recherche approfondie, Graphe de connaissances, Contradictions.
  // Le chat reste monté (masqué) pour ne pas interrompre une réponse en cours.
  const openPassage = (sourceId: string, start: number, end: number) => setViewer({ sourceId, range: [start, end] });
  const openReport = (artifactId: string) => {
    setStudioCollapsed(false); setMobileTab("studio");
    window.dispatchEvent(new CustomEvent("notebook:open-artifact", { detail: artifactId }));
  };
  const sourceList = (sources ?? []).map((s) => ({ id: s.id, title: s.title }));
  // onglets masqués quand la fonctionnalité est désactivée dans Réglages → Fonctionnalités
  const CENTER = ([
    { id: "chat", label: "Chat", icon: <Sparkles aria-hidden /> },
    { id: "research", feature: "deep_research", label: "Recherche approfondie", short: "Recherche", icon: <Telescope aria-hidden /> },
    { id: "graph", feature: "knowledge_graph", label: "Graphe de connaissances", short: "Graphe", icon: <Network aria-hidden /> },
    { id: "contradictions", feature: "contradictions", label: "Contradictions", icon: <Scale aria-hidden /> },
  ] as const).filter((t) => !("feature" in t) || !disabledFeatures.includes(t.feature));
  const centerPanel = CENTER.length === 1 ? chatPanel : (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div role="tablist" aria-label="Espaces du notebook" className="glass-panel flex shrink-0 gap-1 overflow-x-auto rounded-lg p-1">
        {CENTER.map((t) => (
          <button key={t.id} type="button" role="tab" id={`center-tab-${t.id}`} aria-selected={center === t.id} aria-controls={`center-panel-${t.id}`} onClick={() => setCenter(t.id)}
            className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition-colors [&_svg]:size-4", center === t.id ? "bg-accent-soft font-medium text-on-accent-soft" : "text-text-muted hover:bg-surface hover:text-text")}>
            {t.icon}<span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{"short" in t ? t.short : t.label}</span>
          </button>
        ))}
      </div>
      <div id="center-panel-chat" role="tabpanel" aria-labelledby="center-tab-chat" hidden={center !== "chat"} className="min-h-0 flex-1">{chatPanel}</div>
      {center !== "chat" && (
        <div id={`center-panel-${center}`} role="tabpanel" aria-labelledby={`center-tab-${center}`} className={cn("glass-panel min-h-0 flex-1 rounded-xl", center === "graph" ? "overflow-hidden" : "overflow-y-auto")}>
          {center === "research" && <DeepResearch notebookId={notebookId} canEdit={canEdit} onOpenSource={(id) => setViewer({ sourceId: id })} onOpenReport={openReport} onSourcesChanged={() => void load()} openRunId={researchRun} />}
          {center === "graph" && <KnowledgeGraph notebookId={notebookId} canEdit={canEdit} sources={sourceList} onOpenPassage={openPassage} onShowContradictions={disabledFeatures.includes("contradictions") ? undefined : () => setCenter("contradictions")} />}
          {center === "contradictions" && <Contradictions notebookId={notebookId} canEdit={canEdit} sources={sourceList} onOpenPassage={openPassage} />}
        </div>
      )}
    </div>
  );

  return (
    <>
      {confirmDialog}
      {titleSlot && createPortal(
        canEdit ? (
          <input aria-label="Titre du notebook" defaultValue={title} placeholder="Notebook sans titre" maxLength={200}
            onBlur={(e) => void rename(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="min-w-0 max-w-md flex-1 truncate rounded-md bg-transparent px-2 py-1 text-base font-semibold hover:bg-surface focus-visible:bg-surface" />
        ) : <h1 className="truncate text-base font-semibold">{title || "Notebook sans titre"}</h1>,
        titleSlot,
      )}
      {actionsSlot && createPortal(
        <>
          <NotebookActionsMenu notebookId={notebookId} allowCopies={allowCopies} canCopy={role === "owner" || (role !== "chat" && allowCopies)} canShare={role === "owner"} />
          {canEdit && browserEnabled && <a href={"/notebook/" + encodeURIComponent(notebookId) + "/browser"} aria-label="Ouvrir le navigateur web" title="Ouvrir le navigateur web"><Button type="button" size="icon-sm" variant="ghost"><Globe aria-hidden /></Button></a>}
        </>,
        actionsSlot,
      )}

      {/* Bureau : Sources et Studio se replient indépendamment. Mobile : navigation par onglets. */}
      {role === "chat" ? <div className="workspace-canvas min-h-0 flex-1 p-2 sm:p-3">{chatPanel}</div> : desktop ? (
        <div
          className="workspace-canvas grid min-h-0 min-w-0 flex-1 gap-2 p-3"
          style={{
            gridTemplateColumns: [
              sourcesCollapsed ? "2.75rem" : `${sourcesWidth}px 8px`,
              "minmax(0, 1fr)",
              ...(wideDesktop ? [studioCollapsed ? "2.75rem" : `8px ${studioWidth}px`] : ["0px"]),
            ].join(" "),
          }}
        >
          {sourcesCollapsed ? (
            <div className="flex h-full min-h-0 w-full flex-col items-center gap-2 rounded-lg border bg-surface-raised py-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Afficher le panneau Sources"
                title="Afficher les sources"
                onClick={() => setSourcesCollapsed(false)}
              >
                <PanelLeftOpen aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="soft"
                aria-label="Ajouter une source"
                title="Ajouter une source"
                onClick={() => setAdding(true)}
              >
                <Plus aria-hidden />
              </Button>
              <span className="[writing-mode:vertical-rl] text-xs text-text-muted">Sources</span>
            </div>
          ) : (
            <div className="relative min-h-0 min-w-0">
              {sourcesPanel}
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute -right-2.5 top-1/2 z-20 -translate-y-1/2 rounded-full shadow-md"
                aria-label="Rétracter le panneau Sources"
                title="Rétracter les sources"
                onClick={() => setSourcesCollapsed(true)}
              >
                <PanelLeftClose aria-hidden />
              </Button>
            </div>
          )}

          {!sourcesCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionner le panneau Sources"
              aria-valuenow={sourcesWidth}
              aria-valuemin={220}
              aria-valuemax={520}
              tabIndex={0}
              className="w-2 cursor-col-resize touch-none rounded-full bg-border/40 outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/50"
              onPointerDown={(event) => beginPanelResize("sources", event)}
              onPointerMove={movePanelResize}
              onPointerUp={endPanelResize}
              onPointerCancel={endPanelResize}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  setSourcesWidth((width) => Math.min(520, Math.max(220, width + (event.key === "ArrowRight" ? 16 : -16))));
                }
              }}
            />
          )}

          {centerPanel}
          {/* 1024–1279 px : Studio sans colonne ; monté masqué pour que ses modales (rapports) restent accessibles */}
          {!wideDesktop && <div className="hidden">{studioPanel}</div>}

          {wideDesktop && !studioCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionner le panneau Studio"
              aria-valuenow={studioWidth}
              aria-valuemin={260}
              aria-valuemax={560}
              tabIndex={0}
              className="w-2 cursor-col-resize touch-none rounded-full bg-border/40 outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/50"
              onPointerDown={(event) => beginPanelResize("studio", event)}
              onPointerMove={movePanelResize}
              onPointerUp={endPanelResize}
              onPointerCancel={endPanelResize}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  setStudioWidth((width) => Math.min(560, Math.max(260, width + (event.key === "ArrowLeft" ? 16 : -16))));
                }
              }}
            />
          )}

          {wideDesktop && (studioCollapsed ? (
            <Button
              type="button"
              variant="secondary"
              className="h-full min-h-0 w-full flex-col gap-3 px-1 py-3"
              aria-label="Afficher le panneau Studio"
              title="Afficher le Studio"
              onClick={() => setStudioCollapsed(false)}
            >
              <PanelRightOpen aria-hidden />
              <span className="[writing-mode:vertical-rl] text-xs">Studio</span>
            </Button>
          ) : (
            <div className="relative min-h-0 min-w-0">
              {studioPanel}
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute -left-2.5 top-1/2 z-20 -translate-y-1/2 rounded-full shadow-md"
                aria-label="Rétracter le panneau Studio"
                title="Rétracter le Studio"
                onClick={() => setStudioCollapsed(true)}
              >
                <PanelRightClose aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex min-h-0 flex-1 flex-col" onTouchStart={handleMobileSwipeStart} onTouchEnd={handleMobileSwipeEnd}>
          <div className="workspace-canvas min-h-0 flex-1 p-2">
            <TabsContent value="sources" className="h-full">{sourcesPanel}</TabsContent>
            <TabsContent value="chat" className="h-full">{centerPanel}</TabsContent>
            <TabsContent value="studio" className="h-full">{studioPanel}</TabsContent>
          </div>
          <TabsList aria-label="Panneaux" className="mobile-workspace-tabs grid h-14 shrink-0 grid-cols-3 border-t bg-surface-raised px-2">
            <TabsTrigger value="sources">Sources</TabsTrigger><TabsTrigger value="chat">Chat</TabsTrigger><TabsTrigger value="studio">Studio</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <AddSourcesDialog open={adding} onOpenChange={setAdding} notebookId={notebookId} onAdded={() => void load()} onWebSearch={() => { setAdding(false); setResearching(true); }} onNote={() => { setAdding(false); setNoteEditor({}); }} />
      <FastResearch notebookId={notebookId} open={researching} onOpenChange={setResearching} onImported={() => void load()} />
      <SourceViewer state={viewer} onClose={() => setViewer(null)} onAsk={ask} />
      <RenameSourceDialog source={renaming} onClose={() => setRenaming(null)} onRename={renameSource} />
      <NoteEditor state={noteEditor} notebookId={notebookId} canEdit={canEdit} onClose={() => setNoteEditor(null)} onSaved={() => void load()} />
    </>
  );
}

/* ---------------------------------------------------------------- Chat ---- */

function Chat({ notebookId, readyCount, onOpenCitation, onOpenPassage, canViewSources, sourceTitle, canSaveNote, onNoteSaved, draft, canConfigure, overview }: { notebookId: string; readyCount: number; onOpenCitation: (c: Cite) => void; onOpenPassage: (p: NumberedVoicePassage) => void; canViewSources: boolean; sourceTitle: (id: string) => string | undefined; canSaveNote: boolean; onNoteSaved: () => void; draft: { text: string } | null; canConfigure: boolean; overview: Overview | null }) {
  const [saved, setSaved] = React.useState<Set<string>>(new Set());
  async function saveNote(id: string) {
    const res = await fetch(`/api/v1/messages/${id}/save-note`, { method: "POST" });
    if (res.status === 409) { setSaved((s) => new Set(s).add(id)); toast({ title: "Cette réponse est déjà dans vos notes" }); return; }
    if (!res.ok) { toast({ title: "Enregistrement impossible", tone: "error" }); return; }
    setSaved((s) => new Set(s).add(id));
    toast({ title: "Réponse enregistrée en note", description: "Elle apparaît dans vos sources et peut être citée.", tone: "success" });
    onNoteSaved();
  }
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[] | null>(null);
  const [text, setText] = React.useState("");
  React.useEffect(() => { if (draft) setText(draft.text); }, [draft]);
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<{ title: string; body?: string } | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  const [configuring, setConfiguring] = React.useState(false);
  const [confirm, confirmDialog] = useConfirm();
  async function clearHistory() {
    if (!conversationId) return;
    if (!(await confirm({ title: "Effacer tout l’historique de cette conversation ?", description: "Les notes enregistrées sont conservées.", confirmLabel: "Effacer" }))) return;
    const r = await fetch(`/api/v1/conversations/${conversationId}/messages`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) { setMessages([]); setError(null); toast({ title: "Historique effacé" }); }
    else toast({ title: "Effacement impossible", tone: "error" });
  }
  const bottom = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const list = await (await fetch(`/api/v1/notebooks/${notebookId}/conversations`)).json();
        let id = list.conversations?.[0]?.id as string | undefined;
        if (!id) id = (await (await fetch(`/api/v1/notebooks/${notebookId}/conversations`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json()).conversation.id;
        setConversationId(id!);
        const hist = await (await fetch(`/api/v1/conversations/${id}/messages`)).json();
        setMessages(hist.messages ?? []);
      } catch { setError({ title: "Conversation indisponible", body: "Rechargez la page." }); setMessages([]); }
    })();
  }, [notebookId]);
  React.useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages]);

  async function send(e?: React.FormEvent, preset?: string) {
    e?.preventDefault();
    const q = (preset ?? text).trim();
    if (!q || streaming || !conversationId) return;
    setText(""); setError(null); setStreaming(true);
    const tmp: Message = { id: "pending", role: "assistant", content: "", status: "streaming" };
    setMessages((m) => [...(m ?? []), { id: crypto.randomUUID(), role: "user", content: q, status: "complete" }, tmp]);
    abort.current = new AbortController();
    try {
      const res = await fetch(`/api/v1/conversations/${conversationId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: q }), signal: abort.current.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        const map: Record<string, { title: string; body?: string }> = {
          ai_not_configured: { title: "L’assistant n’est pas encore configuré", body: "La clé OpenRouter et le modèle de chat doivent être renseignés côté serveur." },
          no_sources: { title: "Aucune source prête et sélectionnée", body: "Ajoutez une source ou cochez-en au moins une." },
          quota_daily_exceeded: { title: "Limite quotidienne atteinte", body: "Réessayez demain ou changez d’offre dans les réglages." },
          quota_monthly_exceeded: { title: "Crédits du mois épuisés", body: "Changez d’offre dans les réglages pour continuer." },
          validation: { title: "Question invalide", body: "4 000 caractères maximum." },
        };
        setError(map[j.error] ?? { title: "Réponse impossible", body: "Réessayez dans un instant." });
        setMessages((m) => m?.filter((x) => x.id !== "pending").slice(0, -1) ?? []);
        setText(q);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null");
          if (event === "delta") setMessages((m) => m!.map((x) => x.id === "pending" ? { ...x, content: x.content + data.text } : x));
          if (event === "thought") setMessages((m) => m!.map((x) => x.id === "pending" ? { ...x, thoughts: (x.thoughts ?? "") + data.text } : x));
          if (event === "artifact") window.dispatchEvent(new Event("notebook:artifact-created"));
          if (event === "done") setMessages((m) => m!.map((x) => x.id === "pending" ? { id: data.messageId, role: "assistant", content: data.text, status: "complete", citations: data.citations, thoughts: data.thoughts } : x));
          if (event === "error") { setError({ title: "La réponse a échoué", body: "Votre crédit a été restitué. Réessayez." }); setMessages((m) => m!.map((x) => x.id === "pending" ? { ...x, status: "failed" } : x)); }
        }
      }
    } catch {
      setMessages((m) => m?.map((x) => x.id === "pending" ? { ...x, status: "stopped" } : x) ?? []);
    } finally { setStreaming(false); abort.current = null; }
  }

  const [headerSlot, setHeaderSlot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => { setHeaderSlot(document.getElementById("app-header-actions")); }, []);

  return (
    <section aria-label="Conversation" className="mobile-chat-panel glass-panel flex h-full min-h-0 flex-col rounded-xl">
      {headerSlot && createPortal(
        <VoiceAssistant notebookId={notebookId} conversationId={conversationId ?? ""} disabled={!canViewSources || readyCount === 0 || !conversationId} onOpenCitation={onOpenPassage} />,
        headerSlot,
      )}
      <div className="mobile-chat-toolbar glass-toolbar flex h-11 shrink-0 items-center justify-end gap-1 border-b px-2">
        {canConfigure && <Button size="sm" variant="ghost" onClick={() => setConfiguring(true)}><Settings2 aria-hidden /> Configurer</Button>}
        <Button size="sm" variant="ghost" disabled={!messages?.length || streaming} onClick={() => void clearHistory()}><Eraser aria-hidden /> Effacer l’historique</Button>
        {confirmDialog}
      </div>
      <ChatSettingsDialog open={configuring} onClose={() => setConfiguring(false)} notebookId={notebookId} />
      <div className="mobile-chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mobile-chat-thread mx-auto grid max-w-[var(--chat-max-w)] gap-6" aria-live="polite" aria-busy={streaming}>
          {messages === null ? (
            <div className="mobile-chat-loading grid gap-2" aria-busy="true" aria-label="Chargement"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
          ) : messages.length === 0 ? (
            overview?.text && readyCount ? (
              <div className="grid gap-4">
                <h2 className="text-sm font-medium text-text-muted">Résumé de vos sources</h2>
                <p className="font-serif text-reading">{overview.text}</p>
                {overview.questions.length > 0 && (
                  <div className="grid gap-2">
                    <p className="text-sm text-text-muted">Pour commencer :</p>
                    {overview.questions.map((q) => (
                      <Button key={q} variant="secondary" className="h-auto justify-start whitespace-normal py-2 text-left" disabled={streaming || !conversationId} onClick={() => void send(undefined, q)}>{q}</Button>
                    ))}
                  </div>
                )}
                {overview.pending && <p className="text-xs text-text-subtle">Mise à jour du résumé en cours…</p>}
              </div>
            ) : (
              <EmptyState icon={<Sparkles />} title={readyCount ? "Posez votre première question" : "Ajoutez une source pour commencer"}>
                {readyCount ? "Les réponses s’appuient uniquement sur vos sources sélectionnées et citent leurs passages." : "Dès qu’une source est prête, vous pourrez l’interroger ici."}
                {readyCount > 0 && overview?.pending && <span className="mt-2 block text-xs text-text-subtle">Résumé de vos sources en préparation…</span>}
              </EmptyState>
            )
          ) : messages.map((m) => m.role === "user" ? (
            <div key={m.id} className="mobile-chat-user-message glass-message-user max-w-[85%] justify-self-end whitespace-pre-wrap rounded-xl rounded-br-xs px-4 py-2.5 text-sm">{m.content}</div>
          ) : (
            <div key={m.id} className="mobile-chat-assistant-message grid gap-2">
              {m.thoughts && <Thoughts text={m.thoughts} streaming={m.status === "streaming" && !m.content} />}
              {m.content ? <Answer text={m.content} citations={m.citations ?? []} sourceTitle={sourceTitle} onOpen={canViewSources ? onOpenCitation : undefined} /> : m.thoughts ? null : <div className="mobile-chat-loading grid gap-2" aria-label="Réponse en cours"><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-9/12" /></div>}
              {canSaveNote && m.status === "complete" && m.id !== "pending" && m.content && (
                <div><Button size="sm" variant="ghost" disabled={saved.has(m.id)} onClick={() => void saveNote(m.id)}><BookmarkPlus aria-hidden /> {saved.has(m.id) ? "Enregistrée en note" : "Enregistrer en note"}</Button></div>
              )}
              {m.id !== "pending" && m.content && m.status !== "streaming" && <Feedback messageId={m.id} initial={m.feedback ?? null} />}
              {m.status === "stopped" && <p className="text-xs text-text-subtle">Réponse interrompue : le texte partiel est conservé.</p>}
              {m.status === "failed" && <p className="flex items-center gap-1.5 text-xs text-danger"><AlertTriangle className="size-3.5" aria-hidden /> Réponse incomplète.</p>}
            </div>
          ))}
          <div ref={bottom} />
        </div>
      </div>
      <div className="mobile-chat-composer border-t border-[var(--glass-stroke-soft)] bg-surface-raised/55 p-3">
        {error && <div className="mx-auto mb-2 max-w-[var(--chat-max-w)]"><Alert tone="warning" title={error.title}>{error.body}</Alert></div>}
        <form onSubmit={send} className="mobile-chat-composer__form glass-control mx-auto flex max-w-[var(--chat-max-w)] items-end gap-2 rounded-xl border border-border-input p-2">
          <textarea rows={1} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            aria-label="Votre question" placeholder={readyCount ? "Posez une question sur vos sources…" : "Ajoutez d’abord une source"}
            className="mobile-chat-composer__input max-h-40 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-text-subtle" />
          <span className="hidden pb-2 text-xs text-text-subtle sm:inline">{readyCount} source{readyCount > 1 ? "s" : ""}</span>
          {streaming ? (
            <Tooltip label="Arrêter"><Button type="button" size="icon-sm" variant="secondary" aria-label="Arrêter la réponse" onClick={() => abort.current?.abort()}><Square aria-hidden /></Button></Tooltip>
          ) : (
            <Button type="submit" size="icon-sm" aria-label="Envoyer" disabled={!text.trim() || !conversationId}><ArrowUp aria-hidden /></Button>
          )}
        </form>
        <p className="mt-2 text-center text-xs text-text-subtle">Les réponses peuvent contenir des erreurs : vérifiez les citations.</p>
      </div>
    </section>
  );
}

/** Un paragraphe de réflexion scindé en titre d'étape (court, sans point final) + développement. */
type ThoughtStep = { title: string | null; body: string };

function parseThoughtSteps(text: string): ThoughtStep[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((para) => {
    const nl = para.indexOf("\n");
    const head = (nl >= 0 ? para.slice(0, nl) : para).trim();
    const rest = (nl >= 0 ? para.slice(nl + 1) : "").trim();
    // Une « étape » ressemble à un titre : courte, sans ponctuation finale, parfois en gras markdown.
    const bare = head.replace(/^\*\*(.+)\*\*:?$/, "$1").replace(/:$/, "").trim();
    const looksLikeTitle = rest.length > 0 && bare.length > 0 && bare.length <= 60 && !/[.?!]$/.test(bare);
    return looksLikeTitle ? { title: bare, body: rest } : { title: null, body: para };
  });
}

/** Réflexion du modèle (reasoning tokens) : timeline d'étapes, repliable, ouverte pendant le flux. */
function Thoughts({ text, streaming }: { text: string; streaming: boolean }) {
  const steps = parseThoughtSteps(text);
  return (
    <details open={streaming} className="group rounded-lg border border-border-subtle bg-surface-sunken/40 open:bg-surface-sunken/60">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-medium text-text-muted">
        <BrainCircuit aria-hidden className={cn("size-4 text-accent", streaming && "animate-pulse")} />
        Réflexion
        {streaming
          ? <span className="inline-flex items-center gap-1 text-xs font-normal text-text-subtle">en cours<span className="animate-pulse">…</span></span>
          : <span className="text-xs font-normal text-text-subtle">({steps.length} étape{steps.length > 1 ? "s" : ""})</span>}
        <svg aria-hidden viewBox="0 0 20 20" className="ml-auto size-3.5 shrink-0 fill-current text-text-subtle transition-transform group-open:rotate-180"><path d="M5 7l5 6 5-6z" /></svg>
      </summary>
      <ol className="m-0 grid gap-3 border-t border-border-subtle p-3 pl-4">
        {steps.map((s, i) => (
          <li key={i} className="relative border-l border-border-subtle pl-4 last:border-transparent">
            <span aria-hidden className="absolute -left-[3.5px] top-1 size-[7px] rounded-full bg-accent" />
            {s.title ? <p className="text-xs font-semibold text-text">{s.title}</p> : null}
            <div className="mt-0.5 text-xs leading-6 text-text-muted [&_p]:whitespace-pre-wrap"><Markdown text={s.body} citations={[]} /></div>
          </li>
        ))}
        {streaming && <li className="relative pl-4"><span aria-hidden className="absolute -left-[3.5px] top-1 size-[7px] animate-pulse rounded-full bg-accent" /></li>}
      </ol>
    </details>
  );
}

/** Réponse : rendu markdown (titres, listes, code...) + pastilles de citation à la place des marqueurs [n]. */
function Answer({ text, citations, onOpen, sourceTitle }: { text: string; citations: Cite[]; onOpen?: (c: Cite) => void; sourceTitle: (id: string) => string | undefined }) {
  return <Markdown text={text} citations={citations} onOpenCitation={onOpen} sourceTitle={sourceTitle} />;
}

/** Pouce haut / bas ; un avis négatif peut porter un motif facultatif. */
function Feedback({ messageId, initial }: { messageId: string; initial: number | null }) {
  const [value, setValue] = React.useState(initial);
  const [asking, setAsking] = React.useState(false);
  const [reason, setReason] = React.useState("");
  async function save(v: number | null, why?: string) {
    const prev = value;
    setValue(v);
    const r = await fetch(`/api/v1/messages/${messageId}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: v, ...(why ? { reason: why } : {}) }) });
    if (!r.ok) { setValue(prev); toast({ title: "Avis non enregistré", tone: "error" }); return false; }
    return true;
  }
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Réponse utile" aria-pressed={value === 1} className={cn(value === 1 && "text-accent")}
          onClick={() => { setAsking(false); void save(value === 1 ? null : 1); }}><ThumbsUp aria-hidden /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Réponse à améliorer" aria-pressed={value === -1} className={cn(value === -1 && "text-danger")}
          onClick={() => { if (value === -1) { setAsking(false); void save(null); } else { void save(-1); setAsking(true); } }}><ThumbsDown aria-hidden /></Button>
      </div>
      {asking && (
        <form className="grid max-w-md gap-2" onSubmit={async (e) => { e.preventDefault(); if (await save(-1, reason.trim() || undefined)) { setAsking(false); toast({ title: "Merci pour votre retour" }); } }}>
          <Field id={`fb-${messageId}`} label="Qu’est-ce qui n’allait pas ? (facultatif)">
            <Textarea value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} className="min-h-16" />
          </Field>
          <div className="flex gap-2"><Button size="sm" type="submit">Envoyer</Button><Button size="sm" type="button" variant="ghost" onClick={() => setAsking(false)}>Passer</Button></div>
        </form>
      )}
    </div>
  );
}

/** Réglages du chat par notebook (C08) : style et longueur des réponses suivantes. */
function ChatSettingsDialog({ open, onClose, notebookId }: { open: boolean; onClose: () => void; notebookId: string }) {
  const [form, setForm] = React.useState<{ chat_style: string; chat_custom_prompt: string; response_length: string } | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();
  React.useEffect(() => {
    if (!open) return;
    setForm(null); setFailed(false); setError(undefined);
    fetch(`/api/v1/notebooks/${notebookId}`).then(async (r) => {
      if (!r.ok) throw new Error();
      const { notebook: n } = await r.json();
      setForm({ chat_style: n.chat_style, chat_custom_prompt: n.chat_custom_prompt ?? "", response_length: n.response_length });
    }).catch(() => setFailed(true));
  }, [open, notebookId]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.chat_style === "custom" && !form.chat_custom_prompt.trim()) { setError("Décrivez le rôle ou le style souhaité."); return; }
    setSaving(true);
    const r = await fetch(`/api/v1/notebooks/${notebookId}`, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_style: form.chat_style, response_length: form.response_length, chat_custom_prompt: form.chat_style === "custom" ? form.chat_custom_prompt.trim() : null }) });
    setSaving(false);
    if (!r.ok) { setError("Enregistrement impossible. Réessayez."); return; }
    toast({ title: "Réglages du chat enregistrés", description: "Ils s’appliquent aux prochaines réponses.", tone: "success" });
    onClose();
  }
  const radio = (name: "chat_style" | "response_length", options: [string, string, string?][]) => (
    <div role="radiogroup" className="grid gap-2">
      {options.map(([v, l, hint]) => (
        <label key={v} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm", form?.[name] === v && "border-accent bg-accent-soft text-on-accent-soft")}>
          <input type="radio" name={name} value={v} checked={form?.[name] === v} onChange={() => setForm((f) => f && { ...f, [name]: v })} className="mt-0.5 accent-[var(--color-accent)]" />
          <span><span className="font-medium">{l}</span>{hint && <span className="block text-xs opacity-80">{hint}</span>}</span>
        </label>
      ))}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Configurer le chat" description="S’applique à tous les membres de ce notebook, pour les prochaines réponses.">
        {failed ? <Alert tone="danger" title="Réglages indisponibles" /> : !form ? (
          <div className="grid gap-2" aria-busy="true" aria-label="Chargement"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : (
          <form onSubmit={submit} className="grid gap-5">
            <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">Style</legend>
              {radio("chat_style", [["default", "Par défaut", "Recherche et réponses générales"], ["learning_guide", "Guide d’apprentissage", "Explique pas à pas et vérifie la compréhension"], ["custom", "Personnalisé", "Vous décrivez le rôle et le ton"]])}
            </fieldset>
            {form.chat_style === "custom" && (
              <Field id="chat-custom" label="Rôle et ton souhaités" error={error}>
                <Textarea value={form.chat_custom_prompt} maxLength={4000} onChange={(e) => { setError(undefined); setForm({ ...form, chat_custom_prompt: e.target.value }); }} placeholder="Ex. : réponds comme un formateur technique, avec des listes concises." />
              </Field>
            )}
            <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">Longueur des réponses</legend>
              {radio("response_length", [["short", "Courte"], ["default", "Normale"], ["long", "Détaillée"]])}
            </fieldset>
            {error && form.chat_style !== "custom" && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="mobile-source-import-actions flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="secondary">Annuler</Button></DialogClose>
              <Button type="submit" loading={saving}>Enregistrer</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------- Ajout source ---- */

function AddSourcesDialog({ open, onOpenChange, notebookId, onAdded, onWebSearch, onNote }: { open: boolean; onOpenChange: (o: boolean) => void; notebookId: string; onAdded: () => void; onWebSearch: () => void; onNote: () => void }) {
  const [tab, setTab] = React.useState("file");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [url, setUrl] = React.useState("");
  const [paste, setPaste] = React.useState({ title: "", text: "" });
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const folderRef = React.useRef<HTMLInputElement>(null);
  const ACCEPT = ".pdf,.docx,.pptx,.epub,.txt,.md,.csv,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm";
  const supportedExtensions = new Set(["pdf", "docx", "pptx", "epub", "txt", "md", "csv", "mp3", "wav", "m4a", "aac", "ogg", "flac", "webm"]);
  const folderFiles = selectedFiles.map((file) => {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    return { file, relativePath, compatible: supportedExtensions.has(extension), withinLimit: file.size > 0 && file.size <= 200 * 1024 * 1024 };
  });
  const compatibleFiles = folderFiles.filter((entry) => entry.compatible && entry.withinLimit);
  const ignoredFiles = folderFiles.length - compatibleFiles.length;

  async function post(items: object[]) {
    const res = await fetch(`/api/v1/notebooks/${notebookId}/sources`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ items }) });
    const j = await res.json().catch(() => ({}));
    if (res.status === 409 && j.error === "max_sources") throw new Error("Nombre maximal de sources atteint pour votre offre.");
    if (res.status === 422) throw new Error(Object.values(j.fields ?? {})[0] as string ?? "Données invalides.");
    if (!res.ok) throw new Error("Ajout impossible. Réessayez.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(undefined); setProgress(null);
    let keepDialogOpen = false;
    try {
      if (tab === "file") {
        if (!compatibleFiles.length) throw new Error("Sélectionnez un dossier contenant au moins un document compatible (200 Mo maximum par fichier).");
        let batch: object[] = [];
        let imported = 0;
        const failures: string[] = [];
        setProgress({ done: 0, total: compatibleFiles.length });
        for (const [index, entry] of compatibleFiles.entries()) {
          const { file, relativePath } = entry;
          try {
            const r = await fetch(`/api/v1/notebooks/${notebookId}/uploads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, size: file.size }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(r.status === 415 ? "format refusé" : r.status === 422 ? "fichier trop volumineux" : "préparation de l’envoi impossible");
            const up = await fetch(j.uploadUrl, { method: "PUT", headers: { "content-type": j.contentType }, body: file });
            if (!up.ok) throw new Error("envoi échoué");
            batch.push({ type: "upload", storagePath: j.storagePath, title: relativePath.slice(0, 300) });
          } catch (uploadError) {
            failures.push(`${relativePath} : ${uploadError instanceof Error ? uploadError.message : "erreur inconnue"}`);
          }
          if (batch.length === 50 || index === compatibleFiles.length - 1) {
            if (batch.length) {
              await post(batch);
              imported += batch.length;
              batch = [];
            }
          }
          setProgress({ done: index + 1, total: compatibleFiles.length });
        }
        if (!imported) throw new Error(failures[0] ?? "Aucun document n’a pu être importé.");
        const skipped = ignoredFiles + failures.length;
        toast({
          title: `${imported} document${imported > 1 ? "s" : ""} ajouté${imported > 1 ? "s" : ""}`,
          description: skipped ? `${skipped} fichier(s) ignoré(s) ou en erreur. Le traitement continue en arrière-plan.` : "Tous les documents compatibles ont été envoyés. Le traitement continue en arrière-plan.",
          tone: failures.length ? "error" : "success",
        });
        if (failures.length) {
          keepDialogOpen = true;
          setError(`Import partiel : ${failures.slice(0, 5).join(" · ")}${failures.length > 5 ? ` · et ${failures.length - 5} autre(s)` : ""}`);
        }
      } else if (tab === "url") {
        const urls = url.split(/\s+/).filter(Boolean);
        if (!urls.length) throw new Error("Collez au moins une adresse.");
        await post(urls.map((u) => ({ type: "url", url: u })));
        toast({ title: "Sources ajoutées", description: "Le traitement continue en arrière-plan.", tone: "success" });
      } else {
        if (!paste.title.trim() || !paste.text.trim()) throw new Error("Titre et texte sont requis.");
        await post([{ type: "text", title: paste.title, text: paste.text }]);
        toast({ title: "Source ajoutée", description: "Le traitement continue en arrière-plan.", tone: "success" });
      }
      setUrl(""); setPaste({ title: "", text: "" }); setSelectedFiles([]); if (fileRef.current) fileRef.current.value = ""; if (folderRef.current) folderRef.current.value = "";
      onAdded();
      if (!keepDialogOpen) onOpenChange(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Ajout impossible."); }
    finally { setBusy(false); setProgress(null); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="mobile-source-dialog" title="Ajouter des sources" description="Les réponses s’appuieront uniquement sur ces documents.">
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onWebSearch} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><Search className="size-4" aria-hidden /></span>
            <span className="grid gap-0.5"><span className="text-sm font-medium">Recherche web</span><span className="text-xs text-text-muted">Trouvez et importez des sources en ligne.</span></span>
          </button>
          <button type="button" onClick={onNote} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><NotebookPen className="size-4" aria-hidden /></span>
            <span className="grid gap-0.5"><span className="text-sm font-medium">Note</span><span className="text-xs text-text-muted">Rédigez une note utilisée comme source.</span></span>
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-text-muted" aria-hidden><span className="h-px flex-1 bg-border" />ou importer<span className="h-px flex-1 bg-border" /></div>
        <form onSubmit={submit} className="mobile-source-import-form grid min-h-0 gap-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Type de source" className="mobile-source-tabs">
              <TabsTrigger value="file"><Upload className="mr-1.5 inline size-3.5" aria-hidden />Fichier / dossier</TabsTrigger>
              <TabsTrigger value="url"><Globe className="mr-1.5 inline size-3.5" aria-hidden />Page web</TabsTrigger>
              <TabsTrigger value="text"><Type className="mr-1.5 inline size-3.5" aria-hidden />Texte</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="grid gap-3 pt-4">
              <input ref={fileRef} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Sélectionner des fichiers" onChange={(event) => { setSelectedFiles(Array.from(event.currentTarget.files ?? [])); setError(undefined); }} />
              <input
                ref={folderRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-label="Sélectionner un dossier"
                {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                onChange={(event) => { setSelectedFiles(Array.from(event.currentTarget.files ?? [])); setError(undefined); }}
              />
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const dropped = Array.from(e.dataTransfer.files); if (dropped.length) { setSelectedFiles(dropped); setError(undefined); } }}
                className={cn("grid justify-items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors", dragging ? "border-accent bg-accent-soft" : "border-border bg-surface")}
              >
                <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-on-accent-soft"><Upload className="size-5" aria-hidden /></span>
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Glissez vos fichiers ici</p>
                  <p className="text-xs text-text-muted">200 Mo maximum par fichier</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><FileText aria-hidden /> Choisir des fichiers</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => folderRef.current?.click()}><FolderOpen aria-hidden /> Choisir un dossier</Button>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5" aria-label="Formats compatibles">
                  {["PDF", "DOCX", "PPTX", "EPUB", "TXT", "MD", "CSV", "Audio"].map((f) => <Badge key={f}>{f}</Badge>)}
                </div>
              </div>
              {selectedFiles.length > 0 && (
                <div className="rounded-lg border bg-surface p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 font-medium"><FolderOpen className="size-4 shrink-0" aria-hidden /><span className="truncate">{(selectedFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || `${selectedFiles.length} fichier(s) sélectionné(s)`}</span></div>
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setSelectedFiles([]); if (fileRef.current) fileRef.current.value = ""; if (folderRef.current) folderRef.current.value = ""; }}>Effacer</Button>
                  </div>
                  <ul className="mt-2 grid max-h-32 gap-1 overflow-y-auto">
                    {folderFiles.slice(0, 50).map((entry) => (
                      <li key={entry.relativePath} className={cn("flex items-center justify-between gap-3 text-xs", entry.compatible && entry.withinLimit ? "text-text" : "text-text-muted line-through")}>
                        <span className="truncate">{entry.relativePath}</span>
                        <span className="shrink-0 text-text-muted">{(entry.file.size / 1048576).toFixed(1)} Mo</span>
                      </li>
                    ))}
                    {folderFiles.length > 50 && <li className="text-xs text-text-muted">… et {folderFiles.length - 50} autre(s)</li>}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-text-muted">
                    <span>{compatibleFiles.length} document(s) compatible(s)</span>
                    {ignoredFiles > 0 && <span>{ignoredFiles} fichier(s) ignoré(s)</span>}
                  </div>
                  {progress && (
                    <div className="mt-3 grid gap-1">
                      <div className="flex justify-between text-xs text-text-muted"><span>Envoi des documents</span><span>{progress.done}/{progress.total}</span></div>
                      <Progress label="Envoi des documents" value={progress.total ? progress.done / progress.total * 100 : 0} />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent value="url" className="pt-4">
              <Field id="urls" label="Adresses web" hint="Une par ligne. Seul le texte principal de la page est importé.">
                <Textarea value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </Field>
            </TabsContent>
            <TabsContent value="text" className="grid gap-3 pt-4">
              <Field id="paste-title" label="Titre"><Input value={paste.title} maxLength={300} onChange={(e) => setPaste({ ...paste, title: e.target.value })} /></Field>
              <Field id="paste-text" label="Texte"><Textarea value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} className="min-h-40" /></Field>
            </TabsContent>
          </Tabs>
          {error && <Alert tone="danger" title={error} />}
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>Annuler</Button></DialogClose>
            <Button type="submit" loading={busy} disabled={busy}>{tab === "file" ? "Importer" : "Ajouter"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------- Visionneuse ---- */

function SourceViewer({ state, onClose, onAsk }: { state: { sourceId: string; range?: [number, number]; timeStartMs?: number } | null; onClose: () => void; onAsk: (text: string) => void }) {
  const [source, setSource] = React.useState<{ title: string; kind: string; origin_url: string | null; extracted_text: string | null; guide: { summary: string; topics: string[] } | null } | null>(null);
  const [audioSegments, setAudioSegments] = React.useState<Array<{ ordinal: number; content: string; time_start_ms: number; time_end_ms: number }>>([]);
  const [failed, setFailed] = React.useState(false);
  const mark = React.useRef<HTMLElement>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  React.useEffect(() => {
    if (!state) return;
    setSource(null); setFailed(false);
    fetch(`/api/v1/sources/${state.sourceId}`).then(async (r) => {
      if (!r.ok) throw new Error();
      const payload = await r.json();
      setSource(payload.source);
      setAudioSegments(payload.audioSegments ?? []);
    }).catch(() => setFailed(true));
  }, [state]);
  React.useEffect(() => { mark.current?.scrollIntoView({ block: "center" }); }, [source]);
  React.useEffect(() => {
    const player = audioRef.current;
    if (!player || source?.kind !== "audio" || state?.timeStartMs == null) return;
    const seek = () => { player.currentTime = Math.max(0, state.timeStartMs! / 1000); };
    if (player.readyState >= 1) seek();
    else player.addEventListener("loadedmetadata", seek, { once: true });
    return () => player.removeEventListener("loadedmetadata", seek);
  }, [source, state]);

  const text = source?.extracted_text ?? "";
  const [a, b] = state?.range ?? [0, 0];
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" className="mobile-source-viewer-dialog" title={source?.title ?? "Source"} description={state?.range ? "Le passage cité est surligné." : undefined}>
        {source?.origin_url && /^https?:\/\//i.test(source.origin_url) && (
          <a href={source.origin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 justify-self-start text-sm text-accent underline-offset-2 hover:underline">
            <ExternalLink className="size-3.5" aria-hidden /> Ouvrir la page originale
          </a>
        )}
        <div className="mobile-source-viewer-content max-h-[65dvh] overflow-y-auto rounded-lg bg-surface p-5">
          {failed ? <Alert tone="danger" title="Source indisponible" /> : !source ? (
            <div className="grid gap-2" aria-busy="true"><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-4/6" /></div>
          ) : (
            <>
            {source.kind === "audio" && (
              <audio ref={audioRef} controls preload="metadata" className="mb-5 w-full" src={`/api/v1/sources/${state?.sourceId}/file`} />
            )}
            {source.guide && (
              <section aria-label="Guide de la source" className="mb-5 grid gap-3 rounded-lg border bg-surface-raised p-4">
                <h3 className="text-sm font-medium text-text-muted">Guide de la source</h3>
                <p className="text-sm leading-6">{source.guide.summary}</p>
                {source.guide.topics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {source.guide.topics.map((t) => (
                      <Button key={t} size="sm" variant="secondary" title="Poser une question sur ce thème" onClick={() => onAsk(`Que disent mes sources sur « ${t} » ?`)}>{t}</Button>
                    ))}
                  </div>
                )}
              </section>
            )}
            {source.kind === "audio" && audioSegments.length > 0 ? (
              <section aria-label="Transcription horodatée" className="grid gap-2">
                <h3 className="text-sm font-medium text-text-muted">Transcription — cliquer pour écouter à cet instant</h3>
                {audioSegments.map((segment) => (
                  <button
                    key={segment.ordinal}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onClick={() => {
                      const player = audioRef.current;
                      if (!player) return;
                      player.currentTime = Math.max(0, segment.time_start_ms / 1000);
                      void player.play().catch(() => undefined);
                    }}
                    aria-label={`Écouter à ${Math.floor(segment.time_start_ms / 1000)} secondes`}
                  >
                    <span className="shrink-0 rounded bg-surface-raised px-2 py-1 font-mono text-xs text-text-muted">
                      {Math.floor(segment.time_start_ms / 60000).toString().padStart(2, "0")}:{Math.floor((segment.time_start_ms % 60000) / 1000).toString().padStart(2, "0")}
                    </span>
                    <span className="text-sm leading-6">{segment.content}</span>
                  </button>
                ))}
              </section>
            ) : (
              <p className={cn("whitespace-pre-wrap font-serif text-reading")}>
                {state?.range ? <>{text.slice(0, a)}<mark ref={mark} className="rounded-xs bg-highlight px-0.5 text-on-highlight">{text.slice(a, b)}</mark>{text.slice(b)}</> : text}
              </p>
            )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------- Éditeur de note ---- */

function NoteEditor({ state, notebookId, canEdit, onClose, onSaved }: { state: { id?: string } | null; notebookId: string; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState("");
  const [locked, setLocked] = React.useState(false);
  const [citations, setCitations] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirm, confirmDialog] = useConfirm();
  const editing = Boolean(state?.id);

  React.useEffect(() => {
    if (!state) return;
    setErrors({});
    if (!state.id) { setTitle(""); setText(""); setLocked(false); setCitations(0); return; }
    setLoading(true);
    fetch(`/api/v1/notes/${state.id}`).then(async (r) => {
      if (!r.ok) throw new Error();
      const j = await r.json();
      setTitle(j.note.title); setText(j.note.text); setLocked(j.note.locked); setCitations(j.citations.length);
    }).catch(() => setErrors({ form: "Note introuvable." })).finally(() => setLoading(false));
  }, [state]);

  async function unlock() {
    if (!state?.id) return;
    if (!(await confirm({ title: "Retirer les citations de cette note ?", description: "Les liens vers les passages cités seront perdus. La note pourra ensuite être modifiée.", confirmLabel: "Retirer les citations" }))) return;
    const r = await fetch(`/api/v1/notes/${state.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ unlock: true }) });
    if (r.ok) { setLocked(false); setCitations(0); } else toast({ title: "Action impossible", tone: "error" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErrors({});
    const r = await fetch(editing ? `/api/v1/notes/${state!.id}` : `/api/v1/notebooks/${notebookId}/notes`, {
      method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(locked ? { title } : { title, text }),
    });
    setSaving(false);
    const j = await r.json().catch(() => ({}));
    if (r.status === 422) { setErrors(j.fields ?? { form: "Données invalides." }); return; }
    if (r.status === 409) { setErrors({ form: "Cette note est verrouillée par ses citations." }); return; }
    if (!r.ok) { setErrors({ form: "Enregistrement impossible. Réessayez." }); return; }
    toast({ title: editing ? "Note mise à jour" : "Note créée", description: "Elle sera indexée dans quelques secondes.", tone: "success" });
    onSaved(); onClose();
  }

  const readOnly = !canEdit;
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={editing ? (readOnly ? "Note" : "Modifier la note") : "Nouvelle note"} description="Une note est une source : elle peut être sélectionnée et citée dans les réponses.">
        {confirmDialog}
        {loading ? (
          <div className="grid gap-2" aria-busy="true"><Skeleton className="h-9" /><Skeleton className="h-40" /></div>
        ) : (
          <form onSubmit={save} className="grid gap-4" noValidate>
            {locked && (
              <Alert tone="accent" title={`Note issue du chat, avec ${citations} citation${citations > 1 ? "s" : ""}`}
                action={canEdit && <Button type="button" size="sm" variant="secondary" onClick={unlock}><Lock aria-hidden /> Retirer les citations</Button>}>
                Le texte est verrouillé pour que les extraits cités restent exacts. Le titre reste modifiable.
              </Alert>
            )}
            <Field id="note-title" label="Titre" error={errors.title}>
              <Input value={title} maxLength={300} readOnly={readOnly} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <NoteContentField text={text} onChange={setText} readOnly={readOnly || locked} error={errors.text} />
            {errors.form && <Alert tone="danger" title={errors.form} />}
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="secondary">{readOnly ? "Fermer" : "Annuler"}</Button></DialogClose>
              {!readOnly && <Button type="submit" loading={saving}>{editing ? "Enregistrer" : "Créer la note"}</Button>}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type MarkAction =
  | { kind: "wrap"; before: string; after?: string }
  | { kind: "line"; prefix: string };
const MARK_BUTTONS: { label: string; icon: React.ReactNode; action: MarkAction }[] = [
  { label: "Gras", icon: <Bold aria-hidden />, action: { kind: "wrap", before: "**" } },
  { label: "Italique", icon: <Italic aria-hidden />, action: { kind: "wrap", before: "*" } },
  { label: "Code", icon: <Code aria-hidden />, action: { kind: "wrap", before: "`" } },
  { label: "Titre", icon: <Heading2 aria-hidden />, action: { kind: "line", prefix: "## " } },
  { label: "Liste à puces", icon: <List aria-hidden />, action: { kind: "line", prefix: "- " } },
  { label: "Liste numérotée", icon: <ListOrdered aria-hidden />, action: { kind: "line", prefix: "1. " } },
  { label: "Citation", icon: <Quote aria-hidden />, action: { kind: "line", prefix: "> " } },
];

/** Contenu d'une note : barre d'outils de mise en forme + onglets Rédiger / Aperçu (rendu comme dans le chat). */
function NoteContentField({ text, onChange, readOnly, error }: { text: string; onChange: (v: string) => void; readOnly: boolean; error?: string }) {
  const [tab, setTab] = React.useState("write");
  const ref = React.useRef<HTMLTextAreaElement>(null);

  function applyMark(action: MarkAction) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = text.slice(start, end);
    let next: string, caretStart: number, caretEnd: number;
    if (action.kind === "wrap") {
      const after = action.after ?? action.before;
      next = text.slice(0, start) + action.before + selected + after + text.slice(end);
      caretStart = start + action.before.length;
      caretEnd = caretStart + selected.length;
    } else {
      // Préfixe chaque ligne de la sélection (ou la ligne courante si rien n'est sélectionné).
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const lineEndRaw = text.indexOf("\n", end);
      const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
      const block = text.slice(lineStart, lineEnd);
      const prefixed = block.split("\n").map((l) => (l.startsWith(action.prefix) ? l : action.prefix + l)).join("\n");
      next = text.slice(0, lineStart) + prefixed + text.slice(lineEnd);
      caretStart = lineStart;
      caretEnd = lineStart + prefixed.length;
    }
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caretStart, caretEnd); });
  }

  if (readOnly) return <Field id="note-text" label="Contenu" error={error}><div className="min-h-64 rounded-md border border-border-input bg-surface-sunken px-3 py-2"><Markdown text={text || "Aucun contenu."} citations={[]} /></div></Field>;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor="note-text" className="text-sm font-medium text-text-muted">Contenu</label>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Mode d’édition">
            <TabsTrigger value="write">Rédiger</TabsTrigger>
            <TabsTrigger value="preview">Aperçu</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === "write" ? (
        <>
          <div role="toolbar" aria-label="Mise en forme" className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-border-input bg-surface p-1">
            {MARK_BUTTONS.map((b) => (
              <Tooltip key={b.label} label={b.label}>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={b.label} onClick={() => applyMark(b.action)}>{b.icon}</Button>
              </Tooltip>
            ))}
          </div>
          <Textarea ref={ref} id="note-text" value={text} onChange={(e) => onChange(e.target.value)} className="min-h-64 rounded-t-none font-serif text-reading" aria-invalid={Boolean(error)} />
          <p className="text-xs text-text-subtle">Markdown pris en charge : **gras**, *italique*, listes, `code`, ## titres.</p>
        </>
      ) : (
        <div className="min-h-64 rounded-md border border-border-input bg-surface-sunken px-3 py-2">
          {text.trim() ? <Markdown text={text} citations={[]} /> : <p className="text-sm text-text-subtle">Rien à prévisualiser pour l’instant.</p>}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------ Renommer une source ---- */

function RenameSourceDialog({ source, onClose, onRename }: { source: Source | null; onClose: () => void; onRename: (id: string, title: string) => Promise<string | null> }) {
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { setTitle(source?.title ?? ""); setError(undefined); }, [source]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!source) return;
    if (!title.trim()) { setError("Titre requis."); return; }
    setSaving(true);
    const err = await onRename(source.id, title);
    setSaving(false);
    if (err) { setError(err); return; }
    toast({ title: "Source renommée", tone: "success" });
    onClose();
  }
  return (
    <Dialog open={Boolean(source)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="Renommer la source">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="source-title" label="Titre" error={error}><Input autoFocus value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="secondary">Annuler</Button></DialogClose>
            <Button type="submit" loading={saving}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
