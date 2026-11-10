// Connecteur d'embeddings (1024 dimensions, figées par le schéma `halfvec(1024)`).
// Fournisseur et modèle viennent de la configuration : aucun nom de modèle codé en dur (décision D1).
// Sans clé : la recherche fonctionne en plein texte seul, et c'est journalisé (pas de faux vecteurs).
import { PermanentError } from "../worker.ts";

export const EMBEDDING_DIM = 1024;

export type Embedder = { model: string; embed: (texts: string[]) => Promise<number[][]> };

export function embedderFromEnv(env = process.env): Embedder | null {
  const key = env.EMBEDDINGS_API_KEY;
  const model = env.EMBEDDINGS_MODEL;
  const provider = env.EMBEDDINGS_PROVIDER;
  if (!key || !model || !provider) return null;
  const endpoints: Record<string, string> = {
    // surcharge réservée aux tests (serveur simulé) et aux proxys
    openrouter: `${env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/embeddings`,
    voyage: "https://api.voyageai.com/v1/embeddings",
    mistral: "https://api.mistral.ai/v1/embeddings",
  };
  const endpoint = endpoints[provider];
  if (!endpoint) throw new Error(`EMBEDDINGS_PROVIDER inconnu : ${provider}`);

  return {
    model: `${provider}:${model}`,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 64) {
        const batch = texts.slice(i, i + 64);
        const body = provider === "voyage"
          ? { model, input: batch, input_type: "document", output_dimension: EMBEDDING_DIM }
          : provider === "openrouter"
            ? { model, input: batch, dimensions: EMBEDDING_DIM } // ignoré par les modèles à dimension fixe : vérifié plus bas
            : { model, input: batch };
        let res: Response | undefined;
        for (let attempt = 0; attempt < 4; attempt++) {
          res = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
          if (res.status !== 429 && res.status < 500) break;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
        // clé invalide / modèle inconnu : erreur de configuration, inutile de réessayer
        if (res && [400, 401, 403, 404].includes(res.status)) throw new PermanentError("embeddings_config", `embeddings_http_${res.status}`);
        if (!res?.ok) throw new Error(`embeddings_http_${res?.status}`);
        const json = (await res.json()) as { data: { embedding: number[] }[] };
        for (const d of json.data) {
          if (d.embedding.length !== EMBEDDING_DIM) throw new Error(`dimension ${d.embedding.length} ≠ ${EMBEDDING_DIM} : changer de modèle`);
          out.push(d.embedding);
        }
      }
      return out;
    },
  };
}
