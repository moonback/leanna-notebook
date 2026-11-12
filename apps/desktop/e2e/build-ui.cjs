// Compile la vraie interface React du navigateur (apps/web/app/browser) pour la charger dans Electron
// sans serveur Next ni authentification : même code de composants, mêmes styles Tailwind.
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const WEB = resolve(__dirname, "../../web");

async function buildUi({ notebookId } = {}) {
  const out = mkdtempSync(join(tmpdir(), "leanna-ui-"));
  const bundlePath = join(out, "bundle.js");
  await require("esbuild").build({
    stdin: {
      contents: `
        import * as React from "react";
        import { createRoot } from "react-dom/client";
        import { BrowserClient } from "./app/browser/browser-client";
        createRoot(document.getElementById("root")).render(
          <div className="flex h-dvh flex-col overflow-hidden"><BrowserClient notebookId={${JSON.stringify(notebookId ?? null)} ?? undefined} /></div>
        );`,
      resolveDir: WEB,
      loader: "tsx",
    },
    bundle: true,
    outfile: bundlePath,
    format: "iife",
    jsx: "automatic",
    alias: { "@": WEB },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });

  // Styles réels : mêmes tokens et mêmes utilitaires que l'application.
  let cssPath = null;
  try {
    const tailwind = require.resolve("@tailwindcss/postcss", { paths: [WEB] });
    const postcss = require(require.resolve("postcss", { paths: [tailwind] }));
    const from = join(WEB, "app/globals.css");
    const result = await postcss([require(tailwind)({ base: WEB })]).process(readFileSync(from, "utf8"), { from });
    cssPath = join(out, "bundle.css");
    writeFileSync(cssPath, result.css);
  } catch (error) {
    console.warn(`styles non compilés (interface testée sans CSS) : ${error.message}`);
  }
  return { bundlePath, cssPath, dir: out };
}

module.exports = { buildUi };
