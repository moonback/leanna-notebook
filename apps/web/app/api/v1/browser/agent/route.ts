import { type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { AiNotConfigured, AiUpstreamError, streamChat, type ToolCall } from "@/lib/ai/openrouter";
import { MAX_STEPS, agentRequestSchema, buildBrowserMessages } from "@/lib/browser/context";
import { signContinuation, verifyContinuation } from "@/lib/browser/continuation";
import { toolDefinitions } from "@/lib/browser/tools";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const LANG_NAMES: Record<string, string> = { fr: "français", en: "anglais", es: "espagnol", de: "allemand", it: "italien", pt: "portugais", nl: "néerlandais" };

/**
 * Une étape de modèle pour Leanna Browser (panneau latéral et agent de navigation).
 * Le serveur ne pilote pas le navigateur : il renvoie le texte et les appels d'outils proposés ;
 * l'application desktop les valide et les exécute (apps/desktop/src/browser/browser-agent.ts).
 * Événements SSE : meta {step} · delta {text} · tool_calls {calls} · done {text, continuation} · error {code}.
 */
export const POST = handle(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, agentRequestSchema);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new ApiError(503, "ai_not_configured");
  const db = createServiceClient();

  const last = body.messages[body.messages.length - 1];
  if (last.role === "assistant") throw new ApiError(422, "validation", { fields: { messages: "Le dernier message doit venir de l'utilisateur ou d'un outil." } });
  const newTurn = last.role === "user";
  if (body.persona === "roxane" && !newTurn) throw new ApiError(422, "validation", { fields: { persona: "Roxane n'utilise pas d'outils." } });

  // Tour utilisateur : quota réservé. Étape d'outil : jeton signé obligatoire, nombre d'étapes borné.
  let step = 0;
  let usageId: string | null = null;
  if (newTurn) {
    let workspaceId: string;
    if (body.notebookId) {
      await requireRole(body.notebookId, "chat");
      const { data: nb } = await db.from("notebooks").select("workspace_id").eq("id", body.notebookId).single();
      if (!nb) throw new ApiError(404, "not_found");
      workspaceId = nb.workspace_id as string;
    } else {
      const { data: ws } = await db.from("workspaces").select("id").eq("owner_id", user.id).eq("kind", "personal").single();
      if (!ws) throw new ApiError(409, "no_workspace");
      workspaceId = ws.id as string;
    }
    if (!process.env.OPENROUTER_API_KEY) throw new ApiError(503, "ai_not_configured");
    const { data, error } = await db.rpc("reserve_usage", { p_ws: workspaceId, p_user: user.id, p_feature: "chat" });
    if (error) throw error;
    usageId = data as string;
  } else {
    const previous = verifyContinuation(secret, body.continuation, user.id);
    if (previous === null) throw new ApiError(403, "invalid_continuation");
    if (previous + 1 >= MAX_STEPS) throw new ApiError(429, "step_limit");
    step = previous + 1;
  }

  const [{ data: profile }, { data: preference }, { data: override }] = await Promise.all([
    db.from("profiles").select("output_language").eq("id", user.id).single(),
    db.from("ai_model_preferences").select("model_id").eq("user_id", user.id).eq("feature_key", "chat").maybeSingle(),
    // Personnalisation existante du personnage (Réglages → Prompts système) : ajoutée, jamais substituée.
    db.from("ai_prompt_overrides").select("content").eq("user_id", user.id).eq("prompt_key", `voice.${body.persona}`).maybeSingle(),
  ]);

  const messages = buildBrowserMessages({
    messages: body.messages, persona: body.persona, mode: body.mode,
    languageName: LANG_NAMES[profile?.output_language ?? "fr"] ?? "français", custom: override?.content,
  });
  // À la dernière étape permise, aucun outil n'est proposé : le modèle doit conclure.
  const tools = body.persona === "leanna" && step < MAX_STEPS - 1 ? toolDefinitions(body.mode) : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const settle = async (status: "committed" | "refunded") => { if (usageId) await db.rpc("settle_usage", { p_id: usageId, p_status: status }); };
      send("meta", { step, persona: body.persona });
      let text = "";
      let calls: ToolCall[] = [];
      try {
        for await (const evt of streamChat(messages, { signal: req.signal, model: preference?.model_id ?? undefined, tools, maxTokens: 2500 })) {
          if (evt.type === "delta") { text += evt.text; send("delta", { text: evt.text }); }
          else if (evt.type === "tool_calls") calls = evt.calls.slice(0, 8);
        }
        await settle("committed");
        if (calls.length) send("tool_calls", { calls });
        send("done", { text, toolCalls: calls.length, continuation: signContinuation(secret, user.id, step) });
        // Identifiants et compteurs uniquement : ni contenu de page, ni arguments d'outils.
        log.info("browser.agent_step", { user_id: user.id, step, persona: body.persona, mode: body.mode, tool_calls: calls.length });
      } catch (e) {
        const aborted = req.signal.aborted;
        await settle(aborted || text ? "committed" : "refunded").catch(() => undefined);
        log.error("browser.agent_failed", { user_id: user.id, step, aborted, status: e instanceof AiUpstreamError ? e.status : null });
        if (!aborted) send("error", { code: e instanceof AiNotConfigured ? "ai_not_configured" : e instanceof AiUpstreamError ? "upstream_error" : "internal" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
});
