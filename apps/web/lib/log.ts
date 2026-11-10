// Journal structuré (JSON sur stdout, lu par Vercel / Fly / tout collecteur).
// Règle : identifiants seulement, jamais de contenu utilisateur, d'email ni de jeton.
type Fields = Record<string, string | number | boolean | null | undefined>;
const REDACT = /(token|key|secret|password|authorization|email)/i;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const safe: Fields = {};
  for (const [k, v] of Object.entries(fields)) safe[k] = REDACT.test(k) ? "[masqué]" : v;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe });
  (level === "error" ? console.error : console.log)(line);
}

export const log = {
  info: (event: string, f?: Fields) => emit("info", event, f),
  warn: (event: string, f?: Fields) => emit("warn", event, f),
  error: (event: string, f?: Fields) => emit("error", event, f),
};
