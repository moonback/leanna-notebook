"use client";
import * as React from "react";
import { Image as ImageIcon, AudioLines, BookOpen, Check, ChevronDown, ChevronRight, Download, Layers, ListChecks, Network, RotateCcw, Sparkles, Trash2, X, Clock3, Table2, BookText, CircleHelp, Workflow, Newspaper, CalendarDays, BarChart3, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Alert, Badge, EmptyState, Progress, Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlay";
import { useConfirm } from "@/components/ui/confirm";
import { ListRow, Panel } from "@/components/ui/surfaces";
import { Citation } from "@/components/ui/citation";
import { toast } from "@/components/ui/toast";
import { ArtifactShareButton } from "./artifact-share-button";
import { cn } from "@/lib/utils";

type ArtType = "report" | "flashcards" | "quiz" | "mind_map" | "audio" | "infographic" | "timeline" | "comparison" | "glossary" | "faq" | "diagram" | "editorial" | "study_plan" | "image";
type Art = { id: string; type: ArtType; title: string | null; status: string; error_code: string | null; options: Record<string, string> | null; custom_prompt?: string | null; created_at: string; progress?: number; stage?: string; unread?: boolean };
type Cite = { marker: number; source_id: string; quote_text: string; char_start: number; char_end: number; verified: boolean };

const TYPES: Record<ArtType, { label: string; icon: React.ReactNode; hint: string }> = {
  report: { label: "Rapport", icon: <BookOpen />, hint: "Synthèse rédigée et sourcée" },
  flashcards: { label: "Fiches", icon: <Layers />, hint: "Recto / verso pour réviser" },
  quiz: { label: "Quiz", icon: <ListChecks />, hint: "QCM corrigé avec explications" },
  mind_map: { label: "Carte mentale", icon: <Network />, hint: "Les thèmes et leurs liens" },
  audio: { label: "Audio Overview", icon: <AudioLines />, hint: "Podcast dialogué à deux voix à partir des sources" },
  infographic: { label: "Infographie", icon: <BarChart3 />, hint: "Synthèse visuelle structurée et sourcée" },
  timeline: { label: "Chronologie", icon: <Clock3 />, hint: "Événements classés par date avec citations" },
  comparison: { label: "Tableau comparatif", icon: <Table2 />, hint: "Comparaison sourcée de concepts ou de sources" },
  glossary: { label: "Glossaire", icon: <BookText />, hint: "Termes clés et définitions sourcées" },
  faq: { label: "FAQ", icon: <CircleHelp />, hint: "Questions fréquentes et réponses sourcées" },
  diagram: { label: "Diagramme", icon: <Workflow />, hint: "Flux ou organigramme Mermaid éditable" },
  editorial: { label: "Contenu éditorial", icon: <Newspaper />, hint: "Newsletter, article ou fil social" },
  study_plan: { label: "Plan d'étude", icon: <CalendarDays />, hint: "Planning de révision construit depuis les sources" },
  image: { label: "Image IA", icon: <ImageIcon />, hint: "Créer une image à partir des sources" },
};
const ERRORS: Record<string, string> = {
  ai_not_configured: "L’assistant n’est pas configuré côté serveur.",
  ai_config: "Configuration du modèle invalide (clé ou modèle).",
  no_sources: "Aucune source prête au moment de la génération.",
  generation_failed: "Le modèle n’a pas produit un résultat exploitable.",
  audio_tts_not_configured: "La synthèse vocale n’est pas configurée côté worker.",
  audio_tts_config: "La configuration du fournisseur de voix est invalide.",
  audio_voices_invalid: "Configurez deux identifiants de voix différents.",
  audio_ffmpeg_not_installed: "ffmpeg est absent du PATH du worker. Installez-le puis redémarrez le worker.",
  image_provider_rejected: "Le modèle image a refusé la requête ou n’est pas disponible.", image_generation_failed: "La génération de l’image a échoué. Les crédits sont restitués.", invalid_image_response: "Le fournisseur n’a pas renvoyé une image valide.", image_too_large: "L’image dépasse la limite de 20 Mo.",
};
const busy = (s: string) => s === "queued" || s === "scheduled" || s === "generating";
const AUDIO_OVERVIEW_MARKER = "[[NOTEBOOK_AUDIO_OVERVIEW_V1]]";
const label = (a: Art) => a.title || TYPES[a.type].label;
const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Studio({ notebookId, canEdit, sourceIds, sourceTitle, onOpenCitation, onAsk, onImported }: {
  notebookId: string; canEdit: boolean; sourceIds: string[]; onImported?: () => void;
  sourceTitle: (id: string) => string | undefined; onOpenCitation?: (c: Cite) => void; onAsk: (text: string) => void;
}) {
  const [arts, setArts] = React.useState<Art[] | null>(null);
  const [failedLoad, setFailedLoad] = React.useState(false);
  const [creating, setCreating] = React.useState<ArtType | null>(null);
  const [referenceImageId, setReferenceImageId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const readyCount = sourceIds.length;

  const seen = React.useRef(new Map<string, string>());
  const load = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/notebooks/${notebookId}/artifacts`);
      if (!r.ok) throw new Error();
      const list: Art[] = (await r.json()).artifacts;
      // E02 : prévenir quand une génération se termine pendant que l'onglet est en arrière-plan.
      for (const a of list) {
        if (a.status === "ready" && busy(seen.current.get(a.id) ?? "") && document.hidden && "Notification" in window && Notification.permission === "granted") {
          new Notification(`${label(a)} est prêt`, { body: "Ouvrez le Studio pour le consulter.", tag: a.id });
        }
      }
      seen.current = new Map(list.map((a) => [a.id, a.status]));
      setArts(list); setFailedLoad(false);
    } catch { setFailedLoad(true); }
  }, [notebookId]);
  React.useEffect(() => { void load(); }, [load]);
  const pending = arts?.some((a) => busy(a.status));
  React.useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [pending, load]);

  async function generate(type: ArtType, options: Record<string, string>, customPrompt?: string) {
    const r = await fetch(`/api/v1/notebooks/${notebookId}/artifacts`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ type, options, sourceIds: (type === "infographic" || type === "image") && options.sourceScope === "all" ? [] : sourceIds, ...(customPrompt ? { customPrompt } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) { toast({ title: "Quota atteint", description: "Changez d’offre dans les réglages ou réessayez plus tard.", tone: "error" }); return false; }
    if (r.status === 503) { toast({ title: "Assistant non configuré", description: "La clé OpenRouter doit être renseignée côté serveur.", tone: "error" }); return false; }
    if (!r.ok) { toast({ title: "Génération impossible", description: j.message, tone: "error" }); return false; }
    toast({ title: `${customPrompt?.startsWith(AUDIO_OVERVIEW_MARKER) ? "Audio Overview" : TYPES[type].label} en préparation`, description: "Vous pouvez continuer à travailler : il apparaîtra ici une fois prêt." });
    // demandé au moment d'un geste de l'utilisateur, une seule fois ; un refus est respecté
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    void load();
    return true;
  }

  async function remove(a: Art) {
    if (!(await confirm({ title: `Supprimer « ${label(a)} » ?`, description: "Ce contenu généré sera supprimé définitivement.", confirmLabel: "Supprimer" }))) return;
    const r = await fetch(`/api/v1/artifacts/${a.id}`, { method: "DELETE" });
    if (r.ok) setArts((xs) => xs?.filter((x) => x.id !== a.id) ?? null); else toast({ title: "Suppression impossible", tone: "error" });
  }

  function view(a: Art) {
    setOpen(a.id);
    setArts((xs) => xs?.map((x) => (x.id === a.id ? { ...x, unread: false } : x)) ?? null);
  }

  return (
    <Panel id="studio" title="Studio" className="h-full">
      {confirmDialog}
      {canEdit && (
        <div className="grid grid-cols-2 gap-2 border-b p-3">
          {(["report", "flashcards", "quiz", "mind_map", "infographic", "timeline", "comparison", "glossary", "faq", "diagram", "editorial", "study_plan", "image"] as ArtType[]).map((t) => (
            <Button key={t} variant="secondary" className="justify-start" disabled={!readyCount} title={readyCount ? TYPES[t].hint : "Ajoutez d’abord une source"} onClick={() => setCreating(t)}>
              {TYPES[t].icon} {TYPES[t].label}
            </Button>
          ))}
          <Button
            variant="secondary"
            className="col-span-2 justify-start"
            disabled={!readyCount}
            title={readyCount ? "Créer un podcast dialogué à deux voix à partir des sources sélectionnées" : "Ajoutez d’abord une source"}
            onClick={() => setCreating("audio")}
          >
            <AudioLines aria-hidden /> Audio Overview · Podcast à deux voix
          </Button>
        </div>
      )}
      {failedLoad ? (
        <div className="p-3"><Alert tone="danger" title="Studio indisponible" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Réessayer</Button>} /></div>
      ) : arts === null ? (
        <div className="grid gap-3 p-4" aria-busy="true" aria-label="Chargement du Studio">{[0, 1].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : arts.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Rien de généré pour l’instant">
          {!canEdit ? "Les contenus générés par les éditeurs apparaîtront ici."
            : readyCount ? "Choisissez un format ci-dessus : il sera créé à partir de vos sources sélectionnées."
            : "Ajoutez une source, puis générez rapports, fiches, quiz ou cartes mentales."}
        </EmptyState>
      ) : (
        <ul className="grid gap-0.5 p-2">
          {arts.map((a) => (
            <li key={a.id} className="grid gap-1">
              <ListRow
                icon={TYPES[a.type].icon}
                title={a.status === "ready" ? <button className="w-full truncate text-left hover:underline" onClick={() => view(a)}>{label(a)}</button> : label(a)}
                meta={a.status === "failed" ? <span className="text-danger">{ERRORS[a.error_code ?? ""] ?? "Échec de la génération."} Crédit restitué.</span>
                  : busy(a.status) ? (a.stage ? `${a.stage[0].toUpperCase()}${a.stage.slice(1)}…` : "En file d’attente…")
                  : `${TYPES[a.type].label} · ${fmt.format(new Date(a.created_at))}`}
                trailing={
                  <span className="flex items-center gap-1">
                    {a.unread && <span role="img" aria-label="Non lu" className="size-2 rounded-pill bg-accent" />}
                    {busy(a.status) && <Badge tone="accent">{a.progress ? `${a.progress} %` : "En cours"}</Badge>}
                    {a.status === "failed" && canEdit && <Button size="icon-sm" variant="ghost" aria-label={`Relancer ${label(a)}`} onClick={() => void generate(a.type, a.options ?? {}, a.custom_prompt ?? undefined)}><RotateCcw aria-hidden /></Button>}
                    {canEdit && a.status === "ready" && <Button size="icon-sm" variant="ghost" aria-label={`Importer ${label(a)} comme source`} title="Importer comme source" onClick={() => void importAsSource(a.id, onImported)}><FilePlus2 aria-hidden /></Button>}
                    {canEdit && !busy(a.status) && <Button size="icon-sm" variant="ghost" aria-label={`Supprimer ${label(a)}`} onClick={() => void remove(a)}><Trash2 aria-hidden /></Button>}
                  </span>
                }
              />
              {busy(a.status) && <div className="px-3 pb-1"><Progress value={a.progress || undefined} label={`Génération : ${TYPES[a.type].label}`} /></div>}
            </li>
          ))}
        </ul>
      )}
      <CreateDialog type={creating} notebookId={notebookId} sourceIds={sourceIds} referenceImageId={referenceImageId} onClose={() => { setCreating(null); setReferenceImageId(null); }} onGenerate={generate} />
      <ArtifactViewer id={open} canShare={canEdit} onImported={onImported} onEditImage={(artifactId) => { setOpen(null); setReferenceImageId(artifactId); setCreating("image"); }} onClose={() => setOpen(null)} sourceTitle={sourceTitle} onOpenCitation={onOpenCitation} onAsk={(t) => { setOpen(null); onAsk(t); }} />
    </Panel>
  );
}

/* ------------------------------------------------------------- Création ---- */

const REPORT_MODELS = [
  { id: "custom", title: "Créer le vôtre", description: "Définissez votre structure, votre ton et vos consignes." },
  { id: "briefing", title: "Document de synthèse", description: "Les informations essentielles, les points clés et les citations des sources." },
  { id: "study_guide", title: "Guide d'étude", description: "Notions clés, explications, questions de révision et glossaire." },
  { id: "blog_post", title: "Article de blog", description: "Un article fluide, structuré et agréable à lire." },
] as const;
type AiReportModel = { id: string; title: string; description: string; instruction: string };

function CreateDialog({ type, notebookId, sourceIds, referenceImageId, onClose, onGenerate }: { type: ArtType | null; notebookId: string; sourceIds: string[]; referenceImageId?: string | null; onClose: () => void; onGenerate: (t: ArtType, o: Record<string, string>, p?: string) => Promise<boolean> }) {
  const [opts, setOpts] = React.useState<Record<string, string>>({});
  const [prompt, setPrompt] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [aiModels, setAiModels] = React.useState<AiReportModel[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = React.useState(false);
  const [aiModelsError, setAiModelsError] = React.useState(false);
  const [selectedAiModel, setSelectedAiModel] = React.useState<string | null>(null);
  const [imageModels, setImageModels] = React.useState<{ id: string; name: string }[]>([]);
  const [imageModelsError, setImageModelsError] = React.useState(false);
  const styleCarouselRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (type !== "image") return;
    let active = true;
    fetch("/api/v1/ai/image-models").then(async (response) => {
      if (!response.ok) throw new Error("image_catalog_unavailable");
      return response.json() as Promise<{ models: { id: string; name: string }[]; defaultModelId: string }>;
    }).then((result) => {
      if (!active) return;
      setImageModels(result.models ?? []);
      setImageModelsError(false);
      setOpts((current) => ({ ...current, modelId: current.modelId || result.defaultModelId }));
    }).catch(() => { if (active) setImageModelsError(true); });
    return () => { active = false; };
  }, [type]);
  const sourceKey = sourceIds.join(",");
  const aiModelsCache = React.useRef<{ notebookId: string; sourceIds: Set<string>; suggestions: AiReportModel[] } | null>(null);
  React.useEffect(() => {
    if (type !== "report" || !sourceKey) return;
    const currentSourceIds = new Set(sourceKey.split(",").filter(Boolean));
    const cached = aiModelsCache.current;
    // Réutiliser les suggestions si les sources n'ont pas changé ou si seules des sources ont été retirées.
    // Une nouvelle analyse OpenRouter n'est nécessaire que lorsqu'au moins une source inédite est ajoutée.
    if (cached && cached.notebookId === notebookId && [...currentSourceIds].every((id) => cached.sourceIds.has(id))) {
      setAiModels(cached.suggestions);
      setAiModelsError(false);
      return;
    }

    let active = true;
    setAiModelsError(false);
    setAiModelsLoading(true);
    fetch(`/api/v1/notebooks/${notebookId}/artifacts/suggestions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceIds: [...currentSourceIds] }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("suggestions_unavailable");
      const result = await response.json() as { suggestions?: AiReportModel[] };
      if (!Array.isArray(result.suggestions)) throw new Error("invalid_suggestions");
      if (active) {
        setAiModels(result.suggestions);
        aiModelsCache.current = { notebookId, sourceIds: currentSourceIds, suggestions: result.suggestions };
      }
    }).catch(() => {
      if (active) setAiModelsError(true);
    }).finally(() => {
      if (active) setAiModelsLoading(false);
    });
    return () => { active = false; };
  }, [type, notebookId, sourceKey]);
  React.useEffect(() => {
    setOpts(type === "report" ? { template: "briefing", reportFormat: "document" } : type === "flashcards" || type === "quiz" ? { difficulty: "medium", count: "standard" } : type === "audio" ? { format: "deep_dive", duration: "standard", style: "accessible" } : type === "infographic" ? { language: "fr", orientation: "landscape", visualStyle: "auto", detailLevel: "standard", sourceScope: "selected" } : type === "image" ? { orientation: "landscape", sourceScope: "selected" } : {});
    setPrompt("");
  }, [type]);
  if (!type) return null;
  const choice = (key: string, text: string, values: [string, string][]) => (
    <Field id={`opt-${key}`} label={text}>
      <select className="h-10 w-full rounded-md border border-border-input bg-surface-raised px-3 text-sm" value={opts[key] ?? values[0][0]} onChange={(e) => setOpts({ ...opts, [key]: e.target.value })}>
        {values.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
  const selectTemplate = (id: string) => {
    setSelectedAiModel(null);
    setOpts((current) => ({ ...current, template: id }));
  };
  const modelCard = (model: { id: string; title: string; description: string }) => {
    const selected = opts.template === model.id;
    return (
      <button key={model.id} type="button" aria-pressed={selected} onClick={() => selectTemplate(model.id)}
        className={cn("flex min-h-28 flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft/40", selected ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-border bg-surface")}>
        <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
          {model.title}
          {selected ? <Check className="size-4 shrink-0 text-accent" aria-label="Sélectionné" /> : <span className="size-4 shrink-0 rounded-full border border-border" />}
        </span>
        <span className="text-xs leading-5 text-text-muted">{model.description}</span>
      </button>
    );
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const audioPrompt = type === "audio" ? `${AUDIO_OVERVIEW_MARKER}${prompt.trim() ? `\\n${prompt.trim()}` : ""}` : undefined;
    const selectedModel = aiModels.find((model) => model.id === selectedAiModel);
    const reportPrompt = [selectedModel?.instruction, prompt.trim()].filter(Boolean).join("\n\n");
    const imageOptions = type === "image" && referenceImageId ? { ...opts, referenceArtifactId: referenceImageId } : opts;
    const ok = await onGenerate(type!, imageOptions, type === "audio" ? audioPrompt : type === "report" ? reportPrompt || undefined : prompt.trim() || undefined);
    setSending(false);
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={type === "infographic" ? "Personnaliser l’infographie" : type === "image" ? "Créer une image IA" : type === "report" ? "Créer un rapport" : `Générer : ${TYPES[type].label}`} description={type === "infographic" ? "Configurez la langue, le format, le style et les sources avant de lancer la création." : type === "image" ? "Décrivez l’image souhaitée à partir des sources du notebook." : type === "report" ? "Choisissez un format et un modèle pour composer un rapport à partir de vos sources." : "À partir des sources sélectionnées. La génération continue en arrière-plan."}>
        <form onSubmit={submit} className="grid gap-5">
          {type === "image" && referenceImageId && <Alert tone="warning" title="Modification d’une image existante">L’image actuelle sera utilisée comme référence. Une nouvelle image sera créée sans écraser l’originale.</Alert>}
          {type === "report" && (
            <>
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Format</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    { id: "interactive", title: "Interactif", description: "Un rapport à explorer avec des contenus Studio intégrés." },
                    { id: "document", title: "Document", description: "Un document structuré contenant uniquement du texte." },
                  ]).map((format) => (
                    <button key={format.id} type="button" aria-pressed={(opts.reportFormat ?? "document") === format.id}
                      onClick={() => setOpts({ ...opts, reportFormat: format.id })}
                      className={cn("flex min-h-20 items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-colors", (opts.reportFormat ?? "document") === format.id ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-raised")}>
                      <span className="grid gap-1"><span className="font-medium">{format.title}</span><span className="text-xs leading-5 text-text-muted">{format.description}</span></span>
                      {(opts.reportFormat ?? "document") === format.id ? <Check className="mt-1 size-4 shrink-0" /> : <span className="mt-1 size-4 shrink-0 rounded-full border border-border" />}
                    </button>
                  ))}
                </div>
              </section>
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Modèle</h3>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{REPORT_MODELS.map(modelCard)}</div>
              </section>
              <section className="grid gap-3">
                <h3 className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4" /> Modèles suggérés par Leanna</h3>
                <p className="text-xs text-text-muted">Leanna analyse les sources sélectionnées et propose des modèles adaptés à leur contenu.</p>
                {aiModelsLoading ? (
                  <div className="grid gap-2 sm:grid-cols-2" aria-live="polite" aria-busy="true">
                    {[0, 1, 2, 3].map((item) => <div key={item} className="grid min-h-24 gap-2 rounded-xl border border-border bg-surface p-4"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div>)}
                  </div>
                ) : aiModelsError ? (
                  <Alert tone="warning" title="Suggestions IA indisponibles">
                    Vérifiez la configuration OpenRouter. Vous pouvez toujours créer un rapport avec les modèles classiques.
                  </Alert>
                ) : aiModels.length ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {aiModels.map((model) => {
                      const selected = selectedAiModel === model.id;
                      return <button key={model.id} type="button" aria-pressed={selected} onClick={() => { setSelectedAiModel(model.id); setOpts((current) => ({ ...current, template: "custom" })); }}
                        className={cn("flex min-h-28 flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft/40", selected ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-border bg-surface")}>
                        <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold">{model.title}{selected ? <Check className="size-4 shrink-0 text-accent" aria-label="Sélectionné" /> : <span className="size-4 shrink-0 rounded-full border border-border" />}</span>
                        <span className="text-xs leading-5 text-text-muted">{model.description}</span>
                      </button>;
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border p-3 text-xs text-text-muted">Les suggestions personnalisées apparaîtront ici après l’analyse des sources.</p>
                )}
              </section>
            </>
          )}
          {type === "infographic" && (
            <div className="grid gap-5">
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Langue</h3>
                {choice("language", "Langue", [["fr", "Français"], ["en", "Anglais"], ["es", "Espagnol"], ["de", "Allemand"], ["it", "Italien"], ["pt", "Portugais"], ["nl", "Néerlandais"]])}
              </section>
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Orientation</h3>
                <div role="radiogroup" aria-label="Orientation de l’infographie" className="grid grid-cols-3 gap-2">
                  {([["landscape", "Paysage"], ["portrait", "Portrait"], ["square", "Carré"]] as const).map(([value, title]) => (
                    <button key={value} type="button" role="radio" aria-checked={(opts.orientation ?? "landscape") === value} onClick={() => setOpts((current) => ({ ...current, orientation: value }))} className={cn("grid min-h-16 place-items-center gap-2 rounded-xl border p-3 text-sm transition-colors", (opts.orientation ?? "landscape") === value ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-border bg-surface hover:bg-surface-raised")}>
                      <span aria-hidden className={cn("rounded border-2 border-current", value === "portrait" ? "h-8 w-5" : value === "landscape" ? "h-5 w-9" : "size-7")} />
                      <span>{title}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Style visuel</h3>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Afficher les styles suivants" onClick={() => styleCarouselRef.current?.scrollBy({ left: 340, behavior: "smooth" })}><ChevronRight aria-hidden /></Button>
                </div>
                <div ref={styleCarouselRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                  {([
                    ["auto", "Sélection automatique", "autoselect.png"], ["kawaii", "Kawaii", "kawaii.jpeg"],
                    ["claymation", "Pâte à modeler", "claymation.jpeg"], ["sketchnote", "Croquis", "sketchnote.jpeg"],
                    ["anime", "Anime", "anime.jpeg"], ["editorial", "Éditorial", "editorial.jpeg"],
                    ["storyboard", "Éducatif", "storyboard.jpeg"], ["bentogrid", "Grille Bento", "bentogrid.jpeg"],
                    ["bricks", "Briques", "bricks.jpeg"], ["scientific", "Scientifique", "scientific.jpeg"],
                    ["professional", "Professionnel", "professional.jpeg"],
                  ] as const).map(([value, title, image]) => {
                    const selected = (opts.visualStyle ?? "auto") === value;
                    return <button key={value} type="button" aria-pressed={selected} onClick={() => setOpts((current) => ({ ...current, visualStyle: value }))} className={cn("w-36 shrink-0 snap-start overflow-hidden rounded-xl border text-left transition-colors", selected ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-border bg-surface hover:border-accent")}>
                      <span role="img" aria-label={title} className="block aspect-[5/3] bg-cover bg-center bg-muted" style={{ backgroundImage: "url(https://www.gstatic.com/tailwind/_/static/infographic/" + image + ")" }} />
                      <span className="flex min-h-11 items-center justify-between gap-1 px-2 py-2 text-xs font-medium">{title}{selected && <Check className="size-4 shrink-0 text-accent" aria-label="Sélectionné" />}</span>
                    </button>;
                  })}
                </div>
              </section>
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Niveau de détail</h3>
                <div role="radiogroup" aria-label="Niveau de détail" className="flex flex-wrap gap-2">
                  {([["concise", "Concis"], ["standard", "Standard"], ["detailed", "Détaillé"]] as const).map(([value, title]) => (
                    <button key={value} type="button" role="radio" aria-checked={(opts.detailLevel ?? "standard") === value} onClick={() => setOpts((current) => ({ ...current, detailLevel: value }))} className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors", (opts.detailLevel ?? "standard") === value ? "border-accent bg-accent-soft font-medium" : "border-border bg-surface hover:bg-surface-raised")}>
                      {title}{value === "detailed" && <Badge tone="warning">BÊTA</Badge>}
                    </button>
                  ))}
                </div>
              </section>
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Sources</h3>
                {choice("sourceScope", "Sources à utiliser", [["selected", sourceIds.length === 1 ? "1 source" : sourceIds.length + " sources"], ["all", "Toutes les sources prêtes du notebook"]])}
                <p className="text-xs text-text-muted">Les citations seront vérifiées et reliées aux passages des sources utilisées.</p>
              </section>
            </div>
          )}
          {type === "image" && <section className="grid gap-3 rounded-xl border border-border p-3"><h3 className="text-sm font-semibold">Modèle et format</h3>{imageModels.length > 0 ? choice("modelId", "Modèle IA", imageModels.map((model) => [model.id, model.name] as [string, string])) : <p className="text-xs text-text-muted">{imageModelsError ? "Catalogue indisponible : le modèle par défaut sera utilisé." : "Chargement des modèles image…"}</p>}{choice("orientation", "Orientation", [["landscape", "Paysage"], ["portrait", "Portrait"], ["square", "Carré"]])}{choice("sourceScope", "Sources à utiliser", [["selected", sourceIds.length + " sources sélectionnées"], ["all", "Toutes les sources prêtes"]])}<p className="text-xs text-text-muted">Modèle par défaut : Nano Banana 2. Configurable côté serveur avec OPENROUTER_IMAGE_MODEL.</p></section>}
          {type === "audio" && <div className="grid gap-4 sm:grid-cols-2">{choice("format", "Format du podcast", [["deep_dive", "Deep Dive · approfondi"], ["brief", "Brief · essentiel"], ["critique", "Critique · analyse"], ["debate", "Débat · points de vue"]])}{choice("duration", "Durée cible", [["short", "Court · 5 min"], ["standard", "Standard · 10 min"], ["long", "Long · 15 min"]])}{choice("style", "Ton", [["accessible", "Accessible et pédagogique"], ["professional", "Professionnel et précis"], ["dynamic", "Dynamique et vivant"]])}</div>}
          {(type === "flashcards" || type === "quiz") && <div className="grid gap-4 sm:grid-cols-2">{choice("difficulty", "Difficulté", [["easy", "Facile"], ["medium", "Moyenne"], ["hard", "Difficile"]])}{choice("count", "Quantité", [["fewer", "Moins"], ["standard", "Standard"], ["more", "Plus"]])}</div>}
          <Field id="opt-prompt" label={type === "image" ? "Décrivez l’image à générer" : type === "infographic" ? "Décrivez l’infographie que vous souhaitez créer" : type === "report" ? "Personnaliser le modèle (facultatif)" : "Consignes (facultatif)"} hint={type === "image" ? "Sujet, style, composition, couleurs et texte éventuel." : type === "infographic" ? undefined : type === "report" ? "Public visé, ton, plan souhaité, longueur ou éléments à mettre en avant…" : "Public visé, angle, thèmes à privilégier…"}>
            <Textarea value={prompt} maxLength={4000} onChange={(e) => setPrompt(e.target.value)} placeholder={type === "image" ? "Ex. : une illustration éditoriale élégante, format paysage, palette bleu nuit et ivoire…" : type === "infographic" ? "Indiquez le style, la couleur ou le thème principal : « Utilise un thème de couleurs bleu et mets en avant les… »" : type === "report" ? "Ex. : rédiger pour une direction, avec une synthèse exécutive et des recommandations concrètes." : "Ex. : pour un public débutant, insister sur la sécurité."} />
          </Field>
          {type === "infographic" ? (
            <div className="grid gap-4 border-t pt-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted" aria-label="Estimation de consommation IA">
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-text-subtle" /> Déjà utilisé</span>
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-accent" /> Utilisation estimée</span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>Générer plus tard</Button>
                <Button type="submit" loading={sending}><Sparkles aria-hidden /> Générer maintenant</Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2 border-t pt-4">
              <DialogClose asChild><Button type="button" variant="secondary">Annuler</Button></DialogClose>
              <Button type="submit" loading={sending}><Sparkles aria-hidden /> {type === "report" ? "Générer le rapport" : "Générer"}</Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------- Visionneuses ---- */

type Content = { image_path?: string; model?: string; markdown?: string; cards?: Card[]; questions?: QuizQ[]; root?: MapNode; audio_path?: string; audio_format?: string; tts_characters?: number; segment_count?: number; estimated_duration_seconds?: number; audio_bytes?: number | null };

type Progress = { item_key: string; state: string; answer: number | null };

/** Progression personnelle enregistrée côté serveur ; un échec n'interrompt pas la révision. */
async function saveProgress(id: string, items: { key: string; state: string; answer?: number }[]) {
  const r = await fetch(`/api/v1/artifacts/${id}/progress`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) }).catch(() => null);
  if (!r?.ok) toast({ title: "Progression non enregistrée", description: "Vous pouvez continuer ; elle ne sera pas conservée.", tone: "error" });
}
async function resetProgress(id: string) {
  const r = await fetch(`/api/v1/artifacts/${id}/progress`, { method: "DELETE" }).catch(() => null);
  if (!r?.ok) toast({ title: "Remise à zéro non enregistrée", tone: "error" });
}

function ArtifactViewer({ id, canShare, onImported, onEditImage, onClose, sourceTitle, onOpenCitation, onAsk }: { id: string | null; canShare: boolean; onImported?: () => void; onEditImage?: (id: string) => void; onClose: () => void; sourceTitle: (id: string) => string | undefined; onOpenCitation?: (c: Cite) => void; onAsk: (t: string) => void }) {
  const [data, setData] = React.useState<{ artifact: { id: string; type: ArtType; title: string | null; content: Content; options: Record<string, string> | null; custom_prompt: string | null }; citations: Cite[]; progress: Progress[] } | null>(null);
  const [failed, setFailed] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playbackRate, setPlaybackRate] = React.useState("1");
  React.useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = Number(playbackRate); }, [playbackRate, data]);
  React.useEffect(() => {
    if (!id) return;
    setData(null); setFailed(false);
    fetch(`/api/v1/artifacts/${id}`).then(async (r) => { if (!r.ok) throw new Error(); setData(await r.json()); }).catch(() => setFailed(true));
  }, [id]);
  const art = data?.artifact;
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={art ? (art.title || TYPES[art.type].label) : "Contenu du Studio"}>
        {id && canShare && <ImportAsSourceButton artifactId={id} disabled={!art} onImported={onImported} />}
        {id && canShare && <ArtifactShareButton artifactId={id} disabled={!art} />}
        <div className="max-h-[70dvh] overflow-y-auto pr-1">
          {art?.custom_prompt && !art.custom_prompt.startsWith(AUDIO_OVERVIEW_MARKER) && <p className="mb-4 rounded-md bg-surface px-3 py-2 text-xs text-text-muted"><span className="font-medium">Consignes de génération :</span> {art.custom_prompt}</p>}
          {failed ? <Alert tone="danger" title="Contenu indisponible" />
            : !art ? <div className="grid gap-2" aria-busy="true" aria-label="Chargement"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /></div>
             : art.type === "image" ? <div className="grid gap-3"><img src={"/api/v1/artifacts/" + art.id + "/image"} alt={art.title || "Image générée par IA"} className="mx-auto max-h-[65vh] w-auto max-w-full rounded-xl border border-border object-contain" /><div className="flex flex-wrap items-center justify-between gap-3"><a className="text-sm font-medium text-accent underline" href={"/api/v1/artifacts/" + art.id + "/image"} download="leanna-image.png">Télécharger l’image</a>{canShare && <Button size="sm" variant="secondary" onClick={() => onEditImage?.(art.id)}><Sparkles aria-hidden /> Modifier cette image</Button>}</div><p className="text-xs text-text-muted">{String(art.content.model || "OpenRouter")}</p></div>
             : art.type === "infographic" ? <InfographicView markdown={art.content.markdown ?? ""} options={art.options ?? {}} citations={data!.citations} sourceTitle={sourceTitle} onOpen={onOpenCitation ? (c) => { onClose(); onOpenCitation(c); } : undefined} />
             : art.type === "diagram" ? <DiagramEditor markdown={art.content.markdown ?? ""} />
             : art.type === "report" || art.type === "audio" || ["timeline", "comparison", "glossary", "faq", "editorial", "study_plan"].includes(art.type) ? <div className="grid gap-4">{art.content.audio_path && <div className="grid gap-2 rounded-lg border border-border p-3"><audio ref={audioRef} controls preload="metadata" className="w-full" src={`/api/v1/artifacts/${art.id}/audio`} /><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">{typeof art.content.estimated_duration_seconds === "number" && <span>Durée estimée : {Math.floor(art.content.estimated_duration_seconds / 60)} min</span>}{typeof art.content.tts_characters === "number" && <span>{art.content.tts_characters.toLocaleString("fr-FR")} caractères TTS</span>}{typeof art.content.segment_count === "number" && <span>{art.content.segment_count} répliques</span>}</div><label className="flex items-center gap-2 text-xs text-text-muted">Vitesse <select aria-label="Vitesse de lecture" className="h-8 rounded-md border border-border-input bg-surface-raised px-2 text-sm text-text" value={playbackRate} onChange={(e) => setPlaybackRate(e.target.value)}>{["0.75", "1", "1.25", "1.5", "1.75", "2"].map((v) => <option key={v} value={v}>{v}×</option>)}</select></label><a className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline" href={`/api/v1/artifacts/${art.id}/audio?download=1`}><Download aria-hidden size={16} /> Télécharger le MP3</a></div></div>}<Markdown text={art.content.markdown ?? ""} citations={data!.citations} sourceTitle={sourceTitle} onOpen={onOpenCitation ? (c) => { onClose(); onOpenCitation(c); } : undefined} /></div>
            : art.type === "flashcards" ? <Flashcards id={art.id} title={art.title || "fiches"} cards={art.content.cards ?? []} progress={data!.progress} />
            : art.type === "quiz" ? <Quiz id={art.id} questions={art.content.questions ?? []} progress={data!.progress} onExplain={onAsk} />
            : art.content.root ? <MindMap root={art.content.root} onAsk={(l) => onAsk(`Explique « ${l} » à partir de mes sources.`)} />
            : <Alert tone="danger" title="Contenu vide" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Importe un contenu généré comme source (note) du carnet, pour pouvoir le sélectionner et le citer. */
async function importAsSource(artifactId: string, onImported?: () => void): Promise<boolean> {
  try {
    const r = await fetch(`/api/v1/artifacts/${artifactId}/import-source`, { method: "POST" });
    if (r.ok || r.status === 409) {
      onImported?.();
      toast(r.ok ? { title: "Importé dans les sources", description: "Il sera indexé puis utilisable dans le chat et le Studio.", tone: "success" } : { title: "Déjà importé dans les sources" });
      return true;
    }
    toast({ title: "Import impossible", description: r.status === 422 ? "Ce contenu n’a pas de texte exploitable." : "Réessayez dans un instant.", tone: "error" });
  } catch { toast({ title: "Import impossible", tone: "error" }); }
  return false;
}

function ImportAsSourceButton({ artifactId, disabled, onImported }: { artifactId: string; disabled: boolean; onImported?: () => void }) {
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  React.useEffect(() => setDone(false), [artifactId]);
  async function run() {
    setLoading(true);
    setDone(await importAsSource(artifactId, onImported));
    setLoading(false);
  }
  return (
    <div className="mb-2 flex justify-end">
      <Button size="sm" variant="secondary" disabled={disabled || loading || done} loading={loading} onClick={() => void run()}>
        {done ? <Check aria-hidden /> : <FilePlus2 aria-hidden />} {done ? "Importé dans les sources" : "Importer comme source"}
      </Button>
    </div>
  );
}

function InfographicView({ markdown, options, citations, sourceTitle, onOpen }: { markdown: string; options: Record<string, string>; citations: Cite[]; sourceTitle: (id: string) => string | undefined; onOpen?: (c: Cite) => void }) {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "") ?? "Synthèse visuelle";
  const stats = [...markdown.matchAll(/(?:^|\n)[-*]\s+([^:\n]{2,60}):\s*([^\n]{1,70})/g)].slice(0, 4).map((m) => ({ label: m[1].replace(/\*\*/g, ""), value: m[2].replace(/\[(\d+)\]/g, "") }));
  const sections: { title: string; items: string[] }[] = [];
  let current: { title: string; items: string[] } | null = null;
  for (const line of lines) {
    const h = /^#{2,4}\s+(.+)/.exec(line.trim());
    if (h) { current = { title: h[1], items: [] }; sections.push(current); continue; }
    const item = /^\s*(?:[-*]|\d+[.)])\s+(.+)/.exec(line);
    if (item && current && current.items.length < 4) current.items.push(item[1].replace(/\[(\d+(?:,\s*\d+)*)\]/g, "").replace(/\*\*/g, ""));
  }
  const cards = sections.filter((x) => x.items.length).slice(0, 6);
  const cols = cards.length > 3 ? 3 : Math.max(1, cards.length);
  const palettes: Record<string, { accent: string; soft: string }> = {
    auto: { accent: "#2563eb", soft: "#dbeafe" }, kawaii: { accent: "#db6b9a", soft: "#fce7f3" },
    claymation: { accent: "#b96b43", soft: "#f4dfd0" }, sketchnote: { accent: "#2563a6", soft: "#e0efff" },
    anime: { accent: "#7c3aed", soft: "#ede9fe" }, editorial: { accent: "#1f2937", soft: "#e5e7eb" },
    storyboard: { accent: "#0f766e", soft: "#ccfbf1" }, bentogrid: { accent: "#4f46e5", soft: "#e0e7ff" },
    bricks: { accent: "#c2410c", soft: "#ffedd5" }, scientific: { accent: "#0e7490", soft: "#cffafe" },
    professional: { accent: "#174b75", soft: "#dceaf4" },
  };
  const palette = palettes[options.visualStyle ?? "auto"] ?? palettes.auto;
  const orientation = options.orientation ?? "landscape";
  const canvasSize = orientation === "portrait" ? { width: 620, height: 960 } : orientation === "square" ? { width: 800, height: 800 } : { width: 960, height: 620 };
  const detailLabels: Record<string, string> = { concise: "Concis", standard: "Standard", detailed: "Détaillé", very_detailed: "Très détaillé" };
  const styleLabels: Record<string, string> = { auto: "Automatique", kawaii: "Kawaii", claymation: "Pâte à modeler", sketchnote: "Croquis", anime: "Anime", editorial: "Éditorial", storyboard: "Éducatif", bentogrid: "Grille Bento", bricks: "Briques", scientific: "Scientifique", professional: "Professionnel" };
  const downloadSvg = () => {
    const svg = document.getElementById("studio-infographic-preview");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "infographie-studio.svg"; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-text-muted">{orientation === "portrait" ? "Portrait" : orientation === "square" ? "Carré" : "Paysage"} · {styleLabels[options.visualStyle ?? "auto"] ?? "Automatique"} · {detailLabels[options.detailLevel ?? "standard"] ?? "Standard"}</p><Button size="sm" variant="secondary" onClick={downloadSvg}><Download aria-hidden size={15} /> Exporter en SVG</Button></div>
    <div className="mx-auto overflow-hidden rounded-xl border border-border bg-surface" style={{ width: "100%", maxWidth: orientation === "portrait" ? "420px" : "100%", aspectRatio: canvasSize.width + " / " + canvasSize.height }}>
      <svg id="studio-infographic-preview" width={canvasSize.width} height={canvasSize.height} viewBox="0 0 960 620" preserveAspectRatio="xMidYMid meet" role="img" aria-label={title} className="h-full w-full" style={{ "--infographic-accent": palette.accent, "--infographic-soft": palette.soft } as React.CSSProperties}>
        <defs><linearGradient id="studioInfographicBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="var(--infographic-accent)" stopOpacity=".16" /><stop offset="100%" stopColor="var(--color-surface, #f3f1ec)" /></linearGradient></defs>
        <rect width="960" height="620" rx="22" fill="var(--infographic-soft)" />
        <text x="48" y="64" fontSize="29" fontWeight="700" fill="currentColor">{title.slice(0, 58)}</text>
        <text x="48" y="94" fontSize="13" fill="currentColor" opacity=".62">SYNTHÈSE EXTRAITE DES SOURCES DU NOTEBOOK</text>
        {stats.map((stat, i) => { const w = 864 / stats.length - 14; return <g key={i} transform={"translate(" + (48 + i * (864 / stats.length)) + ",124)"}><rect width={w} height="94" rx="12" fill="var(--color-surface, #f3f1ec)" stroke="var(--color-border, #e2ded5)" /><text x="14" y="30" fontSize="12" fill="currentColor" opacity=".65">{stat.label.slice(0, 24)}</text><text x="14" y="65" fontSize="23" fontWeight="700" fill="var(--infographic-accent)">{stat.value.slice(0, 18)}</text></g>; })}
        {cards.map((card, i) => { const w = 864 / cols - 14; const x = 48 + (i % cols) * (864 / cols); const y = 246 + Math.floor(i / cols) * 164; return <g key={i} transform={"translate(" + x + "," + y + ")"}><rect width={w} height="146" rx="12" fill="var(--color-surface, #f3f1ec)" stroke="var(--color-border, #e2ded5)" /><circle cx="22" cy="24" r="11" fill="var(--infographic-accent)" opacity=".18" /><text x="22" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--infographic-accent)">{i + 1}</text><text x="42" y="29" fontSize="15" fontWeight="700" fill="currentColor">{card.title.slice(0, 28)}</text>{card.items.map((item, j) => <g key={j}><circle cx="18" cy={58 + j * 20} r="3" fill="var(--infographic-accent)" /><text x="30" y={62 + j * 20} fontSize="11.5" fill="currentColor">{item.slice(0, Math.floor((w - 48) / 7))}</text></g>)}</g>; })}
        <text x="48" y="590" fontSize="11" fill="currentColor" opacity=".55">Détails et références vérifiées conservés sous le visuel.</text>
      </svg>
    </div>
    <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Afficher le contenu détaillé et les citations</summary><div className="pt-4"><Markdown text={markdown} citations={citations} sourceTitle={sourceTitle} onOpen={onOpen} /></div></details>
  </div>;
}

function DiagramEditor({ markdown }: { markdown: string }) {
  const [source, setSource] = React.useState(markdown.match(/```mermaid\s*([\s\S]*?)```/i)?.[1]?.trim() ?? markdown);
  const [editing, setEditing] = React.useState(false);
  const code = source;
  const direction = /^\s*(?:flowchart|graph)\s+LR/im.test(code) ? "LR" : "TD";
  const nodeMap = new Map<string, string>();
  const edges: { from: string; to: string }[] = [];
  const nodePattern = /([A-Za-z0-9_]+)\s*(?:\[\s*([^\]]+)\s*\]|\(\(\s*([^)]+)\s*\)\)|\(\s*([^)]+)\s*\)|\{\s*([^}]+)\s*\})/g;
  for (const m of code.matchAll(nodePattern)) nodeMap.set(m[1], (m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[1]).trim());
  for (const m of code.matchAll(/([A-Za-z0-9_]+)\s*(?:-->|==>|-\.\->)\s*(?:\|[^|]*\|\s*)?([A-Za-z0-9_]+)/g)) {
    if (!nodeMap.has(m[1])) nodeMap.set(m[1], m[1]);
    if (!nodeMap.has(m[2])) nodeMap.set(m[2], m[2]);
    if (!edges.some((e) => e.from === m[1] && e.to === m[2])) edges.push({ from: m[1], to: m[2] });
  }
  const nodes = [...nodeMap.entries()].slice(0, 18);
  const horizontal = direction === "LR";
  const positions = new Map(nodes.map(([id], i) => [id, horizontal ? { x: 35 + i * 185, y: 70 } : { x: 285, y: 25 + i * 100 }]));
  const width = horizontal ? Math.max(400, nodes.length * 185 + 30) : 720;
  const height = horizontal ? 190 : Math.max(190, nodes.length * 100 + 20);
  const downloadSvg = () => {
    const svg = document.getElementById("studio-diagram-preview");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "diagramme-studio.svg"; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-text-muted">Aperçu du diagramme · {nodes.length} nœuds · {edges.length} liens</p><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>{editing ? "Masquer l’éditeur" : "Modifier le code Mermaid"}</Button><Button size="sm" variant="secondary" onClick={downloadSvg} disabled={!nodes.length}><Download aria-hidden size={15} /> SVG</Button></div></div>
    {editing && <Textarea value={source} onChange={(e) => setSource(e.target.value)} rows={8} maxLength={12000} aria-label="Code Mermaid éditable" />}
    {nodes.length ? <div className="overflow-x-auto rounded-xl border border-border bg-surface p-3"><svg id="studio-diagram-preview" viewBox={"0 0 " + width + " " + height} role="img" aria-label="Aperçu du diagramme Mermaid" className="mx-auto h-auto max-h-[560px] w-full" style={{ minWidth: horizontal ? Math.min(width, 620) + "px" : undefined }}>
      <defs><marker id="studioDiagramArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="var(--color-text-muted, #5c584f)" /></marker></defs>
      {edges.map((edge, i) => { const a = positions.get(edge.from); const b = positions.get(edge.to); if (!a || !b) return null; return <line key={i} x1={horizontal ? a.x + 140 : a.x + 70} y1={horizontal ? a.y + 32 : a.y + 64} x2={horizontal ? b.x : b.x + 70} y2={horizontal ? b.y + 32 : b.y} stroke="var(--color-text-muted, #5c584f)" strokeWidth="1.5" markerEnd="url(#studioDiagramArrow)" />; })}
      {nodes.map(([id, label]) => { const p = positions.get(id)!; return <g key={id} transform={"translate(" + p.x + "," + p.y + ")"}><rect width="140" height="64" rx="10" fill="var(--color-surface-raised, #ffffff)" stroke="var(--color-accent, #0f4c8a)" strokeWidth="1.5" /><text x="70" y="25" textAnchor="middle" fontSize="10" fill="var(--color-text-muted, #5c584f)">{id}</text><text x="70" y="44" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-text, #1c1b19)">{label.slice(0, 20)}</text></g>; })}
    </svg></div> : <Alert tone="warning" title="Syntaxe non reconnue">La prévisualisation prend en charge les flowcharts Mermaid simples avec nœuds et flèches.</Alert>}
    <p className="text-xs text-text-muted">Les modifications sont locales à cette prévisualisation et ne modifient pas l’artefact enregistré. L’export SVG correspond à l’aperçu rendu.</p>
  </div>;
}

/** Markdown minimal et sûr (aucun HTML injecté) : titres, listes, gras, pastilles [n]. Exporté pour les tests. */
export function Markdown({ text, citations, sourceTitle, onOpen }: { text: string; citations: Cite[]; sourceTitle: (id: string) => string | undefined; onOpen?: (c: Cite) => void }) {
  const byMarker = new Map(citations.map((c) => [c.marker, c]));
  // Inline : lien http(s), pastille [n], gras, italique, code. Aucun HTML injecté.
  const inline = (s: string): React.ReactNode[] => s.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\[\d+\]|\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\s][^*]*\*(?![*\w]))/g).map((part, i) => {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{link[1]}</a>;
    const m = /^\[(\d+)\]$/.exec(part);
    if (m) {
      const c = byMarker.get(Number(m[1]));
      return c ? <Citation key={i} n={c.marker} source={sourceTitle(c.source_id) ?? "Source supprimée"} quote={c.quote_text} verified={c.verified} onOpen={onOpen ? () => onOpen(c) : undefined} /> : null;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    if (/^\*[^*\s][^*]*\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });

  type Item = { indent: number; ordered: boolean; text: string };
  const renderList = (items: Item[], from: number, key: string): [React.ReactNode, number] => {
    const base = items[from].indent;
    const ordered = items[from].ordered;
    const lis: React.ReactNode[] = [];
    let i = from;
    while (i < items.length && items[i].indent >= base) {
      if (items[i].indent > base) {
        const [sub, next] = renderList(items, i, `${key}-${i}`);
        lis.push(<li key={`n${i}`} className="list-none">{sub}</li>);
        i = next;
        continue;
      }
      lis.push(<li key={i}>{inline(items[i].text)}</li>);
      i++;
    }
    const cls = `ml-5 space-y-1.5 marker:text-text-muted ${ordered ? "list-decimal" : "list-disc"}`;
    return [ordered ? <ol key={key} className={cls}>{lis}</ol> : <ul key={key} className={cls}>{lis}</ul>, i];
  };

  const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let items: Item[] = [];
  const flush = () => {
    if (!items.length) return;
    blocks.push(renderList(items, 0, `l${blocks.length}`)[0]);
    items = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { items.push({ indent: Math.floor(li[1].replace(/\t/g, "  ").length / 2), ordered: /\d/.test(li[2]), text: li[3] }); continue; }
    flush();
    if (!t) continue;

    if (t.startsWith("```")) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i]);
      blocks.push(<pre key={`c${i}`} className="overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-sm leading-relaxed"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(t)) { blocks.push(<hr key={`r${i}`} className="my-2 border-border" />); continue; }

    if (t.startsWith("|") && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(lines[i + 1].trim())) {
      const head = cells(t);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      blocks.push(
        <div key={`t${i}`} className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-[0.95em]">
            <thead className="bg-surface"><tr>{head.map((h, k) => <th key={k} scope="col" className="border-b border-border px-3 py-2 font-semibold">{inline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k} className="border-b border-border last:border-0 even:bg-surface/50">{head.map((_, j) => <td key={j} className="px-3 py-2 align-top">{inline(r[j] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (t.startsWith(">")) {
      const quote: string[] = [t.replace(/^>\s?/, "")];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith(">")) quote.push(lines[++i].trim().replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`q${i}`} className="border-l-4 border-accent/40 pl-4 italic text-text-muted">{inline(quote.join(" "))}</blockquote>);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const n = h[1].length;
      const text2 = inline(h[2].replace(/\s+#+$/, ""));
      if (n === 1) blocks.push(<h2 key={i} className="mt-4 border-b border-border pb-2 font-sans text-2xl font-bold tracking-tight first:mt-0">{text2}</h2>);
      else if (n === 2) blocks.push(<h3 key={i} className="mt-4 font-sans text-xl font-semibold first:mt-0">{text2}</h3>);
      else if (n === 3) blocks.push(<h4 key={i} className="mt-3 font-sans text-lg font-semibold">{text2}</h4>);
      else blocks.push(<h5 key={i} className="mt-2 font-sans text-base font-semibold text-text-muted">{text2}</h5>);
      continue;
    }
    blocks.push(<p key={i}>{inline(t)}</p>);
  }
  flush();
  return <div className="grid gap-4 font-serif text-reading leading-relaxed [&>*]:min-w-0">{blocks}</div>;
}

type Card = { key: string; front: string; back: string };
/** Export CSV (recto ; verso), lisible par Excel et les applis de révision. Exporté pour les tests. */
export function cardsToCsv(cards: Card[]) {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return "﻿" + ["Recto,Verso", ...cards.map((c) => `${cell(c.front)},${cell(c.back)}`)].join("\r\n");
}
function downloadCsv(name: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "fiches"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Flashcards({ id, title, cards, progress }: { id: string; title: string; cards: Card[]; progress: Progress[] }) {
  const [acquired, setAcquired] = React.useState(() => new Set(progress.filter((p) => p.state === "got_it").map((p) => p.item_key)));
  // Reprise : seules les fiches pas encore acquises sont reproposées.
  const [deck, setDeck] = React.useState(() => cards.filter((c) => !acquired.has(c.key)));
  const resumed = acquired.size > 0;
  const [i, setI] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [missed, setMissed] = React.useState<Card[]>([]);
  const mark = (ok: boolean) => {
    const c = deck[i];
    void saveProgress(id, [{ key: c.key, state: ok ? "got_it" : "missed" }]);
    if (ok) setAcquired((s) => new Set(s).add(c.key)); else setMissed((m) => [...m, c]);
    setFlipped(false); setI((x) => x + 1);
  };
  const restart = (next: Card[]) => { setDeck(next); setI(0); setMissed([]); setFlipped(false); };
  const [confirm, confirmDialog] = useConfirm();
  const restartAll = async () => {
    if (!(await confirm({ title: "Tout reprendre à zéro ?", description: "Votre progression sur ces fiches sera effacée.", confirmLabel: "Tout reprendre" }))) return;
    await resetProgress(id); setAcquired(new Set()); restart([...cards].sort(() => Math.random() - 0.5)); };
  const exportBtn = <Button size="sm" variant="ghost" onClick={() => downloadCsv(title, cardsToCsv(cards))}>Exporter (CSV)</Button>;
  if (!cards.length) return <Alert tone="warning" title="Aucune fiche" />;
  if (i >= deck.length) return (
    <div className="grid justify-items-center gap-4 py-6 text-center">
      <p className="text-2xl">{acquired.size} / {cards.length} acquises</p>
      <div className="flex flex-wrap justify-center gap-2">
        {missed.length > 0 && <Button onClick={() => restart(missed)}>{missed.length > 1 ? `Revoir les ${missed.length} fiches à retravailler` : "Revoir la fiche à retravailler"}</Button>}
        <Button variant="secondary" onClick={() => void restartAll()}><RotateCcw aria-hidden /> Tout reprendre (mélangé)</Button>
        {exportBtn}
      </div>
      {confirmDialog}
    </div>
  );
  const c = deck[i];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text-muted">Fiche {i + 1} / {deck.length}{resumed && i === 0 ? ` · reprise, ${acquired.size} déjà acquise${acquired.size > 1 ? "s" : ""}` : ""}</p>
        {exportBtn}
      </div>
      <button onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Réponse — cliquer pour revoir la question" : "Question — cliquer pour voir la réponse"}
        className={cn("grid min-h-48 place-items-center rounded-xl border p-6 text-center font-serif text-xl transition-colors", flipped ? "bg-accent-soft text-on-accent-soft" : "bg-surface")}>
        <span aria-live="polite">{flipped ? c.back : c.front}</span>
      </button>
      <div className="flex justify-center gap-2">
        <Button variant="secondary" onClick={() => mark(false)}><X aria-hidden /> À revoir</Button>
        <Button onClick={() => mark(true)}><Check aria-hidden /> Je savais</Button>
      </div>
    </div>
  );
}

type QuizQ = { key: string; question: string; choices: string[]; answer: number; hint?: string; explanation?: string };
function Quiz({ id, questions, progress, onExplain }: { id: string; questions: QuizQ[]; progress: Progress[]; onExplain: (text: string) => void }) {
  const answered0 = new Map(progress.map((p) => [p.item_key, p]));
  // Reprise à la première question sans réponse ; le score tient compte des réponses déjà données.
  const start = questions.findIndex((q) => !answered0.has(q.key));
  const [i, setI] = React.useState(start < 0 ? questions.length : start);
  const resumed = answered0.size > 0 && start > 0;
  const [picked, setPicked] = React.useState<number | null>(null);
  const [score, setScore] = React.useState(() => progress.filter((p) => p.state === "correct").length);
  const [hint, setHint] = React.useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const restart = async () => {
    if (!(await confirm({ title: "Recommencer le quiz ?", description: "Votre score et vos réponses seront effacés.", confirmLabel: "Recommencer" }))) return;
    await resetProgress(id); setI(0); setScore(0); setPicked(null); setHint(false); };
  if (!questions.length) return <Alert tone="warning" title="Aucune question" />;
  if (i >= questions.length) return (
    <div className="grid justify-items-center gap-4 py-6 text-center">
      <p className="text-2xl">Score : {score} / {questions.length}</p>
      <Button variant="secondary" onClick={() => void restart()}><RotateCcw aria-hidden /> Recommencer</Button>
      {confirmDialog}
    </div>
  );
  const q = questions[i];
  const answered = picked !== null;
  const letter = (k: number) => String.fromCharCode(65 + k);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-text-muted">Question {i + 1} / {questions.length} · score {score}{resumed && i === start ? " · reprise là où vous vous étiez arrêté" : ""}</p>
      <p className="font-serif text-reading">{q.question}</p>
      <div role="radiogroup" aria-label="Choix de réponse" className="grid gap-2">
        {q.choices.map((ch, k) => (
          <button key={k} role="radio" aria-checked={picked === k} disabled={answered}
            onClick={() => { setPicked(k); if (k === q.answer) setScore((s) => s + 1); void saveProgress(id, [{ key: q.key, state: k === q.answer ? "correct" : "wrong", answer: k }]); }}
            className={cn("rounded-lg border p-3 text-left text-sm transition-colors enabled:hover:bg-surface",
              answered && (k === q.answer ? "border-success bg-success-soft" : k === picked ? "border-danger bg-danger-soft" : "opacity-60"))}>
            <span className="mr-2 font-mono text-text-subtle">{letter(k)}.</span>{ch}
            {answered && k === q.answer && <span className="sr-only"> (bonne réponse)</span>}
          </button>
        ))}
      </div>
      {!answered && q.hint && (hint
        ? <p className="text-sm text-text-muted">Indice : {q.hint}</p>
        : <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setHint(true)}>Afficher un indice</Button>)}
      {answered && (
        <Alert tone={picked === q.answer ? "success" : "warning"} title={picked === q.answer ? "Bonne réponse" : `Réponse attendue : ${letter(q.answer)}`}>{q.explanation}</Alert>
      )}
      {answered && <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => onExplain(`Explique la question « ${q.question} » : pourquoi la bonne réponse est « ${q.choices[q.answer]} » ?`)}>Expliquer dans le chat</Button>}
      {answered && <Button className="justify-self-end" onClick={() => { setI((x) => x + 1); setPicked(null); setHint(false); }}>{i + 1 < questions.length ? "Question suivante" : "Voir le score"}</Button>}
    </div>
  );
}

type MapNode = { label: string; children?: MapNode[] };
function MindMap({ root, onAsk }: { root: MapNode; onAsk: (label: string) => void }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-text-muted">Dépliez les branches ; cliquez sur un thème pour l’explorer dans le chat.</p>
      <ul role="tree" aria-label={root.label} className="grid gap-1"><MapItem node={root} depth={0} onAsk={onAsk} /></ul>
    </div>
  );
}
function MapItem({ node, depth, onAsk }: { node: MapNode; depth: number; onAsk: (l: string) => void }) {
  const [open, setOpen] = React.useState(depth < 1);
  const kids = node.children ?? [];
  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={false} className="grid gap-1">
      <div className="flex items-center gap-1" style={{ paddingLeft: `calc(${depth} * var(--space-5, 1.25rem))` }}>
        {kids.length ? (
          <button aria-label={open ? `Replier ${node.label}` : `Déplier ${node.label}`} onClick={() => setOpen((o) => !o)} className="grid size-6 place-items-center rounded-xs text-text-muted hover:bg-surface">
            {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
          </button>
        ) : <span className="size-6" aria-hidden />}
        <button onClick={() => onAsk(node.label)} title="Explorer dans le chat"
          className={cn("rounded-md px-2 py-1 text-left hover:bg-accent-soft hover:text-on-accent-soft", depth === 0 ? "text-lg font-semibold" : depth === 1 ? "font-medium" : "text-sm")}>
          {node.label}
        </button>
      </div>
      {open && kids.length > 0 && <ul role="group" className="grid gap-1">{kids.map((k, j) => <MapItem key={j} node={k} depth={depth + 1} onAsk={onAsk} />)}</ul>}
    </li>
  );
}
