import { describe, expect, it, vi } from "vitest";
import { transcriberFromEnv } from "./transcription.ts";

describe("Groq transcription adapter", () => {
  it("requests Whisper verbose segments and converts seconds to milliseconds", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form.get("model")).toBe("whisper-large-v3-turbo");
      expect(form.get("response_format")).toBe("verbose_json");
      expect(form.get("timestamp_granularities[]")).toBe("segment");
      return new Response(JSON.stringify({ text: "Bonjour.\n\nBienvenue.", segments: [
        { start: 0.42, end: 1.8, text: "Bonjour." }, { start: 2, end: 3.25, text: "Bienvenue." },
      ] }), { status: 200 });
    });
    const adapter = transcriberFromEnv({ GROQ_API_KEY: "test-key" }, request as typeof fetch)!;
    expect(adapter.model).toBe("groq:whisper-large-v3-turbo");
    expect(await adapter.transcribe(new Uint8Array([1, 2, 3]), "audio/mpeg")).toEqual({
      text: "Bonjour.\n\nBienvenue.", segments: [
        { text: "Bonjour.", start_ms: 420, end_ms: 1800 }, { text: "Bienvenue.", start_ms: 2000, end_ms: 3250 },
      ],
    });
    expect(request).toHaveBeenCalledWith("https://api.groq.com/openai/v1/audio/transcriptions", expect.objectContaining({
      method: "POST", headers: { Authorization: "Bearer test-key" },
    }));
  });
  it("returns null without provider credentials", () => expect(transcriberFromEnv({})).toBeNull());
  it("prefers Groq when both keys are configured", () => expect(transcriberFromEnv({ GROQ_API_KEY: "g", DEEPGRAM_API_KEY: "d" })?.model).toBe("groq:whisper-large-v3-turbo"));
  it("keeps Deepgram as fallback", () => expect(transcriberFromEnv({ DEEPGRAM_API_KEY: "d" })?.model).toBe("deepgram:nova-3"));
  it("classifies invalid Groq credentials as permanent", async () => {
    const request = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const adapter = transcriberFromEnv({ GROQ_API_KEY: "bad" }, request as typeof fetch)!;
    await expect(adapter.transcribe(new Uint8Array([1]), "audio/mpeg")).rejects.toMatchObject({ code: "transcription_config" });
  });
  it("rejects audio above 25 MB before sending", async () => {
    const request = vi.fn();
    const adapter = transcriberFromEnv({ GROQ_API_KEY: "test" }, request as typeof fetch)!;
    await expect(adapter.transcribe(new Uint8Array(25 * 1024 * 1024 + 1), "audio/mpeg")).rejects.toMatchObject({ code: "transcription_file_too_large" });
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects an empty transcript", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ text: "", segments: [] }), { status: 200 }));
    const adapter = transcriberFromEnv({ GROQ_API_KEY: "test" }, request as typeof fetch)!;
    await expect(adapter.transcribe(new Uint8Array([1]), "audio/mpeg")).rejects.toMatchObject({ code: "no_speech" });
  });
});
