import { describe, expect, it } from "vitest";
import { credentialsSchema, fieldErrors, profilePatchSchema, safeNext, uploadTypeOf } from "./validation";

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

describe("video upload types", () => {
  it.each([["clip.mp4", "mp4"], ["clip.m4v", "m4v"], ["clip.mov", "mov"], ["clip.mkv", "mkv"]])(
    "accepts %s as %s", (filename, expected) => expect(uploadTypeOf(filename)).toBe(expected));
  it("rejects unsupported video extensions", () => expect(uploadTypeOf("clip.avi")).toBeNull());
});
