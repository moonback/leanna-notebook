"use client";
import * as React from "react";
import { ArrowLeft, Ban, BookOpen, CircleCheck, CircleDot, CircleX, ExternalLink, FileText, Pause, Play, RotateCcw, Search, Send, Telescope, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert, Badge, Progress, Skeleton } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type RunSummary = { id: string; question: string; depth: string; status: string; stage: string | null; progress: number; artifact_id: string | null; created_at: string; error_code: string | null; parent_run_id: string | null };
type SubQ = { id: string; text: string; status: "pending" | "covered" | "partial" };
type Run = RunSummary & {
  instructions: string[]; max_sources: number; report_format: string; next_step: string; plan: { objectives?: string[]; subquestions?: SubQ[] };
  spent: { iterations?: number; queries?: number; pages?: number; tokens?: number; cost_usd?: number }; budget: { iterations: number; queries: number; pages: number };
  models: string[]; error_message: string | null; started_at: string | null; finished_at: string | null; pause_requested: boolean;
};
type Event = { id: number; type: string; message: string; data: Record<string, unknown>; created_at: string };
type RSource = { id: string; subquestion_id: string | null; url: string; title: string; domain: string; author: string | null; published_at: string | null; accessed_at: string | null; summary: string | null; relevance: number | null; status: string; reason: string | null; source_id: string | null };
type Finding = { id: string; research_source_id: string; subquestion_id: string | null; statement: string; quote: string; support: "single" | "corroborated" | "contested" };
type Worker = { status: string; attempts: number; maxAttempts: number; runAfter: string; leaseUntil: string | null; errorCode: string | null } | null;

const ACTIVE = new Set(["queued", "planning", "searching", "reading", "extracting", "cross_checking", "writing"]);
const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  queued: { label: "En file", tone: "neutral" }, planning: { label: "Planification", tone: "accent" }, searching: { label: "Recherche", tone: "accent" },
  reading: { label: "Lecture", tone: "accent" }, extracting: { label: "Extraction", tone: "accent" }, cross_checking: { label: "Vérification", tone: "accent" },
  writing: { label: "Rédaction", tone: "accent" }, completed: { label: "Terminée", tone: "success" }, failed: { label: "Échec", tone: "danger" },
  cancelled: { label: "Annulée", tone: "neutral" }, paused: { label: "En pause", tone: "warning" },
};
const DEPTHS = [
  { id: "quick", label: "Rapide", hint: "Recherche ciblée · 1 tour · ≈ 8 pages" },
  { id: "deep", label: "Approfondie", hint: "Multi-angles · 2 tours · ≈ 20 pages" },
  { id: "expert", label: "Experte", hint: "Recoupement et vérification · 3 tours · ≈ 36 pages" },
];
const FORMATS: Record<string, string> = {
  structured: "Rapport structuré", executive: "Synthèse exécutive", comparative: "Analyse comparative", detailed: "Rapport détaillé",
  dossier: "Dossier documentaire", timeline: "Chronologie", actors: "Tableau des acteurs", risks: "Analyse des risques", bibliography: "Bibliographie", none: "Pas de rapport (sources seulement)",
};
const ERRORS: Record<string, string> = {
  research_not_configured: "La recherche web n’est pas configurée côté worker (TAVILY_API_KEY).",
  ai_not_configured: "Aucun modèle IA n’est configuré côté worker (OPENROUTER_API_KEY).",
  ai_config: "OpenRouter refuse la configuration (clé, crédits ou modèle).",
  research_provider_config: "Le fournisseur de recherche refuse la configuration.",
  research_no_sources: "Aucune source exploitable n’a pu être ajoutée au notebook.",
  lease_expired: "Le worker a été interrompu pendant une étape.",
  quota_daily_exceeded: "Quota quotidien atteint.", quota_monthly_exceeded: "Crédits mensuels épuisés.",
  research_not_resumable: "Cette recherche ne peut pas être reprise.", research_busy: "Une étape est déjà en cours.", research_not_active: "La recherche n’est plus active.",
};

const elapsed = (from: string | null, to: string | null, now: number) => {
  if (!from) return "—";
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};

export function DeepResearch({ notebookId, canEdit, onOpenSource, onOpenReport, onSourcesChanged }: {
  notebookId: string; canEdit: boolean; onOpenSource: (sourceId: string) => void; onOpenReport: (artifactId: string) => void; onSourcesChanged: () => void;
}) {
  const [runs, setRuns] = React.useState<RunSummary[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const loadRuns = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/notebooks/${notebookId}/deep-research`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setRuns((await r.json()).runs); setFailed(false);
    } catch { setFailed(true); }
  }, [notebookId]);
  React.useEffect(() => { void loadRuns(); }, [loadRuns]);

  if (selected) return <Monitor key={selected} runId={selected} canEdit={canEdit} onBack={() => { setSelected(null); void loadRuns(); }} onOpenSource={onOpenSource} onOpenReport={onOpenReport}
    onSourcesChanged={onSourcesChanged} onDeepen={async (question) => {
      const id = await launch(notebookId, { question, depth: "deep", maxSources: 8, reportFormat: "structured", parentRunId: selected });
      if (id) setSelected(id);
    }} />;

  return (
    <div className="grid gap-6 p-4 sm:p-6">
      {canEdit && <Launcher notebookId={notebookId} onLaunched={(id) => { setSelected(id); void loadRuns(); }} />}
      <section aria-labelledby="dr-history" className="grid gap-3">
        <h3 id="dr-history" className="text-sm font-semibold">Recherches précédentes</h3>
        {failed ? <Alert tone="danger" title="Historique indisponible" action={<Button size="sm" variant="secondary" onClick={() => void loadRuns()}>Réessayer</Button>} />
          : !runs ? <div className="grid gap-2" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          : runs.length === 0 ? <p className="text-sm text-text-muted">Aucune recherche approfondie dans ce notebook pour l’instant.</p>
          : (
            <ul className="grid gap-2">
              {runs.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r.id)} className="grid w-full gap-2 rounded-lg border bg-surface-raised p-3 text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-focus">
                    <span className="flex items-start justify-between gap-3">
                      <span className="line-clamp-2 text-sm font-medium">{r.question}</span>
                      <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge>
                    </span>
                    {ACTIVE.has(r.status) && <Progress value={r.progress} label={`Progression : ${r.progress} %`} />}
                    <span className="text-xs text-text-muted">
                      {new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} · {DEPTHS.find((d) => d.id === r.depth)?.label}
                      {r.parent_run_id ? " · approfondissement" : ""}{r.artifact_id ? " · rapport dans le Studio" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

async function launch(notebookId: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(`/api/v1/notebooks/${notebookId}/deep-research`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(ERRORS[j.error] ?? "Impossible de lancer la recherche.");
    return j.runId as string;
  } catch (e) {
    toast({ title: "Recherche non lancée", description: e instanceof Error ? e.message : undefined, tone: "error" });
    return null;
  }
}

function Launcher({ notebookId, onLaunched }: { notebookId: string; onLaunched: (id: string) => void }) {
  const [question, setQuestion] = React.useState("");
  const [depth, setDepth] = React.useState("deep");
  const [maxSources, setMaxSources] = React.useState(10);
  const [reportFormat, setReportFormat] = React.useState("structured");
  const [instructions, setInstructions] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const id = await launch(notebookId, { question, depth, maxSources, reportFormat, ...(instructions.trim() ? { instructions } : {}) });
    setBusy(false);
    if (id) { setQuestion(""); setInstructions(""); onLaunched(id); }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-surface-raised p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><Telescope className="size-5" /></span>
        <div>
          <h3 className="text-sm font-semibold">Recherche approfondie</h3>
          <p className="text-xs text-text-muted">Leanna planifie, cherche sur le web, lit les pages, vérifie, ajoute les sources et rédige un rapport cité dans le Studio.</p>
        </div>
      </div>
      <Field id="dr-question" label="Votre question">
        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={2000} required
          placeholder="Ex. : compare les nouvelles technologies de stockage d’énergie, identifie les acteurs importants et rédige un rapport sourcé." />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Profondeur</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEPTHS.map((d) => (
            <label key={d.id} className={cn("cursor-pointer rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus", depth === d.id ? "border-accent bg-accent-soft/60" : "hover:border-border-strong")}>
              <input type="radio" name="dr-depth" value={d.id} checked={depth === d.id} onChange={() => setDepth(d.id)} className="sr-only" />
              <span className="block font-medium">{d.label}</span>
              <span className="block text-xs text-text-muted">{d.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="dr-max" label="Sources maximum">
          <select id="dr-max" value={maxSources} onChange={(e) => setMaxSources(Number(e.target.value))} className="h-9 w-full rounded-md border border-border-input bg-surface-raised px-2 text-sm">
            {[5, 8, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} sources</option>)}
          </select>
        </Field>
        <Field id="dr-format" label="Rapport généré">
          <select id="dr-format" value={reportFormat} onChange={(e) => setReportFormat(e.target.value)} className="h-9 w-full rounded-md border border-border-input bg-surface-raised px-2 text-sm">
            {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Instructions complémentaires</summary>
        <Textarea className="mt-3" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} maxLength={2000}
          aria-label="Instructions complémentaires" placeholder="Ex. : privilégier les sources institutionnelles et les publications de moins de deux ans." />
      </details>
      <div className="flex justify-end">
        <Button type="submit" loading={busy} disabled={question.trim().length < 3}><Search aria-hidden /> Lancer la recherche</Button>
      </div>
    </form>
  );
}

function Monitor({ runId, canEdit, onBack, onOpenSource, onOpenReport, onSourcesChanged, onDeepen }: {
  runId: string; canEdit: boolean; onBack: () => void; onOpenSource: (id: string) => void; onOpenReport: (id: string) => void; onSourcesChanged: () => void; onDeepen: (question: string) => Promise<void>;
}) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [sources, setSources] = React.useState<RSource[]>([]);
  const [findings, setFindings] = React.useState<Finding[]>([]);
  const [worker, setWorker] = React.useState<Worker>(null);
  const [offline, setOffline] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const [acting, setActing] = React.useState<string | null>(null);
  const [instruction, setInstruction] = React.useState("");
  const [wake, setWake] = React.useState(0);
  const cursor = React.useRef(0);
  const added = React.useRef(0);
  const sourcesChanged = React.useRef(onSourcesChanged);
  sourcesChanged.current = onSourcesChanged;

  const refresh = React.useCallback(async () => {
    const r = await fetch(`/api/v1/deep-research/${runId}?after=${cursor.current}`, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json() as { run: Run; events: Event[]; sources: RSource[]; findings: Finding[]; worker: Worker };
    setRun(j.run); setSources(j.sources); setFindings(j.findings); setWorker(j.worker);
    if (j.events.length) {
      cursor.current = j.events[j.events.length - 1]!.id;
      setEvents((old) => {
        const seen = new Set(old.map((e) => e.id));
        return [...old, ...j.events.filter((e) => !seen.has(e.id))];
      });
    }
    const nAdded = j.sources.filter((s) => s.source_id).length;
    if (nAdded !== added.current) { added.current = nAdded; sourcesChanged.current(); }
    return j.run;
  }, [runId]);

  // Suivi : relit l'état persisté (jamais un état local), avec reprise automatique après une coupure réseau.
  React.useEffect(() => {
    let stop = false, delay = 2000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await refresh();
        setOffline(false); delay = 2000;
        if (stop || (!ACTIVE.has(r.status) && !r.pause_requested)) return;
      } catch { setOffline(true); delay = Math.min(15000, delay * 2); }
      if (!stop) timer = setTimeout(tick, delay);
    };
    void tick();
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); void tick(); } };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onVisible); };
  }, [refresh, wake]);
  React.useEffect(() => {
    if (!run || !ACTIVE.has(run.status)) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run]);

  async function act(action: string, extra: object = {}) {
    setActing(action);
    try {
      const r = await fetch(`/api/v1/deep-research/${runId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const j = await r.json();
      if (!r.ok) throw new Error(ERRORS[j.error] ?? "Action impossible.");
      if (action === "instruct") setInstruction("");
      setWake((n) => n + 1);   // relance le suivi (après une reprise notamment)
    } catch (e) {
      toast({ title: "Action impossible", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally { setActing(null); }
  }

  if (!run) {
    return <div className="grid gap-3 p-6" aria-busy="true">{offline ? <Alert tone="danger" title="Recherche introuvable ou connexion perdue." action={<Button size="sm" variant="secondary" onClick={onBack}>Retour</Button>} /> : <><Skeleton className="h-6 w-2/3" /><Skeleton className="h-2" /><Skeleton className="h-40" /></>}</div>;
  }
  const active = ACTIVE.has(run.status);
  const retained = sources.filter((s) => ["retained", "added", "indexed"].includes(s.status));
  const rejected = sources.filter((s) => ["rejected", "duplicate", "failed"].includes(s.status));
  const queries = events.filter((e) => e.type === "research.query.completed" || e.type === "research.query.failed");
  const contradictions = events.filter((e) => e.type === "research.contradiction.detected");
  const subqs = run.plan.subquestions ?? [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  const workerLine = !worker ? (active ? "en attente du worker" : "inactif")
    : worker.status === "running" ? `en cours d’exécution (tentative ${worker.attempts}/${worker.maxAttempts})`
    : worker.status === "queued" ? (Date.parse(worker.runAfter) > now ? `étape programmée à ${new Date(worker.runAfter).toLocaleTimeString("fr-FR")}` : "étape en file d’attente")
    : worker.status === "failed" ? `échec de l’étape (${worker.errorCode ?? "erreur"})` : worker.status === "cancelled" ? "étape annulée" : "étape terminée";

  return (
    <div className="grid gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <Button size="icon-sm" variant="ghost" aria-label="Retour à l’historique" onClick={onBack}><ArrowLeft aria-hidden /></Button>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-pretty">{run.question}</h3>
          <p className="mt-1 text-xs text-text-muted">
            {DEPTHS.find((d) => d.id === run.depth)?.label} · {FORMATS[run.report_format]} · {run.max_sources} sources max · durée {elapsed(run.started_at, run.finished_at, now)}
          </p>
        </div>
        <Badge tone={STATUS[run.status]?.tone}>{STATUS[run.status]?.label ?? run.status}</Badge>
      </div>

      <div className="grid gap-2" aria-live="polite">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{run.stage ?? STATUS[run.status]?.label}</span>
          <span className="tabular-nums text-text-muted">{run.progress} %</span>
        </div>
        <Progress value={run.progress} label={`Progression de la recherche : ${run.progress} %`} />
        <p className="text-xs text-text-muted">Worker : {workerLine}{run.pause_requested ? " · pause demandée" : ""}</p>
        {offline && <Alert tone="warning" title="Connexion perdue — reconnexion automatique…">L’état affiché sera resynchronisé depuis le serveur.</Alert>}
        {run.status === "failed" && <Alert tone="danger" title={ERRORS[run.error_code ?? ""] ?? "La recherche a échoué."}>{run.error_message ?? undefined}</Alert>}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {([["Requêtes", run.spent.queries ?? 0], ["Pages lues", run.spent.pages ?? 0], ["Sources retenues", retained.length], ["Écartées", rejected.length]] as const).map(([k, v]) => (
          <div key={k} className="flex flex-col-reverse bg-surface-raised px-3 py-2"><dt className="text-xs text-text-muted">{k}</dt><dd className="text-lg font-semibold tabular-nums">{v}</dd></div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        {run.artifact_id && <Button size="sm" onClick={() => onOpenReport(run.artifact_id!)}><FileText aria-hidden /> Ouvrir le rapport</Button>}
        {canEdit && active && !run.pause_requested && <Button size="sm" variant="secondary" loading={acting === "pause"} onClick={() => void act("pause")}><Pause aria-hidden /> Pause</Button>}
        {canEdit && run.status === "paused" && <Button size="sm" loading={acting === "resume"} onClick={() => void act("resume")}><Play aria-hidden /> Reprendre</Button>}
        {canEdit && run.status === "failed" && <Button size="sm" loading={acting === "resume"} onClick={() => void act("resume")}><RotateCcw aria-hidden /> Relancer depuis l’étape échouée</Button>}
        {canEdit && (active || run.status === "paused") && <Button size="sm" variant="ghost" loading={acting === "cancel"} onClick={() => void act("cancel")}><Ban aria-hidden /> Annuler</Button>}
      </div>

      {canEdit && (active || run.status === "paused") && (
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void act("instruct", { instruction }); }}>
          <div className="min-w-0 flex-1"><Field id="dr-instruction" label="Ajouter une consigne (prise en compte à l’étape suivante)">
            <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={1000} placeholder="Ex. : inclure les données européennes" />
          </Field></div>
          <Button type="submit" size="icon" aria-label="Envoyer la consigne" disabled={instruction.trim().length < 3} loading={acting === "instruct"}><Send aria-hidden /></Button>
        </form>
      )}
      {run.instructions.length > 0 && <p className="text-xs text-text-muted">Consignes : {run.instructions.join(" · ")}</p>}

      <Section title="Sous-questions" count={subqs.length} open>
        {subqs.length === 0 ? <p className="text-sm text-text-muted">{active ? "Plan en cours d’élaboration…" : "Aucun plan."}</p> : (
          <ul className="grid gap-2">
            {subqs.map((q) => (
              <li key={q.id} className="flex items-start gap-2 text-sm">
                {q.status === "covered" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Couverte" /> : <CircleDot className="mt-0.5 size-4 shrink-0 text-text-subtle" aria-label="Partiellement couverte" />}
                <span className="min-w-0 flex-1">{q.text}<span className="ml-2 text-xs text-text-muted">{findings.filter((f) => f.subquestion_id === q.id).length} information(s)</span></span>
                {canEdit && run.status === "completed" && <Button size="sm" variant="ghost" onClick={() => void onDeepen(q.text)}>Approfondir</Button>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Sources retenues" count={retained.length} open>
        {retained.length === 0 ? <p className="text-sm text-text-muted">Aucune source retenue pour l’instant.</p> : (
          <ul className="grid gap-2">{retained.map((s) => <SourceRow key={s.id} s={s} onOpenSource={onOpenSource} />)}</ul>
        )}
      </Section>

      <Section title="Informations extraites" count={findings.length}>
        <ul className="grid gap-3">
          {findings.map((f) => (
            <li key={f.id} className="grid gap-1 text-sm">
              <span className="flex items-start gap-2"><span className="min-w-0 flex-1">{f.statement}</span>
                {f.support === "corroborated" && <Badge tone="success">recoupée</Badge>}{f.support === "contested" && <Badge tone="warning">contestée</Badge>}</span>
              <blockquote className="border-l-2 border-border-strong pl-3 font-serif text-xs text-text-muted">« {f.quote} » — {byId.get(f.research_source_id)?.domain}</blockquote>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Contradictions détectées" count={contradictions.length}>
        <ul className="grid gap-2">{contradictions.map((e) => <li key={e.id} className="flex gap-2 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{e.message}</li>)}</ul>
      </Section>

      <Section title="Recherches effectuées" count={queries.length}>
        <ul className="grid gap-1 text-sm">{queries.map((e) => <li key={e.id} className="text-text-muted">{e.message}</li>)}</ul>
      </Section>

      <Section title="Pages écartées" count={rejected.length}>
        <ul className="grid gap-2">{rejected.map((s) => <SourceRow key={s.id} s={s} onOpenSource={onOpenSource} />)}</ul>
      </Section>

      <Section title="Journal" count={events.length}>
        <ol className="grid gap-1.5 text-xs">
          {[...events].reverse().slice(0, 200).map((e) => (
            <li key={e.id} className="flex gap-2"><time className="shrink-0 tabular-nums text-text-subtle">{new Date(e.created_at).toLocaleTimeString("fr-FR")}</time><span>{e.message}</span></li>
          ))}
        </ol>
      </Section>
      {run.models.length > 0 && <p className="text-xs text-text-subtle">Modèles utilisés : {run.models.join(", ")} · {(run.spent.tokens ?? 0).toLocaleString("fr-FR")} tokens{run.spent.cost_usd ? ` · ${run.spent.cost_usd.toFixed(3)} $` : ""}</p>}
    </div>
  );
}

function Section({ title, count, open, children }: { title: string; count: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="rounded-lg border bg-surface-raised">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
        {title}<span className="rounded-pill bg-surface-sunken px-2 text-xs tabular-nums text-text-muted">{count}</span>
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
  );
}

function SourceRow({ s, onOpenSource }: { s: RSource; onOpenSource: (id: string) => void }) {
  const icon = s.status === "indexed" ? <BookOpen className="size-4 text-success" aria-label="Indexée dans le notebook" />
    : ["rejected", "duplicate", "failed"].includes(s.status) ? <CircleX className="size-4 text-text-subtle" aria-label="Écartée" /> : <CircleDot className="size-4 text-accent" aria-label="Retenue" />;
  return (
    <li className="grid gap-1 rounded-md border p-3 text-sm">
      <span className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{s.title || s.url}</span>
          <span className="block truncate text-xs text-text-muted">{s.domain}{s.author ? ` · ${s.author}` : ""}{s.published_at ? ` · ${s.published_at.slice(0, 10)}` : ""}{s.relevance != null ? ` · pertinence ${Math.round(s.relevance * 100)} %` : ""}</span>
        </span>
      </span>
      {s.summary && <p className="text-xs text-text-muted">{s.summary}</p>}
      {s.reason && <p className="text-xs text-text-subtle">Motif : {s.reason}</p>}
      <span className="flex flex-wrap gap-3 text-xs">
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"><ExternalLink className="size-3" aria-hidden /> Page originale</a>
        {s.source_id && s.status === "indexed" && <button type="button" className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline" onClick={() => onOpenSource(s.source_id!)}><BookOpen className="size-3" aria-hidden /> Lire dans le notebook</button>}
      </span>
    </li>
  );
}
