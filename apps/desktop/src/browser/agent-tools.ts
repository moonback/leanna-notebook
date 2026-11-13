/**
 * Outils de l'agent de navigation : définitions (schéma JSON strict) et validation des arguments.
 * Le modèle ne reçoit que ces définitions ; il n'a accès à aucun objet Electron.
 * Le bloc <tools> est recopié à l'identique dans apps/web/lib/browser/tools.ts (un test vérifie l'égalité).
 */
export type ToolProperty =
  | { type: "string"; description: string; minLength?: number; maxLength: number; enum?: readonly string[] }
  | { type: "boolean"; description: string }
  | { type: "array"; description: string; items: { type: "string"; maxLength: number }; minItems: number; maxItems: number };

export type ToolSpec = {
  /** Nom canonique `browser.<name>` ; nom sur le fil `browser_<name>` (les API de function calling refusent le point). */
  name: string;
  description: string;
  /** Vrai si l'outil ne fait que lire : seul type d'outil permis en mode observation. */
  readOnly: boolean;
  parameters: { type: "object"; properties: Record<string, ToolProperty>; required: readonly string[]; additionalProperties: false };
};

// <tools>
const TAB = { type: "string", description: "Identifiant de l'onglet visé. Par défaut : l'onglet actif.", maxLength: 36 } as const;
const ELEMENT = { type: "string", description: "Repère de l'élément (e1, e2…) fourni par browser_get_page_content, ou son texte visible exact.", minLength: 1, maxLength: 200 } as const;
const tool = (name: string, readOnly: boolean, description: string, properties: Record<string, ToolProperty> = {}, required: string[] = []): ToolSpec =>
  ({ name, description, readOnly, parameters: { type: "object", properties, required, additionalProperties: false } });

export const TOOLS: readonly ToolSpec[] = [
  tool("open_url", false, "Ouvre une adresse http(s) dans l'onglet actif (ou l'onglet indiqué) et attend la fin du chargement.",
    { url: { type: "string", description: "Adresse complète en http:// ou https://.", minLength: 8, maxLength: 2048 }, tab_id: TAB }, ["url"]),
  tool("new_tab", false, "Ouvre un nouvel onglet, sur l'adresse indiquée ou sur la page d'accueil.",
    { url: { type: "string", description: "Adresse complète en http:// ou https:// (facultatif).", minLength: 8, maxLength: 2048 } }),
  tool("close_tab", false, "Ferme un onglet.", { tab_id: TAB }),
  tool("go_back", false, "Revient à la page précédente de l'onglet.", { tab_id: TAB }),
  tool("go_forward", false, "Avance à la page suivante de l'onglet.", { tab_id: TAB }),
  tool("reload", false, "Recharge la page de l'onglet.", { tab_id: TAB }),
  tool("get_page_content", true, "Lit le contenu principal d'une page (texte nettoyé et borné, titres) et la liste de ses éléments interactifs avec leurs repères.", { tab_id: TAB }),
  tool("get_page_metadata", true, "Renvoie les métadonnées d'une page : titre, adresse, description, auteur, langue, date de publication, adresse canonique.", { tab_id: TAB }),
  tool("extract_links", true, "Liste les liens d'une page (texte et adresse), éventuellement filtrés par un mot.",
    { tab_id: TAB, filter: { type: "string", description: "Ne garder que les liens dont le texte ou l'adresse contient ce mot.", maxLength: 100 } }),
  tool("extract_tables", true, "Extrait les tableaux d'une page (légende et lignes).", { tab_id: TAB }),
  tool("find_text", true, "Cherche un texte dans une page et renvoie les passages qui le contiennent.",
    { query: { type: "string", description: "Texte à chercher.", minLength: 1, maxLength: 200 }, tab_id: TAB }, ["query"]),
  tool("click_element", false, "Clique sur un élément de la page (lien, bouton).", { element: ELEMENT, tab_id: TAB }, ["element"]),
  tool("type_text", false, "Saisit un texte dans un champ de la page, et valide le formulaire si demandé.",
    { element: ELEMENT, text: { type: "string", description: "Texte à saisir.", maxLength: 2000 },
      submit: { type: "boolean", description: "Valider le formulaire après la saisie." }, tab_id: TAB }, ["element", "text"]),
  tool("scroll_page", false, "Fait défiler la page.",
    { direction: { type: "string", description: "Sens du défilement.", maxLength: 6, enum: ["up", "down", "top", "bottom"] }, tab_id: TAB }, ["direction"]),
  tool("take_screenshot", true, "Capture la zone visible de la page. L'image est montrée à l'utilisateur dans le journal ; tu n'en reçois que les dimensions.", { tab_id: TAB }),
  tool("get_active_tab", true, "Renvoie l'onglet actif et la liste des onglets ouverts (identifiant, titre, adresse)."),
  tool("search_web", false, "Lance une recherche sur le moteur choisi par l'utilisateur et renvoie les liens de la page de résultats.",
    { query: { type: "string", description: "Requête de recherche.", minLength: 1, maxLength: 300 } }, ["query"]),
  tool("compare_pages", true, "Lit le contenu de plusieurs onglets déjà ouverts pour les comparer.",
    { tab_ids: { type: "array", description: "Identifiants des onglets à comparer (2 à 4).", items: { type: "string", maxLength: 36 }, minItems: 2, maxItems: 4 } }, ["tab_ids"]),
  tool("save_to_notebook", false, "Propose d'enregistrer la page dans le Notebook de l'utilisateur. Toujours soumis à sa confirmation.",
    { mode: { type: "string", description: "link : lien seul ; text : contenu texte ; summary : contenu et synthèse ; selection : texte sélectionné.", maxLength: 9, enum: ["link", "text", "summary", "selection"] },
      summary: { type: "string", description: "Synthèse à joindre (mode summary).", maxLength: 8000 }, tab_id: TAB }, ["mode"]),
];
// </tools>

export const WIRE_PREFIX = "browser_";
export type ToolArgs = Record<string, string | boolean | string[]>;
export type ValidatedCall = { ok: true; tool: ToolSpec; args: ToolArgs } | { ok: false; error: string };

/** Nom d'outil tel que reçu du modèle (`browser_x`, `browser.x` ou `x`) → définition. */
export function findTool(name: unknown): ToolSpec | undefined {
  if (typeof name !== "string" || name.length > 64) return undefined;
  const canonical = name.replace(/^browser[._]/, "");
  return TOOLS.find((tool) => tool.name === canonical);
}

/**
 * Validation stricte : outil connu, arguments conformes au schéma, aucune propriété en trop,
 * aucun caractère de contrôle. Rien n'est corrigé ni deviné : un appel invalide est refusé.
 */
export function validateToolCall(name: unknown, rawArgs: unknown): ValidatedCall {
  const tool = findTool(name);
  if (!tool) return { ok: false, error: "unknown_tool" };
  let input: unknown = rawArgs;
  if (typeof rawArgs === "string") {
    if (rawArgs.length > 20_000) return { ok: false, error: "arguments_too_large" };
    try { input = rawArgs.trim() ? JSON.parse(rawArgs) : {}; } catch { return { ok: false, error: "invalid_json" }; }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "arguments_must_be_object" };
  const values = input as Record<string, unknown>;
  const { properties, required } = tool.parameters;
  for (const key of Object.keys(values)) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) return { ok: false, error: `unexpected_argument:${key.slice(0, 40)}` };
  }
  const args: ToolArgs = {};
  const badText = (value: string) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  for (const [key, spec] of Object.entries(properties)) {
    const value = values[key];
    if (value === undefined || value === null) {
      if (required.includes(key)) return { ok: false, error: `missing_argument:${key}` };
      continue;
    }
    if (spec.type === "boolean") {
      if (typeof value !== "boolean") return { ok: false, error: `invalid_argument:${key}` };
      args[key] = value;
    } else if (spec.type === "string") {
      if (typeof value !== "string" || value.length < (spec.minLength ?? 0) || value.length > spec.maxLength || badText(value)) {
        return { ok: false, error: `invalid_argument:${key}` };
      }
      if (spec.enum && !spec.enum.includes(value)) return { ok: false, error: `invalid_argument:${key}` };
      args[key] = value;
    } else {
      if (!Array.isArray(value) || value.length < spec.minItems || value.length > spec.maxItems ||
        !value.every((item) => typeof item === "string" && item.length <= spec.items.maxLength && !badText(item))) {
        return { ok: false, error: `invalid_argument:${key}` };
      }
      args[key] = value as string[];
    }
  }
  return { ok: true, tool, args };
}
