import { PermanentError } from "../worker.ts";

const MAX_FILES = 400;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
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

/** Capture un dépôt public à un commit précis. Les fichiers sont numérotés pour ancrer les citations. */
export async function extractGitHubCodebase(rawUrl: string): Promise<string> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new PermanentError("github_invalid_url"); }
  if (url.protocol !== "https:" || url.hostname !== "github.com") throw new PermanentError("github_invalid_url");
  const [owner, repoWithGit, ...rest] = url.pathname.split("/").filter(Boolean);
  const repo = repoWithGit?.replace(/\.git$/i, "");
  if (!owner || !repo || rest.length) throw new PermanentError("github_invalid_url");
  const ref = url.searchParams.get("ref") || "HEAD";
  if (ref.length > 200 || ref.startsWith("-")) throw new PermanentError("github_invalid_ref");

  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Leanna-Notebook" };
  const request = async (path: string) => {
    const response = await fetch(\`${API}\${path}\`, { headers, signal: AbortSignal.timeout(20_000) });
    if (response.status === 404) throw new PermanentError("github_not_found");
    if (response.status === 403 || response.status === 429) throw new Error("github_rate_limited");
    if (!response.ok) throw new Error(\`github_http_${response.status}\`);
    return response.json() as Promise<any>;
  };

  const tree = await request(\`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1\`);
  if (tree.truncated) throw new PermanentError("github_repo_too_large");
  const files = (tree.tree ?? []).filter((entry: any) => entry.type === "blob" && typeof entry.path === "string" && shouldIndexGitHubPath(entry.path));
  if (!files.length) throw new PermanentError("github_no_indexable_files");
  if (files.length > MAX_FILES) throw new PermanentError("github_repo_too_large");

  let total = 0;
  const sections: string[] = [];
  for (let i = 0; i < files.length; i += 8) {
    const batch = await Promise.all(files.slice(i, i + 8).map(async (entry: any) => {
      if (typeof entry.size !== "number" || entry.size > MAX_FILE_BYTES) return null;
      const rawPath = entry.path.split("/").map(encodeURIComponent).join("/");
      const rawRef = ref.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(\`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${rawRef}/${rawPath}\`, {
        headers: { "User-Agent": "Leanna-Notebook" }, signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(\`github_raw_http_${response.status}\`);
      const content = await response.text();
      if (content.includes("\\u0000") || containsPotentialSecret(content)) return null;
      const bytes = Buffer.byteLength(content, "utf8");
      total += bytes;
      if (total > MAX_TOTAL_BYTES) throw new PermanentError("github_repo_too_large");
      const lines = content.replace(/\r\n?/g, "\n").split("\n");
      const numbered = lines.map((line, index) => \`${String(index + 1).padStart(5, "0")} | ${line}\`).join("\n");
      return \`## FILE: ${entry.path}\n${numbered}\`;
    }));
    sections.push(...batch.filter((value): value is string => Boolean(value)));
  }
  if (!sections.length) throw new PermanentError("github_no_indexable_files");
  return \`GITHUB CODEBASE: ${owner}/${repo}\nREF: ${ref}\nFILES INDEXED: ${sections.length}\n\n${sections.join("\n\n---\n\n")}\`;
}
