/**
 * Version des prompts de personnages. 2 par défaut ; `PROMPTS_VERSION=1` (variable serveur) rétablit la
 * version précédente, conservée dans `legacy/`. Les personnalisations des utilisateurs (table
 * `ai_prompt_overrides`) sont ajoutées au prompt de référence quelle que soit la version : elles ne sont
 * jamais écrasées par un changement de version.
 */
export const PROMPTS_VERSION: 1 | 2 = process.env.PROMPTS_VERSION === "1" ? 1 : 2;

/** Section de prompt : un titre, puis une ligne par règle. */
export function section(title: string, ...lines: string[]): string {
  return [`## ${title}`, ...lines].join("\n");
}
