# Studio

Le Studio permet de créer des artefacts sourcés à partir des sources du notebook. La route de création accepte les 23 formats documentaires et pédagogiques du Studio, ainsi que le type d'image IA lorsqu'il est activé.

## Formats exposés par l'interface et l'API

| Type | Usage |
|---|---|
| `report` | Rapport, synthèse ou document structuré |
| `flashcards` | Fiches question / réponse |
| `quiz` | Questionnaire à choix multiples |
| `mind_map` | Carte mentale hiérarchique |
| `audio` | Audio Overview dialogué à deux voix |
| `infographic` | Synthèse visuelle structurée |
| `timeline` | Chronologie des événements datés |
| `comparison` | Tableau comparatif |
| `glossary` | Glossaire |
| `faq` | Questions fréquentes |
| `diagram` | Diagramme Mermaid |
| `editorial` | Article, newsletter ou contenu éditorial |
| `study_plan` | Plan d'étude |
| `one_pager` | Synthèse exécutive d'une page |
| `swot` | Matrice Forces / Faiblesses / Opportunités / Menaces |
| `decision_tree` | Arbre de décision et critères de choix |
| `memo` | Fiche mémo de mémorisation rapide |
| `raci` | Matrice des responsabilités RACI |
| `case_study` | Étude de cas structurée |
| `literature_review` | Revue critique et croisée des sources |
| `presentation_script` | Script oral organisé slide par slide |
| `roadmap` | Feuille de route avec phases et jalons |
| `troubleshooting` | Guide de diagnostic et de dépannage rapide |

Les types sont déclarés dans `apps/web/app/notebook/[id]/studio.tsx` et acceptés par le schéma Zod de `apps/web/app/api/v1/notebooks/[id]/artifacts/route.ts`.

## Nouveaux formats documentaires

Les dix formats ajoutés sont des artefacts Markdown sourcés, générés par des instructions spécialisées dans le worker. Les tableaux (SWOT, RACI et revue de littérature) utilisent le rendu Markdown existant ; l'arbre de décision peut inclure un diagramme Mermaid. Les rôles, dates, échéances, causes et recommandations absents du corpus doivent être explicitement signalés comme inconnus ou à définir, jamais inventés.

## Génération

La création est asynchrone : l'API valide le rôle `editor`, réserve quota et artefact/job via la fonction SQL `create_artifact`, puis répond HTTP 202. Le worker traite le job, récupère les passages, construit le prompt selon le type, valide les sorties structurées lorsque nécessaire et résout les citations contre les passages fournis.

Les options communes exposées par l'API incluent langue, modèle de rapport, difficulté, quantité, format, durée, style, orientation, style visuel, niveau de détail et périmètre de sources. Toutes les options ne s'appliquent pas à chaque type.

## Infographie et chronologie

- L'infographie est un type pris en charge par l'UI, l'API et le worker. Le prompt worker demande une synthèse visuelle en Markdown avec chiffres clés, étapes, comparaisons et citations ; les options visuelles comprennent orientation, style et niveau de détail.
- La chronologie est un type pris en charge par l'UI, l'API et le worker. Le prompt demande de n'extraire que les événements explicitement datés et d'associer les citations.
- Ces constats confirment le chemin de génération dans le code, pas une validation visuelle exhaustive de tous les résultats de modèles.

## Formats non exposés

La base déclare aussi des valeurs d'artefact historiques ou futures, notamment `slide_deck` et `video`. Elles ne figurent pas dans l'enum Zod de création inspecté et ne doivent donc pas être annoncées comme formats Studio disponibles sur la seule base de leur présence SQL.

Voir aussi le [guide Studio](../user-guide/USE_STUDIO.md) et la [référence API](../API_REFERENCE.md).
