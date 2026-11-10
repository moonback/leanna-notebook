import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // racine du monorepo (sinon Next choisit un lockfile parent hors du dépôt)
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // paquet partagé du monorepo, livré en TypeScript source
  transpilePackages: ["@notebook/core"],
};

export default nextConfig;
