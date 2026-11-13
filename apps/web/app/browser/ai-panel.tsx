"use client";

import * as React from "react";
import {
  Check, CircleSlash, ExternalLink, Eye, Hand, LoaderCircle, MessageSquarePlus, Send, ShieldQuestion, Sparkles, Square, TriangleAlert, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import type { TranscriptMessage } from "@/lib/browser/context";
import { askRoxane, errorMessage, runTurn, type JournalEntry } from "./agent-runner";
import { hostOf, type DesktopAgentMode, type DesktopBrowserApi, type DesktopBrowserSettings, type DesktopBrowserTab, type DesktopSaveRequest } from "./browser-api";

type Item =
  | { kind: "user"; id: string; text: string; page?: string }
  | { kind: "assistant" | "roxane"; id: string; text: string }
  | { kind: "journal"; id: string; entry: JournalEntry }
  | { kind: "notice"; id: string; text: string };

const MODES: { id: DesktopAgentMode; label: string; icon: typeof Eye; hint: string }[] = [
  { id: "observation", label: "Observation", icon: Eye, hint: "Leanna lit les pages mais n’agit pas dans le navigateur." },
  { id: "assistance", label: "Assistance", icon: Hand, hint: "Leanna propose des actions ; vous validez chacune d’elles." },
  { id: "autonomous", label: "Autonome", icon: Zap, hint: "Leanna enchaîne les actions courantes. Les actions sensibles restent soumises à votre confirmation." },
];
const QUICK = ["Résume cette page", "Quels sont les points clés ?", "Explique-moi cette page simplement", "Extrais les informations importantes (dates, chiffres, noms)"];

const urlsIn = (text: string) => [...new Set(text.match(/https?:\/\/[^\s<>"')\]]+/g)?.map((url) => url.replace(/[.,;:!?]+$/, "")) ?? [])].slice(0, 12);

type Props = {
  api: DesktopBrowserApi;
  tab: DesktopBrowserTab | null;
  settings: DesktopBrowserSettings;
  onSettings: (settings: DesktopBrowserSettings) => void;
  notebookId?: string;
  /** Enregistre une page dans le Notebook (ajout approuvé par l'utilisateur). */
  save: (request: DesktopSaveRequest) => Promise<{ ok: boolean; message: string }>;
  /** Zone d'actions « Ajouter au Notebook » de l'utilisateur. */
  children?: React.ReactNode;
};

/** Panneau latéral : conversation avec Leanna sur la page active, journal des actions et confirmations. */
export function AiPanel({ api, tab, settings, onSettings, notebookId, save, children }: Props) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [live, setLive] = React.useState("");
  const [input, setInput] = React.useState("");
  const [running, setRunning] = React.useState<"leanna" | "roxane" | null>(null);
  const transcript = React.useRef<TranscriptMessage[]>([]);
  const liveRef = React.useRef("");
  const controller = React.useRef<AbortController | null>(null);
  const decisions = React.useRef(new Map<string, (approved: boolean) => void>());
  const fresh = React.useRef(true);
  const bottom = React.useRef<HTMLDivElement>(null);
  const counter = React.useRef(0);
  const nextId = () => `i${++counter.current}`;

  React.useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [items, live]);
  // Quitter le panneau interrompt la mission : aucune action ne continue sans journal visible.
  React.useEffect(() => () => { controller.current?.abort(); }, []);

  const flushLive = () => {
    const text = liveRef.current.trim();
    liveRef.current = "";
    setLive("");
    if (text) setItems((current) => [...current, { kind: "assistant", id: nextId(), text }]);
  };

  function upsertJournal(entry: JournalEntry) {
    flushLive();
    setItems((current) => current.some((item) => item.kind === "journal" && item.entry.id === entry.id)
      ? current.map((item) => item.kind === "journal" && item.entry.id === entry.id ? { ...item, entry } : item)
      : [...current, { kind: "journal", id: nextId(), entry }]);
  }

  function decide(id: string, approved: boolean) {
    decisions.current.get(id)?.(approved);
    decisions.current.delete(id);
  }

  function stop() {
    controller.current?.abort();
    for (const id of [...decisions.current.keys()]) decide(id, false);
    void api.agentAbort().catch(() => undefined);
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || running) return;
    setInput("");
    setRunning("leanna");
    const abort = new AbortController();
    controller.current = abort;
    setItems((current) => [...current, { kind: "user", id: nextId(), text: question, page: tab && tab.security !== "internal" ? `${tab.title} — ${hostOf(tab.url)}` : undefined }]);
    const result = await runTurn({
      api, fetch: window.fetch.bind(window), notebookId, signal: abort.signal, save,
      onText: (value) => { liveRef.current = value; setLive(value); },
      onJournal: upsertJournal,
      confirm: (entry) => new Promise<boolean>((resolve) => { decisions.current.set(entry.id, resolve); }),
    }, transcript.current, question, { reset: fresh.current });
    fresh.current = false;
    transcript.current = result.transcript;
    liveRef.current = "";
    setLive("");
    const last = result.transcript[result.transcript.length - 1];
    setItems((current) => [
      // Une confirmation restée en attente au moment de l'arrêt n'a pas été exécutée.
      ...current.map((item) => item.kind === "journal" && (item.entry.status === "pending" || item.entry.status === "running")
        ? { ...item, entry: { ...item.entry, status: "denied" as const, detail: "Non exécutée (mission interrompue)." } } : item),
      ...(last?.role === "assistant" && last.text.trim() ? [{ kind: "assistant" as const, id: nextId(), text: last.text }] : []),
      ...(result.error ? [{ kind: "notice" as const, id: nextId(), text: errorMessage(result.error) }] : []),
    ]);
    setRunning(null);
    controller.current = null;
  }

  async function roxane() {
    if (running) return;
    setRunning("roxane");
    const abort = new AbortController();
    controller.current = abort;
    const result = await askRoxane({ fetch: window.fetch.bind(window), signal: abort.signal, notebookId }, transcript.current,
      (value) => { liveRef.current = value; setLive(value); });
    liveRef.current = "";
    setLive("");
    setItems((current) => [
      ...current,
      ...(result.text.trim() ? [{ kind: "roxane" as const, id: nextId(), text: result.text }] : []),
      ...(result.error ? [{ kind: "notice" as const, id: nextId(), text: errorMessage(result.error) }] : []),
    ]);
    setRunning(null);
    controller.current = null;
  }

  function reset() {
    stop();
    transcript.current = [];
    fresh.current = true;
    setItems([]);
  }

  const hasAnswer = items.some((item) => item.kind === "assistant");
  const mode = MODES.find((item) => item.id === settings.agentMode) ?? MODES[1];

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-ai-panel>
      <header className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent" aria-hidden />
          <h2 className="flex-1 text-sm font-semibold">Leanna</h2>
          <Button size="icon-sm" variant="ghost" aria-label="Nouvelle conversation" title="Nouvelle conversation" onClick={reset} disabled={items.length === 0}>
            <MessageSquarePlus aria-hidden />
          </Button>
        </div>
        <div role="radiogroup" aria-label="Niveau d’autonomie de l’agent" className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-surface-sunken p-1">
          {MODES.map(({ id, label, icon: Icon, hint }) => (
            <button key={id} type="button" role="radio" aria-checked={settings.agentMode === id} title={hint} disabled={Boolean(running)} data-mode={id}
              className={cn("flex items-center justify-center gap-1 rounded px-1 py-1 text-xs transition-colors disabled:opacity-60",
                settings.agentMode === id ? "bg-surface-raised font-medium text-text shadow-sm" : "text-text-muted hover:text-text")}
              onClick={() => void api.updateSettings({ agentMode: id }).then(onSettings).catch(() => undefined)}>
              <Icon className="size-3.5" aria-hidden />{label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-2xs leading-4 text-text-muted">{mode.hint}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {items.length === 0 && !live && (
          <div className="grid gap-2">
            <p className="text-sm leading-6 text-text-muted">
              Posez une question sur la page ouverte, ou confiez une recherche à Leanna. Elle cite les adresses des pages qu’elle a réellement consultées.
            </p>
            {QUICK.map((label) => (
              <Button key={label} variant="secondary" size="sm" className="h-auto justify-start whitespace-normal py-2 text-left" disabled={!tab || Boolean(running)} onClick={() => void send(label)}>
                {label}
              </Button>
            ))}
          </div>
        )}
        <ol className="grid gap-3">
          {items.map((item) => {
            if (item.kind === "user") return (
              <li key={item.id} className="ml-6 rounded-lg bg-accent-soft px-3 py-2 text-sm text-on-accent-soft">
                <p className="whitespace-pre-wrap">{item.text}</p>
                {item.page && <p className="mt-1 truncate text-2xs opacity-75">Page : {item.page}</p>}
              </li>
            );
            if (item.kind === "notice") return (
              <li key={item.id} className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs" role="status">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />{item.text}
              </li>
            );
            if (item.kind === "journal") return <JournalRow key={item.id} entry={item.entry} onDecide={(approved) => decide(item.entry.id, approved)} />;
            const sources = urlsIn(item.text);
            return (
              <li key={item.id} className={cn("text-sm", item.kind === "roxane" && "rounded-lg border border-border bg-surface-raised p-3")} data-message={item.kind}>
                {item.kind === "roxane" && <p className="mb-1 text-2xs font-semibold uppercase text-text-muted">Le regard de Roxane</p>}
                <Markdown text={item.text} citations={[]} />
                {sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1" aria-label="Sources citées">
                    {sources.map((url) => (
                      <button key={url} type="button" title={`Ouvrir ${url} dans un nouvel onglet`} onClick={() => void api.createTab({ url })}
                        className="inline-flex max-w-full items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-2xs text-text-muted hover:bg-surface-raised hover:text-text">
                        {/* Adresse affichée en entier (chemin et paramètres compris) : l'utilisateur voit où il va avant de cliquer. */}
                        <ExternalLink className="size-3 shrink-0" aria-hidden /><span className="truncate">{url.replace(/^https?:\/\//, "").slice(0, 90)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
          {live && <li className="text-sm" data-message="live"><Markdown text={live} citations={[]} /></li>}
          {running && !live && <li className="flex items-center gap-2 text-xs text-text-muted"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />{running === "roxane" ? "Roxane relit la réponse…" : "Leanna réfléchit…"}</li>}
        </ol>
        <div ref={bottom} />
      </div>

      <footer className="shrink-0 border-t border-border p-3">
        {children}
        {hasAnswer && !running && (
          <Button variant="ghost" size="sm" className="mb-2 w-full" onClick={() => void roxane()} title="Roxane relit la dernière réponse de Leanna et en signale les points fragiles.">
            Demander le regard de Roxane
          </Button>
        )}
        <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
          <Textarea aria-label="Message à Leanna" rows={2} className="min-h-0 flex-1 resize-none" placeholder="Demandez à Leanna…" value={input} maxLength={4000}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} />
          {running
            ? <Button type="button" variant="danger" size="icon" aria-label="Interrompre la mission" title="Interrompre immédiatement" onClick={stop}><Square aria-hidden /></Button>
            : <Button type="submit" size="icon" aria-label="Envoyer" disabled={!input.trim()}><Send aria-hidden /></Button>}
        </form>
      </footer>
    </div>
  );
}

const STATUS: Record<JournalEntry["status"], { icon: typeof Check; tone: string; label: string }> = {
  running: { icon: LoaderCircle, tone: "text-text-muted", label: "En cours" },
  pending: { icon: ShieldQuestion, tone: "text-warning", label: "En attente de votre accord" },
  done: { icon: Check, tone: "text-success", label: "Effectuée" },
  denied: { icon: X, tone: "text-text-muted", label: "Refusée par vous" },
  refused: { icon: CircleSlash, tone: "text-text-muted", label: "Non autorisée" },
  error: { icon: TriangleAlert, tone: "text-warning", label: "Échec" },
};

/** Ligne du journal : ce que l'agent a fait, tenté, ou attend de pouvoir faire. */
function JournalRow({ entry, onDecide }: { entry: JournalEntry; onDecide: (approved: boolean) => void }) {
  const status = STATUS[entry.status];
  return (
    <li className={cn("rounded-md border px-2.5 py-2 text-xs", entry.status === "pending" ? "border-warning bg-warning-soft" : "border-border bg-surface-sunken")}
      data-journal={entry.status} data-tool={entry.tool}>
      <div className="flex items-start gap-2">
        <status.icon className={cn("mt-0.5 size-3.5 shrink-0", status.tone, entry.status === "running" && "animate-spin")} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium text-text">{entry.summary}</p>
          <p className="text-text-muted">{status.label}{entry.detail ? ` — ${entry.detail}` : ""}</p>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {entry.image && <img src={entry.image} alt="Capture de la page" className="mt-2 w-full rounded border border-border" />}
      {entry.status === "pending" && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => onDecide(true)}>Autoriser</Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => onDecide(false)}>Refuser</Button>
        </div>
      )}
    </li>
  );
}
