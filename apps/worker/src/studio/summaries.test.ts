import { describe, expect, it } from "vitest";
import { buildGuideMessages, buildOverviewMessages, toGuide, toOverview } from "./summaries.ts";

describe("summary prompt composition", () => {
  it("keeps source summary rules in system and customization in a separate user message", () => {
    const messages = buildGuideMessages("fr", 'Guide "principal"', "Le document décrit le protocole.", "Adopte un ton accessible.");
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("UNIQUEMENT à partir du texte fourni");
    expect(messages[0].content).toContain("schéma JSON");
    expect(messages[0].content).not.toContain("Adopte un ton accessible.");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("<user_customization>");
    expect(messages[1].content).toContain("Adopte un ton accessible.");
    expect(messages[2].content).toContain("<source titre=\"Guide 'principal'\">");
    expect(messages[2].content).toContain("Le document décrit le protocole.");
  });

  it("keeps notebook overview customization separate from source passages", () => {
    const messages = buildOverviewMessages("en", "<passage n=\"1\">Evidence</passage>", "Use concise wording.");
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("English");
    expect(messages[0].content).toContain("3 questions");
    expect(messages[0].content).not.toContain("Use concise wording.");
    expect(messages[1].content).toContain("<user_customization>");
    expect(messages[1].content).toContain("Use concise wording.");
    expect(messages[2].content).toContain("<passages>");
    expect(messages[2].content).toContain("Evidence");
  });

  it("omits empty customization messages", () => {
    expect(buildGuideMessages("fr", "Guide", "Texte", "  ")).toHaveLength(2);
    expect(buildOverviewMessages("fr", "Passages", null)).toHaveLength(2);
  });
});

describe("summary output validation", () => {
  it("validates source summary JSON", () => {
    expect(toGuide('{"summary":"Résumé fidèle.","topics":["Concept clé"]}')).toEqual({
      summary: "Résumé fidèle.",
      topics: ["Concept clé"],
    });
  });

  it("limits notebook overview to three suggested questions", () => {
    const result = toOverview(JSON.stringify({
      overview: "Vue d'ensemble fidèle.",
      questions: ["Q1", "Q2", "Q3", "Q4"],
    }));
    expect(result.questions).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("rejects invalid summary shapes", () => {
    expect(() => toGuide('{"summary":"","topics":[]}')).toThrow("invalid_model_output");
    expect(() => toOverview('{"overview":"ok","questions":[7]}')).toThrow("invalid_model_output");
  });
});
