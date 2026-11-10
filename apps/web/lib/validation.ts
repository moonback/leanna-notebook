import { z } from "zod";

// Messages d'erreur rédigés pour l'utilisateur, en français.
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  password: z
    .string()
    .min(10, "10 caractères minimum.")
    .max(128, "128 caractères maximum."),
});

export const magicLinkSchema = credentialsSchema.pick({ email: true });

export const LANGUAGES = ["fr", "en", "es", "de", "it", "pt", "nl"] as const;
export const THEMES = ["light", "dark", "system"] as const;

/** Colonnes de `profiles` modifiables par l'utilisateur (liste blanche). */
export const profilePatchSchema = z
  .object({
    display_name: z.string().trim().max(120, "120 caractères maximum.").nullable(),
    output_language: z.enum(LANGUAGES),
    theme: z.enum(THEMES),
    web_notifications: z.boolean(),
    dashboard_view: z.enum(["grid", "list"]),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Aucune modification.");

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const notebookCreateSchema = z.object({ title: z.string().trim().max(200, "200 caractères maximum.").default("") }).strict();

/** Types acceptés à l'upload : extension → MIME attendu → kind de source. */
export const UPLOAD_TYPES = {
  pdf: ["application/pdf", "pdf"], txt: ["text/plain", "txt"], md: ["text/markdown", "md"], csv: ["text/csv", "csv"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  epub: ["application/epub+zip", "epub"],
  mp3: ["audio/mpeg", "audio"], wav: ["audio/wav", "audio"], m4a: ["audio/mp4", "audio"],
  aac: ["audio/aac", "audio"], ogg: ["audio/ogg", "audio"], flac: ["audio/flac", "audio"], webm: ["audio/webm", "audio"],
} as const;
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Fichier trop volumineux (200 Mo maximum)."),
}).strict();

export const sourceItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upload"), storagePath: z.string().min(1).max(500), title: z.string().trim().min(1).max(300) }).strict(),
  z.object({ type: z.literal("url"), url: z.string().trim().url("Adresse invalide.").max(2048).refine((u) => /^https?:\/\//i.test(u), "Seuls http et https sont acceptés.") }).strict(),
  z.object({ type: z.literal("github"), url: z.string().trim().url().max(300).refine((value) => { try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "github.com" && u.pathname.split("/").filter(Boolean).length === 2; } catch { return false; } }, "Indiquez l’URL d’un dépôt GitHub public."), branch: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._/-]+$/, "Nom de branche invalide.").refine((value) => !value.includes("..") && !value.includes("//") && !value.startsWith("/") && !value.endsWith("/") && !value.endsWith(".") && !value.endsWith(".lock"), "Nom de branche invalide.") }).strict(),
  z.object({ type: z.literal("text"), title: z.string().trim().min(1, "Titre requis.").max(300), text: z.string().min(1, "Texte vide.").max(3_500_000, "Texte trop long (500 000 mots maximum).") }).strict(),
]);
export const sourcesCreateSchema = z.object({ items: z.array(sourceItemSchema).min(1).max(50) }).strict();

export const NOTE_MAX_CHARS = 200_000;
export const noteCreateSchema = z.object({
  title: z.string().trim().min(1, "Titre requis.").max(300, "300 caractères maximum."),
  text: z.string().trim().min(1, "La note est vide.").max(NOTE_MAX_CHARS, "Note trop longue (200 000 caractères maximum)."),
}).strict();
export const notePatchSchema = z.object({
  title: z.string().trim().min(1, "Titre requis.").max(300, "300 caractères maximum."),
  text: z.string().trim().min(1, "La note est vide.").max(NOTE_MAX_CHARS, "Note trop longue (200 000 caractères maximum)."),
  /** Retire les citations d'une note issue du chat pour pouvoir la modifier. */
  unlock: z.literal(true),
}).partial().strict().refine((v) => Object.keys(v).length > 0, "Aucune modification.");

/** Extension d'un nom de fichier → type d'upload accepté, ou null. */
export function uploadTypeOf(filename: string) {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return ext in UPLOAD_TYPES ? (ext as keyof typeof UPLOAD_TYPES) : null;
}

/** Première erreur par champ, pour l'affichage sous chaque input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Chemin de redirection sûr après connexion : interne uniquement (pas d'open redirect). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
