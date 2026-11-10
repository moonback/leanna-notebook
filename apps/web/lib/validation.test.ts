import { describe, expect, it } from "vitest";
import { credentialsSchema, fieldErrors, profilePatchSchema, safeNext, sourceItemSchema } from "./validation";

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

describe("GitHub source validation", () => {
  it("accepts a public repository URL and an explicit branch", () => {
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://github.com/acme/project", branch: "main" }).success).toBe(true);
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://github.com/acme/project", branch: "feature/new-parser" }).success).toBe(true);
  });

  it("rejects non-GitHub hosts, nested paths and invalid branch names", () => {
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://github.evil.test/acme/project", branch: "main" }).success).toBe(false);
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://github.com/acme/project/tree/main", branch: "main" }).success).toBe(false);
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://github.com/acme/project", branch: "../main" }).success).toBe(false);
  });
});
