import { describe, expect, it } from "vitest";
import {
  AUDIO_OVERVIEW_MARKER,
  audioOverviewInstructions,
  buildAudioOverviewMessages,
  isAudioOverviewPrompt,
  parseAudioOverviewScript,
} from "./audio-overview.ts";

const validScript = {
  title: "Les idées essentielles",
  segments: Array.from({ length: 8 }, (_, i) => ({
    speaker: i % 2 === 0 ? "host" : "guest",
    text: `Réplique de démonstration numéro ${i + 1}, suffisamment longue pour représenter un passage oral complet.`,
  })),
};

describe("Audio Overview", () => {
  it("recognizes the internal marker and preserves the user's editorial instruction", () => {
    const prompt = `${AUDIO_OVERVIEW_MARKER}
Adopte un ton accessible.`;
    expect(isAudioOverviewPrompt(prompt)).toBe(true);
    expect(audioOverviewInstructions(prompt)).toBe("Adopte un ton accessible.");
    expect(isAudioOverviewPrompt("simple report")).toBe(false);
  });

  it("builds a two-speaker, source-grounded script prompt in the requested language", () => {
    const messages = buildAudioOverviewMessages("Extrait de source.", "fr", "Ton chaleureux.", { format: "critique", duration: "long", style: "professional" });
    expect(messages[0].content).toContain("exactement deux intervenants");
    expect(messages[0].content).toContain("Ton chaleureux.");
    expect(messages[0].content).toContain("Critique : examiner les arguments");
    expect(messages[0].content).toContain("1 700 à 2 100 mots");
    expect(messages[0].content).toContain("Ton professionnel et précis");
    expect(messages[0].content).toContain("français");
    expect(messages[1].content).toContain("Extrait de source.");
  });

  it("accepts a valid dialogue with two speaker identities", () => {
    expect(parseAudioOverviewScript(JSON.stringify(validScript)).segments).toHaveLength(8);
  });

  it("rejects a script that does not start with the host", () => {
    const invalid = { ...validScript, segments: validScript.segments.map((s, i) => ({ ...s, speaker: i === 0 ? "guest" : s.speaker })) };
    expect(() => parseAudioOverviewScript(JSON.stringify(invalid))).toThrow("audio_script_invalid");
  });

  it("rejects consecutive turns assigned to the same voice", () => {
    const invalid = { ...validScript, segments: validScript.segments.map((s, i) => ({ ...s, speaker: i < 2 ? "host" : s.speaker })) };
    expect(() => parseAudioOverviewScript(JSON.stringify(invalid))).toThrow("audio_script_invalid");
  });

  it("rejects malformed JSON", () => {
    expect(() => parseAudioOverviewScript("not json")).toThrow("audio_script_json_absent");
  });
});
