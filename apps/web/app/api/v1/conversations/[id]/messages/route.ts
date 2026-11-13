import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { AiNotConfigured, AiUpstreamError, embedQuery, streamChat, type ChatMessage } from "@/lib/ai/openrouter";
import { CHAT_DEFAULT_INSTRUCTIONS, chatFixedRules, stripCitationMarkers } from "@/lib/ai/prompts/chat";
import { formatPassages, resolveCitations, type Passage } from "@notebook/core/citations";
import { log } from "@/lib/log";
import { githubFilePath, passageTitle, SOURCE_FILES_SELECT } from "@/lib/github-source";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { disabledFeatures } from "@/lib/ownership";

export const runtime = "nodejs";
export const maxDuration = 60;
type Params = { params: Promise<{ id: string }> };

const askSchema = z.object({
  text: z.string().trim().min(1, "Question vide.").max(4000, "4 000 caractères maximum."),
  sourceIds: z.array(z.string().uuid()).max(600).optional(),
}).strict();

const LANG_NAMES: Record<string, string> = { fr: "French", en: "English", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch" };

type StudioArtifactType = "report" | "flashcards" | "quiz" | "mind_map" | "infographic" | "timeline" | "comparison" | "glossary" | "faq" | "diagram" | "editorial" | "study_plan" | "audio" | "image";

/** Détecte uniquement une demande explicite de création d'un livrable Studio. */
function detectStudioArtifactRequest(input: string): { type: StudioArtifactType; template?: string } | null {
  const value = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const action = /\b(cree|creer|gener(e|er|ez)|prepare|produis|realise|redige|rediger|ecris|construis|fabrique|fais-moi|fais moi|faire|fais|fasse|fait|veux|voudrais|souhaite|aimerais|besoin|make|create|generate)\b/.test(value);
  if (!action) return null;
  const types: Array<[StudioArtifactType, RegExp]> = [
    ["flashcards", /\b(fiches? de revision|flashcards|cartes memoire)\b/],
    ["quiz", /\b(quiz|qcm|questionnaire)\b/],
    ["mind_map", /\b(carte mentale|mind ?map)\b/],
    ["infographic", /\b(infographie|infographic)\b/],
    ["timeline", /\b(chronologie|frise chronologique|timeline)\b/],
    ["comparison", /\b(comparatif|comparaison|tableau comparatif)\b/],
    ["glossary", /\b(glossaire)\b/],
    ["faq", /\b(faq|foire aux questions)\b/],
    ["diagram", /\b(diagramme|schema|flowchart)\b/],
    ["editorial", /\b(newsletter|article de blog|publication|contenu editorial)\b/],
    ["study_plan", /\b(plan d'etude|plan de revision|planning de revision|programme de revision)\b/],
    ["report", /\b(rapport|report|synthese|briefing|guide d'etude|study guide|guide pratique|fiche pratique|guide detaille|plan d'action|cahier des charges|specification|document)\b/],
    ["audio", /\b(audio overview|podcast|resume audio)\b/],
    ["image", /\b(image|illustration|visuel|visuelle|affiche)\b/],
  ];
  const match = types.find(([, pattern]) => pattern.test(value));
  if (!match) return null;
  if (match[0] !== "report") return { type: match[0] };
  const template = /\b(guide d'etude|study guide)\b/.test(value) ? "study_guide"
    : /\b(article de blog)\b/.test(value) ? "blog_post"
    : /\b(plan d'action)\b/.test(value) ? "action_plan"
    : /\b(guide pratique|fiche pratique)\b/.test(value) ? "practical_sheet"
    : /\b(guide detaille)\b/.test(value) ? "detailed_guide"
    : /\b(specification|cahier des charges)\b/.test(value) ? "specification"
    : "briefing";
  return { type: "report", template };
}

/** Conversation de l'utilisateur courant uniquement (une conversation est privée). */
async function ownConversation(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { data } = await createServiceClient().from("conversations").select("id, notebook_id, workspace_id, user_id").eq("id", id).single();
  if (!data || data.user_id !== userId) throw new ApiError(404, "not_found");
  await requireRole(data.notebook_id, "chat");
  return data;
}

/** Historique avec citations (lecture sous RLS). */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const conv = await ownConversation(id, user.id);
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("chat_messages")
    .select("id, role, content, status, feedback, thoughts, created_at, citations(marker, chunk_id, source_id, quote_text, char_start, char_end, verified)")
    .eq("conversation_id", id).order("created_at");
  if (error) throw error;
  return NextResponse.json({ messages: await withCitationFiles(conv.notebook_id, data ?? []) });
});

type StoredCitation = { chunk_id: string | null; source_id: string | null };

/** Sources GitHub : ajoute à chaque citation le chemin du fichier cité (`file`), déduit de la page du chunk. */
async function withCitationFiles<M extends { citations?: StoredCitation[] | null }>(notebookId: string, messages: M[]) {
  const cited = messages.flatMap((m) => m.citations ?? []).filter((c) => c.chunk_id && c.source_id);
  if (!cited.length) return messages;
  const db = createServiceClient();
  const { data: repos } = await db.from("sources").select(`id, ${SOURCE_FILES_SELECT}`)
    .eq("notebook_id", notebookId).eq("kind", "github").in("id", [...new Set(cited.map((c) => c.source_id!))]);
  if (!repos?.length) return messages;
  const repoById = new Map(repos.map((r) => [r.id as string, r as { github_files?: unknown }]));
  const chunkIds = [...new Set(cited.filter((c) => repoById.has(c.source_id!)).map((c) => c.chunk_id!))];
  const { data: chunks } = await db.from("chunks").select("id, page_start").in("id", chunkIds);
  const pageOf = new Map((chunks ?? []).map((c) => [c.id as string, c.page_start as number | null]));
  return messages.map((m) => ({ ...m, citations: (m.citations ?? []).map((c) => {
    const file = c.chunk_id && c.source_id ? githubFilePath(repoById.get(c.source_id), pageOf.get(c.chunk_id)) : null;
    return file ? { ...c, file } : c;
  }) }));
}

const LENGTH_EN: Record<string, string> = {
  short: "Tone and style instruction: keep the response short, a few sentences with only the essentials.",
  long: "Tone and style instruction: give a detailed response that develops each point with examples drawn from the passages.",
};

/**
 * Prompt système : instructions par défaut (ou personnalisées) + ton/style du notebook + règles fixes.
 * Uniquement des éléments stables par notebook (préfixe cachable) ; le variable va dans le message user.
 */
function systemPrompt(lang: string, style: string, custom: string | null, length: string, override?: string | null) {
  return [
    override?.trim() || CHAT_DEFAULT_INSTRUCTIONS,
    style === "learning_guide" ? "Tone and style instruction: be pedagogical, explain step by step and end with one question that lets me check my understanding." : "",
    style === "custom" && custom ? `Tone and style instruction: ${custom}` : "",
    LENGTH_EN[length] ?? "",
    chatFixedRules(LANG_NAMES[lang] ?? "French"),
  ].filter(Boolean).join("\n\n");
}

/**
 * Question → réponse en streaming SSE avec citations vérifiées.
 * Événements : meta {messageId} · delta {text} · done {text, citations, usage} · error {code}.
 */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const conv = await ownConversation(id, user.id);
  const { text, sourceIds } = await parseBody(req, askSchema);
  const db = createServiceClient();

  // Sources prêtes et sélectionnées (défaut : toutes sauf les désélections de l'utilisateur)
  const [{ data: ready }, { data: desel }, { data: nb }, { data: profile }, { data: promptOverride }] = await Promise.all([
    db.from("sources").select(`id, title, fts_config, ${SOURCE_FILES_SELECT}`).eq("notebook_id", conv.notebook_id).eq("status", "ready"),
    db.from("source_deselections").select("source_id").eq("notebook_id", conv.notebook_id).eq("user_id", user.id),
    db.from("notebooks").select("chat_style, chat_custom_prompt, response_length, output_language").eq("id", conv.notebook_id).single(),
    db.from("profiles").select("output_language").eq("id", user.id).single(),
    db.from("ai_prompt_overrides").select("content").eq("user_id", user.id).eq("prompt_key", "chat").maybeSingle(),
  ]);
  const off = new Set((desel ?? []).map((d) => d.source_id));
  const selected = (ready ?? []).filter((s) => (sourceIds ? sourceIds.includes(s.id) : !off.has(s.id)));
  if (selected.length === 0) throw new ApiError(422, "no_sources");

  // Configuration IA vérifiée AVANT de consommer du quota
  const { data: chatPreference } = await db.from("ai_model_preferences")
    .select("model_id").eq("user_id", user.id).eq("feature_key", "chat").maybeSingle();
  let query: Awaited<ReturnType<typeof embedQuery>>;
  try { query = await embedQuery(text); } catch (e) {
    if (e instanceof AiNotConfigured) throw new ApiError(503, "ai_not_configured");
    throw e;
  }

  const artifactRequest = detectStudioArtifactRequest(text);
  if (artifactRequest) {
    await requireRole(conv.notebook_id, "editor");
    if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_CHAT_MODEL) throw new ApiError(503, "ai_not_configured");
    if (artifactRequest.type === "image") {
      const { data: imagePrefs } = await db.from("ai_image_preferences")
        .select("enabled,default_model_id,default_orientation").eq("user_id", user.id).maybeSingle();
      if (imagePrefs?.enabled === false) throw new ApiError(403, "image_generation_disabled");
      const modelId = imagePrefs?.default_model_id || process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image";
      const catalogResponse = await fetch("https://openrouter.ai/api/v1/images/models", {
        headers: { authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "X-Title": "Leanna Notebook" },
        next: { revalidate: 1800 },
      });
      if (!catalogResponse.ok) throw new ApiError(502, "image_model_catalog_unavailable");
      const catalog = await catalogResponse.json() as { data?: { id?: string }[] };
      if (!(catalog.data ?? []).some((model) => model.id === modelId)) throw new ApiError(422, "unsupported_image_model");
    }
  }
  if (artifactRequest?.type === "audio" && (await disabledFeatures(user.id)).includes("audio_overview")) throw new ApiError(403, "feature_disabled");
  const { data: usageId, error: qe } = await db.rpc("reserve_usage", { p_ws: conv.workspace_id, p_user: user.id, p_feature: "chat" });
  if (qe) throw qe;

  // Une demande explicite de livrable déclenche le moteur Studio existant depuis le chat.
  // Les mêmes contrôles de rôle, de notebook, de sources et de quota que le Studio s'appliquent.
  let requestedArtifact: { id: string; type: StudioArtifactType } | null = null;
  if (artifactRequest) {
    const options = artifactRequest.type === "image"
      ? await (async () => {
          const { data: imagePrefs } = await db.from("ai_image_preferences")
            .select("default_model_id,default_orientation").eq("user_id", user.id).maybeSingle();
          return {
            modelId: imagePrefs?.default_model_id || process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image",
            orientation: imagePrefs?.default_orientation ?? "landscape",
            sourceScope: "selected",
          };
        })()
      : artifactRequest.template
        ? { template: artifactRequest.template, language: nb?.output_language ?? profile?.output_language ?? "fr", reportFormat: "document", sourceScope: "selected" }
        : { language: nb?.output_language ?? profile?.output_language ?? "fr", sourceScope: "selected" };
    const { data: artifactId, error: artifactError } = await db.rpc("create_artifact", {
      p_notebook: conv.notebook_id,
      p_user: user.id,
      p_type: artifactRequest.type,
      p_options: options,
      p_custom_prompt: text,
      p_source_ids: selected.map((s) => s.id),
      p_idempotency_key: null,
    });
    if (artifactError) { await db.rpc("settle_usage", { p_id: usageId, p_status: "refunded" }); throw artifactError; }
    requestedArtifact = { id: artifactId as string, type: artifactRequest.type };
    log.info("chat.studio_artifact_requested", { notebook_id: conv.notebook_id, artifact_id: artifactId, type: artifactRequest.type });
  }


  const base = { workspace_id: conv.workspace_id, notebook_id: conv.notebook_id, conversation_id: conv.id, user_id: user.id };
  const { data: history } = await db.from("chat_messages").select("role, content").eq("conversation_id", conv.id)
    .eq("status", "complete").order("created_at", { ascending: false }).limit(6);
  await db.from("chat_messages").insert({ ...base, role: "user", content: text, source_ids: selected.map((s) => s.id) });
  const { data: answer } = await db.from("chat_messages")
    .insert({ ...base, role: "assistant", status: "streaming", source_ids: selected.map((s) => s.id) }).select("id").single();
  const answerId = answer!.id as string;

  // Recherche hybride (vecteur si disponible + plein texte), langue majoritaire des sources
  const ftsCounts = new Map<string, number>();
  for (const s of selected) ftsCounts.set(s.fts_config, (ftsCounts.get(s.fts_config) ?? 0) + 1);
  const fts = [...ftsCounts].sort((a, b) => b[1] - a[1])[0][0];
  const { data: hits, error: me } = await db.rpc("match_chunks", {
    p_notebook: conv.notebook_id, p_embedding: query ? `[${query.vector.join(",")}]` : null,
    p_query: text, p_fts_config: fts, p_source_ids: selected.map((s) => s.id), p_k: 12,
  });
  if (me) throw me;
  const byId = new Map(selected.map((s) => [s.id, s]));
  const passages: Passage[] = (hits as { chunk_id: string; source_id: string; content: string; char_start: number; char_end: number; page_start: number | null }[])
    .map((h, i) => ({ n: i + 1, chunk_id: h.chunk_id, source_id: h.source_id, source_title: passageTitle(byId.get(h.source_id), h.page_start), content: h.content, char_start: h.char_start, char_end: h.char_end, page_start: h.page_start }));

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(nb?.output_language ?? profile?.output_language ?? "fr", nb?.chat_style ?? "default", nb?.chat_custom_prompt ?? null, nb?.response_length ?? "default", promptOverride?.content) },
    ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.role === "assistant" ? stripCitationMarkers(m.content) : m.content })),
    { role: "user", content: [
      `<passages>\n${formatPassages(passages)}\n</passages>`,
      passages.length ? "" : "No relevant passage was found for this query: say that the information is not in the selected sources.",
      artifactRequest ? "The requested Studio artifact is already queued. Acknowledge briefly and do not reproduce the full deliverable in this chat response." : "",
      `Question : ${text}`,
    ].filter(Boolean).join("\n\n") },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("meta", { messageId: answerId, passages: passages.length, vector: Boolean(query) });
      if (requestedArtifact) {
        send("artifact", { id: requestedArtifact.id, type: requestedArtifact.type });
        const confirmation = requestedArtifact.type === "image"
          ? "La création de ton image est lancée dans le Studio. Tu peux suivre sa progression et retrouver le résultat dans l’onglet Studio."
          : "La génération de ton document est lancée dans le Studio. Tu peux suivre sa progression et retrouver le résultat dans l’onglet Studio.";
        try {
          await db.from("chat_messages").update({ content: confirmation, status: "complete", usage: null, model: null }).eq("id", answerId);
          await db.rpc("settle_usage", { p_id: usageId, p_status: "committed" });
          await db.from("notebooks").update({ last_activity_at: new Date().toISOString() }).eq("id", conv.notebook_id);
          send("delta", { text: confirmation });
          send("done", { messageId: answerId, text: confirmation, thoughts: null, citations: [], usage: null });
        } catch (e) {
          await db.from("chat_messages").update({ content: "La génération a été demandée, mais son lancement doit être vérifié dans le Studio.", status: "failed" }).eq("id", answerId);
          await db.rpc("settle_usage", { p_id: usageId, p_status: "refunded" });
          log.error("chat.studio_artifact_confirmation_failed", { message_id: answerId, artifact_id: requestedArtifact.id });
          send("error", { code: "internal" });
        } finally {
          controller.close();
        }
        return;
      }
      let raw = "", thoughts = "", usage: unknown = null, model: string | null = null;
      try {
        for await (const evt of streamChat(messages, { signal: req.signal, model: chatPreference?.model_id ?? undefined, reasoning: true })) {
          if (evt.type === "delta") { raw += evt.text; send("delta", { text: evt.text }); }
          else if (evt.type === "thought") { thoughts += evt.text; send("thought", { text: evt.text }); }
          else if (evt.type === "usage") { usage = evt.usage; model = evt.model; }
        }
        const resolved = resolveCitations(raw, passages);
        const final = resolved.text;
        const citations = resolved.citations;
        const dropped = resolved.dropped;
        await db.from("chat_messages").update({ content: final, status: "complete", usage, model, thoughts: thoughts || null }).eq("id", answerId);
        if (citations.length) {
          await db.from("citations").insert(citations.map((c) => ({
            workspace_id: conv.workspace_id, notebook_id: conv.notebook_id, message_id: answerId, marker: c.marker,
            chunk_id: c.chunk_id, source_id: c.source_id, quote_text: c.quote_text, char_start: c.char_start, char_end: c.char_end, verified: c.verified,
          })));
        }
        await db.rpc("settle_usage", { p_id: usageId, p_status: "committed" });
        await db.from("notebooks").update({ last_activity_at: new Date().toISOString() }).eq("id", conv.notebook_id);
        log.info("chat.answered", { notebook_id: conv.notebook_id, message_id: answerId, passages: passages.length, citations: citations.length, dropped_markers: dropped, model });
        send("done", { messageId: answerId, text: final, thoughts: thoughts || null, usage,
          citations: citations.map((c) => { const file = githubFilePath(byId.get(c.source_id), c.page_start); return file ? { ...c, file } : c; }) });
      } catch (e) {
        const aborted = req.signal.aborted;
        // texte partiel conservé ; ses citations sont vérifiées comme pour une réponse complète
        const partial = resolveCitations(raw, passages);
        await db.from("chat_messages").update({ content: partial.text, status: aborted ? "stopped" : "failed", thoughts: thoughts || null }).eq("id", answerId);
        if (partial.citations.length) {
          await db.from("citations").insert(partial.citations.map((c) => ({
            workspace_id: conv.workspace_id, notebook_id: conv.notebook_id, message_id: answerId, marker: c.marker,
            chunk_id: c.chunk_id, source_id: c.source_id, quote_text: c.quote_text, char_start: c.char_start, char_end: c.char_end, verified: c.verified,
          })));
        }
        // arrêt volontaire : les tokens sont consommés ; panne fournisseur : crédit rendu
        await db.rpc("settle_usage", { p_id: usageId, p_status: aborted ? "committed" : "refunded" });
        log.error("chat.failed", { message_id: answerId, aborted, status: e instanceof AiUpstreamError ? e.status : null });
        if (!aborted) send("error", { code: e instanceof AiUpstreamError ? "upstream_error" : "internal" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
});

/** Effacer l'historique de sa conversation (citations supprimées en cascade ; les notes enregistrées restent). */
export const DELETE = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await ownConversation(id, user.id);
  const { error } = await createServiceClient().from("chat_messages").delete().eq("conversation_id", id).neq("status", "streaming");
  if (error) throw error;
  log.info("chat.cleared", { conversation_id: id });
  return new NextResponse(null, { status: 204 });
});
