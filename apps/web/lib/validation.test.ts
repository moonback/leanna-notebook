import { describe, expect, it } from "vitest";
import { credentialsSchema, fieldErrors, profilePatchSchema, safeNext } from "./validation";

describe("credentialsSchema", () => {
  it("normalise l'email", () => {
    expect(credentialsSchema.parse({ email: "  A@Exemple.FR ", password: "0123456789" }).email).toBe("a@exemple.fr");
  });
  it("refuse un email invalide et un mot de passe court", () => {
    const r = credentialsSchema.safeParse({ email: "nope", password: "court" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ email: "Adresse email invalide.", password: "10 caractères minimum." });
  });
});

describe("profilePatchSchema", () => {
  it("accepte une modification partielle valide", () => {
    expect(profilePatchSchema.parse({ theme: "dark" })).toEqual({ theme: "dark" });
  });
  it("refuse les colonnes hors liste blanche", () => {
    expect(profilePatchSchema.safeParse({ adult_verified_at: "2026-01-01" }).success).toBe(false);
  });
  it("accepte un prompt vocal personnalisé et la restauration par null", () => {
    expect(profilePatchSchema.parse({ voice_system_prompt: "Tu es Leanna." })).toEqual({ voice_system_prompt: "Tu es Leanna." });
    expect(profilePatchSchema.parse({ voice_system_prompt: null })).toEqual({ voice_system_prompt: null });
  });
  it("limite la taille du prompt vocal et refuse une chaîne vide", () => {
    expect(profilePatchSchema.safeParse({ voice_system_prompt: " " }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ voice_system_prompt: "x".repeat(20_001) }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ voice_system_prompt: "x".repeat(20_000) }).success).toBe(true);
  });
  it("refuse un corps vide et une langue inconnue", () => {
    expect(profilePatchSchema.safeParse({}).success).toBe(false);
    expect(profilePatchSchema.safeParse({ output_language: "xx" }).success).toBe(false);
  });
});

describe("safeNext", () => {
  it("bloque les redirections externes", () => {
    expect(safeNext("/notebook/1")).toBe("/notebook/1");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
