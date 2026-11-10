"use client";

import * as React from "react";
import { AudioLines, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";

type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "error";
type Passage = { number: number; title: string; page: number | null; excerpt: string };

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

export function VoiceAssistant({ notebookId, disabled = false }: { notebookId: string; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<VoiceState>("idle");
  const [status, setStatus] = React.useState("Prêt à discuter de vos sources.");
  const [transcript, setTranscript] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [sources, setSources] = React.useState<Passage[]>([]);
  const [muted, setMuted] = React.useState(false);
  const socket = React.useRef<WebSocket | null>(null);
  const audioContext = React.useRef<AudioContext | null>(null);
  const mediaStream = React.useRef<MediaStream | null>(null);
  const processor = React.useRef<ScriptProcessorNode | null>(null);
  const micSource = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackNodes = React.useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlaybackTime = React.useRef(0);
  const mutedRef = React.useRef(false);
  const mounted = React.useRef(true);

  const stop = React.useCallback(() => {
    socket.current?.close();
    socket.current = null;
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
    if (mounted.current) setState("idle");
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

  async function handleToolCall(message: any) {
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
        const passages = (payload.passages ?? []) as Passage[];
        setSources(passages);
        const result = passages.length ? passages.map((p) => `[Source ${p.number}] ${p.title}${p.page ? `, page ${p.page}` : ""}\n${p.excerpt}`).join("\n\n") : "Aucun passage pertinent trouvé dans les sources sélectionnées.";
        socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result } }] } }));
      } catch {
        socket.current?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { error: "La recherche dans les sources a échoué. Indique à l'utilisateur que tu ne peux pas vérifier cette information." } }] } }));
      }
    }
  }

  async function start() {
    if (state === "connecting" || state === "listening" || state === "speaking") { stop(); return; }
    setState("connecting");
    setStatus("Connexion sécurisée à Gemini Live…");
    setTranscript("");
    setAnswer("");
    setSources([]);
    try {
      const tokenResponse = await fetch(`/api/v1/notebooks/${notebookId}/voice-token`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice: "Aoede" })
      });
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenPayload.error === "voice_not_configured" ? "Ajoutez GEMINI_API_KEY côté serveur." : "Impossible d'ouvrir une session vocale.");

      const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenPayload.token)}`);
      socket.current = ws;
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("Connexion Gemini Live impossible."));
        ws.onclose = () => { if (mounted.current && state !== "idle") setStatus("Session vocale terminée."); };
      });
      ws.send(JSON.stringify({ setup: {
        model: `models/${tokenPayload.model}`,
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } },
        systemInstruction: tokenPayload.config.systemInstruction,
        tools: tokenPayload.config.tools,
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }}));

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Délai de configuration Gemini dépassé.")), 15000);
        const previous = ws.onmessage;
        ws.onmessage = (event) => {
          previous?.call(ws, event);
          try {
            const data = JSON.parse(typeof event.data === "string" ? event.data : "");
            if (data.setupComplete) { window.clearTimeout(timeout); resolve(); }
            if (data.error) { window.clearTimeout(timeout); reject(new Error(data.error.message ?? "Erreur Gemini Live.")); }
          } catch {}
        };
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mediaStream.current = stream;
      const ctx = new AudioContext();
      audioContext.current = ctx;
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      micSource.current = source;
      const node = ctx.createScriptProcessor(4096, 1, 1);
      processor.current = node;
      node.onaudioprocess = (event) => {
        if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
        const pcm = floatToPcm16(downsampleTo16k(event.inputBuffer.getChannelData(0), ctx.sampleRate));
        ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: bytesToBase64(pcm) } } }));
      };
      source.connect(node);
      node.connect(ctx.destination);
      setState("listening");
      setStatus("Je vous écoute. Parlez naturellement.");
      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : "");
          if (msg.toolCall) { await handleToolCall(msg); return; }
          const content = msg.serverContent;
          if (content?.interrupted) {
            playbackNodes.current.forEach((n) => { try { n.stop(); } catch {} });
            playbackNodes.current.clear();
            nextPlaybackTime.current = 0;
            setState("listening");
            setStatus("Je vous écoute.");
          }
          if (content?.inputTranscription?.text) setTranscript((v) => v + content.inputTranscription.text);
          if (content?.outputTranscription?.text) {
            setAnswer((v) => v + content.outputTranscription.text);
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
            setState("listening");
            setStatus("À vous de parler.");
          }
        } catch { /* ignore malformed provider frames */ }
      };
    } catch (error) {
      stop();
      setState("error");
      setStatus(error instanceof Error ? error.message : "Erreur pendant le démarrage vocal.");
    }
  }

  function toggleMute() {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    setStatus(mutedRef.current ? "Microphone coupé." : "Microphone actif.");
  }

  return (
    <>
      <Button size="sm" variant="soft" disabled={disabled} onClick={() => setOpen(true)}>
        <AudioLines aria-hidden /> Parler à mes sources
      </Button>
      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) stop(); }}>
        <DialogContent title="Conversation vocale" description="Discutez en direct avec Leanna à partir des sources sélectionnées." size="lg">
          <div className="grid gap-5">
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-surface-raised px-4 py-8 text-center">
              <div className={`grid size-20 place-items-center rounded-full ${state === "speaking" ? "bg-accent text-on-accent" : "bg-accent-soft text-on-accent-soft"}`}>
                {state === "speaking" ? <Volume2 className="size-9" /> : <AudioLines className="size-9" />}
              </div>
              <p className="text-sm font-medium" role="status">{status}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {state === "idle" || state === "error" ? (
                  <Button onClick={() => void start()} disabled={disabled}><Mic aria-hidden /> Démarrer la conversation</Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={toggleMute}><span className="sr-only">{muted ? "Activer" : "Couper"} le microphone</span>{muted ? <MicOff /> : <Mic />}{muted ? "Activer le micro" : "Couper le micro"}</Button>
                    <Button variant="danger" onClick={stop}><PhoneOff aria-hidden /> Terminer</Button>
                  </>
                )}
              </div>
            </div>
            {(transcript || answer) && <div className="grid gap-2 text-sm"><p className="font-medium">Conversation</p>{transcript && <p className="rounded-lg bg-surface-secondary p-3"><span className="text-xs text-text-muted">Vous</span><br />{transcript}</p>}{answer && <p className="rounded-lg bg-surface-secondary p-3"><span className="text-xs text-text-muted">Leanna</span><br />{answer}</p>}</div>}
            {sources.length > 0 && <div className="grid gap-2"><p className="text-sm font-medium">Sources consultées</p>{sources.map((s) => <div key={s.number} className="rounded-lg border p-3 text-sm"><p className="font-medium">{s.title}{s.page ? ` · page ${s.page}` : ""}</p><p className="mt-1 line-clamp-3 text-text-muted">{s.excerpt}</p></div>)}</div>}
            <p className="text-xs text-text-subtle">Les réponses vocales s'appuient sur une recherche dans les sources sélectionnées. Une connexion Internet et l'autorisation du microphone sont nécessaires.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
