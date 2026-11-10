const fs = require("node:fs");
const path = require("node:path");

const checks = [];
const report = (label, ok, detail) => {
  checks.push(ok);
  process.stdout.write(`${ok ? "✓" : "✗"} ${label}: ${detail}\n`);
};

process.stdout.write("\nLeanna Notebook — diagnostic desktop local\n\n");
report("Node.js", Number(process.versions.node.split(".")[0]) >= 20, `v${process.versions.node} (20+ recommandé)`);

const webPackage = path.resolve(__dirname, "../../web/package.json");
report("Application Next.js", fs.existsSync(webPackage), webPackage);

const lockfile = path.resolve(__dirname, "../../../pnpm-lock.yaml");
report("Workspace pnpm", fs.existsSync(lockfile), lockfile);

let electronBinary = "";
try {
  electronBinary = require("electron");
} catch (error) {
  report("Package Electron", false, error instanceof Error ? error.message : String(error));
}

if (electronBinary) {
  const binaryExists = typeof electronBinary === "string" && fs.existsSync(electronBinary);
  report(
    "Binaire Electron",
    binaryExists,
    binaryExists ? electronBinary : `introuvable : ${String(electronBinary)}`,
  );
}

const ok = checks.every(Boolean);
process.stdout.write(ok
  ? "\nDiagnostic terminé : environnement local prêt. Lancez pnpm desktop:dev à la racine.\n\n"
  : "\nDiagnostic incomplet. Depuis la racine du dépôt, lancez pnpm install puis pnpm --filter @notebook/desktop rebuild electron. Relancez ensuite pnpm desktop:doctor.\n\n");
process.exitCode = ok ? 0 : 1;
