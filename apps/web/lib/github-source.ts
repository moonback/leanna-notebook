/**
 * Sources GitHub : chaque fichier du dépôt est une « page » (page 1 = vue d'ensemble).
 * external_ref.github.files[page - 1] donne le chemin du fichier, utilisé pour nommer les passages
 * transmis au modèle et à Leanna (« owner/repo › src/app.ts » plutôt que « page 12 »)
 * et pour afficher le fichier dans les citations.
 */
export const SOURCE_FILES_SELECT = "github_files:external_ref->github->files";

type WithFiles = { title: string; github_files?: unknown };

/** Chemin du fichier correspondant à une page d'une source GitHub, ou null (autre type, vue d'ensemble, page inconnue). */
export function githubFilePath(source: Pick<WithFiles, "github_files"> | undefined, page: number | null | undefined): string | null {
  const files = source?.github_files;
  if (!page || page < 2 || !Array.isArray(files)) return null;
  const path = files[page - 1];
  return typeof path === "string" ? path : null;
}

export function passageTitle(source: WithFiles | undefined, page: number | null): string {
  if (!source) return "source";
  const path = githubFilePath(source, page);
  return path ? `${source.title} › ${path}` : source.title;
}
