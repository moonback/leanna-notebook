# Inventaire des prompts — Leanna Notebook

> Audit distant du 11 novembre 2026. Inventaire fondé sur les fichiers accessibles et les chemins d'exécution inspectés. Le dépôt n'étant pas disponible dans l'index de recherche de code GitHub pendant cette passe, cet inventaire couvre les points d'entrée connus et les prompts référencés par le catalogue ; il ne prétend pas détecter chaque chaîne de prompt inline du dépôt.

## Catalogue utilisateur vérifié

Source : `apps/web/lib/ai/prompt-catalog.ts`. 18 clés sont déclarées.

| Clé | Fonction | Définition | Consommateur / état |
|---|---|---|---|
| `chat` | Assistant conversationnel RAG | `apps/web/lib/ai/prompts/chat.ts` | `apps/web/app/api/v1/conversations/[id]/messages/route.ts` — lu et assemblé avant `streamChat` |
| `studio.report` | Rapport | `prompt-catalog.ts` | `apps/worker/src/studio/generate.ts` — override appliqué au prompt Studio |
| `studio.flashcards` | Fiches | `prompt-catalog.ts` | Worker Studio — sortie JSON validée par Zod |
| `studio.quiz` | QCM | `prompt-catalog.ts` | Worker Studio — sortie JSON validée par Zod |
| `studio.mind_map` | Carte mentale | `prompt-catalog.ts` | Worker Studio — sortie JSON validée par Zod |
| `studio.infographic` | Infographie | `prompt-catalog.ts` | Worker Studio — Markdown et citations résolues |
| `studio.timeline` | Chronologie | `prompt-catalog.ts` | Worker Studio — Markdown et citations résolues |
| `studio.comparison` | Comparatif | `prompt-catalog.ts` | Worker Studio — Markdown et citations résolues |
| `studio.glossary` | Glossaire | `prompt-catalog.ts` | Worker Studio — Markdown et citations résolues |
| `studio.faq` | FAQ | `prompt-catalog.ts` | Worker Studio — Markdown et citations résolues |
| `studio.diagram` | Mermaid | `prompt-catalog.ts` | Worker Studio — Markdown et citations résolues |
| `studio.editorial` | Contenu éditorial | `prompt-catalog.ts` | Worker Studio — Markdown et citations résolues |
| `studio.study_plan` | Plan d'étude | `prompt-catalog.ts` | Worker Studio — Markdown et citations résolues |
| `studio.audio_overview` | Script audio dialogué | `prompt-catalog.ts` | Worker Studio + `audio-overview.ts` — JSON validé par Zod, puis TTS |
| `summary.source` | Résumé d'une source | `prompt-catalog.ts` | `apps/worker/src/studio/summaries.ts` — override lu par `guideHandler` |
| `summary.notebook` | Vue d'ensemble | `prompt-catalog.ts` | `apps/worker/src/studio/summaries.ts` — override lu par `overviewHandler` |
| `voice.leanna` | Persona vocale Leanna | `apps/web/lib/ai/prompts/leanna.ts` | `voice-token/route.ts` — injecté dans Gemini Live |
| `voice.roxane` | Persona vocale Roxane | `apps/web/lib/ai/prompts/roxane.ts` | `voice-token/route.ts` — injecté dans Gemini Live |

## Prompts et fragments internes hors catalogue

| Élément | Emplacement | Rôle / paramètres | Sortie |
|---|---|---|---|
| Règles fixes du chat | `apps/web/lib/ai/prompts/chat.ts` | Langue, citations [n], refus d'instructions dans les passages, Markdown | Réponse texte streamée |
| Assemblage du chat | `messages/route.ts` | Style notebook, consigne libre, longueur, présence de passages, langue | Message système + 6 messages d'historique max + question et passages |
| Templates Studio | `apps/worker/src/studio/generate.ts` | Rapport (briefing, study guide, blog, spécification, etc.), infographie, chronologie, comparaison, glossaire, FAQ, diagramme, éditorial, plan d'étude | Markdown |
| Instructions JSON Studio | `generate.ts` | Nombre/difficulté de fiches et quiz, structure de carte mentale | JSON, contrôlé par Zod |
| Règles communes Studio | `generate.ts` | Sources uniquement, documents non fiables, langue | Préfixe système |
| Script Audio Overview | `apps/worker/src/studio/audio-overview.ts` | Format, durée, style, deux rôles, alternance, langue, consigne éditoriale | JSON `{title, segments[]}` |
| Persona vocale Leanna | `prompts/leanna.ts` | Recherche obligatoire via outil pour question documentaire | Audio Gemini Live + appels d'outil |
| Persona vocale Roxane | `prompts/roxane.ts` | Challenge critique concis, sans répétition | Audio Gemini Live |
| Résumé de source | `summaries.ts` | 30 000 caractères max, langue, résumé et thèmes | JSON validé par Zod |
| Résumé notebook | `summaries.ts` | Passages échantillonnés, plafond 20 000 caractères, debounce 20 s | JSON validé par Zod |
| Recherche documentaire | `messages/route.ts` + RPC `match_chunks` | Embedding facultatif + plein texte, 12 passages max | Données RAG, pas un prompt autonome |
| Instructions de format | `generate.ts`, `audio-overview.ts` | Options de rapport, format, orientation, style visuel, détail, durée | Intégrées au message système |

## Construction et transmission

- Chat : `systemPrompt()` assemble le prompt de base, les préférences, la langue et les règles fixes ; historique récent limité à 6 messages ; jusqu'à 12 passages récupérés ; `streamChat` envoie la requête.
- Studio : `studioHandler` récupère les passages (plafond 60 000 caractères), sélectionne la clé d'override, construit le prompt par type, appelle le LLM OpenRouter puis valide / résout les citations.
- Résumés : worker `guideHandler` et `overviewHandler`, JSON strict et validation Zod.
- Voix : `voice-token/route.ts` assemble persona + personnalisation et crée un jeton Gemini Live à usage unique.
- Audio : le modèle rédige un script JSON, Zod le valide, ElevenLabs synthétise chaque segment et ffmpeg assemble le MP3.

## Limites de couverture

L'index de recherche de code GitHub était indisponible pour ce dépôt pendant l'audit. Les fichiers listés ici ont été récupérés directement par chemin. Les chaînes de prompt dispersées dans d'autres routes, agents, tests, migrations ou fichiers non référencés doivent encore être recherchées depuis un clone local. Le total « 18 » désigne uniquement les clés du catalogue utilisateur, pas le nombre total de fragments de prompt du code.

## Appels IA complémentaires repérés dans l'arbre du dépôt

L'exploration de l'arbre Git (260 fichiers) a permis d'identifier deux chemins supplémentaires hors catalogue :

| Élément | Emplacement | Instructions et données | Sortie / garde-fous |
|---|---|---|---|
| Suggestions d'images | `apps/web/app/api/v1/notebooks/[id]/artifacts/image-suggestions/route.ts` | Prompt de direction artistique, exactement 3 à 5 suggestions, extraits documentaires plafonnés à 18 000 caractères | JSON demandé, parsing + Zod, normalisation et plafonnement du nombre de suggestions |
| Génération d'image | `apps/worker/src/studio/image-generation.ts` | Brief utilisateur + contexte documentaire tronqué à 7 500 caractères, référence image facultative | API image OpenRouter, contrôle MIME/taille, stockage et versionnement |

Les suggestions d'images utilisent maintenant un message système dédié et un message utilisateur séparé pour les extraits. La génération d'image reste un endpoint multimodal distinct et ne fait pas partie des 18 clés du catalogue.

## Tests et validation repérés

Les tests unitaires du worker incluent notamment `apps/worker/src/studio/generate.test.ts` et `apps/worker/src/studio/audio-overview.test.ts`. Ils couvrent la validation des sorties, les citations, les formats Studio et les scripts Audio Overview. Des assertions ont été ajoutées pour vérifier la séparation des préférences personnalisées et des instructions système. Leur exécution reste à faire depuis un checkout local.
