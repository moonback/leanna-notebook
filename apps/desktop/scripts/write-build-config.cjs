const fs = require("node:fs");
const path = require("node:path");

const raw = process.env.LEANNA_WEB_URL?.trim();
if (!raw) {
  console.error(
    "LEANNA_WEB_URL est obligatoire pour créer l'installateur. " +
      'Exemple PowerShell : $env:LEANNA_WEB_URL = "https://app.votre-domaine.fr"',
  );
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error("LEANNA_WEB_URL doit être une URL absolue valide.");
  process.exit(1);
}

if (
  url.protocol !== "https:" ||
  !url.hostname ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
) {
  console.error(
    "LEANNA_WEB_URL doit être une origine HTTPS sans identifiants, chemin, query ni fragment.",
  );
  process.exit(1);
}

const outputDirectory = path.resolve(__dirname, "../dist");
fs.mkdirSync(outputDirectory, { recursive: true });
const configPath = path.join(outputDirectory, "build-config.json");
fs.writeFileSync(
  configPath,
  JSON.stringify({ webUrl: url.origin }, null, 2) + "\n",
  "utf8",
);
console.log(`Configuration desktop créée : ${configPath}`);
console.log(`URL SaaS intégrée : ${url.origin}`);
