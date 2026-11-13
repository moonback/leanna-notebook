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
/** Fonctionnalités que l'utilisateur peut désactiver (Réglages → Fonctionnalités) ; même liste que la contrainte SQL. */
export const OPTIONAL_FEATURES = ["deep_research", "knowledge_graph", "contradictions", "prompt_suggestions", "audio_overview"] as const;
export type OptionalFeature = typeof OPTIONAL_FEATURES[number];

export const profilePatchSchema = z
  .object({
    display_name: z.string().trim().max(120, "120 caractères maximum.").nullable(),
    output_language: z.enum(LANGUAGES),
    theme: z.enum(THEMES),
    web_notifications: z.boolean(),
    dashboard_view: z.enum(["grid", "list"]),
    disabled_features: z.array(z.enum(OPTIONAL_FEATURES)).max(OPTIONAL_FEATURES.length).transform((v) => [...new Set(v)]),
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

const httpUrl = z.string().trim().url("Adresse invalide.").max(2048).refine((u) => /^https?:\/\//i.test(u), "Seuls http et https sont acceptés.");

/** Provenance d'une source ajoutée depuis Leanna Browser (conservée dans `sources.external_ref.browser`). */
export const browserOriginSchema = z.object({
  /** Adresse de la page d'où vient un contenu texte (pour un lien, c'est l'URL de la source elle-même). */
  originUrl: httpUrl.optional(),
  title: z.string().trim().min(1).max(300).optional(),
  faviconUrl: httpUrl.optional(),
  /** Date de consultation de la page (ISO 8601). */
  consultedAt: z.string().datetime().optional(),
  mode: z.enum(["link", "text", "summary", "selection"]).optional(),
}).strict();
export type BrowserOrigin = z.infer<typeof browserOriginSchema>;

/** Métadonnées enregistrées avec la source : date d'ajout, date de consultation, favicon, titre, mode d'ajout. */
export function browserExternalRef(origin: BrowserOrigin, addedAt: Date): { browser: Record<string, string> } {
  return { browser: {
    added_at: addedAt.toISOString(),
    ...(origin.consultedAt ? { consulted_at: origin.consultedAt } : {}),
    ...(origin.faviconUrl ? { favicon_url: origin.faviconUrl } : {}),
    ...(origin.title ? { title: origin.title } : {}),
    ...(origin.mode ? { mode: origin.mode } : {}),
  } };
}

export const sourceItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upload"), storagePath: z.string().min(1).max(500), title: z.string().trim().min(1).max(300) }).strict(),
  z.object({ type: z.literal("url"), url: httpUrl, browser: browserOriginSchema.optional() }).strict(),
  z.object({ type: z.literal("text"), title: z.string().trim().min(1, "Titre requis.").max(300), text: z.string().min(1, "Texte vide.").max(3_500_000, "Texte trop long (500 000 mots maximum)."), browser: browserOriginSchema.optional() }).strict(),
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
