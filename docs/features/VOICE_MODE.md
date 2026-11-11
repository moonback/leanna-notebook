# Mode vocal — Leanna et Roxane

Le mode vocal utilise Gemini Live en audio bidirectionnel. Le client capture le microphone, transmet les trames audio au service Live, joue les trames audio de réponse et affiche les transcriptions. Le serveur émet un jeton éphémère ; la clé Gemini reste côté serveur.

## Personas et activation de Roxane

- Leanna est la spécialiste documentaire et possède l'outil `search_notebook_sources`.
- Roxane est une co-animatrice critique distincte. Son prompt lui demande de relever les hypothèses, limites, contradictions et informations manquantes sans répéter inutilement Leanna.
- Roxane est désactivée par défaut dans le composant vocal (`roxaneEnabled = false`) et peut être activée/désactivée pendant la session.
- La logique `shouldInviteRoxane` garde Roxane silencieuse pendant les deux premiers échanges et l'invite à partir du troisième.
- La persona choisie est envoyée à `/api/v1/notebooks/:id/voice-token`, qui assemble le prompt correspondant.

## Recherche et citations

Leanna peut appeler `search_notebook_sources`. La route `/voice-search` limite la recherche au notebook courant, aux sources prêtes et aux sources sélectionnées par l'utilisateur. Elle renvoie les extraits avec titre, page ou horodatage et offsets de caractères.

Le client accumule les citations d'un même tour, déduplique les plages identiques et attend la fin de toutes les recherches asynchrones avant de finaliser le tour. Les références sont ainsi isolées d'un tour vocal au suivant.

## Jeton et configuration

Le handler utilise le modèle `gemini-3.8-live`, une clé `GEMINI_API_KEY` côté serveur et des jetons à usage unique. L'expiration de jeton demandée est de 30 minutes ; la fenêtre de création de session est d'une minute. Les voix préconstruites autorisées sont Aoede, Charon, Fenrir, Kore, Puck, Leda, Orus et Zephyr.

## Fichiers de référence

- `apps/web/app/notebook/[id]/voice-assistant.tsx`
- `apps/web/app/notebook/[id]/voice-turn.ts`
- `apps/web/app/notebook/[id]/voice-turn.test.ts`
- `apps/web/app/api/v1/notebooks/[id]/voice-token/route.ts`
- `apps/web/app/api/v1/notebooks/[id]/voice-search/route.ts`
- `apps/web/lib/ai/prompts/leanna.ts`
- `apps/web/lib/ai/prompts/roxane.ts`

Les tests unitaires couvrent notamment la règle des deux premiers tours silencieux, la déduplication des citations et l'attente des recherches RAG concurrentes. Leur exécution n'a pas été effectuée pendant cette passe.
