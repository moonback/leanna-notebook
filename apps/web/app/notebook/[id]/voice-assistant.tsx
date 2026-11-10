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
    return (
    <>
      <Button size="sm" variant="soft" disabled={disabled} onClick={() => { setExpanded(false); setOpen(true); }}>
        <AudioLines aria-hidden /> {state === "idle" || state === "error" ? "Mode vocal" : "Studio vocal actif"}
      </Button>

      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setExpanded(false); }}>
        <DialogContent
          title="Studio vocal"
          description="Une conversation naturelle avec vos sources."
          size="lg"
          className={expanded
            ? "!inset-0 !h-[100dvh] !max-h-none !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none !gap-0 !p-0 [&>div:first-child]:!sr-only"
            : "!inset-x-0 !bottom-0 !left-0 !top-auto !h-auto !max-h-none !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-t-2xl !rounded-b-none !gap-0 !p-0 [&>div:first-child]:!sr-only"}
        >
          {!expanded ? (
            <div className="flex min-h-[76px] items-center gap-3 border-t bg-surface-raised px-3 py-2.5 sm:px-5">
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
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant={roxaneEnabled ? "secondary" : "ghost"} onClick={toggleRoxane} disabled={state !== "idle" && state !== "error"} aria-pressed={roxaneEnabled} title={roxaneEnabled ? "Désactiver Roxane" : "Activer Roxane"} className="hidden sm:inline-flex">
                  <Sparkles aria-hidden /> {roxaneEnabled ? "Roxane" : "Ajouter Roxane"}
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
            <div className="flex h-full min-h-0 flex-col bg-surface">
              <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-7">
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
                  <Button size="sm" variant={roxaneEnabled ? "secondary" : "ghost"} onClick={toggleRoxane} disabled={state !== "idle" && state !== "error"} aria-pressed={roxaneEnabled}>
                    <Sparkles aria-hidden /> <span className="hidden sm:inline">{roxaneEnabled ? "Roxane activée" : "Activer Roxane"}</span><span className="sm:hidden">Roxane</span>
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Réduire le studio vocal" title="Réduire" onClick={() => setExpanded(false)}><Minimize2 aria-hidden /></Button>
                  <Button size="icon" variant="ghost" aria-label="Masquer le studio vocal" title="Masquer" onClick={() => { setOpen(false); setExpanded(false); }}><span aria-hidden>×</span></Button>
                </div>
              </header>

              <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
                <section className="flex min-h-0 flex-col items-center justify-center gap-7 overflow-y-auto px-5 py-8 sm:px-10">
                  <div className="flex w-full max-w-xl items-center justify-center gap-5 sm:gap-10">
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

                  <div className="max-w-md text-center">
                    <p className="text-base font-medium">{state === "idle" ? "Prêt pour votre prochaine question" : state === "connecting" ? "Préparation de votre espace vocal…" : state === "error" ? "La connexion a rencontré un problème" : state === "speaking" ? "Leanna vous répond" : "Je vous écoute"}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{state === "idle" ? "Posez une question à voix haute. Leanna recherche dans les sources de ce notebook et vous répond naturellement." : status}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2">
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

                <aside className="flex min-h-0 flex-col border-t bg-surface-raised/60 lg:border-l lg:border-t-0">
                  <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
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
              <footer className="flex h-12 shrink-0 items-center justify-between border-t px-4 text-[11px] text-text-subtle sm:px-7">
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
