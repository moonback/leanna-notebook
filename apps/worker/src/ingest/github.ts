import { PermanentError } from "../worker.ts";

const MAX_FILES = 400;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024;
const API = "https://api.github.com";
const IGNORE_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", "vendor", ".venv", "__pycache__", ".turbo"]);
const IGNORE_FILES = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa|id_ed25519|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.secret)$/i;
const IGNORE_EXT = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|7z|rar|mp[34]|wav|woff2?|ttf|otf|lock|map|min\.js|min\.css|exe|dll|so|dylib|bin|sqlite3?)$/i;

export function shouldIndexGitHubPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((part) => IGNORE_DIRS.has(part))) return false;
  if (IGNORE_FILES.test(path) || IGNORE_EXT.test(path)) return false;
  if (parts.some((part) => part.startsWith(".") && part !== ".github")) return false;
  return true;
}

export function containsPotentialSecret(value: string): boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|(?:api[_-]?key|client[_-]?secret|password|access[_-]?token)\s*[:=]\s*["'][^"'\n]{12,}["']/i.test(value);
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: "c", cc: "cpp", cpp: "cpp", cs: "csharp", css: "css", go: "go", h: "c",
  hpp: "cpp", html: "html", java: "java", js: "javascript", jsx: "jsx",
  json: "json", md: "markdown", mjs: "javascript", mts: "typescript",
  py: "python", rb: "ruby", rs: "rust", sh: "bash", sql: "sql",
  svelte: "svelte", swift: "swift", toml: "toml", ts: "typescript",
  tsx: "tsx", vue: "vue", xml: "xml", yaml: "yaml", yml: "yaml",
  y: "verilog", zsh: "bash",
};

export function languageForGitHubPath(path: string): string {
  const name = path.split("/").pop() ?? path;
  if (name === "Dockerfile") return "dockerfile";
  if (name === "Makefile") return "makefile";
  if (name === "Gemfile") return "ruby";
  if (name === " justfile") return "makefile";
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "text";
}

/** Choisit un délimiteur Markdown plus long que toute séquence présente dans le contenu. */
export function markdownFence(content: string): string {
  const backticks = Math.max(0, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length));
  const tildes = Math.max(0, ...Array.from(content.matchAll(/~+/g), (match) => match[0].length));
  return backticks <= tildes ? "`".repeat(Math.max(3, backticks + 1)) : "~".repeat(Math.max(3, tildes + 1));
}

function numberedContent(content: string): string {
  const normalized = content.replace(/\r\n?/g, "\n");
  return normalized.split("\n").map((line, index) => `${String(index + 1).padStart(5, "0")} | ${line}`).join("\n");
}

function markdownPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/([\\`])/g, "\\$1");
}

export type GitHubMarkdownFile = { path: string; content: string };

export function renderGitHubMarkdown(input: {
  owner: string;
  repo: string;
  ref: string;
  commitSha: string;
  files: GitHubMarkdownFile[];
}): string {
  const { owner, repo, ref, commitSha, files } = input;
  const tree = files.map(({ path }) => `- \`${markdownPath(path)}\``).join("\n");
  const toc = files.map(({ path }) => `- [${path.replace(/\\/g, "/")}](#file-${path.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")})`).join("\n");
  const sections = files.map(({ path, content }) => {
    const fence = markdownFence(content);
    const language = languageForGitHubPath(path);
    return [
      `## FILE: ${path}`,
      "",
      `- **Chemin :** \`${markdownPath(path)}\``,
      `- **Langage :** ${language}`,
      `- **Lignes :** ${content.replace(/\\r\\n?/g, "\\n").split("\\n").length}`,
      "",
      `${fence}${language}`,
      numberedContent(content),
      fence,
    ].join("\n");
  }).join("\n\n---\n\n");

  return [
    "# Codebase GitHub",
    "",
    "## Métadonnées",
    "",
    `- **Dépôt :** [${owner}/${repo}](https://github.com/${owner}/${repo})`,
    `- **Branche / référence :** \`${ref}\``,
    `- **Commit immuable :** \`${commitSha}\``,
    `- **Fichiers indexés :** ${files.length}`,
    "",
    "## Arborescence indexée",
    "",
    tree,
    "",
    "## Sommaire des fichiers",
    "",
    toc,
    "",
    "---",
    "",
    sections,
    "",
  ].join("\n");
}

/** Capture un dépôt public à un commit précis puis le convertit en un document Markdown unique. */
export async function extractGitHubCodebase(rawUrl: string): Promise<string> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new PermanentError("github_invalid_url"); }
  if (url.protocol !== "https:" || url.hostname !== "github.com") throw new PermanentError("github_invalid_url");
  const [owner, repoWithGit, ...rest] = url.pathname.split("/").filter(Boolean);
  const repo = repoWithGit?.replace(/\.git$/i, "");
  if (!owner || !repo || rest.length) throw new PermanentError("github_invalid_url");
  const ref = url.searchParams.get("ref") || "HEAD";
  if (ref.length > 200 || ref.startsWith("-")) throw new PermanentError("github_invalid_ref");

  console.log(`[github] owner=${owner} repo=${repo} ref=${ref}`);
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Leanna-Notebook" };
  const request = async (path: string) => {
    const response = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(20_000) });
    if (response.status === 404) throw new PermanentError("github_not_found");
    if (response.status === 403 || response.status === 429) throw new Error("github_rate_limited");
    if (!response.ok) throw new Error(`github_http_${response.status}`);
    return response.json() as Promise<any>;
  };

  const branchData = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(ref)}`);
  const commitSha = branchData.commit?.sha;
  if (typeof commitSha !== "string") throw new PermanentError("github_invalid_ref");
  const tree = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${commitSha}?recursive=1`);
  if (tree.truncated) throw new PermanentError("github_repo_too_large");
  const entries = (tree.tree ?? []).filter((entry: any) => entry.type === "blob" && typeof entry.path === "string" && shouldIndexGitHubPath(entry.path));
  if (!entries.length) throw new PermanentError("github_no_indexable_files");
  if (entries.length > MAX_FILES) throw new PermanentError("github_repo_too_large");

  let total = 0;
  const files: GitHubMarkdownFile[] = [];
  for (let i = 0; i < entries.length; i += 8) {
    const batch = await Promise.all(entries.slice(i, i + 8).map(async (entry: any) => {
      if (typeof entry.size !== "number" || entry.size > MAX_FILE_BYTES) return null;
      const rawPath = entry.path.split("/").map(encodeURIComponent).join("/");
      const rawRef = commitSha.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${rawRef}/${rawPath}`, {
        headers: { "User-Agent": "Leanna-Notebook" }, signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`github_raw_http_${response.status}`);
      const content = await response.text();
      if (content.includes("\\u0000") || containsPotentialSecret(content)) return null;
      const bytes = Buffer.byteLength(content, "utf8");
      total += bytes;
      if (total > MAX_TOTAL_BYTES) throw new PermanentError("github_repo_too_large");
      return { path: entry.path as string, content };
    }));
    files.push(...batch.filter((file): file is GitHubMarkdownFile => Boolean(file)));
  }
  if (!files.length) throw new PermanentError("github_no_indexable_files");

  const markdown = renderGitHubMarkdown({ owner, repo, ref, commitSha, files });
  if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) throw new PermanentError("github_repo_too_large");
  return markdown;
}
