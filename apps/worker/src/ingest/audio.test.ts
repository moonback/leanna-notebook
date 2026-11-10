import { describe, expect, it, vi } from "vitest";
import type { Transcriber } from "../ai/transcription.ts";
import { chunk } from "./chunker.ts";
import { extract } from "./extract.ts";

describe("audio extraction", () => {
  it("keeps transcript character offsets aligned with timestamp ranges", async () => {
    const transcriber: Transcriber = {
      model: "fake:timestamped",
      transcribe: vi.fn(async () => ({
        text: "Bonjour tout le monde.\n\nBienvenue dans ce cours.",
        segments: [
          { text: "  Bonjour   tout le monde. ", start_ms: 420, end_ms: 1800 },
          { text: "Bienvenue dans ce cours.", start_ms: 2000, end_ms: 3250 },
        ],
      })),
    };
    const extracted = await extract("audio", { file: new Uint8Array([1, 2]), mimeType: "audio/mpeg" }, transcriber);
    expect(extracted.text).toBe("Bonjour tout le monde.\n\nBienvenue dans ce cours.");
    expect(extracted.timeRanges).toEqual([
      { char_start: 0, char_end: 22, start_ms: 420, end_ms: 1800 },
      { char_start: 24, char_end: 49, start_ms: 2000, end_ms: 3250 },
    ]);
    const chunks = chunk(extracted.text, { timeRanges: extracted.timeRanges });
    expect(chunks[0]).toMatchObject({ time_start_ms: 420, time_end_ms: 1800 });
    expect(chunks.at(-1)).toMatchObject({ time_start_ms: 2000, time_end_ms: 3250 });
  });

  it("fails explicitly when transcription is not configured", async () => {
    await expect(extract("audio", { file: new Uint8Array([1]) }, null))
      .rejects.toMatchObject({ code: "transcription_not_configured" });
  });
});
