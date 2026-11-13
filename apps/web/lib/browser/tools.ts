// Définitions des outils de l'agent de navigation déclarées au modèle.
// Le bloc <tools> est la copie exacte de apps/desktop/src/browser/agent-tools.ts, où se trouve la validation
// qui fait autorité (processus Main). lib/browser/tools.test.ts échoue si les deux copies divergent.
import type { ToolDefinition } from "@/lib/ai/openrouter";

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

/**
 * Outils proposés au modèle. En mode observation, seuls les outils de lecture sont déclarés : le modèle
 * n'est pas tenté d'appeler ce qui serait de toute façon refusé par Main.
 */
export function toolDefinitions(mode: "observation" | "assistance" | "autonomous"): ToolDefinition[] {
  return TOOLS.filter((tool) => mode !== "observation" || tool.readOnly).map((tool) => ({
    type: "function",
    function: { name: WIRE_PREFIX + tool.name, description: tool.description, parameters: tool.parameters as unknown as Record<string, unknown> },
  }));
}
