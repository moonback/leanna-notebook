import { PermanentError } from "../worker.ts";

export type TranscriptSegment = { text: string; start_ms: number; end_ms: number };
export type Transcript = { text: string; segments: TranscriptSegment[] };
export type Transcriber = { model: string; transcribe: (audio: Uint8Array, mimeType: string) => Promise<Transcript> };

const GROQ_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function groqTranscriber(key: string, env: NodeJS.ProcessEnv, request: typeof fetch): Transcriber {
  const model = env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
  return {
    model: `groq:${model}`,
    async transcribe(audio, mimeType) {
      if (audio.byteLength > GROQ_MAX_AUDIO_BYTES) throw new PermanentError("transcription_file_too_large", "Le fichier audio dépasse la limite Groq de 25 Mo.");
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(audio).buffer], { type: mimeType }), "notebook-audio.mp3");
      form.set("model", model);
      form.set("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      form.set("temperature", "0");
      if (env.GROQ_STT_LANGUAGE) form.set("language", env.GROQ_STT_LANGUAGE);
      const response = await request("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if ([400, 401, 403, 404, 413, 415, 422].includes(response.status)) {
        const detail = (await response.text()).slice(0, 240);
        throw new PermanentError(response.status === 413 ? "transcription_file_too_large" : "transcription_config", `groq_http_${response.status}: ${detail}`);
      }
      if (!response.ok) throw new Error(`groq_http_${response.status}`);
      const payload = await response.json() as { text?: string; segments?: Array<{ start?: number; end?: number; text?: string }> };
      const segments = (payload.segments ?? []).filter((s) => typeof s.text === "string" && s.text.trim()).map((s) => ({
        text: s.text!.trim(), start_ms: Math.max(0, Math.round((s.start ?? 0) * 1000)),
        end_ms: Math.max(0, Math.round((s.end ?? s.start ?? 0) * 1000)),
      }));
      const text = segments.length ? segments.map((s) => s.text).join("\n\n") : payload.text?.trim() ?? "";
      if (!text) throw new PermanentError("no_speech", "Aucune parole exploitable détectée dans cette vidéo ou cet audio.");
      return { text, segments };
    },
  };
}

/** Groq is preferred; Deepgram remains a backward-compatible fallback. */
export function transcriberFromEnv(env = process.env, request: typeof fetch = fetch): Transcriber | null {
  if (env.GROQ_API_KEY) return groqTranscriber(env.GROQ_API_KEY, env, request);
  const key = env.DEEPGRAM_API_KEY;
  if (!key) return null;
  const model = env.STT_MODEL || "nova-3";
  const language = env.STT_LANGUAGE || "multi";
  return {
    model: `deepgram:${model}`,
    async transcribe(audio, mimeType) {
      const params = new URLSearchParams({ model, language, utterances: "true", smart_format: "true" });
      const response = await request(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": mimeType },
        body: audio as BodyInit, signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if ([400, 401, 403, 404].includes(response.status)) throw new PermanentError("transcription_config", `deepgram_http_${response.status}`);
      if (!response.ok) throw new Error(`deepgram_http_${response.status}`);
      const payload = await response.json() as { results?: { utterances?: Array<{ start?: number; end?: number; transcript?: string }>; channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
      const utterances = (payload.results?.utterances ?? []).filter((u) => typeof u.transcript === "string" && u.transcript.trim()).map((u) => ({
        text: u.transcript!.trim(), start_ms: Math.max(0, Math.round((u.start ?? 0) * 1000)),
        end_ms: Math.max(0, Math.round((u.end ?? u.start ?? 0) * 1000)),
      }));
      const text = utterances.length ? utterances.map((u) => u.text).join("\n\n") : payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
      if (!text) throw new PermanentError("no_speech", "Aucune parole exploitable dans ce fichier audio.");
      return { text, segments: utterances };
    },
  };
}
