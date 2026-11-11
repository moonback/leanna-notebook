# Évaluation et tests des prompts

## Grille de notation (100 points)

| Critère | Poids | Mesure observable |
|---|---:|---|
| Compréhension des intentions | 20 | Objectif et sous-objectifs correctement identifiés |
| Cohérence logique | 15 | Absence de contradictions et respect de la hiérarchie |
| Pertinence | 15 | Réponse centrée sur la demande et complète |
| Fiabilité des sources | 15 | Affirmations supportées, citations valides, inconnues signalées |
| Qualité du raisonnement | 10 | Liens explicites, nuances, pas de conclusions non fondées |
| Format de sortie | 10 | Validation du schéma et des contraintes de rendu |
| Robustesse | 10 | Résistance aux ambiguïtés, injections et données manquantes |
| Efficacité tokens | 5 | Tokens utiles par résultat correct, sans dégrader les autres critères |

Aucun score initial ou final n'est attribué dans ce document : aucun benchmark modèle n'a été exécuté pendant l'audit distant.

## Tests automatisés à maintenir

### Composition

- Un override de chat ne supprime jamais le prompt de référence.
- Les préférences personnalisées ne peuvent pas modifier les invariants de citations, sources et langue.
- La composition des prompts inclut seulement les options applicables.
- Le prompt final respecte les plafonds de taille.

### Compréhension et RAG

- Question simple, question multi-intention, ambiguïté et clarification nécessaire.
- Référence à un message précédent.
- Source unique et corpus multi-source.
- Information absente : réponse explicite sans invention.
- Sources contradictoires : désaccord et provenance séparés.
- Injection d'instructions dans un document : ignorée.
- Historique long : contraintes et référents pertinents conservés.

### Studio

- Chaque type accepté par l'API a un test de composition.
- Infographie : chiffres absents non inventés.
- Chronologie : dates non explicites non déduites.
- Comparatif : valeurs absentes indiquées.
- Quiz : une seule bonne réponse et index dans les limites.
- Flashcards : structure et cardinalité valides.
- Mind map : profondeur et taille contrôlées.
- Markdown : citations résolues, marqueurs inconnus supprimés.
- JSON invalide : rejet et retry borné.

### Résumés et voix

- Guide et aperçu : JSON valide, limites de champs et sources insuffisantes.
- Leanna : appel d'outil sur question documentaire.
- Roxane : pas de répétition, pas d'affirmation sans extrait.
- Deux premiers tours silencieux : test du code client existant.
- Audio : alternance host/guest, nombre de segments, script JSON tronqué et TTS indisponible.

## Jeux de données

Conserver des fixtures versionnées :
- documents courts et longs ;
- documents contradictoires ;
- documents contenant une injection prompt ;
- corpus sans réponse ;
- questions multi-intentions ;
- extraits avec pages et offsets ;
- réponses modèles valides et invalides.

## Mesures

Enregistrer par cas : version du prompt, modèle, options, tokens entrée/sortie, latence, nombre d'appels, score de citation, résultat du schéma et verdict de l'évaluateur. Les appels réels doivent être distingués des tests mockés.

## Statut de cette passe

Les fichiers de test existants n'ont pas pu être recensés exhaustivement ni exécutés depuis l'API distante. Aucun résultat de test IA réel n'est revendiqué. La validation doit être faite après checkout de la branche dans l'environnement local du projet.

## Tests ajoutés dans la seconde passe

- `apps/worker/src/studio/generate.test.ts` : vérifie que la personnalisation libre Studio est un message utilisateur distinct et n'apparaît pas dans le message système.
- `apps/worker/src/studio/audio-overview.test.ts` : vérifie la même séparation pour les consignes éditoriales Audio Overview.
- Correction d'un retour à la ligne échappé littéralement dans l'import de ce dernier fichier de test, qui empêchait son parsing TypeScript.

Ces tests ont été modifiés mais ne sont pas exécutés dans cet environnement distant. Les parcours de résumés automatiques et l'injection d'overrides de catalogue dans le handler Studio nécessitent encore des tests dédiés.
