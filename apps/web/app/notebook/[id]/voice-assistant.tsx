"use client";

import * as React from "react";
import { AudioLines, Mic, MicOff, PhoneOff, Maximize2, Minimize2, Sparkles, Copy, Trash2, Check, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Citation } from "@/components/ui/citation";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { PendingVoiceSearches, shouldInviteRoxane, VoiceTurnCitationStore, type NumberedVoicePassage } from "./voice-turn";

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

export function VoiceAssistant({ notebookId, conversationId, disabled = false, onOpenCitation }: { notebookId: string; conversationId: string; disabled?: boolean; onOpenCitation: (passage: Passage) => void }) {
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
  const [muted, setMuted] = React.useState(false);\n  const [roxaneEnabled, setRoxaneEnabled] = React.useState(false);\n  const [copied, setCopied] = React.useState(false);\n  const roxaneEnabledRef = React.useRef(false);
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

  const stop = React.useCallback(() => {
    intentionalClose.current = true;
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
  }, []);

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
    node.onended = () => playbackNodes.current.delete(node);
    node.start(startAt);
  }

  async function handleToolCall(message: LiveMessage) {
    const calls = message?.toolCall?.functionCalls ?? [];
    for (const call of calls) {
      if (call.name !== "search_notebook_sources") continue;
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
    }
  }

  async function persistVoiceTurn() {
    const userText = userTurn.current.trim();
    const assistantText = assistantTurn.current.trim();
    const sourceIds = [...turnSourceIds.current];
    if (!userText || !assistantText) return;
    const response = await fetch(`/api/v1/conversations/${conversationId}/voice-messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userText, assistantText, sourceIds })
    });
    if (!response.ok) throw new Error("Le tour vocal n’a pas pu être enregistré dans l’historique.");
    userTurn.current = "";
    assistantTurn.current = "";
    turnSourceIds.current.clear();
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
      if (!conversationId) throw new Error("Conversation du notebook en cours de chargement.");
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
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice: "Aoede", persona: "leanna" })
      });
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenPayload.error === "voice_not_configured" ? "Ajoutez GEMINI_API_KEY côté serveur." : "Impossible d'ouvrir la session vocale de Leanna.");

      const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenPayload.token)}`);
      ws.binaryType = "arraybuffer";
      socket.current = ws;
      let roxaneWs: WebSocket | null = null;
      if (roxaneEnabledRef.current) {
        const roxaneTokenResponse = await fetch(`/api/v1/notebooks/${notebookId}/voice-token`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice: "Kore", persona: "roxane" })
        });
        const roxaneTokenPayload = await roxaneTokenResponse.json();
        if (!roxaneTokenResponse.ok) throw new Error("Impossible d'ouvrir la session vocale de Roxane.");
        roxaneWs = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(roxaneTokenPayload.token)}`);
        roxaneWs.binaryType = "arraybuffer";
        roxaneSocket.current = roxaneWs;
      }
      await Promise.all([ws, ...(roxaneWs ? [roxaneWs] : [])].map((connection) => new Promise<void>((resolve, reject) => {
        connection.onopen = () => resolve();
        connection.onerror = () => reject(new Error("Connexion à l'une des sessions vocales impossible."));
      })));
      ws.send(JSON.stringify({ setup: {
        model: `models/${tokenPayload.model}`,
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } },
        systemInstruction: tokenPayload.config.systemInstruction,
        tools: tokenPayload.config.tools,
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }}));

      if (roxaneWs) {
        const roxaneTokenResponse = await fetch(`/api/v1/notebooks/${notebookId}/voice-token`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice: "Kore", persona: "roxane" })
        });
        const roxaneTokenPayload = await roxaneTokenResponse.json();
        if (!roxaneTokenResponse.ok) throw new Error("Impossible de configurer la voix de Roxane.");
        roxaneWs.send(JSON.stringify({ setup: {
          model: `models/${roxaneTokenPayload.model}`,
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
          systemInstruction: roxaneTokenPayload.config.systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }}));
      }

      const waitForSetup = (connection: WebSocket, label: string) => new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`Délai de configuration dépassé pour ${label}.`)), 15000);
        connection.onclose = (event) => {
          window.clearTimeout(timeout);
          reject(new Error(event.reason ? `${label} : ${event.reason}` : `La session ${label} a été fermée avant son initialisation.`));
        };
        connection.onmessage = (event) => {
          const data = parseFrame(event.data);
          if (!data) return;
          if (data.setupComplete) { window.clearTimeout(timeout); resolve(); }
          if (data.error) { window.clearTimeout(timeout); reject(new Error(data.error.message ?? `Erreur ${label}.`)); }
        };
      });
      await Promise.all([waitForSetup(ws, "Leanna"), ...(roxaneWs ? [waitForSetup(roxaneWs, "Roxane")] : [])]);

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
      setStatus("Je vous écoute. Parlez naturellement.");
      ws.onclose = () => { if (mounted.current && !intentionalClose.current) { stop(); setStatus("Session vocale terminée."); } };
      ws.onerror = () => { if (mounted.current) setStatus("Connexion vocale instable…"); };
      const askRoxane = async (turnNumber: number) => {
        if (!roxaneEnabledRef.current || roxaneAskedForTurn.current || !assistantTurn.current.trim() || !shouldInviteRoxane(turnNumber)) return;
        roxaneAskedForTurn.current = true;
        const groundedSources = turnPassages.current.snapshot().map((passage) => `[Source ${passage.number}] ${passage.title}${passage.page ? `, page ${passage.page}` : ""}: ${passage.excerpt}`).join("\n");
        const prompt = [
          "Voici le tour qui vient d'avoir lieu. Interviens comme Roxane uniquement si tu peux apporter une valeur ajoutée réelle et précise.",
          `Question de l'utilisateur : ${userTurn.current.trim()}`,
          `Réponse de Leanna : ${assistantTurn.current.trim()}`,
          `Extraits vérifiés consultés : ${groundedSources || "Aucun extrait transmis"}`,
          "Parle uniquement si tu identifies au moins un élément concret : contradiction, hypothèse fragile, limite importante, information manquante qui change la conclusion, conséquence pratique ou question réellement nécessaire.",
          "Ne répète pas Leanna, ne la félicite pas par réflexe, ne reformule pas sa réponse et ne pose jamais une question générique pour meubler.",
          "Si tu n'as rien de pertinent à ajouter, termine immédiatement le tour sans produire de texte ni audio. Le silence est la réponse attendue dans ce cas.",
          "Si tu interviens, limite-toi à une remarque concise et directement utile. N'ajoute aucun fait absent des extraits."
        ].join("\n\n");
        const connection = roxaneSocket.current;
        if (!connection || connection.readyState !== WebSocket.OPEN) {
          setStatus("Roxane est indisponible ; la réponse de Leanna est conservée.");
          return;
        }
        roxaneTurnText.current = "";
        setRoxaneAnswer("");
        roxaneSpeaking.current = true;
        setStatus("Roxane analyse la réponse de Leanna…");
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(() => {
            roxaneTurnResolver.current = null;
            resolve();
          }, 18000);
          roxaneTurnResolver.current = () => { window.clearTimeout(timeout); resolve(); };
          connection.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: prompt }] }], turnComplete: true } }));
        });
        roxaneSpeaking.current = false;
        if (roxaneTurnText.current.trim()) assistantTurn.current += `\n\nRoxane : ${roxaneTurnText.current.trim()}`;
      };

      if (roxaneWs) roxaneWs.onmessage = async (event) => {
        try {
          const message = parseFrame(event.data);
          if (!message?.serverContent) return;
          const content = message.serverContent;
          const spoken = content.outputTranscription?.text;
          if (spoken) {
            roxaneTurnText.current += spoken;
            setRoxaneAnswer((current) => current + spoken);
            setStatus("Roxane intervient…");
          }
          for (const part of content.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) await playPcm(part.inlineData.data, part.inlineData.mimeType ?? "audio/pcm;rate=24000");
          }
          if (content.turnComplete) {
            roxaneTurnResolver.current?.();
            roxaneTurnResolver.current = null;
          }
        } catch { /* ignore malformed Roxane frames */ }
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
            setStatus(roxaneEnabledRef.current ? `Échange ${completedTurnNumber}/2 · Roxane reste en écoute.` : "Leanna vous répond · Roxane est désactivée.");
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
          setState("listening");
          setStatus("À vous de parler.");
        } catch (error) {
          setState("listening");
          setStatus(error instanceof Error ? error.message : "Enregistrement de l’historique impossible.");
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
          if (content?.interrupted) {
            playbackNodes.current.forEach((n) => { try { n.stop(); } catch {} });
            playbackNodes.current.clear();
            nextPlaybackTime.current = 0;
            setState("listening");
            setStatus("Je vous écoute.");
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
      setStatus(error instanceof Error ? error.message : "Erreur pendant le démarrage vocal.");
    }
  }

  function toggleRoxane() {\n    if (state !== "idle" && state !== "error") return;\n    const next = !roxaneEnabledRef.current;\n    roxaneEnabledRef.current = next;\n    setRoxaneEnabled(next);\n    setStatus(next ? "Roxane sera présente à la prochaine session." : "Roxane est désactivée. Leanna reste disponible.");\n  }\n\n  async function copyConversation() {\n    const content = turnHistory.map((turn) => [`Vous : ${turn.user}`, `Leanna : ${turn.assistant}`, turn.roxane ? `Roxane : ${turn.roxane}` : ""].filter(Boolean).join("\\n")).join("\\n\\n");\n    if (!content.trim()) return;\n    await navigator.clipboard.writeText(content);\n    setCopied(true);\n    window.setTimeout(() => setCopied(false), 1800);\n  }\n\n  function toggleMute() {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    setStatus(mutedRef.current ? "Microphone coupé." : "Microphone actif.");
  }

  return (
    <>
      <Button size="sm" variant="soft" disabled={disabled} onClick={() => { setExpanded(false); setOpen(true); }}>
        <AudioLines aria-hidden /> Mode vocal
      </Button>
      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setExpanded(false); stop(); } }}>
        <DialogContent
          title="Studio vocal"
          description="Échangez avec Leanna et Roxane autour des sources de votre notebook."
          size="lg"
          className={expanded
            ? "!inset-x-0 !top-0 !left-0 !h-[100dvh] !max-h-none !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none !gap-0 !p-4 sm:!p-6 [&>div:first-child]:!sr-only"
            : "!inset-x-0 !bottom-0 !left-0 !top-auto !h-[92px] !max-h-none !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-t-2xl !rounded-b-none !gap-0 !p-3 sm:!px-5 [&>div:first-child]:!sr-only"}
        >
          {!expanded ? (
            <div className="flex min-w-0 items-center gap-3 pr-8">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-accent/10 text-accent"><AudioLines className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Leanna + Roxane</p>
                <p className="truncate text-xs text-text-muted">{state === "idle" || state === "error" ? "Studio vocal réduit · Prêt à démarrer" : status}</p>
              </div>
              {state === "idle" || state === "error" ? (
                <Button size="sm" onClick={() => void start()} disabled={disabled}><Mic aria-hidden /> Démarrer</Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={stop}><PhoneOff aria-hidden /> Terminer</Button>
              )}
              <Button size="icon" variant="ghost" aria-label="Déployer le studio vocal en plein écran" title="Déployer" onClick={() => setExpanded(true)}><Maximize2 aria-hidden /></Button>
            </div>
          ) : (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Studio vocal · Leanna + Roxane</p>
                <p className="truncate text-xs text-text-muted">{status}</p>
              </div>
              <Button size="icon" variant="ghost" aria-label="Réduire le studio vocal" title="Réduire" onClick={() => setExpanded(false)}><Minimize2 aria-hidden /></Button>
            </div>
            <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
            <section className="relative overflow-hidden rounded-2xl border bg-surface-raised p-4 sm:p-5">
              <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-accent/10 blur-3xl" />
              <div className="relative flex flex-col items-center gap-4 text-center">
                <div className="flex items-center gap-3 sm:gap-5">
                  <div className={`grid size-14 place-items-center rounded-2xl border text-lg font-semibold shadow-sm transition-colors sm:size-16 ${state === "speaking" ? "border-accent/50 bg-accent text-on-accent" : "border-border bg-surface text-text"}`}>
                    L
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`flex h-8 items-center gap-1 ${state === "speaking" ? "text-accent" : "text-text-subtle"}`} aria-hidden="true">
                      {Array.from({ length: 7 }, (_, index) => (
                        <span key={index} className={`w-1 rounded-full bg-current ${state === "speaking" ? "animate-pulse" : ""}`} style={{ height: `${8 + ((index * 7) % 17)}px`, animationDelay: `${index * 90}ms` }} />
                      ))}
                    </div>
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-subtle">Duo vocal</span>
                  </div>
                  <div className={`grid size-14 place-items-center rounded-2xl border text-lg font-semibold shadow-sm transition-colors sm:size-16 ${roxaneAnswer && state !== "speaking" ? "border-accent/50 bg-accent-soft text-on-accent-soft" : "border-border bg-surface text-text"}`}>
                    R
                  </div>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 text-left">
                  <div className="rounded-xl border bg-surface/80 p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-lg bg-accent/10 text-xs font-bold text-accent">L</span>
                      <span className="text-sm font-semibold">Leanna</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">Recherche dans vos sources et formule une réponse sourcée.</p>
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-text-subtle">Voix Aoede</p>
                  </div>
                  <div className="rounded-xl border bg-surface/80 p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-lg bg-violet-500/10 text-xs font-bold text-violet-500">R</span>
                      <span className="text-sm font-semibold">Roxane</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">Challenge l’analyse et ouvre de nouvelles pistes.</p>
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-text-subtle">Voix Kore</p>
                  </div>
                </div>

                <div className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors ${roxaneEnabled ? "border-violet-500/30 bg-violet-500/[0.06]" : "border-border bg-surface/70"}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${roxaneEnabled ? "bg-violet-500/15 text-violet-500" : "bg-surface-secondary text-text-subtle"}`}><Sparkles className="size-5" /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><p className="text-sm font-semibold">Roxane</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${roxaneEnabled ? "bg-violet-500/15 text-violet-500" : "bg-surface-secondary text-text-subtle"}`}>{roxaneEnabled ? "Activée" : "Désactivée"}</span></div>
                      <p className="text-xs leading-relaxed text-text-muted">{roxaneEnabled ? "Elle intervient après Leanna uniquement si elle a un apport pertinent." : "Mode Leanna seule. Activez Roxane pour ajouter son regard critique."}</p>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant={roxaneEnabled ? "secondary" : "soft"} onClick={toggleRoxane} disabled={state !== "idle" && state !== "error"} aria-pressed={roxaneEnabled} className="shrink-0">
                    <Radio aria-hidden /> {roxaneEnabled ? "Désactiver" : "Activer Roxane"}
                  </Button>
                </div>

                <div className="flex items-center gap-2 rounded-full border bg-surface/80 px-3 py-1.5" role="status" aria-live="polite">
                  <span className={`size-2 rounded-full ${state === "error" ? "bg-danger" : state === "idle" ? "bg-text-subtle" : "bg-emerald-500"} ${state === "listening" || state === "speaking" ? "animate-pulse" : ""}`} />
                  <span className="text-xs font-medium text-text-muted">{status}</span>
                </div>

                <div className="flex w-full flex-wrap items-center justify-center gap-2">
                  {state === "idle" || state === "error" ? (
                    <Button onClick={() => void start()} disabled={disabled} className="min-w-52">
                      <Mic aria-hidden /> Lancer le duo vocal
                    </Button>
                  ) : (
                    <>
                      <Button variant={muted ? "soft" : "secondary"} onClick={toggleMute}>
                        {muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}
                        {muted ? "Réactiver le micro" : "Couper le micro"}
                      </Button>
                      <Button variant="secondary" onClick={stop}>
                        <PhoneOff aria-hidden /> Terminer
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-text-subtle">Roxane est désactivée par défaut. Si vous l’activez, elle reste silencieuse pendant les deux premiers échanges et intervient ensuite uniquement si elle apporte un éclairage pertinent.</p>
              </div>
            </section>

            {(turnHistory.length > 0 || transcript || answer || roxaneAnswer) ? (
              <section className="grid min-h-0 gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Conversation</h3>
                    <p className="text-xs text-text-subtle">Votre échange et les interventions du duo</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border px-2.5 py-1 text-[10px] font-medium text-text-muted">
                      {turnHistory.length + (transcript || answer || roxaneAnswer ? 1 : 0)} échange{turnHistory.length + (transcript || answer || roxaneAnswer ? 1 : 0) > 1 ? "s" : ""}
                    </span>
                    <Button size="icon" variant="ghost" aria-label="Copier la conversation" title="Copier la conversation" onClick={() => void copyConversation()} disabled={turnHistory.length === 0}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}</Button>
                    <Button size="icon" variant="ghost" aria-label="Effacer l'historique affiché" title="Effacer l'historique affiché" onClick={() => setTurnHistory([])} disabled={turnHistory.length === 0}><Trash2 aria-hidden /></Button>
                  </div>
                </div>
                <div className="grid max-h-[34vh] gap-3 overflow-y-auto rounded-xl border bg-surface p-3 sm:p-4">
                  {turnHistory.map((turn, index) => (
                    <div key={index} className="grid gap-2">
                      <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-surface-secondary px-3.5 py-2.5">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">Vous</p>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.user}</p>
                      </div>
                      <div className="max-w-[95%] rounded-2xl rounded-bl-md border bg-surface-raised px-3.5 py-2.5">
                        <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent"><span className="grid size-5 place-items-center rounded-md bg-accent/10">L</span> Leanna</p>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.assistant}</p>
                      </div>
                      {turn.roxane && (
                        <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-violet-500/20 bg-violet-500/[0.04] px-3.5 py-2.5">
                          <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-500"><span className="grid size-5 place-items-center rounded-md bg-violet-500/10">R</span> Roxane</p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.roxane}</p>
                        </div>
                      )}
                      {turn.sources.length > 0 && (
                        <details className="ml-1 rounded-lg border bg-surface-raised px-3 py-2">
                          <summary className="cursor-pointer text-xs font-medium text-text-muted">{turn.sources.length} source{turn.sources.length > 1 ? "s" : ""} consultée{turn.sources.length > 1 ? "s" : ""}</summary>
                          <div className="mt-2 grid gap-2">
                            {turn.sources.map((source) => (
                              <div key={`${source.sourceId}:${source.charStart}:${source.charEnd}`} className="rounded-lg bg-surface p-2.5">
                                <Citation n={source.number} source={source.title} quote={source.excerpt} onOpen={() => onOpenCitation(source)} />
                                <p className="mt-1 text-xs text-text-muted">{source.title}{source.page ? ` · page ${source.page}` : ""}</p>
                                <button type="button" className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => onOpenCitation(source)}>Ouvrir le passage</button>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                  {(transcript || answer || roxaneAnswer) && (
                    <div className="grid gap-2">
                      {transcript && <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-surface-secondary px-3.5 py-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">Vous</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{transcript}</p></div>}
                      {answer && <div className="max-w-[95%] rounded-2xl rounded-bl-md border bg-surface-raised px-3.5 py-2.5"><p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent"><span className="grid size-5 place-items-center rounded-md bg-accent/10">L</span> Leanna</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p></div>}
                      {roxaneAnswer && <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-violet-500/20 bg-violet-500/[0.04] px-3.5 py-2.5"><p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-500"><span className="grid size-5 place-items-center rounded-md bg-violet-500/10">R</span> Roxane</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{roxaneAnswer}</p></div>}
                      {sources.length > 0 && <details className="rounded-lg border bg-surface-raised px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-text-muted">{sources.length} source{sources.length > 1 ? "s" : ""} consultée{sources.length > 1 ? "s" : ""}</summary><div className="mt-2 grid gap-2">{sources.map((source) => <div key={`${source.sourceId}:${source.charStart}:${source.charEnd}`} className="rounded-lg bg-surface p-2.5"><Citation n={source.number} source={source.title} quote={source.excerpt} onOpen={() => onOpenCitation(source)} /><p className="mt-1 text-xs text-text-muted">{source.title}{source.page ? ` · page ${source.page}` : ""}</p><button type="button" className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => onOpenCitation(source)}>Ouvrir le passage</button></div>)}</div></details>}
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <div className="rounded-xl border border-dashed px-4 py-5 text-center">
                <div className="mx-auto grid size-9 place-items-center rounded-xl bg-accent/10 text-accent"><AudioLines className="size-4" /></div>
                <p className="mt-2 text-sm font-medium">Votre espace de conversation</p>
                <p className="mt-1 text-xs text-text-muted">Leanna répond à partir des documents. Activez Roxane quand vous souhaitez son regard complémentaire ; elle n’intervient que lorsqu’elle a quelque chose de réellement utile à ajouter.</p>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-text-subtle">Leanna s’appuie sur les sources sélectionnées. Roxane reçoit la réponse et les extraits consultés pour apporter un regard critique. Les deux sessions utilisent des connexions Gemini Live distinctes.</p>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
