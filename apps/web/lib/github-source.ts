/**
 * Sources GitHub : chaque fichier du dépôt est une « page » (page 1 = vue d'ensemble).
 * external_ref.github.files[page - 1] donne le chemin du fichier, utilisé pour nommer les passages
 * transmis au modèle et à Leanna (« owner/repo › src/app.ts » plutôt que « page 12 »).
 */
export const SOURCE_FILES_SELECT = "github_files:external_ref->github->files";

export function passageTitle(source: { title: string; github_files?: unknown } | undefined, page: number | null): string {
  if (!source) return "source";
  const files = source.github_files;
  if (!page || !Array.isArray(files)) return source.title;
  const path = files[page - 1];
  return typeof path === "string" && page > 1 ? `${source.title} › ${path}` : source.title;
}
