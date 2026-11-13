import { z } from "zod";
import type { ChatMessage } from "@/lib/ai/openrouter";
import {
  UNTRUSTED_TAG, USER_REQUEST_TAG, browserSystemPrompt, type BrowserAgentMode, type BrowserPersona,
} from "@/lib/ai/prompts/browser";

/**
 * Assemblage des messages envoyés au modèle pour Leanna Browser.
 * Séparation stricte : consignes (system) · demande de l'utilisateur (<user_request>) · contenu web et
 * résultats d'outils (<untrusted_web_content>, données non fiables). Le contexte est borné ici, côté serveur.
 */

/** Nombre maximal d'étapes d'outils par demande de l'utilisateur. */
export const MAX_STEPS = 12;
const PAGE_TEXT_MAX = 30_000;
const TOOL_RESULT_MAX = 40_000;
/** Au-delà des N derniers, les résultats d'outils anciens sont abrégés. */
const RECENT_TOOL_RESULTS = 6;

export const pageContextSchema = z.object({
  status: z.enum(["ok", "empty", "unavailable"]),
  reason: z.string().max(80).optional(),
  url: z.string().max(2048),
  title: z.string().max(300),
  description: z.string().max(1000).optional(),
  publishedAt: z.string().max(40).nullable().optional(),
  truncated: z.boolean().optional(),
  headings: z.array(z.string().max(210)).max(40).optional(),
  text: z.string().max(PAGE_TEXT_MAX),
}).strict();
export type PageContext = z.infer<typeof pageContextSchema>;

const toolCallSchema = z.object({ id: z.string().min(1).max(80), name: z.string().min(1).max(64), arguments: z.string().max(20_000) }).strict();

export const transcriptMessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"), text: z.string().trim().min(1, "Message vide.").max(4000, "4 000 caractères maximum."),
    page: pageContextSchema.optional(), selection: z.string().max(8000).optional(),
  }).strict(),
  z.object({ role: z.literal("assistant"), text: z.string().max(20_000), toolCalls: z.array(toolCallSchema).max(8).optional() }).strict(),
  z.object({ role: z.literal("tool"), toolCallId: z.string().min(1).max(80), name: z.string().min(1).max(64), result: z.string().max(TOOL_RESULT_MAX) }).strict(),
]);
export type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;

export const agentRequestSchema = z.object({
  messages: z.array(transcriptMessageSchema).min(1).max(120),
  persona: z.enum(["leanna", "roxane"]).default("leanna"),
  mode: z.enum(["observation", "assistance", "autonomous"]).default("assistance"),
  continuation: z.string().max(400).optional(),
  notebookId: z.string().uuid().optional(),
}).strict();

/** Empêche un contenu de fermer ou d'ouvrir lui-même un bloc de structure. */
export function neutralize(text: string): string {
  return text.replace(new RegExp(`<(\\s*/?\\s*(?:${UNTRUSTED_TAG}|${USER_REQUEST_TAG}))`, "gi"), "&lt;$1");
}

const attribute = (value: string) => value.replace(/[\s"'<>]+/g, " ").trim().slice(0, 300);

/** Bloc de contenu non fiable (page, sélection, résultat d'outil). */
export function wrapUntrusted(kind: "active_page" | "selection" | "tool_result", source: string, body: string): string {
  return `<${UNTRUSTED_TAG} kind="${kind}" source="${attribute(source)}">\n${neutralize(body)}\n</${UNTRUSTED_TAG}>`;
}

export function formatPage(page: PageContext): string {
  if (page.status !== "ok") {
    const why = page.status === "empty" ? "la page est chargée mais ne contient pas de texte lisible" : `la page est inaccessible (${page.reason ?? "raison inconnue"})`;
    return wrapUntrusted("active_page", page.url,
      `Titre : ${page.title}\nAdresse : ${page.url}\nCONTENU INDISPONIBLE : ${why}. Aucun contenu n'a pu être lu.`);
  }
  return wrapUntrusted("active_page", page.url, [
    `Titre : ${page.title}`,
    `Adresse : ${page.url}`,
    page.publishedAt ? `Date de publication : ${page.publishedAt}` : "",
    page.description ? `Description : ${page.description}` : "",
    page.headings?.length ? `Plan : ${page.headings.slice(0, 25).join(" · ")}` : "",
    page.truncated ? "Remarque : contenu tronqué, seul le début de la page est fourni." : "",
    "",
    page.text,
  ].filter((line, index) => line !== "" || index === 6).join("\n"));
}

function userContent(message: Extract<TranscriptMessage, { role: "user" }>, withPage: boolean): string {
  return [
    message.page && withPage ? formatPage(message.page) : "",
    message.page && !withPage ? `(Contexte de page d'un message précédent, omis : ${attribute(message.page.url)})` : "",
    message.selection && withPage && message.page ? wrapUntrusted("selection", message.page.url, message.selection) : "",
    `<${USER_REQUEST_TAG}>\n${neutralize(message.text)}\n</${USER_REQUEST_TAG}>`,
  ].filter(Boolean).join("\n\n");
}

export type BuildOptions = {
  messages: TranscriptMessage[]; persona: BrowserPersona; mode: BrowserAgentMode; languageName: string; custom?: string | null;
  /** Prompt système imposé (évaluation avant/après). */
  systemOverride?: string;
};

export function buildBrowserMessages(options: BuildOptions): ChatMessage[] {
  const { messages } = options;
  const system: ChatMessage = { role: "system", content: options.systemOverride ?? browserSystemPrompt(options) };
  const lastUser = messages.map((message) => message.role).lastIndexOf("user");

  if (options.persona === "roxane") {
    // Roxane commente : elle reçoit la page, la question et la réponse de Leanna, sans outils ni historique d'actions.
    const question = messages[lastUser] as Extract<TranscriptMessage, { role: "user" }> | undefined;
    const answer = [...messages].reverse().find((message): message is Extract<TranscriptMessage, { role: "assistant" }> =>
      message.role === "assistant" && Boolean(message.text.trim()));
    const page = [...messages].reverse().find((message) => message.role === "user" && message.page) as Extract<TranscriptMessage, { role: "user" }> | undefined;
    return [system, {
      role: "user",
      content: [
        page?.page ? formatPage(page.page) : "",
        answer ? `<leanna_answer>\n${neutralize(answer.text)}\n</leanna_answer>` : "",
        `<${USER_REQUEST_TAG}>\n${neutralize(question?.text ?? "Donne ton regard critique sur la réponse de Leanna.")}\n</${USER_REQUEST_TAG}>`,
      ].filter(Boolean).join("\n\n"),
    }];
  }

  const out: ChatMessage[] = [system];
  const toolIndexes = messages.flatMap((message, index) => message.role === "tool" ? [index] : []);
  const recentFrom = toolIndexes[Math.max(0, toolIndexes.length - RECENT_TOOL_RESULTS)] ?? 0;
  let open = new Set<string>(); // appels d'outils de l'assistant encore sans résultat
  const closeOpen = () => {
    for (const id of open) out.push({ role: "tool", tool_call_id: id, content: wrapUntrusted("tool_result", "application", '{"status":"not_executed"}') });
    open = new Set();
  };
  messages.forEach((message, index) => {
    if (message.role === "tool") {
      if (!open.has(message.toolCallId)) return; // résultat orphelin : ignoré
      open.delete(message.toolCallId);
      const body = index >= recentFrom ? message.result : `${message.result.slice(0, 600)}\n…[résultat ancien abrégé]`;
      out.push({ role: "tool", tool_call_id: message.toolCallId, content: wrapUntrusted("tool_result", message.name, body) });
      return;
    }
    closeOpen();
    if (message.role === "user") {
      out.push({ role: "user", content: userContent(message, index === lastUser) });
    } else {
      const calls = message.toolCalls ?? [];
      open = new Set(calls.map((call) => call.id));
      out.push({
        role: "assistant", content: message.text,
        ...(calls.length ? { tool_calls: calls.map((call) => ({ id: call.id, type: "function" as const, function: { name: call.name, arguments: call.arguments } })) } : {}),
      });
    }
  });
  closeOpen();
  return out;
}

/** Nombre de résultats d'outils depuis la dernière demande de l'utilisateur. */
export function stepsSinceUser(messages: TranscriptMessage[]): number {
  const lastUser = messages.map((message) => message.role).lastIndexOf("user");
  return messages.slice(lastUser + 1).filter((message) => message.role === "assistant" && message.toolCalls?.length).length;
}
