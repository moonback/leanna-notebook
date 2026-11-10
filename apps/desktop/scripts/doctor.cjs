const fs = require("node:fs");
const path = require("node:path");

let failed = false;
const report = (label, ok, detail) => {
  if (!ok) failed = true;
  process.stdout.write(`${ok ? "✓" : "✗"} ${label}: ${detail}\n`);
};

process.stdout.write("\nLeanna Notebook — diagnostic desktop local\n\n");

const nodeMajor = Number(process.versions.node.split(".")[0]);
report("Node.js", Number.isFinite(nodeMajor) && nodeMajor >= 20, `v${process.versions.node} (20+ requis)`);

const webPackage = path.resolve(__dirname, "../../web/package.json");
let nextAvailable = false;
try {
  const web = JSON.parse(fs.readFileSync(webPackage, "utf8"));
  nextAvailable = Boolean(web.dependencies?.next || web.devDependencies?.next);
} catch {
  nextAvailable = false;
}
report("Application Next.js", nextAvailable, nextAvailable ? webPackage : `package.json Next.js introuvable ou invalide : ${webPackage}`);

const lockfile = path.resolve(__dirname, "../../../pnpm-lock.yaml");
report("Workspace pnpm", fs.existsSync(lockfile), lockfile);

let electronBinary;
try {
  electronBinary = require("electron");
  const binaryExists = typeof electronBinary === "string" && fs.existsSync(electronBinary);
  report(
    "Binaire Electron",
    binaryExists,
    binaryExists ? electronBinary : `chemin de binaire invalide : ${String(electronBinary)}`,
  );
} catch (error) {
  report("Binaire Electron", false, error instanceof Error ? error.message : String(error));
}

process.stdout.write(failed
  ? "\nDiagnostic incomplet. Depuis la racine du dépôt, lancez pnpm install puis pnpm --filter @notebook/desktop rebuild electron. Relancez ensuite pnpm desktop:doctor.\n\n"
  : "\nDiagnostic terminé : environnement local prêt. Lancez pnpm desktop:dev à la racine.\n\n");
process.exitCode = failed ? 1 : 0;
