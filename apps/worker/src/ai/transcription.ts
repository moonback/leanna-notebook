import { PermanentError } from "../worker.ts";

export type TranscriptSegment = { text: string; start_ms: number; end_ms: number };
export type Transcript = { text: string; segments: TranscriptSegment[] };
export type Transcriber = {
  model: string;
  transcribe: (audio: Uint8Array, mimeType: string) => Promise<Transcript>;
};

/**
 * Deepgram prerecorded transcription adapter.
 * Utterance offsets are kept in milliseconds so the ingestion pipeline can attach
 * timestamps to searchable chunks. Provider credentials never leave the worker.
 */
export function transcriberFromEnv(env = process.env, request: typeof fetch = fetch): Transcriber | null {
  const key = env.DEEPGRAM_API_KEY;
  if (!key) return null;
  const model = env.STT_MODEL || "nova-3";
  const language = env.STT_LANGUAGE || "multi";

  return {
    model: `deepgram:${model}`,
    async transcribe(audio, mimeType) {
      const params = new URLSearchParams({
        model,
        language,
        utterances: "true",
        smart_format: "true",
      });
      const response = await request(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": mimeType },
        body: audio as BodyInit,
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if ([400, 401, 403, 404].includes(response.status)) {
        throw new PermanentError("transcription_config", `deepgram_http_${response.status}`);
      }
      if (!response.ok) throw new Error(`deepgram_http_${response.status}`);

      const payload = await response.json() as {
        results?: {
          utterances?: Array<{ start?: number; end?: number; transcript?: string }>;
          channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
        };
      };
      const utterances = (payload.results?.utterances ?? [])
        .filter((u) => typeof u.transcript === "string" && u.transcript.trim())
        .map((u) => ({
          text: u.transcript!.trim(),
          start_ms: Math.max(0, Math.round((u.start ?? 0) * 1000)),
          end_ms: Math.max(0, Math.round((u.end ?? u.start ?? 0) * 1000)),
        }));
      const text = utterances.length
        ? utterances.map((u) => u.text).join("\n\n")
        : payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
      if (!text) throw new PermanentError("no_speech", "Aucune parole exploitable dans ce fichier audio.");
      return { text, segments: utterances };
    },
  };
}
