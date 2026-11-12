"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, CircleCheck, CircleX, Pause, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";

type ActiveRun = {
  id: string; notebook_id: string; notebookTitle: string; question: string; status: string; stage: string | null;
  progress: number; started_at: string | null; finished_at: string | null;
};

const ACTIVE = new Set(["queued", "planning", "searching", "reading", "extracting", "cross_checking", "writing"]);
const LABEL: Record<string, string> = {
  queued: "En file", planning: "Planification", searching: "Recherche web", reading: "Lecture des pages", extracting: "Extraction",
  cross_checking: "Vérification croisée", writing: "Rédaction du rapport", paused: "En pause", completed: "Terminée", failed: "Échec", cancelled: "Annulée",
};
// pages sans session : inutile d'interroger l'API
const PUBLIC = /^\/(?:$|login|signup|auth|privacy|terms|s\/|p\/)/;
const DISMISSED_KEY = "research-dock:dismissed";

/** Annonce qu'une recherche a démarré ou changé d'état : le suivi se met à jour aussitôt. */
export function notifyResearchChanged() {
  window.dispatchEvent(new Event("deep-research:changed"));
}

function readDismissed(): Set<string> {
  try { return new Set(JSON.parse(window.sessionStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}

/**
 * Suivi flottant des recherches approfondies, visible sur toutes les pages.
 * Réduit par défaut ; n'apparaît que s'il y a une recherche à suivre. L'état vient de l'API (état persisté).
 */
export function ResearchDock() {
  const pathname = usePathname() ?? "/";
  const [runs, setRuns] = React.useState<ActiveRun[]>([]);
  const [open, setOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  // 401 reçu sur cette page : on réessaie à la navigation suivante (connexion sans rechargement complet)
  const [signedOutAt, setSignedOutAt] = React.useState<string | null>(null);
  // l'accueil « / » est le tableau de bord une fois connecté : on n'exclut que la vitrine via le 401
  const skip = signedOutAt === pathname || (pathname !== "/" && PUBLIC.test(pathname));

  React.useEffect(() => { setDismissed(readDismissed()); }, []);

  const visible = runs.filter((r) => !dismissed.has(r.id));
  const active = visible.filter((r) => ACTIVE.has(r.status));
  const hasActive = active.length > 0;

  React.useEffect(() => {
    if (skip) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      clearTimeout(timer);
      if (document.hidden) return;   // reprise au retour sur l'onglet
      try {
        const r = await fetch("/api/v1/deep-research/active", { cache: "no-store" });
        if (r.status === 401) { setRuns([]); setSignedOutAt(pathname); return; }
        if (r.ok && !stop) setRuns((await r.json()).runs);
      } catch { /* réseau : nouvel essai au prochain passage */ }
      if (!stop) timer = setTimeout(tick, hasActive ? 3000 : 20000);
    };
    void tick();
    const now = () => { void tick(); };
    window.addEventListener("deep-research:changed", now);
    document.addEventListener("visibilitychange", now);
    window.addEventListener("online", now);
    return () => {
      stop = true; clearTimeout(timer);
      window.removeEventListener("deep-research:changed", now);
      document.removeEventListener("visibilitychange", now);
      window.removeEventListener("online", now);
    };
  }, [skip, hasActive, pathname]);

  function dismiss(id: string) {
    setDismissed((old) => {
      const next = new Set(old).add(id);
      try { window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch { /* stockage indisponible */ }
      return next;
    });
  }

  if (skip || visible.length === 0) return null;
  const lead = active[0] ?? visible[0]!;
  const summary = hasActive
    ? `${active.length} recherche${active.length > 1 ? "s" : ""} en cours · ${lead.progress} %`
    : visible.length > 1 ? `${visible.length} recherches à consulter` : `Recherche ${LABEL[lead.status]?.toLowerCase() ?? ""}`;

  return (
    <div className="fixed bottom-20 right-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:bottom-4 sm:right-4">
      {open && (
        <section id="research-dock-panel" aria-label="Recherches approfondies" className="w-[22rem] max-w-full overflow-hidden rounded-xl border bg-surface-raised shadow-card">
          <header className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold">Recherches approfondies</h2>
            <button type="button" aria-label="Réduire" onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text">
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </header>
          <ul className="max-h-[50dvh] divide-y overflow-y-auto">
            {visible.map((r) => {
              const running = ACTIVE.has(r.status);
              return (
                <li key={r.id} className="grid gap-2 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <StatusIcon status={r.status} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{r.question}</p>
                      <p className="truncate text-xs text-text-muted">{r.notebookTitle}</p>
                    </div>
                    {!running && <button type="button" onClick={() => dismiss(r.id)} className="shrink-0 text-xs text-text-subtle hover:text-text">Masquer</button>}
                  </div>
                  {running && (
                    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.progress} aria-label={`Progression : ${r.progress} %`} className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                      <div className="h-full rounded-pill bg-accent transition-[width] duration-500" style={{ width: `${Math.max(3, r.progress)}%` }} />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-text-muted">{r.stage ?? LABEL[r.status] ?? r.status}{running ? ` · ${r.progress} %` : ""}</span>
                    <Link href={`/notebook/${r.notebook_id}?research=${r.id}`}
                      onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("notebook:open-research", { detail: { notebookId: r.notebook_id, runId: r.id } })); }}
                      className="shrink-0 font-medium text-accent underline-offset-2 hover:underline">
                      {r.status === "completed" ? "Voir le résultat" : "Suivre"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="research-dock-panel"
        aria-label={`${summary}. ${open ? "Réduire" : "Afficher"} le suivi des recherches`}
        className="inline-flex h-11 items-center gap-2.5 rounded-pill border bg-surface-raised pl-1.5 pr-4 text-sm shadow-card transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-focus">
        <ProgressRing value={hasActive ? lead.progress : 100} done={!hasActive} failed={!hasActive && (lead.status === "failed" || lead.status === "cancelled")} />
        <span className="max-w-[60vw] truncate font-medium" aria-live="polite">{summary}</span>
      </button>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Terminée" />;
  if (status === "failed" || status === "cancelled") return <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-label={LABEL[status]} />;
  if (status === "paused") return <Pause className="mt-0.5 size-4 shrink-0 text-warning" aria-label="En pause" />;
  return <Telescope className="mt-0.5 size-4 shrink-0 animate-pulse text-accent" aria-label="En cours" />;
}

function ProgressRing({ value, done, failed }: { value: number; done: boolean; failed: boolean }) {
  const r = 14, c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-8 place-items-center" aria-hidden>
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-8 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={failed ? "var(--danger)" : done ? "var(--success)" : "var(--accent)"} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(3, value) / 100)} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      <Telescope className={cn("size-3.5", failed ? "text-danger" : done ? "text-success" : "text-accent")} />
    </span>
  );
}
