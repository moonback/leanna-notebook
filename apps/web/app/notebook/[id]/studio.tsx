"use client";
import * as React from "react";
import { AudioLines, BookOpen, Check, ChevronDown, ChevronRight, Download, Layers, ListChecks, Network, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Alert, Badge, EmptyState, Progress, Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlay";
import { ListRow, Panel } from "@/components/ui/surfaces";
import { Citation } from "@/components/ui/citation";
import { toast } from "@/components/ui/toast";
import { ArtifactShareButton } from "./artifact-share-button";
import { cn } from "@/lib/utils";

type ArtType = "report" | "flashcards" | "quiz" | "mind_map" | "audio";
type Art = { id: string; type: ArtType; title: string | null; status: string; error_code: string | null; options: Record<string, string> | null; custom_prompt?: string | null; created_at: string; progress?: number; stage?: string; unread?: boolean };
type Cite = { marker: number; source_id: string; quote_text: string; char_start: number; char_end: number; verified: boolean };

const TYPES: Record<ArtType, { label: string; icon: React.ReactNode; hint: string }> = {
  report: { label: "Rapport", icon: <BookOpen />, hint: "Synthèse rédigée et sourcée" },
  flashcards: { label: "Fiches", icon: <Layers />, hint: "Recto / verso pour réviser" },
  quiz: { label: "Quiz", icon: <ListChecks />, hint: "QCM corrigé avec explications" },
  mind_map: { label: "Carte mentale", icon: <Network />, hint: "Les thèmes et leurs liens" },
  audio: { label: "Audio Overview", icon: <AudioLines />, hint: "Podcast dialogué à deux voix à partir des sources" },
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
};
const busy = (s: string) => s === "queued" || s === "scheduled" || s === "generating";
const AUDIO_OVERVIEW_MARKER = "[[NOTEBOOK_AUDIO_OVERVIEW_V1]]";
const label = (a: Art) => a.title || TYPES[a.type].label;
const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Studio({ notebookId, canEdit, sourceIds, sourceTitle, onOpenCitation, onAsk }: {
  notebookId: string; canEdit: boolean; sourceIds: string[];
  sourceTitle: (id: string) => string | undefined; onOpenCitation?: (c: Cite) => void; onAsk: (text: string) => void;
}) {
  const [arts, setArts] = React.useState<Art[] | null>(null);
  const [failedLoad, setFailedLoad] = React.useState(false);
  const [creating, setCreating] = React.useState<ArtType | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
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
      body: JSON.stringify({ type, options, sourceIds, ...(customPrompt ? { customPrompt } : {}) }),
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
    if (!confirm(`Supprimer « ${label(a)} » ?`)) return;
    const r = await fetch(`/api/v1/artifacts/${a.id}`, { method: "DELETE" });
    if (r.ok) setArts((xs) => xs?.filter((x) => x.id !== a.id) ?? null); else toast({ title: "Suppression impossible", tone: "error" });
  }

  function view(a: Art) {
    setOpen(a.id);
    setArts((xs) => xs?.map((x) => (x.id === a.id ? { ...x, unread: false } : x)) ?? null);
  }

  return (
    <Panel id="studio" title="Studio" className="h-full">
      {canEdit && (
        <div className="grid grid-cols-2 gap-2 border-b p-3">
          {(["report", "flashcards", "quiz", "mind_map"] as ArtType[]).map((t) => (
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
                    {canEdit && !busy(a.status) && <Button size="icon-sm" variant="ghost" aria-label={`Supprimer ${label(a)}`} onClick={() => void remove(a)}><Trash2 aria-hidden /></Button>}
                  </span>
                }
              />
              {busy(a.status) && <div className="px-3 pb-1"><Progress value={a.progress || undefined} label={`Génération : ${TYPES[a.type].label}`} /></div>}
            </li>
          ))}
        </ul>
      )}
      <CreateDialog type={creating} onClose={() => setCreating(null)} onGenerate={generate} />
      <ArtifactViewer id={open} canShare={canEdit} onClose={() => setOpen(null)} sourceTitle={sourceTitle} onOpenCitation={onOpenCitation} onAsk={(t) => { setOpen(null); onAsk(t); }} />
    </Panel>
  );
}

/* ------------------------------------------------------------- Création ---- */

function CreateDialog({ type, onClose, onGenerate }: { type: ArtType | null; onClose: () => void; onGenerate: (t: ArtType, o: Record<string, string>, p?: string) => Promise<boolean> }) {
  const [opts, setOpts] = React.useState<Record<string, string>>({});
  const [prompt, setPrompt] = React.useState("");
  const [sending, setSending] = React.useState(false);
  React.useEffect(() => {
    setOpts(type === "report" ? { template: "briefing" } : type === "flashcards" || type === "quiz" ? { difficulty: "medium", count: "standard" } : type === "audio" ? { format: "deep_dive", duration: "standard", style: "accessible" } : {});
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
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const audioPrompt = type === "audio" ? `${AUDIO_OVERVIEW_MARKER}${prompt.trim() ? `\\n${prompt.trim()}` : ""}` : undefined;\n    const ok = await onGenerate(type!, opts, type === "audio" ? audioPrompt : prompt.trim() || undefined);
    setSending(false);
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Générer : ${TYPES[type].label}`} description="À partir des sources sélectionnées. La génération continue en arrière-plan.">
        <form onSubmit={submit} className="grid gap-4">
          {type === "report" && choice("template", "Format", [["briefing", "Note de synthèse"], ["study_guide", "Guide d’étude"], ["faq", "Questions fréquentes"]])}\n          {type === "audio" && <div className="grid gap-4 sm:grid-cols-2">{choice("format", "Format du podcast", [["deep_dive", "Deep Dive · approfondi"], ["brief", "Brief · essentiel"], ["critique", "Critique · analyse"], ["debate", "Débat · points de vue"]])}{choice("duration", "Durée cible", [["short", "Court · 5 min"], ["standard", "Standard · 10 min"], ["long", "Long · 15 min"]])}{choice("style", "Ton", [["accessible", "Accessible et pédagogique"], ["professional", "Professionnel et précis"], ["dynamic", "Dynamique et vivant"]])}</div>}
          {(type === "flashcards" || type === "quiz") && (
            <div className="grid gap-4 sm:grid-cols-2">
              {choice("difficulty", "Difficulté", [["easy", "Facile"], ["medium", "Moyenne"], ["hard", "Difficile"]])}
              {choice("count", "Quantité", [["fewer", "Moins"], ["standard", "Standard"], ["more", "Plus"]])}
            </div>
          )}
          <Field id="opt-prompt" label="Consignes (facultatif)" hint="Public visé, angle, thèmes à privilégier…">
            <Textarea value={prompt} maxLength={4000} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex. : pour un public débutant, insister sur la sécurité." />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="secondary">Annuler</Button></DialogClose>
            <Button type="submit" loading={sending}><Sparkles aria-hidden /> Générer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------- Visionneuses ---- */

type Content = { markdown?: string; cards?: Card[]; questions?: QuizQ[]; root?: MapNode; audio_path?: string; audio_format?: string };

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

function ArtifactViewer({ id, canShare, onClose, sourceTitle, onOpenCitation, onAsk }: { id: string | null; canShare: boolean; onClose: () => void; sourceTitle: (id: string) => string | undefined; onOpenCitation?: (c: Cite) => void; onAsk: (t: string) => void }) {
  const [data, setData] = React.useState<{ artifact: { id: string; type: ArtType; title: string | null; content: Content; custom_prompt: string | null }; citations: Cite[]; progress: Progress[] } | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!id) return;
    setData(null); setFailed(false);
    fetch(`/api/v1/artifacts/${id}`).then(async (r) => { if (!r.ok) throw new Error(); setData(await r.json()); }).catch(() => setFailed(true));
  }, [id]);
  const art = data?.artifact;
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={art ? (art.title || TYPES[art.type].label) : "Contenu du Studio"}>
        {id && canShare && <ArtifactShareButton artifactId={id} disabled={!art} />}
        <div className="max-h-[70dvh] overflow-y-auto pr-1">
          {art?.custom_prompt && !art.custom_prompt.startsWith(AUDIO_OVERVIEW_MARKER) && <p className="mb-4 rounded-md bg-surface px-3 py-2 text-xs text-text-muted"><span className="font-medium">Consignes de génération :</span> {art.custom_prompt}</p>}
          {failed ? <Alert tone="danger" title="Contenu indisponible" />
            : !art ? <div className="grid gap-2" aria-busy="true" aria-label="Chargement"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /></div>
             : art.type === "report" || art.type === "audio" ? <div className="grid gap-4">{art.content.audio_path && <div className="grid gap-2 rounded-lg border border-border p-3"><audio ref={audioRef} controls preload="metadata" className="w-full" src={`/api/v1/artifacts/${art.id}/audio`} /><div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs text-text-muted">Vitesse <select aria-label="Vitesse de lecture" className="h-8 rounded-md border border-border-input bg-surface-raised px-2 text-sm text-text" value={playbackRate} onChange={(e) => setPlaybackRate(e.target.value)}>{["0.75", "1", "1.25", "1.5", "1.75", "2"].map((v) => <option key={v} value={v}>{v}×</option>)}</select></label><a className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline" href={`/api/v1/artifacts/${art.id}/audio?download=1`}><Download aria-hidden size={16} /> Télécharger le MP3</a></div></div>}<Markdown text={art.content.markdown ?? ""} citations={data!.citations} sourceTitle={sourceTitle} onOpen={onOpenCitation ? (c) => { onClose(); onOpenCitation(c); } : undefined} /></div>
            : art.type === "flashcards" ? <Flashcards id={art.id} title={art.title || "fiches"} cards={art.content.cards ?? []} progress={data!.progress} />
            : art.type === "quiz" ? <Quiz id={art.id} questions={art.content.questions ?? []} progress={data!.progress} onExplain={onAsk} />
            : art.content.root ? <MindMap root={art.content.root} onAsk={(l) => onAsk(`Explique « ${l} » à partir de mes sources.`)} />
            : <Alert tone="danger" title="Contenu vide" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Markdown minimal et sûr (aucun HTML injecté) : titres, listes, gras, pastilles [n]. Exporté pour les tests. */
export function Markdown({ text, citations, sourceTitle, onOpen }: { text: string; citations: Cite[]; sourceTitle: (id: string) => string | undefined; onOpen?: (c: Cite) => void }) {
  const byMarker = new Map(citations.map((c) => [c.marker, c]));
  const inline = (s: string) => s.split(/(\[\d+\]|\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = /^\[(\d+)\]$/.exec(part);
    if (m) {
      const c = byMarker.get(Number(m[1]));
      return c ? <Citation key={i} n={c.marker} source={sourceTitle(c.source_id) ?? "Source supprimée"} quote={c.quote_text} verified={c.verified} onOpen={onOpen ? () => onOpen(c) : undefined} /> : null;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(<ul key={`l${blocks.length}`} className="ml-5 list-disc space-y-1">{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
    list = [];
  };
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (/^[-*]\s+/.test(t)) { list.push(t.replace(/^[-*]\s+/, "")); return; }
    flush();
    if (!t) return;
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) blocks.push(h[1].length <= 2 ? <h3 key={i} className="mt-2 text-xl font-semibold">{inline(h[2])}</h3> : <h4 key={i} className="mt-1 text-lg font-semibold">{inline(h[2])}</h4>);
    else blocks.push(<p key={i}>{inline(t)}</p>);
  });
  flush();
  return <div className="grid gap-3 font-serif text-reading">{blocks}</div>;
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
  const restartAll = async () => { await resetProgress(id); setAcquired(new Set()); restart([...cards].sort(() => Math.random() - 0.5)); };
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
  const restart = async () => { await resetProgress(id); setI(0); setScore(0); setPicked(null); setHint(false); };
  if (!questions.length) return <Alert tone="warning" title="Aucune question" />;
  if (i >= questions.length) return (
    <div className="grid justify-items-center gap-4 py-6 text-center">
      <p className="text-2xl">Score : {score} / {questions.length}</p>
      <Button variant="secondary" onClick={() => void restart()}><RotateCcw aria-hidden /> Recommencer</Button>
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
