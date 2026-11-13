import type { PageContext, TranscriptMessage } from "@/lib/browser/context";
import type { DesktopAgentOutcome, DesktopBrowserApi, DesktopPageContent, DesktopSaveRequest } from "./browser-api";

/**
 * Boucle de l'agent côté interface : le serveur propose du texte et des appels d'outils, l'application
 * desktop (processus Main) valide et exécute chaque appel. Ce module ne décide d'aucune autorisation :
 * il transmet les appels à Main, affiche le journal et relaie les confirmations de l'utilisateur.
 * Sans dépendance à React, pour être testé avec un navigateur et un serveur simulés.
 */
export type JournalEntry = {
  id: string;
  tool: string;
  summary: string;
  status: "running" | "pending" | "done" | "denied" | "refused" | "error";
  /** Pourquoi une confirmation est demandée, ou message d'échec. */
  detail?: string;
  /** Capture d'écran (data URL) produite par l'outil. */
  image?: string;
};

export type RunnerDeps = {
  api: Pick<DesktopBrowserApi, "agentStart" | "agentCall" | "agentResolve" | "agentAbort" | "agentEnd" | "extractPage" | "getSelection" | "getState">;
  fetch: typeof fetch;
  notebookId?: string;
  signal: AbortSignal;
  /** Texte de la réponse en cours (cumulé). */
  onText: (text: string) => void;
  onJournal: (entry: JournalEntry) => void;
  /** Attend la décision de l'utilisateur sur une action en attente. */
  confirm: (entry: JournalEntry) => Promise<boolean>;
  /** Enregistre dans le Notebook une page dont l'ajout vient d'être approuvé. */
  save: (request: DesktopSaveRequest) => Promise<{ ok: boolean; message: string }>;
};

export type TurnResult = { transcript: TranscriptMessage[]; error?: string };

const MAX_ITERATIONS = 14;
const MAX_TRANSCRIPT = 100;

export function toPageContext(page: DesktopPageContent): PageContext {
  return {
    status: page.status, ...(page.reason ? { reason: page.reason.slice(0, 80) } : {}),
    url: page.url.slice(0, 2048), title: page.title.slice(0, 300),
    ...(page.description ? { description: page.description.slice(0, 1000) } : {}),
    publishedAt: page.publishedAt, truncated: page.truncated || page.text.length > 30_000,
    headings: page.headings.slice(0, 40).map((heading) => `${"#".repeat(heading.level)} ${heading.text}`.slice(0, 210)),
    text: page.text.slice(0, 30_000),
  };
}

/** Lit un flux SSE `event:` / `data:` et rend ses événements. */
export async function* parseSse(response: Response): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      try { yield { event, data: JSON.parse(data) as Record<string, unknown> }; } catch { /* bloc illisible ignoré */ }
    }
  }
}

type Step = { text: string; calls: { id: string; name: string; arguments: string }[]; continuation?: string };

async function requestStep(deps: RunnerDeps, body: Record<string, unknown>, onText: (text: string) => void): Promise<Step> {
  const response = await deps.fetch("/api/v1/browser/agent", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: deps.signal,
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `http_${response.status}`);
  }
  const step: Step = { text: "", calls: [] };
  for await (const { event, data } of parseSse(response)) {
    if (event === "delta" && typeof data.text === "string") { step.text += data.text; onText(step.text); }
    else if (event === "tool_calls" && Array.isArray(data.calls)) step.calls = data.calls as Step["calls"];
    else if (event === "done") step.continuation = typeof data.continuation === "string" ? data.continuation : undefined;
    else if (event === "error") throw new Error(typeof data.code === "string" ? data.code : "internal");
  }
  return step;
}

function trim(transcript: TranscriptMessage[]): TranscriptMessage[] {
  if (transcript.length <= MAX_TRANSCRIPT) return transcript;
  // Coupe sur un message utilisateur pour ne jamais séparer un appel d'outil de son résultat.
  const from = transcript.findIndex((message, index) => index >= transcript.length - MAX_TRANSCRIPT && message.role === "user");
  return from > 0 ? transcript.slice(from) : transcript.slice(-MAX_TRANSCRIPT);
}

/** Contexte de la page active, lu au moment de la demande (jamais le DOM : un extrait nettoyé et borné). */
async function activePage(deps: RunnerDeps): Promise<{ page?: PageContext; selection?: string }> {
  const state = await deps.api.getState();
  if (!state.activeTabId) return {};
  const [content, selection] = await Promise.all([
    deps.api.extractPage(state.activeTabId),
    deps.api.getSelection(state.activeTabId).catch(() => ""),
  ]);
  if (!content.url) return {};
  return { page: toPageContext(content), ...(selection.trim() ? { selection: selection.slice(0, 8000) } : {}) };
}

/** Un tour complet : demande de l'utilisateur → réponse finale de Leanna, avec autant d'étapes d'outils que nécessaire. */
export async function runTurn(deps: RunnerDeps, history: TranscriptMessage[], userText: string, options: { reset?: boolean } = {}): Promise<TurnResult> {
  const transcript = trim([...history]);
  let assistantText = "";
  let missionId: number | null = null;
  try {
    const { mode, mission } = await deps.api.agentStart({ text: userText, reset: options.reset === true });
    missionId = mission;
    transcript.push({ role: "user", text: userText, ...(await activePage(deps)) });
    let continuation: string | undefined;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      assistantText = "";
      const step = await requestStep(deps, { messages: transcript, persona: "leanna", mode, continuation, notebookId: deps.notebookId },
        (text) => { assistantText = text; deps.onText(text); });
      continuation = step.continuation;
      transcript.push({ role: "assistant", text: step.text, ...(step.calls.length ? { toolCalls: step.calls } : {}) });
      assistantText = "";
      if (step.calls.length === 0) return { transcript };

      for (const call of step.calls) {
        if (deps.signal.aborted) throw new DOMException("aborted", "AbortError");
        const id = `${transcript.length}-${call.id}`;
        let outcome: DesktopAgentOutcome = await deps.api.agentCall({ name: call.name, args: call.arguments, mission: missionId! });
        if (outcome.status === "confirmation_required") {
          const entry: JournalEntry = { id, tool: outcome.tool, summary: outcome.summary, status: "pending", detail: outcome.reason };
          deps.onJournal(entry);
          const approved = await deps.confirm(entry);
          if (deps.signal.aborted) throw new DOMException("aborted", "AbortError");
          outcome = await deps.api.agentResolve({ actionId: outcome.actionId, approve: approved, mission: missionId! });
        } else {
          deps.onJournal({ id, tool: outcome.tool, summary: outcome.summary, status: "running" });
        }

        let result: Record<string, unknown>;
        if (outcome.status === "ok") {
          result = outcome.result;
          let detail: string | undefined;
          if (outcome.save) {
            const saved = await deps.save(outcome.save);
            result = { saved: saved.ok, message: saved.message };
            detail = saved.message;
          }
          deps.onJournal({ id, tool: outcome.tool, summary: outcome.summary, status: "done", detail, image: outcome.image });
        } else if (outcome.status === "confirmation_required") {
          result = { status: "error", message: "confirmation inattendue" };
        } else {
          result = { status: outcome.status, error: outcome.error, message: outcome.message };
          deps.onJournal({ id, tool: outcome.tool, summary: outcome.summary, status: outcome.status, detail: outcome.message });
        }
        transcript.push({ role: "tool", toolCallId: call.id, name: call.name, result: JSON.stringify(result).slice(0, 38_000) });
      }
    }
    return { transcript, error: "step_limit" };
  } catch (error) {
    const aborted = deps.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    if (aborted && missionId !== null) await deps.api.agentAbort({ mission: missionId }).catch(() => undefined);
    // Le texte partiel d'une réponse interrompue est conservé, comme dans le chat du Notebook.
    if (assistantText) transcript.push({ role: "assistant", text: assistantText });
    return { transcript, error: aborted ? "aborted" : error instanceof Error ? error.message : "internal" };
  } finally {
    if (missionId !== null) await deps.api.agentEnd({ mission: missionId }).catch(() => false);
  }
}

/** Second regard de Roxane sur la dernière réponse de Leanna : sans outil, sans effet sur la conversation de Leanna. */
export async function askRoxane(deps: Pick<RunnerDeps, "fetch" | "signal" | "notebookId">, transcript: TranscriptMessage[], onText: (text: string) => void): Promise<{ text: string; error?: string }> {
  let text = "";
  try {
    const messages = transcript.filter((message) => message.role !== "tool")
      .map((message) => message.role === "assistant" ? { role: "assistant" as const, text: message.text } : message);
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return { text: "", error: "nothing_to_review" };
    const step = await requestStep({ ...deps } as RunnerDeps, { messages: [...messages, lastUser], persona: "roxane", notebookId: deps.notebookId },
      (value) => { text = value; onText(value); });
    return { text: step.text };
  } catch (error) {
    return { text, error: deps.signal.aborted ? "aborted" : error instanceof Error ? error.message : "internal" };
  }
}

export const ERROR_MESSAGES: Record<string, string> = {
  aborted: "Mission interrompue.",
  step_limit: "Leanna a atteint le nombre maximal d’étapes pour cette demande. Précisez la suite si besoin.",
  ai_not_configured: "L’assistant n’est pas configuré sur ce serveur.",
  quota_daily_exceeded: "Quota quotidien atteint. Réessayez demain.",
  quota_monthly_exceeded: "Quota mensuel atteint.",
  upstream_error: "Le modèle n’a pas répondu. Réessayez dans un instant.",
  auth_required: "Votre session a expiré. Reconnectez-vous.",
  invalid_continuation: "La mission a expiré. Relancez votre demande.",
  validation: "La demande n’a pas pu être envoyée (contenu trop long ?).",
};
export const errorMessage = (code: string) => ERROR_MESSAGES[code] ?? "Une erreur est survenue. Réessayez.";
