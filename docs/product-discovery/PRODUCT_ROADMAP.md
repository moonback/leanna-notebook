# Feuille de route produit — Leanna Notebook

## Principes de priorisation

- Sécuriser la confiance avant d'augmenter l'autonomie.
- Réutiliser le pipeline jobs / RAG / citations / quotas.
- Livrer des MVP mesurables, sans migration massive.
- Chaque sortie IA doit conserver sa provenance.
- Ne jamais interpréter « non trouvé » comme « inexistant ».

## Backlog classé

### P0 — Fondamentale
1. **#1 Cockpit de fiabilité documentaire** — score 8,25. Première brique de confiance.
2. **#2 Détecteur de lacunes et dossier incomplet** — score 8,65. Cas d'usage à forte valeur.
3. **#3 OCR et compréhension visuelle des scans** — score 7,55. Supprime une limite explicite d'ingestion.
4. **#4 Déduplication et versions intelligentes** — score 7,85. Qualité du corpus et fondation temporelle.

### P1 — Différenciation
5. **#5 Moteur de contradictions et évolution des faits** — score 8,95.
6. **#6 Raisonnement multi-sources traçable** — score 8,75.
7. **#7 Carte de connaissances navigable** — score 8,05.
8. **#8 Agents experts en équipe** — score 8,40.
9. **#9 Brief de décision avec scénarios** — score 8,45.
10. **#10 Studio avec provenance et versions** — score 7,75.

### P2 — Innovation
11. **#11 Recherche web comparative et réconciliation** — score 7,85.
12. **#12 Veille documentaire et détection de changements** — score 8,10.
13. **#13 Assistant de réunion et alignement audio-docs** — score 7,45.
14. **#14 Studio vocal pilotable et multi-agents** — score 8,00.
15. **#15 Générateur de workflows documentaires** — score 8,40.
16. **#16 Simulateur de scénarios et hypothèses** — score 7,95.
17. **#17 Mémoire de projet explicable** — score 8,45.

### P3 — Vision long terme
18. **#18 Connecteurs externes synchronisés** — score 7,10.
19. **#19 Espace de revue collaborative des preuves** — score 7,45.
20. **#20 Tuteur adaptatif de maîtrise des connaissances** — score 7,85.

## Feuille de route par horizon

### Court terme — 0 à 30 jours
- Valider le socle existant : tests, parcours d'import, 13 types Studio, partage, voix, Electron.
- Définir un corpus benchmark (10 à 20 dossiers synthétiques ou anonymisés) et mesurer retrieval, citations, latence et coût.
- Concevoir Cockpit de fiabilité en lecture seule ; instrumentation des statuts, erreurs et sources utilisées.
- Prototyper le détecteur de lacunes sur un objectif et un seul notebook.
- Tester OCR sur échantillon représentatif et comparer fournisseur / coût / confidentialité.
- Définir empreinte de document et stratégie de version sans écriture destructive.

**Livrables :** spécification UX, benchmark RAG, métriques baseline, schéma d'événements et critères de succès.

### Moyen terme — 30 à 90 jours
- Livrer Cockpit et checklist de complétude.
- Ajouter déduplication exacte et gestion manuelle des versions.
- Ajouter OCR PDF avec pages et bounding boxes.
- MVP de raisonnement multi-sources avec trace des sous-questions.
- Définir un modèle de faits atomiques et évaluer la précision sur données annotées.
- Préparer versionnage Studio et provenance du prompt/modèle/sources.

**Dépendances :** observabilité avant cockpit avancé ; OCR avant ingestion de dossiers scannés ; empreintes/versionnage avant analyse temporelle ; benchmark avant raisonnement multi-étapes.

### Long terme — 3 à 6 mois
- Déployer moteur de contradictions sur périmètre contrôlé.
- Ajouter graphe de connaissances et vue preuves.
- Ajouter brief de décision et scénarios.
- Lancer agents experts en séquence (pas en autonomie libre) avec budgets, permissions read-only et validation.
- Ajouter workflows linéaires et assistant de réunion.
- Étendre le Studio avec provenance et mise à jour ciblée.

**Dépendances :** extraction de faits et preuve atomique pour contradictions ; relations pour graphe ; orchestration job pour agents/workflows ; provenance/versioning pour réactualisation.

### Vision future — 6 à 12 mois
- Veille documentaire et alertes sur changements.
- Mémoire de projet explicable et revue collaborative.
- Connecteurs synchronisés, d'abord lecture seule et permissions minimales.
- Studio vocal commandable avec confirmation.
- Simulations métier et tuteur adaptatif.
- Déploiement de capacités avancées uniquement si coût, sécurité et adoption sont validés.

## Dépendances structurantes

| Fondation | Débloque |
|---|---|
| Benchmark RAG + observabilité | Mesure de toute amélioration IA |
| Preuve atomique (claim → chunk → source) | Contradictions, raisonnement, revue collaborative |
| Empreintes + versions | Temporalité, diff, impact sur artefacts, veille |
| OCR et extraction fiable | Dossiers scannés, formulaires, tableaux |
| Orchestration jobs + budget | Agents, workflows, tâches planifiées |
| Contrôle des permissions par outil | Connecteurs et agents sûrs |
| Provenance des générations | Studio réactualisable et auditabilité |

## Garde-fous de livraison

- Les agents commencent en lecture seule.
- Toute écriture, partage, suppression ou action externe nécessite confirmation.
- Limites explicites de temps, coût, tokens et nombre d'étapes.
- Les sorties structurées passent par Zod ; citations filtrées aux passages effectivement récupérés.
- Jobs idempotents, annulables, retryables et visibles.
- RLS testée avec plusieurs utilisateurs et rôles.
- Mesurer taux de citations valides, précision des contradictions, taux de faux positifs, coût par tâche, latence et taux d'approbation.
- Feature flags et rollout progressif pour les fonctionnalités à risque.

## KPI de pilotage

- Import : taux de réussite par format, délai jusqu'à ready, part des erreurs résolues.
- RAG : recall@k sur benchmark, exactitude de citation, taux de réponse « insuffisant » correct.
- Contradictions : précision / rappel sur corpus annoté, taux de faux conflits.
- Complétude : exigences correctement classées, taux de pièces manquantes confirmées.
- Studio : taux de génération aboutie, réutilisation, régénérations, temps jusqu'au livrable.
- Agentique : taux d'achèvement, interventions humaines, coût et actions refusées.
- Produit : activation, rétention par notebook, notebooks actifs, conversion par cas d'usage.

## Décision de séquencement recommandée

Ne pas démarrer par agents multi-étapes ou connecteurs. Le meilleur ordre est : **Cockpit de fiabilité → Détecteur de lacunes → Raisonnement multi-sources → Contradictions**. Ce séquencement construit la confiance, crée un cas d'usage distinctif et prépare une couche de connaissances structurée.
