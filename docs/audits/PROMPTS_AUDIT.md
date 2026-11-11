# Audit de qualité des prompts

Date : 11 novembre 2026  
Périmètre : fichiers de référence du catalogue, chat, Studio, résumés, voix et Audio Overview accessibles sur la branche `main`.

## Synthèse factuelle

- 18 clés déclarées dans `SYSTEM_PROMPT_CATALOG`.
- 18 clés possèdent un chemin de lecture identifié dans le code consulté : chat, 13 types Studio, 2 résumés et 2 personas vocales.
- Le nombre total de fragments inline n'est pas établi : l'index de code GitHub est indisponible et le dépôt n'a pas été cloné dans un environnement d'exécution.
- Une incohérence de comportement a été corrigée sur la branche d'audit : l'override du chat remplaçait le prompt par défaut alors que l'interface annonce un ajout complémentaire.
- Aucun test, typecheck, lint ou build n'a été exécuté dans cette passe distante.

## Constats classés

### P1 — Personnalisation du chat remplaçait les instructions de référence

**Fichier :** `apps/web/app/api/v1/conversations/[id]/messages/route.ts`  
**Avant :** `override?.trim() || CHAT_DEFAULT_INSTRUCTIONS`  
**Problème :** un override non vide supprimait le prompt de base. L'interface `system-prompts.tsx` indique pourtant que le texte personnalisé est ajouté au prompt de référence.  
**Risque :** perte de consignes de qualité générales et divergence entre le contrat UX et l'exécution.  
**Correction sur la branche :** le prompt par défaut est conservé ; l'override est encadré comme préférence complémentaire et explicitement subordonné aux règles de sources, citations, sécurité, confidentialité et format.  
**Validation :** modification GitHub confirmée ; tests non exécutés.

### P1 — Priorité des personnalisations non explicitée de manière homogène

**Fichiers :** `apps/worker/src/studio/generate.ts`, `apps/worker/src/studio/summaries.ts`, `apps/web/app/api/v1/notebooks/[id]/voice-token/route.ts`.  
**Constat :** les personnalisations sont ajoutées au message système ou émises dans un message système séparé, sans convention commune de délimitation et de priorité.  
**Risque :** instruction utilisateur contradictoire avec le schéma JSON, les règles de provenance ou le rôle de persona. Les contrôles applicatifs restent la vraie frontière de sécurité, mais l'ordre des instructions peut réduire la robustesse du modèle.  
**Recommandation :** injecter les préférences dans un bloc délimité, les qualifier de non prioritaires et maintenir les invariants techniques dans le code et dans le message système principal.

### P1 — Deux sources de vérité pour le prompt Studio

**Fichiers :** `prompt-catalog.ts` et `generate.ts`.  
**Constat :** le catalogue expose des consignes de référence (par exemple `studio.report`, `studio.infographic`) alors que le worker construit des tâches plus détaillées dans `TEMPLATES`, les branches de `buildPrompt` et les règles communes. L'override est appliqué, mais le texte de référence du catalogue n'est pas visiblement le template complet envoyé au modèle.  
**Risque :** l'utilisateur pense éditer le prompt effectif alors qu'il ne modifie qu'une couche d'instructions.  
**Recommandation :** distinguer dans l'UI « consigne complémentaire » et « prompt exécuté », ou unifier progressivement les définitions sans supprimer les règles structurantes.

### P1 — Traçabilité des citations hétérogène selon le type

**Fichiers :** `generate.ts`.  
**Constat :** les artefacts Markdown passent par `resolveCitations`; fiches, quiz et cartes mentales utilisent des références de passages validées via Zod et remappées contre les passages réellement fournis. Cette différence est acceptable mais doit être documentée et testée séparément.  
**Risque :** une sortie textuelle sans marqueur vérifiable peut survivre sans citation associée ; les données structurées peuvent omettre `n` puisque ce champ est optionnel.  
**Recommandation :** ajouter des tests de couverture des affirmations et définir les cas où une absence de citation est admise.

### P2 — Résumés automatiques utilisent un échantillonnage déterministe

**Fichier :** `apps/worker/src/studio/generate.ts` et `summaries.ts`.  
**Constat :** guide source : 30 000 caractères max ; aperçu notebook : 20 000 caractères max et passages échantillonnés uniformément par source.  
**Risque :** un fait situé dans une zone non sélectionnée peut être omis ; le résumé peut donner une impression de couverture totale.  
**Recommandation :** signaler que le résumé est une synthèse des extraits sélectionnés, et envisager une sélection par pertinence ou une synthèse hiérarchique pour les grands corpus.

### P2 — Historique conversationnel limité et non résumé

**Fichier :** `messages/route.ts`.  
**Constat :** six messages complets récents sont injectés ; aucun mécanisme de résumé de conversation n'est visible dans ce chemin.  
**Risque :** perte d'une décision ou d'un référent ancien dans une conversation longue.  
**Recommandation :** mesurer le besoin avant d'introduire une mémoire de conversation ; préserver les contraintes et décisions explicites plutôt que d'ajouter tout l'historique.

### P2 — Prompt vocal Leanna et Roxane spécialisés, mais invariants partiellement dépendants du modèle

**Fichiers :** `prompts/leanna.ts`, `prompts/roxane.ts`, `voice-token/route.ts`.  
**Constat :** Leanna doit appeler `search_notebook_sources` pour les questions documentaires ; Roxane doit challenger sans répéter. Le comportement silencieux des deux premiers tours est piloté côté client et doit rester testé hors prompt.  
**Risque :** le prompt ne peut garantir à lui seul que l'outil est appelé ou que Roxane reste silencieuse.  
**Recommandation :** garder l'activation, les tours silencieux et les autorisations dans le code ; tester les contrats d'outil et la logique client séparément.

### P2 — Parsing Audio Overview par extraction de la première à dernière accolade

**Fichier :** `audio-overview.ts`.  
**Constat :** `parseAudioOverviewScript` extrait le segment entre la première et la dernière accolade, puis valide avec Zod.  
**Risque :** des accolades parasites ou une réponse mal formée peuvent provoquer un rejet ; le retry dépend du worker.  
**Recommandation :** tester les cas de clôture Markdown, texte avant/après JSON, accolades dans les chaînes et JSON tronqué.

### P3 — Gestionnaire de prompts incomplet au regard du besoin avancé

**Fichiers :** `system-prompts.tsx`, route API, table `ai_prompt_overrides`.  
**Présent :** recherche, catégories, prompt de référence, édition, sauvegarde et reset ; overrides par utilisateur limités à 12 000 caractères.  
**Non repéré :** versionnage, diff, restauration d'une version antérieure, prévisualisation des variables, estimation de tokens, test sandbox, graphe de dépendances et statut d'utilisation.  
**Recommandation :** commencer par afficher la composition réelle et les dépendances, puis ajouter l'historique transactionnel.

## Cohérence des consignes

- Le chat utilise un prompt par défaut anglais avec des règles fixes en anglais et une langue de sortie dynamique ; cela fonctionne potentiellement, mais augmente le mélange linguistique du contexte.
- Les passages sont explicitement traités comme données non fiables dans le chat, Studio, Audio Overview et Leanna.
- Les contraintes de sortie structurée sont contrôlées dans le code pour les fiches, quiz, cartes mentales, résumés et script audio.
- Les règles de citations sont les plus strictes dans le chat ; les sorties Studio Markdown sont normalisées par le résolveur de citations.
- Les prompts ne constituent pas une frontière de sécurité : autorisations, RLS, sélection de sources, validation Zod et résolution des citations doivent rester côté code.

## Scores

Aucun score numérique avant/après n'est publié : il n'existe pas de benchmark exécuté dans cette passe. Les pondérations proposées sont conservées dans `docs/testing/PROMPT_EVALUATION.md`. Attribuer des notes sans tests de référence serait trompeur.

## Modifications réellement effectuées

- Chat : maintien du prompt de référence lorsqu'un override existe ; encadrement de la personnalisation comme préférence complémentaire et non prioritaire.
- Les autres constats restent des recommandations à traiter après couverture locale complète et tests de non-régression.

### P1 — Personnalisation vocale insuffisamment hiérarchisée

**Fichier :** `apps/web/app/api/v1/notebooks/[id]/voice-token/route.ts`.  
**Constat initial :** l'override vocal était concaténé directement après le prompt persona, sans délimitation ni rappel explicite de priorité.  
**Correction sur cette branche :** l'override est désormais encadré comme personnalisation complémentaire, explicitement subordonnée au persona, à l'ancrage documentaire, à l'utilisation des outils et aux contraintes de sécurité/confidentialité.  
**À valider :** tests de composition et essais Gemini Live réels non exécutés.

### P1 — Suggestions d'images : instructions et documents dans le même message utilisateur

**Fichier :** `apps/web/app/api/v1/notebooks/[id]/artifacts/image-suggestions/route.ts`.  
**Constat initial :** les consignes de direction artistique et les extraits documentaires étaient concaténés dans un seul message `user`. La défense contre l'injection documentaire reposait donc sur une instruction incluse dans ce même message.  
**Correction sur cette branche :** consignes et schéma JSON déplacés dans un message `system` dédié ; extraits transmis séparément dans un message `user` délimité. La validation Zod et la normalisation restent inchangées.  
**À valider :** tests d'injection documentaire, modèles compatibles JSON mode et sorties invalides non exécutés.

### Limite de couverture mise à jour

L'arbre Git du commit audité contient 260 fichiers et a été énuméré. Les chemins image et voix supplémentaires ont été inspectés. Cela améliore la couverture par rapport au seul catalogue, mais ne prouve pas que chaque appel LLM ou chaque chaîne inline de tous les fichiers TypeScript/JavaScript a été analysé : la recherche de code GitHub reste indisponible et aucun clone local n'a été utilisé.

## Harmonisation des personnalisations — seconde passe

### Studio et Audio Overview

**Constat :** `buildPrompt()` plaçait la consigne libre `customPrompt` dans le message système ; l'override du catalogue était ensuite concaténé au même message. Audio Overview faisait de même avec sa consigne éditoriale.  
**Correction :** les règles de tâche, d'ancrage documentaire et de format restent dans le message système. Les personnalisations libres et les overrides du catalogue sont désormais transmis dans des messages utilisateur distincts, encadrés et explicitement non prioritaires. Les passages restent séparés dans leur propre bloc.  
**Tests ajoutés / adaptés :** vérification que les personnalisations Studio et Audio Overview ne sont plus présentes dans le message système et que les sources gardent leur message séparé. Exécution non réalisée à ce stade.

### Résumés automatiques

**Constat :** les overrides `summary.source` et `summary.notebook` étaient transmis comme messages système supplémentaires avant les règles fixes.  
**Correction :** ils sont maintenant transmis comme préférences complémentaires dans un message utilisateur distinct ; le schéma JSON, le périmètre documentaire et les règles de langue restent dans le système.

### Limite résiduelle du gestionnaire de prompts

Le catalogue expose des textes par défaut pour Studio, mais les chemins d'exécution utilisent leurs propres templates dans `generate.ts` / `audio-overview.ts`. Le texte du catalogue est lu comme override personnalisé ; il ne constitue pas à lui seul le prompt réellement exécuté. L'interface doit donc présenter explicitement la composition effective (template applicatif + override + options + règles + sources) afin d'éviter de laisser croire que l'éditeur affiche l'intégralité du prompt runtime.

### Seconde passe — Studio, Audio Overview et résumés

Les personnalisations Studio et Audio Overview ainsi que les overrides des résumés sont désormais transmis comme messages utilisateur complémentaires ; les règles de tâche et de format restent au niveau système. Les tests unitaires existants de génération Studio et Audio Overview ont été adaptés pour contrôler cette séparation. Un import de test contenant un retour à la ligne échappé littéralement a également été corrigé. Aucun test n'a été exécuté à distance.

### Gestionnaire de prompts — transparence du prompt runtime

L'interface `apps/web/app/settings/system-prompts.tsx` distingue maintenant les textes de référence du catalogue des prompts réellement assemblés par le worker pour Studio et les résumés. Elle précise le mode d'injection des personnalisations pour les familles Studio/résumés, chat et voix. Cela corrige une ambiguïté de l'interface qui laissait entendre que chaque texte personnalisé était toujours ajouté directement au prompt système et que le texte affiché représentait l'intégralité du prompt exécuté.
