import { describe, expect, it } from "vitest";
import { githubFilePath, passageTitle } from "./github-source";
import { githubRepoName, sourceItemSchema } from "./validation";

describe("sources GitHub", () => {
  it("valide l'adresse d'un dépôt et en déduit owner/repo", () => {
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://github.com/acme/app" }).success).toBe(true);
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://github.com/acme/app/tree/main" }).success).toBe(true);
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://gitlab.com/acme/app" }).success).toBe(false);
    expect(sourceItemSchema.safeParse({ type: "github", url: "https://github.com/acme" }).success).toBe(false);
    expect(githubRepoName("https://github.com/acme/app.git")).toBe("acme/app");
  });
  it("nomme le passage avec le chemin du fichier", () => {
    const src = { title: "acme/app", github_files: ["(vue d'ensemble)", "README.md", "src/app.ts"] };
    expect(passageTitle(src, 3)).toBe("acme/app › src/app.ts");
    expect(passageTitle(src, 1)).toBe("acme/app");
    expect(passageTitle({ title: "doc.pdf", github_files: null }, 4)).toBe("doc.pdf");
    expect(passageTitle(undefined, 1)).toBe("source");
  });
  it("donne le chemin du fichier cité, jamais pour la vue d'ensemble ni pour une autre source", () => {
    const files = ["(vue d'ensemble)", "README.md"];
    expect(githubFilePath({ github_files: files }, 2)).toBe("README.md");
    expect(githubFilePath({ github_files: files }, 1)).toBeNull();
    expect(githubFilePath({ github_files: files }, 9)).toBeNull();
    expect(githubFilePath({ github_files: null }, 2)).toBeNull();
    expect(githubFilePath(undefined, 2)).toBeNull();
  });
});
