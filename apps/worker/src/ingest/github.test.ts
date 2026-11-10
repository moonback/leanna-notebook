import { describe, expect, it } from "vitest";
import { shouldIndexGitHubPath } from "./github.ts";

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

  it("excludes environment files and private key material", () => {
    for (const path of [".env", ".env.production", "config/.npmrc", "certs/server.pem", "keys/id_rsa", "secrets/api.secret"]) {
      expect(shouldIndexGitHubPath(path)).toBe(false);
    }
  });
});
