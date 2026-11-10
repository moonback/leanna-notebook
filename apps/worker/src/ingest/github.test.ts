import { describe, expect, it } from "vitest";
import {
  containsPotentialSecret,
  languageForGitHubPath,
  markdownFence,
  renderGitHubMarkdown,
  shouldIndexGitHubPath,
} from "./github.ts";

describe("GitHub codebase file selection", () => {
  it("keeps source files and project documentation", () => {
    expect(shouldIndexGitHubPath("src/app.ts")).toBe(true);
    expect(shouldIndexGitHubPath("README.md")).toBe(true);
    expect(shouldIndexGitHubPath(".github/workflows/ci.yml")).toBe(true);
  });

  it("excludes generated folders, dependencies and binary assets", () => {
    for (const path of [
      "node_modules/react/index.js",
      ".git/config",
      ".next/server/app.js",
      "dist/bundle.js",
      "coverage/report.json",
      "assets/logo.png",
      "public/font.woff2",
      "pnpm-lock.yaml",
    ]) expect(shouldIndexGitHubPath(path)).toBe(false);
  });

  it("skips lockfiles and excludes environment files and private key material", () => {
    for (const path of [".env", ".env.production", "config/.npmrc", "certs/server.pem", "keys/id_rsa", "secrets/api.secret"]) {
      expect(shouldIndexGitHubPath(path)).toBe(false);
    }
  });

  it("detects common credential patterns before indexing file contents", () => {
    expect(containsPotentialSecret("const token = \"ghp_123456789012345678901234567890\";")).toBe(true);
    expect(containsPotentialSecret("-----BEGIN PRIVATE KEY-----")).toBe(true);
    expect(containsPotentialSecret("export function add(a: number, b: number) { return a + b; }")).toBe(false);
  });
});

describe("GitHub Markdown codebase document", () => {
  it("renders repository metadata, an indexed tree, a file index and fenced source sections", () => {
    const markdown = renderGitHubMarkdown({
      owner: "moonback",
      repo: "demo",
      ref: "main",
      commitSha: "abc123",
      files: [{ path: "src/app.ts", content: "export const answer = 42;\n" }, { path: "README.md", content: "# Demo\n" }],
    });

    expect(markdown).toContain("# Codebase GitHub");
    expect(markdown).toContain("https://github.com/moonback/demo");
    expect(markdown).toContain("**Commit immuable :** `abc123`");
    expect(markdown).toContain("`src/app.ts`");
    expect(markdown).toContain("## FILE: src/app.ts");
    expect(markdown).toContain("```typescript");
    expect(markdown).toContain("00001 | export const answer = 42;");
    expect(markdown).toContain("00002 | ");
  });

  it("selects a fence longer than backtick and tilde runs inside the source", () => {
    expect(markdownFence("const x = ````")).toBe("~~~~");
    expect(markdownFence("const x = ~~~~")).toBe("`````");
  });

  it("maps common file extensions to Markdown code-fence languages", () => {
    expect(languageForGitHubPath("src/component.tsx")).toBe("tsx");
    expect(languageForGitHubPath("db/schema.sql")).toBe("sql");
    expect(languageForGitHubPath("README.md")).toBe("markdown");
    expect(languageForGitHubPath("Dockerfile")).toBe("dockerfile");
  });

  it("keeps each file path and original line numbers in its own section", () => {
    const markdown = renderGitHubMarkdown({
      owner: "acme",
      repo: "project",
      ref: "release/1",
      commitSha: "deadbeef",
      files: [{ path: "apps/web/page.tsx", content: "first\nsecond" }],
    });
    expect(markdown).toContain("## FILE: apps/web/page.tsx");
    expect(markdown).toContain("00001 | first");
    expect(markdown).toContain("00002 | second");
  });
});
