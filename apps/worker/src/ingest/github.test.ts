import { describe, expect, it } from "vitest";
import { containsPotentialSecret, shouldIndexGitHubPath } from "./github.ts";

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
