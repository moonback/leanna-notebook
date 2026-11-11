# Catalogue des prompts IA

Ce catalogue a été confronté aux fichiers présents sur `main` le 11 novembre 2026.

## Sources de référence

| Fichier | Rôle |
|---|---|
| `apps/web/lib/ai/prompt-catalog.ts` | Catalogue UI : clés, libellés, groupes, descriptions et textes de référence |
| `apps/web/lib/ai/prompts/leanna.ts` | Prompt système vocal de Leanna |
| `apps/web/lib/ai/prompts/roxane.ts` | Prompt système vocal de Roxane |
| `apps/web/app/api/v1/settings/system-prompts/route.ts` | Lecture, sauvegarde et réinitialisation des personnalisations |
| `apps/web/app/api/v1/conversations/[id]/messages/route.ts` | Assemblage du prompt conversationnel |
| `apps/web/app/api/v1/notebooks/[id]/voice-token/route.ts` | Assemblage du prompt Gemini Live par persona |
| `apps/worker/src/studio/generate.ts` | Construction des prompts Studio et lecture des overrides |
| `apps/worker/src/studio/audio-overview.ts` | Instructions du script Audio Overview |

## Clés déclarées dans le catalogue

| Clé | Fonction |
|---|---|
| `chat` | Assistant conversationnel avec RAG |
| `studio.report` | Rapports |
| `studio.flashcards` | Fiches de révision |
| `studio.quiz` | Quiz |
| `studio.mind_map` | Cartes mentales |
| `studio.infographic` | Infographies |
| `studio.timeline` | Chronologies |
| `studio.comparison` | Tableaux comparatifs |
| `studio.glossary` | Glossaires |
| `studio.faq` | FAQ |
| `studio.diagram` | Diagrammes Mermaid |
| `studio.editorial` | Contenus éditoriaux |
| `studio.study_plan` | Plans d'étude |
| `studio.audio_overview` | Script Audio Overview |
| `summary.source` | Résumé d'une source |
| `summary.notebook` | Vue d'ensemble du notebook |
| `voice.leanna` | Persona vocale Leanna |
| `voice.roxane` | Persona vocale Roxane |

Le catalogue TypeScript est la source des clés acceptées par l'API. La contrainte SQL de `ai_prompt_overrides.prompt_key` doit rester synchronisée avec ces clés.

## Personnalisation et application

Les personnalisations sont enregistrées dans `public.ai_prompt_overrides`, avec une clé composite utilisateur/prompt et une limite SQL de 12 000 caractères. L'API exige une session utilisateur et vérifie que la clé appartient au catalogue.

Points d'application vérifiés :
- `chat` est lu par le handler de conversation et combiné aux instructions RAG de base.
- `voice.leanna` et `voice.roxane` sont lus lors de la création du jeton Gemini Live.
- Le worker Studio lit un override associé au type d'artefact et l'ajoute au prompt de génération.

Les clés `summary.source` et `summary.notebook` sont présentes dans le catalogue et dans la contrainte SQL ; leur chaîne d'application complète n'a pas été suivie dans cette passe.

## Règles de sécurité

Les sources documentaires doivent être traitées comme des données non fiables. Les prompts de chat et de génération rappellent de ne pas suivre les instructions contenues dans les passages et de ne pas inventer de citations. Une personnalisation utilisateur ne doit pas être considérée comme une frontière de sécurité : les autorisations, l'isolation des notebooks, la validation des sorties et la résolution des citations doivent rester imposées par le code.

Pour modifier le catalogue, mettre à jour ensemble le catalogue TypeScript, la contrainte SQL, les points de consommation et les tests concernés.
