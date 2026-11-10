import { PermanentError } from "../worker.ts";

export type SpeechSynthesizer = (text: string, voiceId: string) => Promise<Uint8Array>;

/** ElevenLabs TTS : les identifiants de voix sont configurés séparément pour les deux intervenants. */
export function speechFromEnv(env = process.env): SpeechSynthesizer | null {
  const key = env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const model = env.AUDIO_OVERVIEW_TTS_MODEL || "eleven_multilingual_v2";
  return async (text, voiceId) => {
    if (!voiceId) throw new PermanentError("audio_voice_not_configured");
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.2, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (response.status === 401 || response.status === 403 || response.status === 404 || response.status === 422) {
      throw new PermanentError("audio_tts_config", `elevenlabs_http_${response.status}`);
    }
    if (!response.ok) throw new Error(`elevenlabs_http_${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 128) throw new Error("elevenlabs_empty_audio");
    return bytes;
  };
}
