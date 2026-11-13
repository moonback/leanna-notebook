import { parseSse, toPageContext } from "./agent-runner";
import type { DesktopPageContent, DesktopSaveRequest } from "./browser-api";

/**
 * Enregistrement d'une page dans le Notebook, par les routes existantes (sources et notes) :
 * mêmes contrôles de rôle, même pipeline d'ingestion, donc sources retrouvables et citables par l'IA du Notebook.
 */
export type SaveResult = { ok: boolean; message: string };
const TEXT_MAX = 1_000_000;

const ERRORS: Record<string, string> = {
  forbidden: "Vous n’avez pas le droit de modifier ce notebook.",
  not_found: "Notebook introuvable.",
  max_sources: "Ce notebook a atteint son nombre maximal de sources.",
  auth_required: "Votre session a expiré. Reconnectez-vous.",
  validation: "Le contenu de la page n’a pas été accepté (trop long ou invalide).",
};

async function post(fetchImpl: typeof fetch, url: string, body: unknown): Promise<string | null> {
  const response = await fetchImpl(url, {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body),
  });
  if (response.ok) return null;
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return ERRORS[payload.error ?? ""] ?? "L’enregistrement a échoué. Réessayez.";
}

/** En-tête placé au début du texte : l'IA du Notebook peut ainsi citer l'adresse d'origine. */
export function sourceText(request: DesktopSaveRequest, consultedAt: string): string {
  const header = `Source : ${request.url}\nPage consultée le ${consultedAt.slice(0, 10)}${request.mode === "selection" ? " (extrait sélectionné)" : ""}\n\n`;
  return header + (request.text ?? "").slice(0, TEXT_MAX);
}

export async function saveToNotebook(fetchImpl: typeof fetch, notebookId: string | null | undefined, request: DesktopSaveRequest, now = new Date()): Promise<SaveResult> {
  if (!notebookId) return { ok: false, message: "Choisissez d’abord un notebook de destination." };
  const consultedAt = now.toISOString();
  const title = (request.title || request.url).slice(0, 300);
  const browser = {
    title, consultedAt, mode: request.mode,
    ...(request.favicon && /^https?:\/\//.test(request.favicon) ? { faviconUrl: request.favicon.slice(0, 2048) } : {}),
  };
  const base = `/api/v1/notebooks/${encodeURIComponent(notebookId)}`;
  try {
    if (request.mode === "link") {
      const error = await post(fetchImpl, `${base}/sources`, { items: [{ type: "url", url: request.url, browser }] });
      return error ? { ok: false, message: error } : { ok: true, message: "Lien ajouté au Notebook." };
    }
    if (!request.text?.trim()) return { ok: false, message: "Aucun contenu à enregistrer pour cette page." };
    const error = await post(fetchImpl, `${base}/sources`, {
      items: [{ type: "text", title, text: sourceText(request, consultedAt), browser: { ...browser, originUrl: request.url } }],
    });
    if (error) return { ok: false, message: error };
    if (request.mode === "summary") {
      if (!request.summary?.trim()) return { ok: true, message: "Contenu ajouté au Notebook (la synthèse n’a pas pu être produite)." };
      const noteError = await post(fetchImpl, `${base}/notes`, {
        title: `Synthèse — ${title}`.slice(0, 300), text: `${request.summary.trim()}\n\nSource : ${request.url}`.slice(0, 200_000),
      });
      return noteError
        ? { ok: true, message: "Contenu ajouté au Notebook, mais la synthèse n’a pas pu être enregistrée." }
        : { ok: true, message: "Contenu et synthèse ajoutés au Notebook." };
    }
    return { ok: true, message: request.mode === "selection" ? "Sélection ajoutée au Notebook." : "Contenu ajouté au Notebook." };
  } catch {
    return { ok: false, message: "L’enregistrement a échoué (réseau). Réessayez." };
  }
}

/** Synthèse de la page par Leanna, pour l'ajout « contenu + synthèse » demandé par l'utilisateur. */
export async function summarizePage(fetchImpl: typeof fetch, page: DesktopPageContent, notebookId?: string): Promise<string> {
  const response = await fetchImpl("/api/v1/browser/agent", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      persona: "leanna", mode: "observation", notebookId,
      messages: [{ role: "user", text: "Rédige une synthèse fidèle de cette page pour mes notes : l’idée principale, puis cinq à huit points clés. N’ajoute rien qui ne figure pas dans la page.", page: toPageContext(page) }],
    }),
  });
  if (!response.ok || !response.body) return "";
  let text = "";
  for await (const { event, data } of parseSse(response)) if (event === "delta" && typeof data.text === "string") text += data.text;
  return text.trim();
}
