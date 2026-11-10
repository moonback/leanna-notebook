import { describe, expect, it, vi } from "vitest";
import { transcriberFromEnv } from "./transcription.ts";

describe("Deepgram transcription adapter", () => {
  it("requests utterances and converts provider seconds to millisecond segments", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      results: { utterances: [
        { start: 0.42, end: 1.8, transcript: "Bonjour." },
        { start: 2, end: 3.25, transcript: "Bienvenue." },
      ] },
    }), { status: 200 }));
    const adapter = transcriberFromEnv({ DEEPGRAM_API_KEY: "test-key" }, request as typeof fetch)!;
    const result = await adapter.transcribe(new Uint8Array([1, 2, 3]), "audio/mpeg");
    expect(adapter.model).toBe("deepgram:nova-3");
    expect(result).toEqual({
      text: "Bonjour.\n\nBienvenue.",
      segments: [
        { text: "Bonjour.", start_ms: 420, end_ms: 1800 },
        { text: "Bienvenue.", start_ms: 2000, end_ms: 3250 },
      ],
    });
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toContain("utterances=true");
    expect(String(url)).toContain("language=multi");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Token test-key", "Content-Type": "audio/mpeg" });
  });

  it("returns null when no API key is configured", () => {
    expect(transcriberFromEnv({})).toBeNull();
  });

  it("classifies invalid credentials or unsupported requests as permanent configuration errors", async () => {
    const request = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const adapter = transcriberFromEnv({ DEEPGRAM_API_KEY: "bad" }, request as typeof fetch)!;
    await expect(adapter.transcribe(new Uint8Array([1]), "audio/wav")).rejects.toMatchObject({ code: "transcription_config" });
  });

  it("rejects an empty speech result", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ results: { utterances: [] } }), { status: 200 }));
    const adapter = transcriberFromEnv({ DEEPGRAM_API_KEY: "test" }, request as typeof fetch)!;
    await expect(adapter.transcribe(new Uint8Array([1]), "audio/wav")).rejects.toMatchObject({ code: "no_speech" });
  });
});
