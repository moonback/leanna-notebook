import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Même alias que tsconfig ("@/*") ; JSX automatique pour les tests de composants.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
});
