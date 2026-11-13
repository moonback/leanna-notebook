"use client";

import * as React from "react";
import { AudioLines, Mic, MicOff, PhoneOff, Maximize2, Minimize2, Sparkles, Copy, Trash2, Check, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Citation } from "@/components/ui/citation";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { PendingVoiceSearches, shouldInviteRoxane, waitForAudioPlaybackDrain, VoiceTurnCitationStore, type NumberedVoicePassage } from "./voice-turn";
import type { DesktopBrowserApi, DesktopSaveRequest } from "@/app/browser/browser-api";

type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "error";
type Passage = NumberedVoicePassage;
type VoiceTurn = { user: string; assistant: string; roxane?: string; sources: Passage[] };
type LiveFunctionCall = { id: string; name: string; args?: Record<string, unknown> };
type LiveMessage = {
  toolCall?: { functionCalls?: LiveFunctionCall[] };
  setupComplete?: boolean;
  error?: { message?: string };
  serverContent?: {
    interrupted?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    turnComplete?: boolean;
  };
};

const ROXANE_T0 = typeof performance !== "undefined" ? performance.now() : 0;
/** Logs de diagnostic Roxane : filtrer la console avec "[Roxane]". */
function rlog(event: string, details?: Record<string, unknown>) {
  const t = ((performance.now() - ROXANE_T0) / 1000).toFixed(2);
  console.log(`[Roxane] +${t}s ${event}`, details ?? "");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}
function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
/** Gemini Live envoie ses trames JSON en binaire : on décode texte et ArrayBuffer. */
const frameDecoder = new TextDecoder();
function parseFrame(data: unknown): LiveMessage | null {
  try {
    const text = typeof data === "string" ? data : data instanceof ArrayBuffer ? frameDecoder.decode(data) : "";
    return text ? JSON.parse(text) as LiveMessage : null;
  } catch {
    return null;
  }
}
function downsampleTo16k(input: Float32Array, inputRate: number) {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}
function floatToPcm16(input: Float32Array) {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/** Petit carillon à deux notes joué quand la conversation vocale devient active. */
function playActivationChime(ctx: AudioContext) {
  try {
    const notes = [660, 880];
    notes.forEach((frequency, i) => {
      const start = ctx.currentTime + 0.02 + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch { /* le son est un confort, jamais bloquant */ }
}

type BubbleTone = "user" | "leanna" | "roxane";
const BUBBLE_STYLE: Record<BubbleTone, { box: string; label: string; name: string }> = {
  user: { box: "ml-auto max-w-[94%] rounded-2xl rounded-br-md bg-surface-secondary", label: "text-text-subtle", name: "Vous" },
  leanna: { box: "max-w-[96%] rounded-2xl rounded-bl-md border bg-surface-raised", label: "text-accent", name: "Leanna" },
  roxane: { box: "max-w-[96%] rounded-2xl rounded-bl-md border border-violet-500/20 bg-violet-500/[0.04]", label: "text-violet-500", name: "Roxane" },
};
function Bubble({ tone, text }: { tone: BubbleTone; text: string }) {
  const style = BUBBLE_STYLE[tone];
  return (
    <div className={`${style.box} px-3 py-2`}>
      <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${style.label}`}>{style.name}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </div>
  );
}

/**
 * `inline` : affiche le Studio vocal directement dans un panneau (barre latérale de Leanna Browser) au lieu du
 * bouton + Dialog. Le composant doit rester monté pour que la session Gemini Live survive aux changements d'onglet.
 */
export function VoiceAssistant({ notebookId, conversationId, disabled = false, onOpenCitation, browserApi, saveBrowserRequest, inline = false }: { notebookId: string; conversationId: string; disabled?: boolean; onOpenCitation: (passage: Passage) => void; browserApi?: DesktopBrowserApi; saveBrowserRequest?: (request: DesktopSaveRequest) => Promise<{ ok: boolean; message: string }>; inline?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [state, setState] = React.useState<VoiceState>("idle");
  const [status, setStatus] = React.useState("Prêt à discuter de vos sources.");
  const [transcript, setTranscript] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [roxaneAnswer, setRoxaneAnswer] = React.useState("");
  const [sources, setSources] = React.useState<Passage[]>([]);
  const [turnHistory, setTurnHistory] = React.useState<VoiceTurn[]>([]);
  const userTurn = React.useRef("");
  const assistantTurn = React.useRef("");
  const turnSourceIds = React.useRef<Set<string>>(new Set());
  const turnPassages = React.useRef(new VoiceTurnCitationStore());
  const pendingSearches = React.useRef(new PendingVoiceSearches());
  const turnCompletePending = React.useRef(false);
  const turnFinalizing = React.useRef(false);
  const [muted, setMuted] = React.useState(false);
  const [roxaneEnabled, setRoxaneEnabled] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const roxaneEnabledRef = React.useRef(false);
  const socket = React.useRef<WebSocket | null>(null);
  const roxaneSocket = React.useRef<WebSocket | null>(null);
  const roxaneTurnText = React.useRef("");
  const roxaneTurnResolver = React.useRef<(() => void) | null>(null);
  const roxaneAskedForTurn = React.useRef(false);
  const completedTurnCount = React.useRef(0);
  const roxaneSpeaking = React.useRef(false);
  const audioContext = React.useRef<AudioContext | null>(null);
  const mediaStream = React.useRef<MediaStream | null>(null);
  const processor = React.useRef<AudioWorkletNode | null>(null);
  const micSource = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackNodes = React.useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlaybackTime = React.useRef(0);
  const mutedRef = React.useRef(false);
  const mounted = React.useRef(true);
  const intentionalClose = React.useRef(false);
  const browserMissionStarted = React.useRef(false);
  const browserMissionId = React.useRef<number | null>(null);
  const browserToolCallIds = React.useRef(new Set<string>());
  const browserToolCallsThisTurn = React.useRef(0);

  const stop = React.useCallback(() => {
    rlog("stop() appelé", { nodes: playbackNodes.current.size, roxaneSpeaking: roxaneSpeaking.current, stack: new Error().stack?.split("\n").slice(2, 5).join(" | ") });
    intentionalClose.current = true;
    if (browserApi && browserMissionId.current !== null) {
      const mission = browserMissionId.current;
      void browserApi.agentAbort({ owner: "voice", mission }).catch(() => undefined);
      browserMissionId.current = null;
      browserMissionStarted.current = false;
    }
    socket.current?.close();
    socket.current = null;
    roxaneSocket.current?.close();
    roxaneSocket.current = null;
    roxaneTurnResolver.current?.();
    roxaneTurnResolver.current = null;
    roxaneSpeaking.current = false;
    processor.current?.disconnect();
    processor.current = null;
    micSource.current?.disconnect();
    micSource.current = null;
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaStream.current = null;
    playbackNodes.current.forEach((node) => { try { node.stop(); } catch {} });
    playbackNodes.current.clear();
    void audioContext.current?.close();
    audioContext.current = null;
    nextPlaybackTime.current = 0;
    mutedRef.current = false;
    if (mounted.current) { setMuted(false); setState("idle"); }
  }, [browserApi]);

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [stop]);

  async function playPcm(base64: string, mimeType: string) {
    const ctx = audioContext.current;
    if (!ctx) return;
    const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1] ?? 24000);
    const bytes = base64ToBytes(base64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const buffer = ctx.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + 0.02, nextPlaybackTime.current);
    nextPlaybackTime.current = startAt + buffer.duration;
    playbackNodes.current.add(node);
    node.onended = () => { playbackNodes.current.delete(node); if (roxaneSpeaking.current) rlog("chunk audio terminé", { restants: playbackNodes.current.size }); };
    node.start(startAt);
    if (roxaneSpeaking.current) rlog("chunk audio planifié", { dureeS: +buffer.duration.toFixed(2), debutDansS: +(startAt - ctx.currentTime).toFixed(2), rate });
  }

  /** Wait until every scheduled PCM chunk has actually finished playing. */
  async function waitForPlaybackToFinish() {
    const context = audioContext.current;
    if (!context) return;
    await waitForAudioPlaybackDrain(
      () => audioContext.current === context && playbackNodes.current.size > 0,
      () => new Promise<void>((resolve) => window.setTimeout(resolve, 40))
    );
  }

  async function handleToolCall(message: LiveMessage) {
    const calls = message?.toolCall?.functionCalls ?? [];
    for (const call of calls) {
      if (call.name.startsWith("browser_")) {
        if (browserToolCallIds.current.has(call.id)) {
          socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { error: "Appel dupliqué ignoré : aucune action supplémentaire n’a été exécutée." } }] } }));
          continue;
        }
        browserToolCallIds.current.add(call.id);
        if (browserToolCallsThisTurn.current >= 8) {
          socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { error: "Limite de 8 actions Browser par tour vocal atteinte. Demande à l’utilisateur de préciser la suite." } }] } }));
          continue;
        }
        browserToolCallsThisTurn.current += 1;
        try {
          if (!browserApi) throw new Error("Le navigateur intégré n'est pas disponible dans cette session.");
          if (!browserMissionStarted.current) {
            const started = await browserApi.agentStart({ text: userTurn.current.slice(0, 8000), reset: false, owner: "voice" });
            browserMissionId.current = started.mission;
            browserMissionStarted.current = true;
          }
          const mission = browserMissionId.current;
          if (mission === null) throw new Error("Mission Browser vocale invalide.");
          let outcome = await browserApi.agentCall({ name: call.name.slice("browser_".length), args: call.args ?? {}, owner: "voice", mission });
          if (outcome.status === "confirmation_required") {
            const approved = window.confirm(`Leanna souhaite effectuer cette action :\n\n${outcome.summary}\n\nMotif : ${outcome.reason}\n\nAutoriser cette action ?`);
            outcome = await browserApi.agentResolve({ actionId: outcome.actionId, approve: approved, owner: "voice", mission });
          }
          let browserResponse: Record<string, unknown>;
          if (outcome.status === "ok") {
            let result = outcome.result;
            if (outcome.save) {
              if (!saveBrowserRequest) throw new Error("L'enregistrement Notebook n'est pas disponible depuis ce navigateur.");
              const saved = await saveBrowserRequest(outcome.save);
              result = { ...result, saved: saved.ok, message: saved.message };
            }
            browserResponse = { status: outcome.save ? (result.saved === true ? "ok" : "error") : outcome.status, tool: outcome.tool, summary: outcome.summary, result };
          } else {
            browserResponse = outcome;
          }
          socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result: JSON.stringify(browserResponse) } }] } }));
          setStatus(browserResponse.status === "ok" ? "Action Browser vérifiée." : "Action Browser non exécutée.");
        } catch (error) {
          socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { error: error instanceof Error ? error.message : "Action Browser impossible." } }] } }));
        }
        continue;
      }
      if (call.name === "search_notebook_sources") {
        try {
          const response = await fetch(`/api/v1/notebooks/${notebookId}/voice-search`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: String(call.args?.query ?? "") })
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "Recherche documentaire impossible");
          const retrieved = (payload.passages ?? []) as Array<Omit<Passage, "number">>;
          const passages = turnPassages.current.add(retrieved);
          for (const sourceId of turnPassages.current.sourceIds()) turnSourceIds.current.add(sourceId);
          setSources(turnPassages.current.snapshot());
          const result = passages.length ? passages.map((p) => `[Source ${p.number}] ${p.title}${p.page ? `, page ${p.page}` : ""}\n${p.excerpt}`).join("\n\n") : "Aucun passage pertinent trouvé dans les sources sélectionnées.";
          socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result } }] } }));
        } catch {
          socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { error: "La recherche dans les sources a échoué. Indique à l'utilisateur que tu ne peux pas vérifier cette information." } }] } }));
        }
        continue;
      }

      if (call.name === "create_studio_artifact") {
        try {
          const response = await fetch(`/api/v1/notebooks/${notebookId}/voice-artifacts`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: String(call.args?.type ?? ""),
              prompt: String(call.args?.prompt ?? ""),
              ...(call.args?.template ? { template: String(call.args.template) } : {}),
              sourceIds: [...turnSourceIds.current]
            })
          });
          const payload = await response.json();
          if (!response.ok) {
            const message = payload.error === "no_sources"
              ? "Aucune source exploitable n'a été trouvée. Demande à l'utilisateur de sélectionner des documents prêts dans ce notebook."
              : payload.error === "ai_not_configured"
                ? "La génération Studio n'est pas configurée sur le serveur."
                : "La création du livrable Studio a échoué. Explique brièvement l'erreur et ne prétends pas que le document a été créé.";
            throw new Error(message);
          }
          const artifact = payload.artifact as { id: string; type: string; status: string };
          window.dispatchEvent(new Event("notebook:artifact-created"));
          setStatus("Génération lancée dans le Studio.");
          socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{
            id: call.id,
            name: call.name,
            response: { result: `Livrable ${artifact.type} créé dans la file du Studio (identifiant ${artifact.id}, statut ${artifact.status}). Confirme oralement en une phrase que la génération est lancée dans l'onglet Studio. Ne récite pas le document.` }
          }] } }));
        } catch (error) {
          socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{
            id: call.id,
            name: call.name,
            response: { error: error instanceof Error ? error.message : "Création Studio impossible." }
          }] } }));
        }
      }
    }
  }

  async function persistVoiceTurn() {
    const userText = userTurn.current.trim();
    const assistantText = assistantTurn.current.trim();
    const sourceIds = [...turnSourceIds.current];
    if (!userText || !assistantText) return;
    if (browserApi) { userTurn.current = ""; assistantTurn.current = ""; turnSourceIds.current.clear(); return; }
    const response = await fetch(`/api/v1/conversations/${conversationId}/voice-messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userText, assistantText, sourceIds })
    });
    if (!response.ok) throw new Error("Le tour vocal nÔÇÖa pas pu ├¬tre enregistr├® dans lÔÇÖhistorique.");
    userTurn.current = "";
    assistantTurn.current = "";
    turnSourceIds.current.clear();
  }

  async function connectRoxane() {
    if (roxaneSocket.current?.readyState === WebSocket.OPEN) return;
    const response = await fetch(`/api/v1/notebooks/${notebookId}/voice-token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice: "Kore", persona: "roxane" }) });
    const payload = await response.json();
    if (!response.ok) throw new Error("Impossible d'ouvrir la session vocale de Roxane.");
    const connection = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(payload.token)}`);
    connection.binaryType = "arraybuffer"; roxaneSocket.current = connection;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Délai de connexion dépassé pour Roxane.")), 15000);
        connection.onopen = () => connection.send(JSON.stringify({ setup: { model: `models/${payload.model}`, generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } }, systemInstruction: payload.config.systemInstruction, inputAudioTranscription: {}, outputAudioTranscription: {} } }));
        connection.onerror = () => { window.clearTimeout(timeout); reject(new Error("Connexion à Roxane impossible.")); };
        connection.onclose = () => { window.clearTimeout(timeout); if (roxaneSocket.current === connection) roxaneSocket.current = null; reject(new Error("La session de Roxane a été fermée avant son initialisation.")); };
        connection.onmessage = (event) => {
          const message = parseFrame(event.data);
          if (message?.error) { window.clearTimeout(timeout); reject(new Error(message.error.message ?? "Erreur de configuration de Roxane.")); }
          if (message?.setupComplete) {
            window.clearTimeout(timeout);
            rlog("setupComplete, session prête");
            connection.onerror = (e) => rlog("WebSocket erreur", { type: e.type });
            connection.onclose = (e) => {
              rlog("WebSocket FERMÉ", { code: e.code, reason: e.reason, wasClean: e.wasClean });
              if (roxaneSocket.current === connection) {
                roxaneSocket.current = null;
                if (roxaneEnabledRef.current) {
                  roxaneEnabledRef.current = false;
                  setRoxaneEnabled(false);
                  setStatus("La connexion de Roxane a été interrompue. Leanna reste disponible.");
                }
              }
            };
            connection.onmessage = async (nextEvent) => {
              try {
                const nextMessage = parseFrame(nextEvent.data);
                if (!nextMessage) { rlog("frame illisible", { type: typeof nextEvent.data }); return; }
                if (!nextMessage.serverContent) { rlog("frame hors serverContent", { keys: Object.keys(nextMessage), brut: JSON.stringify(nextMessage).slice(0, 300) }); return; }
                const data = nextMessage.serverContent, spoken = data.outputTranscription?.text;
                const audioParts = (data.modelTurn?.parts ?? []).filter((p) => p.inlineData?.data);
                rlog("frame", {
                  audioChunks: audioParts.length,
                  audioBase64Len: audioParts.reduce((n, p) => n + (p.inlineData?.data?.length ?? 0), 0),
                  text: spoken,
                  turnComplete: data.turnComplete,
                  interrupted: data.interrupted,
                  generationComplete: (data as { generationComplete?: boolean }).generationComplete,
                  nodes: playbackNodes.current.size,
                  ctxState: audioContext.current?.state
                });
                if (data.interrupted) rlog("INTERRUPTED reçu de la session Roxane");
                if (spoken) { roxaneTurnText.current += spoken; setRoxaneAnswer((current) => current + spoken); setStatus("Roxane intervient…"); }
                for (const part of data.modelTurn?.parts ?? []) {
                  if (!part.inlineData?.data) continue;
                  await playPcm(part.inlineData.data, part.inlineData.mimeType ?? "audio/pcm;rate=24000");
                  setState("speaking");
                  setStatus("Roxane vous répond…");
                }
                if (data.turnComplete) { rlog("turnComplete Roxane", { nodes: playbackNodes.current.size }); roxaneTurnResolver.current?.(); roxaneTurnResolver.current = null; }
              } catch (error) { rlog("erreur traitement frame", { error: String(error) }); }
            };
            resolve();
          }
        };
      });
    } catch (error) { if (roxaneSocket.current === connection) roxaneSocket.current = null; connection.close(); throw error; }
  }

  function disconnectRoxane() {
    roxaneEnabledRef.current = false; roxaneSpeaking.current = false;
    roxaneTurnResolver.current?.(); roxaneTurnResolver.current = null;
    roxaneSocket.current?.close(); roxaneSocket.current = null;
    roxaneTurnText.current = ""; setRoxaneAnswer("");
  }

  async function start() {
    if (state === "connecting" || state === "listening" || state === "speaking") { stop(); return; }
    intentionalClose.current = false;
    setState("connecting");
    setStatus("Connexion sécurisée à Gemini Live…");
    setTranscript("");
    setAnswer("");
    setRoxaneAnswer("");
    setSources([]);
    setTurnHistory([]);
    try {
      if (!conversationId && !browserApi) throw new Error("Conversation du notebook en cours de chargement.");
      browserMissionStarted.current = false;
      browserMissionId.current = null;
      browserToolCallIds.current.clear();
      browserToolCallsThisTurn.current = 0;
      userTurn.current = "";
      assistantTurn.current = "";
      turnSourceIds.current.clear();
      turnPassages.current.clear();
      turnCompletePending.current = false;
      turnFinalizing.current = false;
      roxaneAskedForTurn.current = false;
      completedTurnCount.current = 0;
      roxaneTurnText.current = "";
      const ctx = new AudioContext();
      audioContext.current = ctx;
      await ctx.resume();
      const tokenResponse = await fetch(`/api/v1/notebooks/${notebookId}/voice-token`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice: "Aoede", persona: "leanna", browser: Boolean(browserApi) })
      });
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenPayload.error === "voice_not_configured" ? "Ajoutez GEMINI_API_KEY côté serveur." : "Impossible d'ouvrir la session vocale de Leanna.");

      const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenPayload.token)}`);
      ws.binaryType = "arraybuffer";
      socket.current = ws;
      await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error("Connexion à la session vocale impossible.")); });
      if (roxaneEnabledRef.current) await connectRoxane();
      ws.send(JSON.stringify({ setup: {
        model: `models/${tokenPayload.model}`,
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } },
        systemInstruction: tokenPayload.config.systemInstruction,
        tools: tokenPayload.config.tools,
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }}));

      const waitForSetup = (connection: WebSocket, label: string) => new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`D├®lai de configuration d├®pass├® pour ${label}.`)), 15000);
        connection.onclose = (event) => {
          window.clearTimeout(timeout);
          reject(new Error(event.reason ? `${label} : ${event.reason}` : `La session ${label} a ├®t├® ferm├®e avant son initialisation.`));
        };
        connection.onmessage = (event) => {
          const data = parseFrame(event.data);
          if (!data) return;
          if (data.setupComplete) { window.clearTimeout(timeout); resolve(); }
          if (data.error) { window.clearTimeout(timeout); reject(new Error(data.error.message ?? `Erreur ${label}.`)); }
        };
      });
      await waitForSetup(ws, "Leanna");
      // Ouverture : Leanna consulte les sources puis résume le sujet en 3 lignes avant de répondre.
      ws.send(JSON.stringify({ realtimeInput: { text: "La session vocale vient de démarrer. Consulte d'abord les sources du notebook avec search_notebook_sources, puis résume en deux phrases courtes le sujet actuel dont nous allons discuter." } }));

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mediaStream.current = stream;
      await ctx.audioWorklet.addModule("/audio/pcm-capture.worklet.js");
      const source = ctx.createMediaStreamSource(stream);
      micSource.current = source;
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      processor.current = node;
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (mutedRef.current || roxaneSpeaking.current || ws.readyState !== WebSocket.OPEN) return;
        const pcm = floatToPcm16(downsampleTo16k(event.data, ctx.sampleRate));
        ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: bytesToBase64(pcm) } } }));
      };
      source.connect(node);
      node.connect(ctx.destination);
      setState("listening");
      playActivationChime(ctx);
      setStatus("Connecté · je vous écoute. Parlez naturellement.");
      ws.onclose = () => { if (mounted.current && !intentionalClose.current) { stop(); setStatus("Session vocale terminée. Relancez-la pour continuer."); } };
      ws.onerror = () => { if (mounted.current) setStatus("Connexion vocale instable… vérifiez votre réseau."); };
      const askRoxane = async (turnNumber: number) => {
        if (!roxaneEnabledRef.current || roxaneAskedForTurn.current || !assistantTurn.current.trim() || !shouldInviteRoxane(turnNumber)) return;
        roxaneAskedForTurn.current = true;
        const groundedSources = turnPassages.current.snapshot().map((passage) => `[Source ${passage.number}] ${passage.title}${passage.page ? `, page ${passage.page}` : ""}: ${passage.excerpt}`).join("\n");
        const prompt = [
          "Voici le tour qui vient d'avoir lieu. Interviens comme Roxane uniquement si tu peux apporter une valeur ajout├®e r├®elle et pr├®cise.",
          `Question de l'utilisateur : ${userTurn.current.trim()}`,
          `R├®ponse de Leanna : ${assistantTurn.current.trim()}`,
          `Extraits v├®rifi├®s consult├®s : ${groundedSources || "Aucun extrait transmis"}`,
          "Réponds maintenant à voix haute, en deux à quatre phrases complètes : relève un élément concret (hypothèse fragile, limite, contradiction, information manquante, conséquence pratique) ou pose une question utile pour approfondir.",
          "Ne répète pas Leanna, ne la félicite pas par réflexe et ne reformule pas sa réponse. Termine toujours ta dernière phrase.",
          "N'ajoute aucun fait absent des extraits."
        ].join("\n\n");
        const connection = roxaneSocket.current;
        if (!connection || connection.readyState !== WebSocket.OPEN) {
          setStatus("Roxane est indisponible ; la réponse de Leanna est conservée.");
          return;
        }
        roxaneTurnText.current = "";
        setRoxaneAnswer("");
        roxaneSpeaking.current = true;
        rlog("askRoxane: envoi du prompt", { turnNumber, nodesLeanna: playbackNodes.current.size });
        setStatus("Roxane analyse la réponse de Leanna…");
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(() => {
            rlog("TIMEOUT 18s en attente de turnComplete Roxane");
            roxaneTurnResolver.current = null;
            resolve();
          }, 18000);
          roxaneTurnResolver.current = () => { window.clearTimeout(timeout); resolve(); };
          // Gemini 3.x Live : le texte en cours de session passe par realtimeInput.text (clientContent ne déclenchait aucune réponse).
          connection.send(JSON.stringify({ realtimeInput: { text: prompt } }));
          rlog("prompt envoyé via realtimeInput.text", { longueur: prompt.length, socketState: connection.readyState });
        });
        // Gemini peut signaler turnComplete alors que les derniers buffers PCM sont encore en lecture.
        // Garder le micro principal bloqué évite que Leanna reprenne la main et coupe Roxane.
        rlog("attente fin de lecture", { nodes: playbackNodes.current.size });
        await waitForPlaybackToFinish();
        rlog("lecture terminée, micro rouvert", { texte: roxaneTurnText.current.slice(0, 80) });
        roxaneSpeaking.current = false;
        if (roxaneTurnText.current.trim()) assistantTurn.current += `\n\nRoxane : ${roxaneTurnText.current.trim()}`;
      };

      const finalizeVoiceTurn = async () => {
        if (turnFinalizing.current || pendingSearches.current.count > 0) return;
        turnFinalizing.current = true;
        try {
          const leannaAnswer = assistantTurn.current.trim();
          const completedTurnNumber = ++completedTurnCount.current;
          if (shouldInviteRoxane(completedTurnNumber)) {
            await askRoxane(completedTurnNumber);
          } else {
            setStatus(roxaneEnabledRef.current ? `Échange ${completedTurnNumber}/2 · Roxane reste en écoute.` : "Leanna a répondu · Roxane est désactivée.");
          }
          if (browserApi && browserMissionId.current !== null) {
            await browserApi.agentEnd({ owner: "voice", mission: browserMissionId.current }).catch(() => false);
            browserMissionId.current = null;
            browserMissionStarted.current = false;
          }
          const completedTurn = { user: userTurn.current.trim(), assistant: leannaAnswer, roxane: roxaneTurnText.current.trim(), sources: turnPassages.current.snapshot() };
          await persistVoiceTurn();
          if (completedTurn.user && completedTurn.assistant) setTurnHistory((history) => [...history, completedTurn]);
          setTranscript("");
          setAnswer("");
          setRoxaneAnswer("");
          roxaneAskedForTurn.current = false;
          roxaneTurnText.current = "";
          setSources([]);
          turnPassages.current.clear();
          turnSourceIds.current.clear();
          userTurn.current = "";
          assistantTurn.current = "";
          turnCompletePending.current = false;
          browserMissionStarted.current = false;
          browserToolCallIds.current.clear();
          browserToolCallsThisTurn.current = 0;
          setState("listening");
          setStatus("À vous de parler. Posez votre prochaine question.");
        } catch (error) {
          setState("listening");
          setStatus(error instanceof Error ? error.message : "Enregistrement de l’historique impossible. Votre échange reste visible.");
        } finally {
          turnFinalizing.current = false;
        }
      };

      ws.onmessage = async (event) => {
        try {
          const msg = parseFrame(event.data);
          if (!msg) return;
          if (msg.toolCall) {
            await pendingSearches.current.track(handleToolCall(msg));
            if (pendingSearches.current.count === 0 && turnCompletePending.current) await finalizeVoiceTurn();
            return;
          }
          const content = msg.serverContent;
          // Pendant l'intervention de Roxane, le micro est coupé : un `interrupted` tardif de Leanna
          // (écho de sa propre voix) ne doit pas stopper l'audio de Roxane, qui partage la file de lecture.
          if (content?.interrupted) rlog("INTERRUPTED reçu de la session Leanna", { roxaneSpeaking: roxaneSpeaking.current, ignoré: roxaneSpeaking.current, nodes: playbackNodes.current.size });
          if (content?.interrupted && !roxaneSpeaking.current) {
            playbackNodes.current.forEach((n) => { try { n.stop(); } catch {} });
            playbackNodes.current.clear();
            nextPlaybackTime.current = 0;
            setState("listening");
            setStatus("Interruption prise en compte · je vous écoute.");
          }
          const heard = content?.inputTranscription?.text;
          const spoken = content?.outputTranscription?.text;
          if (heard) { userTurn.current += heard; setTranscript((v) => v + heard); }
          if (spoken) {
            assistantTurn.current += spoken;
            setAnswer((v) => v + spoken);
            setState("speaking");
            setStatus("Leanna vous répond…");
          }
          for (const part of content?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              await playPcm(part.inlineData.data, part.inlineData.mimeType ?? "audio/pcm;rate=24000");
              setState("speaking");
              setStatus("Leanna vous répond…");
            }
          }
          if (content?.turnComplete) {
            turnCompletePending.current = true;
            await pendingSearches.current.waitForIdle();
            await finalizeVoiceTurn();
          }
        } catch { /* ignore malformed provider frames */ }
      };
    } catch (error) {
      stop();
      setState("error");
      setStatus(error instanceof Error ? error.message : "Erreur pendant le démarrage vocal. Vérifiez le micro et réessayez.");
    }
  }

  async function toggleRoxane() {
    const next = !roxaneEnabledRef.current;
    if (!next) {
      disconnectRoxane(); setRoxaneEnabled(false);
      setStatus("Roxane est désactivée. Leanna continue la conversation.");
      return;
    }
    roxaneEnabledRef.current = true; setRoxaneEnabled(true);
    if (socket.current?.readyState === WebSocket.OPEN) {
      try { await connectRoxane(); setStatus("Roxane a rejoint la conversation."); }
      catch (error) { roxaneEnabledRef.current = false; setRoxaneEnabled(false); setStatus(error instanceof Error ? error.message : "Impossible d'activer Roxane."); }
    } else setStatus("Roxane sera présente au démarrage de la prochaine session.");
  }

  async function copyConversation() {
    const content = turnHistory.map((turn) => [
      `Vous : ${turn.user}`,
      `Leanna : ${turn.assistant}`,
      turn.roxane ? `Roxane : ${turn.roxane}` : ""
    ].filter(Boolean).join("\n")).join("\n\n");
    if (!content.trim()) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function toggleMute() {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    setStatus(mutedRef.current ? "Microphone coupé · Leanna ne vous entend plus." : "Microphone actif · je vous écoute.");
  }

  if (inline) {
    const idle = state === "idle" || state === "error";
    const active = state === "speaking" || state === "listening";
    const empty = turnHistory.length === 0 && !transcript && !answer && !roxaneAnswer;
    const badge = state === "idle" ? "En veille" : state === "connecting" ? "Connexion" : state === "error" ? "Erreur" : state === "speaking" ? "Leanna parle" : "À l’écoute";
    const sourceList = (list: Passage[]) => list.map((source) => (
      <Citation key={`${source.sourceId}:${source.charStart}:${source.charEnd}`} n={source.number} source={source.title} quote={source.excerpt} onOpen={() => onOpenCitation(source)} />
    ));
    return (
      <section aria-label="Studio vocal" data-voice-panel className="flex min-h-0 flex-1 flex-col bg-surface">
        <header className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><AudioLines className="size-4" aria-hidden /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Studio vocal</p>
              <p className="truncate text-xs text-text-muted" aria-live="polite">{idle ? "Prêt · Vos sources sont disponibles" : status}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${state === "error" ? "bg-danger/10 text-danger" : idle ? "bg-surface-secondary text-text-muted" : "bg-emerald-500/10 text-emerald-600"}`}>{badge}</span>
          </div>
        </header>

        <div className="shrink-0 border-b border-border px-3 py-4">
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`grid size-12 place-items-center rounded-2xl border text-base font-semibold transition-all ${state === "speaking" ? "border-accent/50 bg-accent/10 text-accent" : "border-border bg-surface-raised text-text"}`}>L</div>
              <p className="text-xs font-semibold">Leanna</p>
            </div>
            <div className="flex h-8 flex-1 items-center justify-center gap-0.5 text-accent" aria-hidden="true">
              {Array.from({ length: 13 }, (_, i) => <span key={i} className={`w-1 rounded-full bg-current transition-all ${active ? "animate-pulse opacity-90" : "opacity-20"}`} style={{ height: `${5 + ((i * 13) % 19)}px`, animationDelay: `${i * 55}ms` }} />)}
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className={`grid size-12 place-items-center rounded-2xl border text-base font-semibold transition-all ${roxaneEnabled ? "border-violet-500/30 bg-violet-500/5 text-violet-500" : "border-dashed border-border bg-surface-raised text-text-subtle"}`}>R</div>
              <p className="text-xs font-semibold">Roxane</p>
            </div>
          </div>
          <p className="mt-3 text-center text-sm font-medium">{state === "idle" ? "Prêt pour votre prochaine question" : state === "connecting" ? "Préparation de votre espace vocal…" : state === "error" ? "La connexion a rencontré un problème" : state === "speaking" ? "Leanna vous répond" : "Je vous écoute"}</p>
          {state === "error" && <p className="mt-1 text-center text-xs leading-relaxed text-text-muted">{status}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {idle ? (
              <Button size="sm" onClick={() => void start()} disabled={disabled}><Mic aria-hidden /> Démarrer la conversation</Button>
            ) : (
              <>
                <Button size="sm" variant={muted ? "soft" : "secondary"} onClick={toggleMute}>{muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}{muted ? "Réactiver le micro" : "Couper le micro"}</Button>
                <Button size="sm" variant="secondary" onClick={stop}><PhoneOff aria-hidden /> Terminer</Button>
              </>
            )}
            <Button size="sm" variant={roxaneEnabled ? "secondary" : "ghost"} onClick={toggleRoxane} aria-pressed={roxaneEnabled} title={roxaneEnabled ? "Désactiver Roxane" : "Activer Roxane"}>
              <Sparkles aria-hidden /> {roxaneEnabled ? "Roxane activée" : "Ajouter Roxane"}
            </Button>
          </div>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
          <p className="text-xs font-semibold">Conversation <span className="font-normal text-text-muted">· {turnHistory.length} échange{turnHistory.length > 1 ? "s" : ""}</span></p>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="Copier la conversation" title="Copier" onClick={() => void copyConversation()} disabled={turnHistory.length === 0}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}</Button>
            <Button size="icon-sm" variant="ghost" aria-label="Effacer l'historique affiché" title="Effacer l'historique" onClick={() => setTurnHistory([])} disabled={turnHistory.length === 0}><Trash2 aria-hidden /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {turnHistory.map((turn, index) => (
            <div key={index} className="space-y-2">
              <Bubble tone="user" text={turn.user} />
              <Bubble tone="leanna" text={turn.assistant} />
              {turn.roxane && <Bubble tone="roxane" text={turn.roxane} />}
              {turn.sources.length > 0 && <details className="rounded-lg border px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-text-muted">{turn.sources.length} source{turn.sources.length > 1 ? "s" : ""}</summary><div className="mt-2 space-y-2">{sourceList(turn.sources)}</div></details>}
            </div>
          ))}
          {(transcript || answer || roxaneAnswer) && (
            <div className="space-y-2">
              {transcript && <Bubble tone="user" text={transcript} />}
              {answer && <Bubble tone="leanna" text={answer} />}
              {roxaneAnswer && <Bubble tone="roxane" text={roxaneAnswer} />}
            </div>
          )}
          {sources.length > 0 && <details className="rounded-lg border px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-text-muted">{sources.length} source{sources.length > 1 ? "s" : ""} consultée{sources.length > 1 ? "s" : ""}</summary><div className="mt-2 space-y-2">{sourceList(sources)}</div></details>}
          {empty && (
            <div className="grid min-h-32 place-items-center text-center">
              <div>
                <p className="text-sm font-medium">Votre échange apparaîtra ici</p>
                <p className="mx-auto mt-1 max-w-56 text-xs leading-relaxed text-text-muted">La transcription, les réponses et les sources seront regroupées dans cet espace.</p>
              </div>
            </div>
          )}
        </div>
        <footer className="shrink-0 border-t border-border px-3 py-2 text-[11px] leading-4 text-text-subtle">
          Roxane est désactivée par défaut : elle reste silencieuse pendant les deux premiers échanges. · Gemini Live
        </footer>
      </section>
    );
  }

  return (
    <>
      <Button size="sm" variant="soft" disabled={disabled} onClick={() => { setExpanded(false); setOpen(true); }}>
        <AudioLines aria-hidden /> {state === "idle" || state === "error" ? "Mode vocal" : "Studio vocal actif"}
      </Button>

      <Dialog modal={!browserApi || expanded} open={open} onOpenChange={(value) => { setOpen(value); if (!value) setExpanded(false); }}>
        <DialogContent
          showOverlay={!browserApi || expanded}
          title="Studio vocal"
          description="Une conversation naturelle avec vos sources."
          size="lg"
          className={browserApi
            ? `browser-voice-dialog ${expanded ? "browser-voice-dialog--expanded" : "browser-voice-dialog--minimized"} ${expanded
              ? "!left-4 !right-4 !top-4 !bottom-4 !h-auto !max-h-none !w-auto !max-w-none !translate-x-0 !translate-y-0 !rounded-3xl !gap-0 !overflow-hidden !p-0 [&>div:first-child]:!sr-only"
              : "!left-1/2 !right-auto !top-auto !bottom-6 !h-auto !max-h-[calc(100dvh-48px)] !w-[min(760px,calc(100vw-32px))] !max-w-none !-translate-x-1/2 !translate-y-0 !rounded-2xl !gap-0 !overflow-hidden !p-0 [&>div:first-child]:!sr-only"}`
            : `mobile-voice-dialog ${expanded ? "mobile-voice-dialog--expanded" : "mobile-voice-dialog--sheet"} ${expanded
              ? "!inset-0 !h-[100dvh] !max-h-none !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none !gap-0 !p-0 [&>div:first-child]:!sr-only"
              : "!inset-x-0 !bottom-0 !left-0 !top-auto !h-auto !max-h-none !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-t-2xl !rounded-b-none !gap-0 !p-0 [&>div:first-child]:!sr-only"}`}
        >
          {!expanded ? (
            <div className={browserApi
              ? "browser-voice-minimized flex min-h-[76px] items-center gap-3 border-t border-white/10 bg-surface-raised/95 py-3 pl-4 pr-14 sm:pl-5 sm:pr-16"
              : "mobile-voice-sheet-header flex min-h-[76px] items-center gap-3 border-t bg-surface-raised py-2.5 pl-3 pr-14 sm:pl-5 sm:pr-16"}>
              <div className={`relative grid size-10 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors ${state === "speaking" ? "border-accent/50 bg-accent/10 text-accent" : "border-border bg-surface text-text"}`}>
                L
                {state !== "idle" && state !== "error" && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-raised bg-emerald-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">Studio vocal</p>
                  <span className="hidden rounded-full border px-2 py-0.5 text-[10px] font-medium text-text-muted sm:inline-flex">{roxaneEnabled ? "Leanna + Roxane" : "Leanna"}</span>
                </div>
                <p className="truncate text-xs text-text-muted">{state === "idle" ? "Prêt · Vos sources sont disponibles" : status}</p>
              </div>
              {state === "speaking" || state === "listening" ? (
                <div className="hidden h-7 items-center gap-1 text-accent sm:flex" aria-label="Activité audio">
                  {Array.from({length: 9}, (_, i) => <span key={i} className={`w-1 rounded-full bg-current ${state === "speaking" ? "animate-pulse" : "opacity-50"}`} style={{height: `${7 + ((i * 11) % 17)}px`, animationDelay: `${i * 70}ms`}} />)}
                </div>
              ) : null}
              <div className="mobile-voice-controls flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant={roxaneEnabled ? "secondary" : "ghost"} onClick={toggleRoxane} aria-pressed={roxaneEnabled} title={roxaneEnabled ? "Désactiver Roxane" : "Activer Roxane"} className="mobile-voice-roxane-toggle">
                  <Sparkles aria-hidden /> <span className="hidden sm:inline">{roxaneEnabled ? "Roxane" : "Ajouter Roxane"}</span>
                </Button>
                {state === "idle" || state === "error" ? (
                  <Button size="sm" onClick={() => void start()} disabled={disabled}><Mic aria-hidden /> <span className="hidden sm:inline">Démarrer</span><span className="sm:hidden">Parler</span></Button>
                ) : (
                  <>
                    <Button size="icon" variant={muted ? "soft" : "ghost"} onClick={toggleMute} aria-label={muted ? "Réactiver le microphone" : "Couper le microphone"} title={muted ? "Réactiver le micro" : "Couper le micro"}>{muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}</Button>
                    <Button size="sm" variant="secondary" onClick={stop}><PhoneOff aria-hidden /><span className="hidden sm:inline">Terminer</span></Button>
                  </>
                )}
                <Button size="icon" variant="ghost" aria-label="Déployer le studio vocal" title="Déployer" onClick={() => setExpanded(true)}><Maximize2 aria-hidden /></Button>
              </div>
            </div>
          ) : (
            <div className={`${browserApi ? "browser-voice-expanded" : ""} flex h-full min-h-0 flex-col bg-surface`}>
              <header className={`${browserApi ? "browser-voice-expanded-header border-b border-border/70 bg-surface/80 backdrop-blur-xl" : "mobile-voice-expanded-header"} flex h-16 shrink-0 items-center justify-between gap-3 border-b pl-4 pr-14 sm:pl-7 sm:pr-16`}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent"><AudioLines className="size-4" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Studio vocal</p>
                    <p className="truncate text-xs text-text-muted">{status}</p>
                  </div>
                  <span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-medium sm:inline-flex ${state === "error" ? "bg-danger/10 text-danger" : state === "idle" ? "bg-surface-secondary text-text-muted" : "bg-emerald-500/10 text-emerald-600"}`}>
                    {state === "idle" ? "En veille" : state === "connecting" ? "Connexion" : state === "error" ? "Erreur" : state === "speaking" ? "Leanna parle" : "À l’écoute"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant={roxaneEnabled ? "secondary" : "ghost"} onClick={toggleRoxane} aria-pressed={roxaneEnabled}>
                    <Sparkles aria-hidden /> <span className="hidden sm:inline">{roxaneEnabled ? "Roxane activée" : "Activer Roxane"}</span><span className="sm:hidden">Roxane</span>
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Réduire le studio vocal" title="Réduire" onClick={() => setExpanded(false)}><Minimize2 aria-hidden /></Button>
                </div>
              </header>

              <main className={`grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] ${browserApi ? "browser-voice-expanded-layout" : ""}`}>
                <section className={`flex min-h-0 flex-col items-center justify-center gap-7 overflow-y-auto px-5 py-8 sm:px-10 ${browserApi ? "bg-[radial-gradient(ellipse_at_50%_0%,rgba(124,58,237,0.13),transparent_58%)]" : ""}`}>
                  <div className="mobile-voice-personas flex w-full max-w-xl items-center justify-center gap-5 sm:gap-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className={`grid size-16 place-items-center rounded-[22px] border text-xl font-semibold shadow-sm transition-all sm:size-20 ${state === "speaking" ? "border-accent/50 bg-accent/10 text-accent shadow-accent/10" : "border-border bg-surface-raised text-text"}`}>L</div>
                      <div className="text-center"><p className="text-sm font-semibold">Leanna</p><p className="text-[11px] text-text-muted">Assistante principale</p></div>
                    </div>
                    <div className="flex h-10 flex-1 items-center justify-center gap-1 text-accent" aria-hidden="true">
                      {Array.from({length: 17}, (_, i) => <span key={i} className={`w-1 rounded-full bg-current transition-all ${state === "speaking" || state === "listening" ? "animate-pulse opacity-90" : "opacity-20"}`} style={{height: `${6 + ((i * 13) % 25)}px`, animationDelay: `${i * 55}ms`}} />)}
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      <div className={`grid size-16 place-items-center rounded-[22px] border text-xl font-semibold transition-all sm:size-20 ${roxaneEnabled ? "border-violet-500/30 bg-violet-500/5 text-violet-500" : "border-dashed border-border bg-surface-raised text-text-subtle"}`}>R</div>
                      <div className="text-center"><p className="text-sm font-semibold">Roxane</p><p className="text-[11px] text-text-muted">{roxaneEnabled ? "Regard critique · Kore" : "Option désactivée"}</p></div>
                    </div>
                  </div>

                  <div className="mobile-voice-status max-w-md text-center">
                    <p className="text-base font-medium">{state === "idle" ? "Prêt pour votre prochaine question" : state === "connecting" ? "Préparation de votre espace vocal…" : state === "error" ? "La connexion a rencontré un problème" : state === "speaking" ? "Leanna vous répond" : "Je vous écoute"}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{state === "idle" ? "Posez une question à voix haute. Leanna recherche dans les sources de ce notebook et vous répond naturellement." : status}</p>
                  </div>

                  <div className="mobile-voice-session-actions flex flex-wrap items-center justify-center gap-2">
                    {state === "idle" || state === "error" ? (
                      <Button onClick={() => void start()} disabled={disabled} className="min-w-44"><Mic aria-hidden /> Démarrer la conversation</Button>
                    ) : (
                      <>
                        <Button variant={muted ? "soft" : "secondary"} onClick={toggleMute}>{muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}{muted ? "Réactiver le micro" : "Couper le micro"}</Button>
                        <Button variant="secondary" onClick={stop}><PhoneOff aria-hidden /> Terminer la session</Button>
                      </>
                    )}
                  </div>
                  <p className="max-w-lg text-center text-[11px] leading-relaxed text-text-subtle">Roxane est désactivée par défaut. Lorsqu’elle est activée, elle reste silencieuse pendant les deux premiers échanges et intervient uniquement si elle apporte un éclairage réellement utile.</p>
                </section>

                <aside className="mobile-voice-history flex min-h-0 flex-col border-t bg-surface-raised/60 lg:border-l lg:border-t-0">
                  <div className="mobile-voice-history-toolbar flex h-14 shrink-0 items-center justify-between border-b px-4">
                    <div><p className="text-sm font-semibold">Conversation</p><p className="text-[11px] text-text-muted">{turnHistory.length} échange{turnHistory.length > 1 ? "s" : ""} archivé{turnHistory.length > 1 ? "s" : ""}</p></div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" aria-label="Copier la conversation" title="Copier" onClick={() => void copyConversation()} disabled={turnHistory.length === 0}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}</Button>
                      <Button size="icon" variant="ghost" aria-label="Effacer l'historique affiché" title="Effacer l'historique" onClick={() => setTurnHistory([])} disabled={turnHistory.length === 0}><Trash2 aria-hidden /></Button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    {turnHistory.map((turn, index) => (
                      <div key={index} className="space-y-2">
                        <div className="ml-auto max-w-[94%] rounded-2xl rounded-br-md bg-surface-secondary px-3.5 py-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">Vous</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.user}</p></div>
                        <div className="max-w-[96%] rounded-2xl rounded-bl-md border bg-surface-raised px-3.5 py-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">Leanna</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.assistant}</p></div>
                        {turn.roxane && <div className="max-w-[96%] rounded-2xl rounded-bl-md border border-violet-500/20 bg-violet-500/[0.04] px-3.5 py-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">Roxane</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.roxane}</p></div>}
                        {turn.sources.length > 0 && <details className="rounded-lg border px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-text-muted">{turn.sources.length} source{turn.sources.length > 1 ? "s" : ""}</summary><div className="mt-2 space-y-2">{turn.sources.map((source) => <Citation key={`${source.sourceId}:${source.charStart}:${source.charEnd}`} n={source.number} source={source.title} quote={source.excerpt} onOpen={() => onOpenCitation(source)} />)}</div></details>}
                      </div>
                    ))}
                    {(transcript || answer || roxaneAnswer) && <div className="space-y-2">
                      {transcript && <div className="ml-auto max-w-[94%] rounded-2xl rounded-br-md bg-surface-secondary px-3.5 py-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">Vous</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{transcript}</p></div>}
                      {answer && <div className="max-w-[96%] rounded-2xl rounded-bl-md border bg-surface-raised px-3.5 py-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">Leanna</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p></div>}
                      {roxaneAnswer && <div className="max-w-[96%] rounded-2xl rounded-bl-md border border-violet-500/20 bg-violet-500/[0.04] px-3.5 py-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">Roxane</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{roxaneAnswer}</p></div>}
                    </div>}
                    {sources.length > 0 && <details className="rounded-lg border px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-text-muted">{sources.length} source{sources.length > 1 ? "s" : ""} consultée{sources.length > 1 ? "s" : ""}</summary><div className="mt-2 space-y-2">{sources.map((source) => <Citation key={`${source.sourceId}:${source.charStart}:${source.charEnd}`} n={source.number} source={source.title} quote={source.excerpt} onOpen={() => onOpenCitation(source)} />)}</div></details>}
                    {turnHistory.length === 0 && !transcript && !answer && !roxaneAnswer && <div className="grid h-full min-h-40 place-items-center text-center"><div><div className="mx-auto grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><AudioLines className="size-4" /></div><p className="mt-3 text-sm font-medium">Votre échange apparaîtra ici</p><p className="mt-1 max-w-56 text-xs leading-relaxed text-text-muted">La transcription, les réponses et les sources seront regroupées dans cet espace.</p></div></div>}
                  </div>
                </aside>
              </main>
              <footer className="mobile-voice-footer flex h-12 shrink-0 items-center justify-between border-t px-4 text-[11px] text-text-subtle sm:px-7">
                <span>Les réponses de Leanna s’appuient sur les sources sélectionnées.</span>
                <span className="hidden sm:inline">Gemini Live · Audio temps réel</span>
              </footer>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
