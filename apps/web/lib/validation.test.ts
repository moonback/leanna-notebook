import { describe, expect, it } from "vitest";
import { credentialsSchema, fieldErrors, profilePatchSchema, safeNext, uploadTypeOf, UPLOAD_TYPES } from "./validation";

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

describe("uploadTypeOf", () => {
  it("reconnaît tous les formats documentés, image, audio et vidéo", () => {
    const extensions = "pdf txt md docx csv pptx epub 3g2 3gp aac aif aifc aiff amr au avi m4a mp3 mp4 mpeg ogg opus ra snd wav wma avif bmp gif ico jp2 png webp tif tiff heic heif jpeg jpg jpe odt rtf hwp hwpx".split(" ");
    for (const ext of extensions) expect(uploadTypeOf("document." + ext)).toBe(ext);
    expect(Object.keys(UPLOAD_TYPES)).toHaveLength(extensions.length);
  });
  it("ignore la casse et refuse les extensions inconnues ou trompeuses", () => {
    expect(uploadTypeOf("PHOTO.JpG")).toBe("jpg");
    expect(uploadTypeOf("malware.exe")).toBeNull();
    expect(uploadTypeOf("document.toString")).toBeNull();
  });
});
