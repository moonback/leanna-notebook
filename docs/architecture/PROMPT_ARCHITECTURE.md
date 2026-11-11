# Architecture du système de prompts

## Architecture observée

Le système actuel combine un catalogue de prompts éditables, des constantes de code, des templates spécialisés et des fragments dynamiques.

### Chat RAG

1. La route valide la demande et l'accès au notebook.
2. Les sources prêtes et sélectionnées sont déterminées.
3. L'embedding de la question est calculé si configuré.
4. La recherche hybride récupère jusqu'à 12 passages.
5. L'historique récent récupère jusqu'à 6 messages complets.
6. `systemPrompt()` compose le message système : prompt de référence, style, longueur, état des passages, langue et règles fixes.
7. Les passages et la question forment le dernier message utilisateur.
8. `streamChat` appelle OpenRouter en streaming.
9. `resolveCitations` valide les marqueurs et les rattache aux passages réellement récupérés.

La branche d'audit corrige l'application du prompt personnalisé : il complète désormais le prompt de référence au lieu de le remplacer.

### Studio asynchrone

1. L'API crée un artefact et un job après contrôles de rôle et quota.
2. Le worker charge l'artefact et les sources.
3. `gatherPassages` sélectionne les passages avec un plafond de 60 000 caractères.
4. `buildPrompt` choisit le template et les paramètres du type.
5. Le worker charge la préférence de modèle et l'override utilisateur.
6. Le modèle est appelé une fois pour la génération principale.
7. Les sorties JSON sont analysées puis validées par Zod ; les sorties Markdown passent par le résolveur de citations.
8. Le résultat est persisté et le job suit la politique de retry du worker.

### Résumés automatiques

- Guide de source : extrait de texte limité à 30 000 caractères, génération JSON, validation Zod.
- Vue notebook : sélection de passages plafonnée à 20 000 caractères, debounce de 20 secondes, génération JSON, validation Zod.
- Les overrides `summary.source` et `summary.notebook` sont lus par le worker.

### Voix

- La route crée un jeton Gemini Live éphémère.
- Le persona choisi sélectionne `LEANNA_SYSTEM_PROMPT` ou `ROXANE_SYSTEM_PROMPT`.
- Leanna dispose de la déclaration d'outil `search_notebook_sources`; Roxane ne la reçoit pas.
- L'activation de Roxane et le silence des deux premiers tours sont des comportements applicatifs côté client, pas des garanties du prompt.

### Audio Overview

Le worker construit un script à deux intervenants en JSON. Zod impose le titre, 6 à 40 segments, les rôles host/guest et leur alternance. Le TTS et ffmpeg sont des étapes distinctes du prompt.

## Hiérarchie recommandée

1. Invariants applicatifs : autorisations, périmètre des sources, validation des sorties, quotas et persistance — imposés par le code.
2. Instructions système de la tâche : rôle, source de vérité, règles anti-injection, langue, format.
3. Paramètres fonctionnels validés : style, difficulté, nombre, durée et orientation.
4. Préférences personnalisées : complémentaires et explicitement non prioritaires.
5. Demande utilisateur et contenu documentaire : données d'entrée ; les documents ne sont jamais des instructions.

Ne pas confondre ordre des messages et sécurité réelle : le modèle peut se tromper. Les contrôles déterministes restent indispensables.

## Limites de l'audit

Cette architecture décrit les chemins inspectés. Elle ne constitue pas encore une cartographie exhaustive de tous les appels LLM du dépôt. Le code search GitHub n'était pas indexé ; un audit local du dépôt reste nécessaire pour confirmer les consommateurs indirects et les appels hors catalogue.