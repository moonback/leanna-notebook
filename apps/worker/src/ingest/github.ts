import { unzipSync } from "fflate";
import { PermanentError } from "../worker.ts";
import { normalize } from "./chunker.ts";
import { FetchRefused, safeFetch } from "./ssrf.ts";

/**
 * Import d'un dépôt GitHub public comme UNE source : l'archive zip du dépôt est téléchargée,
 * les fichiers texte utiles sont filtrés puis assemblés en un document où chaque fichier est une « page ».
 * La page 1 est une vue d'ensemble (arborescence + README) pour les questions d'architecture.
 */

export type GithubRepo = { owner: string; repo: string; ref?: string };
export type RepoFile = { path: string; content: string };
export type GithubRef = { owner: string; repo: string; ref: string | null; commit: string | null; files: string[]; skipped: number; truncated: number };

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

/** https://github.com/owner/repo[.git][/tree/<ref>] → { owner, repo, ref }. Null si ce n'est pas un dépôt GitHub. */
export function parseGithubUrl(raw: string): GithubRepo | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, "");
  if (!NAME.test(owner) || !NAME.test(repo) || repo === "." || repo === "..") return null;
  let ref: string | undefined;
  if (parts[2] === "tree" && parts.length > 3) {
    ref = decodeURIComponent(parts.slice(3).join("/"));
    if (!/^[A-Za-z0-9_./-]{1,200}$/.test(ref) || ref.includes("..")) return null;
  }
  return { owner, repo, ...(ref ? { ref } : {}) };
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "vendor", "target", ".next", ".nuxt", "coverage",
  "__pycache__", ".venv", "venv", "env", "bower_components", ".idea", ".vscode", ".turbo", ".cache", ".gradle", "Pods", "DerivedData"]);
const SKIP_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "Cargo.lock", "poetry.lock", "composer.lock",
  "Gemfile.lock", "go.sum", "Pipfile.lock", "uv.lock", "flake.lock", ".DS_Store"]);
const TEXT_EXT = new Set([
  "md", "mdx", "markdown", "rst", "txt", "adoc",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "astro", "html", "css", "scss", "sass", "less",
  "py", "pyi", "rb", "php", "java", "kt", "kts", "scala", "groovy", "go", "rs", "c", "h", "cc", "cpp", "hpp", "cs", "fs", "swift", "m", "mm",
  "dart", "lua", "r", "jl", "ex", "exs", "erl", "hs", "clj", "elm", "zig", "nim", "sol", "pl", "sh", "bash", "zsh", "fish", "ps1", "bat",
  "sql", "graphql", "gql", "proto", "prisma", "json", "jsonc", "yaml", "yml", "toml", "ini", "cfg", "conf", "xml", "gradle", "tf", "hcl", "nix",
  "ipynb", "csv", "env.example",
]);
const TEXT_NAMES = new Set(["dockerfile", "makefile", "procfile", "gemfile", "rakefile", "justfile", "cmakelists.txt", ".gitignore", ".env.example"]);
export const MAX_FILE_BYTES = 200 * 1024;
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;
const MAX_UNCOMPRESSED = 200 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
/** Marge sous le plafond global de 500 000 mots (extract.finalize) pour la vue d'ensemble. */
const WORD_BUDGET = 450_000;

/** Vrai si le fichier mérite d'être indexé (texte/code, hors dépendances, lockfiles et artefacts générés). */
export function isIndexable(path: string, size: number): boolean {
  if (size <= 0 || size > MAX_FILE_BYTES) return false;
  const parts = path.split("/");
  if (parts.slice(0, -1).some((d) => SKIP_DIRS.has(d))) return false;
  const name = parts.at(-1)!;
  if (SKIP_FILES.has(name)) return false;
  const lower = name.toLowerCase();
  if (/\.(min\.(js|css)|map|snap|lock)$/.test(lower)) return false;
  if (TEXT_NAMES.has(lower)) return true;
  if (/^(readme|license|licence|changelog|contributing)(\.|$)/.test(lower)) return true;
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";
  return TEXT_EXT.has(ext);
}

/** Ordre de lecture : README racine, documentation, manifestes, puis le code par chemin. */
export function filePriority(path: string): number {
  const lower = path.toLowerCase();
  const name = lower.split("/").pop()!;
  const depth = path.split("/").length - 1;
  if (/^readme(\.|$)/.test(name)) return depth === 0 ? 0 : 2;
  if (lower.startsWith("docs/") || lower.startsWith("doc/") || /\.(md|mdx|rst|adoc)$/.test(name)) return 3;
  if (depth === 0 || /^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|composer\.json|gemfile|dockerfile)$/.test(name)) return 1;
  if (/(^|\/)(tests?|__tests__|spec|fixtures?|examples?)\//.test(lower) || /\.(test|spec)\.[a-z]+$/.test(name)) return 5;
  return 4;
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;
const SEPARATOR = "\n\n";

/**
 * Assemble le document : page 1 = vue d'ensemble, puis un fichier par page (« === Fichier : chemin === »).
 * Chaque morceau est normalisé AVANT concaténation pour que les offsets de page restent exacts.
 */
export function buildRepoDocument(repo: GithubRepo & { commit?: string | null }, files: RepoFile[], skipped = 0) {
  const ordered = [...files].sort((a, b) => filePriority(a.path) - filePriority(b.path) || a.path.localeCompare(b.path));
  const kept: RepoFile[] = [];
  let words = 0;
  for (const f of ordered) {
    const content = normalize(f.content);
    if (!content) continue;
    const w = countWords(content) + 4;
    if (words + w > WORD_BUDGET) continue; // un gros fichier en moins, les suivants peuvent encore tenir
    words += w;
    kept.push({ path: f.path, content });
  }
  const truncated = ordered.length - kept.length;
  const readme = kept.find((f) => /^readme(\.|$)/i.test(f.path));
  const tree = kept.map((f) => f.path);
  const overview = normalize([
    `Dépôt GitHub ${repo.owner}/${repo.repo}${repo.ref ? ` (référence ${repo.ref})` : ""}${repo.commit ? ` · commit ${repo.commit}` : ""}`,
    `Adresse : https://github.com/${repo.owner}/${repo.repo}`,
    `${kept.length} fichier(s) indexé(s)${skipped ? `, ${skipped} ignoré(s) (binaires, dépendances, fichiers générés ou trop gros)` : ""}${truncated ? `, ${truncated} non inclus faute de place` : ""}.`,
    "",
    "Arborescence des fichiers indexés :",
    ...tree.slice(0, 3000),
    ...(tree.length > 3000 ? [`… et ${tree.length - 3000} autre(s)`] : []),
    ...(readme ? ["", `Extrait du ${readme.path} :`, readme.content.slice(0, 6000)] : []),
  ].join("\n"));

  const pages = [overview, ...kept.map((f) => normalize(`=== Fichier : ${f.path} ===\n${f.content}`))];
  const pageStarts: number[] = [];
  let text = "";
  for (const [i, page] of pages.entries()) {
    if (i > 0) text += SEPARATOR;
    pageStarts.push(text.length);
    text += page;
  }
  const ref: GithubRef = { owner: repo.owner, repo: repo.repo, ref: repo.ref ?? null, commit: repo.commit ?? null,
    files: ["(vue d'ensemble)", ...tree], skipped, truncated };
  return { text, pageStarts, pageCount: pages.length, title: `${repo.owner}/${repo.repo}`, github: ref };
}

/** Décompresse les seules entrées indexables de l'archive zip GitHub (dossier racine « owner-repo-sha/» retiré). */
export function readRepoZip(zip: Uint8Array): { files: RepoFile[]; skipped: number; commit: string | null } {
  let entries = 0, total = 0, skipped = 0, root: string | null = null;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(zip, {
      filter: (f) => {
        if (++entries > MAX_ENTRIES) throw new PermanentError("archive_too_large", "Dépôt trop volumineux.");
        if (f.name.endsWith("/")) return false;
        root ??= f.name.split("/")[0]!;
        const path = f.name.split("/").slice(1).join("/");
        if (!path || !isIndexable(path, f.originalSize)) { skipped++; return false; }
        total += f.originalSize;
        if (total > MAX_UNCOMPRESSED) throw new PermanentError("archive_too_large", "Dépôt trop volumineux.");
        return true;
      },
    });
  } catch (e) {
    if (e instanceof PermanentError) throw e;
    throw new PermanentError("unreadable_file");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files: RepoFile[] = [];
  for (const [name, bytes] of Object.entries(raw)) {
    if (bytes.includes(0)) { skipped++; continue; } // binaire déguisé
    let content: string;
    try { content = decoder.decode(bytes); } catch { skipped++; continue; }
    const path = name.split("/").slice(1).join("/");
    files.push({ path, content: path.endsWith(".ipynb") ? notebookText(content) : content });
  }
  const commit = (root as string | null)?.match(/-([0-9a-f]{7,40})$/)?.[1] ?? null;
  return { files, skipped, commit };
}

/** Notebook Jupyter : on ne garde que le texte des cellules (pas les sorties ni les images base64). */
function notebookText(json: string): string {
  try {
    const nb = JSON.parse(json) as { cells?: { cell_type?: string; source?: string | string[] }[] };
    return (nb.cells ?? []).map((c) => `[${c.cell_type ?? "cell"}]\n${Array.isArray(c.source) ? c.source.join("") : c.source ?? ""}`).join("\n\n");
  } catch { return ""; }
}

const GITHUB_HOSTS = ["api.github.com", "codeload.github.com"];

/** Télécharge et assemble un dépôt public. Erreurs attendues : PermanentError avec code stable. */
export async function fromGithub(rawUrl: string, fetcher: typeof safeFetch = safeFetch) {
  const repo = parseGithubUrl(rawUrl);
  if (!repo) throw new PermanentError("invalid_github_url", "Adresse de dépôt GitHub invalide.");
  const archive = `https://api.github.com/repos/${repo.owner}/${repo.repo}/zipball${repo.ref ? `/${encodeURIComponent(repo.ref)}` : ""}`;
  let res;
  try {
    const token = process.env.GITHUB_TOKEN; // optionnel : relève la limite de 60 requêtes/heure de l'API anonyme
    res = await fetcher(archive, 5, { maxBytes: MAX_ARCHIVE_BYTES, allowHosts: GITHUB_HOSTS, accept: "application/zip, application/vnd.github+json",
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}) });
  } catch (e) {
    if (e instanceof FetchRefused) {
      if (e.message === "http_404") throw new PermanentError("github_not_found", "Dépôt introuvable ou privé (seuls les dépôts publics sont pris en charge).");
      if (e.message === "too_large") throw new PermanentError("too_large", "Archive du dépôt supérieure à 60 Mo.");
      // 403/429 : limite de débit GitHub → nouvelle tentative plus tard
      if (e.message === "paywall" || e.message === "http_429") throw new Error(`github_rate_limited:${e.message}`);
      throw new PermanentError("url_refused", e.message);
    }
    throw e;
  }
  const { files, skipped, commit } = readRepoZip(new Uint8Array(res.body));
  if (!files.length) throw new PermanentError("empty_content", "Aucun fichier texte exploitable dans ce dépôt.");
  return buildRepoDocument({ ...repo, commit }, files, skipped);
}
