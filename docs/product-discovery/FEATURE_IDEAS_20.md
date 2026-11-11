# 20 fonctionnalités — Leanna Notebook

- Date : 11 novembre 2026
- Base : audit statique du code `main` au commit `f3269ec`
- Les 20 propositions ci-dessous sont nouvelles ou approfondissent explicitement un existant ; elles ne sont pas présentées comme déjà livrées.

## Méthode de notation

Notes de 1 à 10. Faisabilité élevée = note haute (plus simple / plus réaliste). Score global = Valeur × 0,30 + Innovation × 0,20 + Différenciation × 0,20 + Commercial × 0,15 + Faisabilité × 0,15. Les notes sont des estimations produit, à réviser après discovery utilisateurs et mesure des coûts.

| # | Fonctionnalité | Priorité | Valeur | Innov. | Diff. | Comm. | Fais. | Score /10 |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | Cockpit de fiabilité documentaire | P0 | 9 | 7 | 8 | 9 | 8 | **8,25** |
| 2 | Détecteur de lacunes et dossier incomplet | P0 | 9 | 9 | 9 | 9 | 7 | **8,70** |
| 3 | OCR et compréhension visuelle des scans | P0 | 9 | 6 | 7 | 8 | 7 | **7,55** |
| 4 | Déduplication et versions intelligentes | P0 | 8 | 7 | 8 | 8 | 8 | **7,85** |
| 5 | Moteur de contradictions et évolution des faits | P1 | 10 | 9 | 10 | 9 | 6 | **9,05** |
| 6 | Raisonnement multi-sources traçable | P1 | 10 | 8 | 9 | 9 | 7 | **8,80** |
| 7 | Carte de connaissances navigable | P1 | 8 | 9 | 9 | 8 | 6 | **8,10** |
| 8 | Agents experts en équipe | P1 | 9 | 9 | 9 | 9 | 6 | **8,55** |
| 9 | Brief de décision avec scénarios | P1 | 9 | 8 | 9 | 9 | 7 | **8,50** |
| 10 | Studio avec provenance et versions | P1 | 8 | 7 | 8 | 8 | 8 | **7,80** |
| 11 | Recherche web comparative et réconciliation | P2 | 8 | 8 | 8 | 8 | 7 | **7,85** |
| 12 | Veille documentaire et détection de changements | P2 | 8 | 9 | 9 | 9 | 6 | **8,25** |
| 13 | Assistant de réunion et alignement audio-docs | P2 | 8 | 7 | 7 | 8 | 7 | **7,50** |
| 14 | Studio vocal pilotable et multi-agents | P2 | 8 | 9 | 9 | 8 | 6 | **8,10** |
| 15 | Générateur de workflows documentaires | P2 | 9 | 9 | 9 | 9 | 6 | **8,55** |
| 16 | Simulateur de scénarios et hypothèses | P2 | 8 | 9 | 9 | 8 | 6 | **8,10** |
| 17 | Mémoire de projet explicable | P2 | 9 | 8 | 9 | 9 | 7 | **8,50** |
| 18 | Connecteurs externes synchronisés | P3 | 8 | 6 | 7 | 9 | 5 | **7,10** |
| 19 | Espace de revue collaborative des preuves | P3 | 8 | 7 | 8 | 8 | 6 | **7,50** |
| 20 | Tuteur adaptatif de maîtrise des connaissances | P3 | 8 | 8 | 8 | 8 | 7 | **7,85** |

## P0 — Fondamentales

### 1. Cockpit de fiabilité documentaire
- **Problème :** l'utilisateur voit les sources et les citations, mais ne dispose pas d'une vue synthétique de la qualité du corpus et de la couverture des réponses.
- **Fonctionnement / parcours :** onglet « Fiabilité » dans le notebook ; tableau des sources avec statut d'extraction, pages/segments couverts, dernière indexation, doublons potentiels, erreurs, date et citations utilisées. Une réponse peut ouvrir un panneau « preuves » montrant passages retenus, passages concurrents et limites.
- **IA :** calcule des indicateurs déterministes d'abord (statut, couverture, fraîcheur, présence de citation), puis signale les zones faibles sans prétendre calculer une vérité absolue.
- **UI :** scorecard non opaque, filtres par source/état, timeline d'ingestion, détail par réponse.
- **Exemple :** avant de partager une synthèse, l'utilisateur voit que deux PDF sont encore en échec et que la conclusion n'est couverte que par une source.
- **Innovation / avantage :** fait de la transparence une fonction produit centrale plutôt qu'un simple affichage de citations.
- **Technique :** réutiliser sources, chunks, jobs, citations et états ; nouveaux agrégats backend / endpoint ; frontend cockpit. DB : éventuellement table snapshots de qualité, sinon calcul à la demande. Aucun fournisseur requis. Complexité **moyenne**.
- **Mesures :** baisse des réponses partagées avec sources en échec ; taux d'ouverture des preuves ; temps de résolution des imports.

### 2. Détecteur de lacunes et dossier incomplet
- **Problème :** l'utilisateur ne sait pas quelles pièces ou informations manquent pour répondre à son objectif.
- **Fonctionnement :** l'utilisateur décrit un objectif (ex. préparer une due diligence, comparer des offres, constituer un dossier de financement). Le système construit une checklist de preuves attendues, relie chaque exigence aux passages disponibles et classe « couvert / partiel / absent / contradictoire ». L'utilisateur peut ajouter une pièce manquante ou accepter une question de clarification.
- **IA :** extraction structurée des exigences, mapping vers les passages RAG, justification et citation pour chaque statut. Les absences sont formulées comme « non trouvé dans le corpus », jamais comme « inexistant ».
- **UI :** panneau objectif, checklist interactive, taux de couverture, bouton « rechercher une pièce ».
- **Exemple :** dossier d'appel d'offres : critères présents, attestation d'assurance non trouvée, date de validité incertaine.
- **Innovation :** transforme le notebook de bibliothèque passive en assistant de complétude métier.
- **Technique :** réutiliser chat RAG, citations, Studio action_plan/specification et jobs ; nouveau modèle `dossier`, `requirement`, `evidence_link`, routes et UI. LLM structuré + validation Zod. Complexité **élevée**.
- **MVP :** checklist créée depuis un prompt objectif, couverture sur 1 notebook, export Markdown.

### 3. OCR et compréhension visuelle des scans
- **Problème :** le code PDF rejette explicitement les scans avec `needs_ocr`; certains documents clés restent donc inutilisables.
- **Fonctionnement :** détection des pages sans couche texte, OCR page par page, conservation de la géométrie et de l'ordre de lecture ; correction manuelle des zones incertaines.
- **IA :** OCR classique puis modèle vision seulement pour tableaux, formulaires ou zones complexes ; ne pas confondre OCR et compréhension sémantique.
- **UI :** aperçu page avec texte extrait, surlignage de confiance et édition ciblée.
- **Exemple :** contrat scanné, attestation photographiée ou formulaire papier.
- **Différenciation :** ingestion réellement inclusive des dossiers métier, avec preuve page par page.
- **Technique :** étendre `extract.ts`, jobs et chunker ; stockage OCR et bounding boxes ; service OCR local ou cloud sélectionnable. Sécurité fichiers et coûts à cadrer. Complexité **élevée**.
- **MVP :** OCR PDF scanné français/anglais, texte indexable avec page d'origine.

### 4. Déduplication et versions intelligentes
- **Problème :** importer plusieurs fois un document ou des versions successives brouille les résultats RAG.
- **Fonctionnement :** empreinte binaire + empreinte textuelle normalisée ; détection exacte et quasi-doublons ; groupe de versions, comparaison des modifications et choix de version active.
- **IA :** extraction des changements significatifs et résumé « ce qui a changé », avec références aux deux versions.
- **UI :** badge doublon/version, vue diff, conserver les deux / remplacer / archiver.
- **Exemple :** contrat v3 reçu par email ; Leanna signale que le délai de résiliation a changé.
- **Innovation :** ajoute une temporalité documentaire et évite les réponses fondées sur une ancienne version.
- **Technique :** réutiliser ingestion/chunks ; hash et parent_version_id, table document_groups ou colonnes version ; tâche asynchrone et diff frontend. Complexité **moyenne**.
- **MVP :** empreinte exacte, avertissement doublon et association manuelle de versions.

## P1 — Différenciation

### 5. Moteur de contradictions et évolution des faits
- **Problème :** deux sources peuvent affirmer des choses incompatibles ; le RAG peut sélectionner une seule version sans avertir.
- **Fonctionnement :** extraction de faits atomiques (sujet, prédicat, valeur, unité, période, source, date) puis rapprochement par entité et période. Les contradictions sont affichées en paires ou séries, jamais fusionnées silencieusement.
- **IA :** classification contradiction / évolution temporelle / différence de périmètre / simple variation ; chaque affirmation garde son passage source et son niveau de certitude.
- **UI :** centre « Divergences », filtres par gravité/date, résolution « confirmé / obsolète / périmètre différent / à vérifier ».
- **Exemple :** deux contrats indiquent des montants différents ; le système explique qu'ils portent sur deux périodes distinctes ou qu'une incohérence demeure.
- **Innovation :** le produit ne se contente plus de répondre, il surveille la cohérence interne du savoir.
- **Technique :** réutiliser chunks, embeddings, citations et worker ; nouvelle table facts/claims, relations contradiction, jobs d'extraction et endpoint. PostgreSQL + pgvector suffisent au MVP ; graphe dédié non requis. Complexité **très élevée**.
- **MVP :** extraction de faits numériques/dates sur 2-10 documents, validation humaine obligatoire.

### 6. Raisonnement multi-sources traçable
- **Problème :** les réponses sont sourcées mais la chaîne de raisonnement entre plusieurs pièces reste peu visible.
- **Fonctionnement :** décomposer une question complexe en sous-questions, rechercher séparément, construire une réponse composée et afficher un graphe « affirmation → preuves → déduction ».
- **IA :** planificateur léger, retrieval par sous-question, synthèse finale ; chaque conclusion étiquetée preuve directe, inférence ou information manquante.
- **UI :** réponse standard + bouton « voir le raisonnement sourcé » ; chaque étape ouvre les passages.
- **Exemple :** établir si une entreprise respecte un engagement en croisant contrat, facture et rapport.
- **Innovation :** auditabilité du raisonnement plutôt que citations décoratives.
- **Technique :** réutiliser `match_chunks`, formatPassages, citations, jobs et LLM ; table optionnelle de traces ; limites de profondeur/coût. Complexité **élevée**.
- **MVP :** plan en 3 sous-questions et arbre de preuve pour une réponse.

### 7. Carte de connaissances navigable
- **Problème :** résumé et carte mentale existent, mais aucune vue transversale durable des entités, thèmes et relations n'est prouvée.
- **Fonctionnement :** graphe des personnes, organisations, concepts, événements, lieux, documents et liens ; zoom du notebook au passage ; filtre temporel et par source.
- **IA :** extraction d'entités/relations, fusion prudente, alias et liens pondérés ; chaque arête doit pointer vers une preuve.
- **UI :** canvas interactif, panneau de détails, recherche, filtres, « pourquoi ce lien ? ».
- **Exemple :** suivre les dépendances entre un client, ses contrats, factures et échéances.
- **Innovation :** visualisation vivante du corpus, pas seulement un diagramme généré ponctuellement.
- **Technique :** réutiliser chunks/embeddings/Studio mind_map ; tables entities, aliases, relations, evidence ; UI graphe (librairie à sélectionner). Complexité **élevée**.
- **MVP :** graphe par notebook limité à 500 nœuds, entités et relations sourcées.

### 8. Agents experts en équipe
- **Problème :** un seul prompt généraliste doit couvrir recherche, critique, synthèse et vérification.
- **Fonctionnement :** un orchestrateur distribue une mission à des agents spécialisés (Analyste, Vérificateur, Synthétiseur, Contradicteur). Ils partagent un plan, pas des permissions implicites ; le résultat est consolidé.
- **IA :** tâches bornées, sorties JSON validées, outils en liste blanche, budget tokens/temps, arrêt et validation humaine avant actions externes.
- **UI :** brief de mission, plan, état de chaque agent, preuves et désaccords, bouton approuver.
- **Exemple :** analyser un dossier fournisseur : un agent extrait les obligations, un autre vérifie les preuves, un troisième repère les risques.
- **Innovation :** collaboration visible et contradictoire, pas une simple réponse multi-persona.
- **Technique :** réutiliser worker jobs, LLM, RAG, quota ; tables agent_runs/steps/tool_calls, orchestrateur et interface de suivi. Complexité **très élevée**.
- **MVP :** séquence de 3 agents sans outils destructifs et sans exécution externe.

### 9. Brief de décision avec scénarios
- **Problème :** les documents sont résumés, mais le passage des connaissances à une décision structurée est manuel.
- **Fonctionnement :** cadrage décision, options, critères, contraintes, preuves, risques et inconnues ; scénarios prudent/central/ambitieux avec hypothèses modifiables.
- **IA :** extraire les critères et faits, distinguer données source et hypothèses utilisateur, calculer uniquement les valeurs dérivées de données explicites.
- **UI :** matrice multicritère, curseurs d'hypothèses, journal de décision, export rapport.
- **Exemple :** choisir entre deux offres de service avec coûts, délais et clauses.
- **Innovation :** transforme les sources en support de décision explicable.
- **Technique :** réutiliser comparison, report, action_plan et citations ; modèles decision_case/options/criteria ; calculs déterministes côté serveur. Complexité **élevée**.
- **MVP :** matrice de comparaison pondérée avec hypothèses visibles.

### 10. Studio avec provenance et versions
- **Problème :** Studio propose 13 types d'artefacts, mais le versionnage et la provenance fine des changements ne sont pas des fonctions de premier plan.
- **Fonctionnement :** chaque rendu garde le snapshot des sources, leur version, le prompt effectif, le modèle et les options ; comparer deux rendus et identifier les passages affectés par une source modifiée.
- **IA :** régénération ciblée des sections impactées, sans réécrire tout le document.
- **UI :** historique, diff, « actualiser depuis les sources », panneau de provenance.
- **Exemple :** mettre à jour une note de synthèse après réception d'une nouvelle version de contrat.
- **Innovation :** un livrable devient maintenable et vérifiable.
- **Technique :** réutiliser artifacts/jobs/prompts/citations ; artifact_versions et source_snapshot ; UI diff. Complexité **moyenne à élevée**.
- **MVP :** versions immuables et métadonnées de génération, sans régénération partielle.

## P2 — Innovation

### 11. Recherche web comparative et réconciliation
- **Problème :** Fast Research renvoie des résultats web, mais l'intégration raisonnée avec le corpus interne reste limitée.
- **Fonctionnement :** lancer une recherche web, sélectionner les résultats, ingérer les pages, comparer affirmations externes et documents internes, signaler les écarts.
- **IA :** classer par autorité/date et faire correspondre les claims, en séparant source interne et source web.
- **UI :** vue côte à côte « dossier interne / web », filtres domaine/date, import sélectif.
- **Exemple :** vérifier si une norme citée dans un manuel est toujours à jour.
- **Innovation :** réconciliation de connaissances privées et publiques avec provenance séparée.
- **Technique :** réutiliser Tavily, recherche web, ingestion URL, RAG et citations ; stocker date de consultation et source externe. Complexité **élevée**.
- **MVP :** comparaison de 5 résultats web sélectionnés avec 5 sources internes.

### 12. Veille documentaire et détection de changements
- **Problème :** un corpus évolue mais le système ne surveille pas automatiquement les URLs ou documents externes.
- **Fonctionnement :** abonner une source URL à une fréquence ; récupérer son empreinte, détecter changements et proposer une réingestion après confirmation ou selon règle.
- **IA :** résumé différentiel et impact sur les réponses/artefacts déjà produits.
- **UI :** abonnements, fréquence, dernier contrôle, changements, pause/retirer.
- **Exemple :** suivre les mises à jour d'une page réglementaire et signaler une modification.
- **Innovation :** notebook vivant, avec historique temporel.
- **Technique :** réutiliser worker jobs, safeFetch/SSRF et ingestion ; tables source_watch/subscription, scheduler fiable, quotas et alertes. Complexité **très élevée**.
- **MVP :** vérification quotidienne d'URL publique, notification et diff texte ; pas d'actions automatiques.
  
### 13. Assistant de réunion et alignement audio-docs
- **Problème :** l'audio est transcrit à l'import et l'Audio Overview génère un podcast, mais le suivi des décisions de réunion n'est pas prouvé.
- **Fonctionnement :** importer un enregistrement, segmenter les intervenants, extraire décisions, actions, questions et horodatages, relier au dossier.
- **IA :** diarisation si fournisseur disponible, extraction structurée, attribution incertaine signalée, citations temporelles.
- **UI :** lecteur synchronisé, résumé, actions à confirmer, liens vers documents liés.
- **Exemple :** réunion fournisseur : retrouver la promesse de livraison à 12:43 et la relier au contrat.
- **Innovation :** fait converger conversation et preuve documentaire.
- **Technique :** réutiliser transcription, timeRanges, citations audio et Studio ; diarisation, tables meeting/action. Complexité **élevée**.
- **MVP :** transcription horodatée + décisions et actions validées manuellement.

### 14. Studio vocal pilotable et multi-agents
- **Problème :** Leanna + Roxane existent en Gemini Live, mais les capacités métier vocales se concentrent sur la recherche de passages.
- **Fonctionnement :** demander oralement un résumé, une comparaison, un quiz ou un brief ; Leanna annonce le plan, Roxane critique si activée, l'utilisateur approuve avant génération.
- **IA :** intent classifier, tool calling borné vers API Studio, double voix avec politique de tours, citations à l'écran.
- **UI :** commandes suggérées, aperçu de l'action, état « prêt à lancer », contrôle Roxane et historique.
- **Exemple :** « Compare les deux contrats et prépare une note de risques ».
- **Innovation :** passer d'une conversation vocale à une commande documentaire vérifiable.
- **Technique :** réutiliser voice-assistant, Gemini Live, routes Studio et worker ; schéma d'intentions/outils, contrôle de permissions. Complexité **très élevée**.
- **MVP :** 3 commandes en lecture seule + génération d'un rapport après confirmation.

### 15. Générateur de workflows documentaires
- **Problème :** chaque outil Studio est déclenché manuellement, sans chaîne de tâches réutilisable.
- **Fonctionnement :** composer des étapes (ingérer, vérifier, extraire, comparer, rédiger, faire approuver, exporter) en modèle de workflow réutilisable.
- **IA :** propose une séquence mais l'utilisateur valide le workflow ; chaque étape a entrées, sorties, critères et budget.
- **UI :** éditeur visuel simple, modèles par métier, historique d'exécution, reprise après échec.
- **Exemple :** à chaque nouveau dossier client, créer fiche, vérifier pièces, détecter lacunes, produire synthèse.
- **Innovation :** industrialise un usage récurrent sans donner un accès agent illimité.
- **Technique :** réutiliser jobs/handlers/artifacts ; tables workflow_definitions/runs/steps, moteur d'orchestration et annulation. Complexité **très élevée**.
- **MVP :** workflow linéaire de 3 étapes sans branchement ni déclencheur externe.

### 16. Simulateur de scénarios et hypothèses
- **Problème :** les documents contiennent chiffres et conditions mais l'utilisateur doit faire les simulations manuellement.
- **Fonctionnement :** extraire paramètres, permettre de modifier les hypothèses, calculer scénarios et afficher sensibilité ; toutes les hypothèses sont séparées des données source.
- **IA :** propose variables et formules candidates ; calcul pur déterministe, aucune valeur inventée ; avertit si unité ou donnée manque.
- **UI :** tableau de paramètres, sliders, graphique, scénarios enregistrés.
- **Exemple :** impact d'une variation de coût ou d'un délai sur un budget projet.
- **Innovation :** transformer un dossier en modèle de simulation traçable.
- **Technique :** réutiliser tableaux comparatifs/artefacts et citations ; moteur de calcul sandboxé, schema scenario ; complexité **élevée**.
- **MVP :** calculateur de scénarios sur 5 variables numériques explicitement extraites.

### 17. Mémoire de projet explicable
- **Problème :** les conversations sont historisées, mais pas de mémoire structurée persistante des décisions, préférences et éléments validés.
- **Fonctionnement :** proposer de mémoriser un fait, une décision, une préférence ou une question ouverte ; l'utilisateur valide, modifie, expire ou supprime ; chaque élément pointe vers sa provenance.
- **IA :** extraction candidate, détection de conflit avec mémoire existante, rappel contextuel sélectif et visibilité de ce qui a été injecté.
- **UI :** panneau « Mémoire du notebook », source, date, confiance, durée de vie, gestion et audit.
- **Exemple :** mémoriser que le budget approuvé est 15 k€ et que la version de référence du cahier des charges est V4.
- **Innovation :** continuité durable sans mémoire opaque.
- **Technique :** réutiliser conversations, notes, RAG, prompt overrides ; tables memory_items et memory_events, règles RLS et injection bornée. Complexité **élevée**.
- **MVP :** faits et décisions épinglés explicitement, rappel dans le chat.

## P3 — Vision long terme

### 18. Connecteurs externes synchronisés
- **Problème :** les sources sont principalement importées ; Google Drive n'est pas confirmé de bout en bout.
- **Fonctionnement :** connecteurs OAuth à permissions minimales, import sélectif, synchronisation incrémentale, révocation et statut de sync.
- **IA :** détection des changements et déduplication avec les documents déjà importés.
- **UI :** catalogue de connecteurs, dossiers choisis, historique et bouton déconnecter.
- **Exemple :** synchroniser le dossier projet Drive et actualiser le notebook.
- **Innovation :** corpus toujours à jour et contextualisé.
- **Technique :** OAuth, webhooks/polling, tokens chiffrés, connecteur par provider, worker et tables integration_connections. Complexité **très élevée**.
- **MVP :** Google Drive lecture seule, sélection manuelle, import incrémental ; sécurité et consentement avant sync.

### 19. Espace de revue collaborative des preuves
- **Problème :** membres et partage existent, mais la revue à plusieurs d'une affirmation et de ses preuves n'est pas démontrée.
- **Fonctionnement :** commenter une citation, valider/rejeter une affirmation, assigner une vérification, résoudre une divergence et conserver un historique.
- **IA :** résumer les désaccords sans trancher ; suggérer les passages supplémentaires à consulter.
- **UI :** fil de revue, mentions, statuts, filtres et vue des décisions.
- **Exemple :** équipe juridique valide chaque clause extraite d'un contrat.
- **Innovation :** transformer les citations en objets de collaboration et de gouvernance.
- **Technique :** réutiliser membres, rôles, citations, notes et partage ; tables evidence_reviews/comments/assignments, notifications. Complexité **élevée**.
- **MVP :** commentaires et validation sur citations dans un notebook partagé.

### 20. Tuteur adaptatif de maîtrise des connaissances
- **Problème :** fiches et quiz existent, mais l'adaptation à la progression et aux lacunes individuelles n'est pas prouvée.
- **Fonctionnement :** sessions courtes, rappel actif, questions adaptatives, répétition espacée et tableau de maîtrise par thème.
- **IA :** choisir la prochaine question selon erreurs et corpus ; corrections sourcées, explication au niveau de l'apprenant.
- **UI :** parcours d'apprentissage, calendrier, progression, reprise et objectifs.
- **Exemple :** réviser un corpus de formation et revoir les notions mal maîtrisées.
- **Innovation :** passer du contenu pédagogique statique à un apprentissage mesurable et personnalisé.
- **Technique :** réutiliser flashcards, quiz, study_plan, citations et profils ; tables learning_sessions/answers/mastery. Complexité **moyenne à élevée**.
- **MVP :** quiz adaptatif par notebook avec répétition simple des questions ratées.

## 21. Les cinq fonctionnalités qui pourraient transformer Leanna Notebook

### A. Moteur de contradictions (n°5)
Le plus grand différenciateur de confiance : signaler ce qui ne concorde pas au lieu de produire une synthèse lisse. **MVP :** faits datés et numériques sur un corpus limité, chaque divergence liée aux extraits d'origine et soumise à validation humaine.

### B. Raisonnement multi-sources traçable (n°6)
Apporte une valeur immédiate sur les dossiers complexes. **MVP :** décomposition en trois sous-questions, retrieval séparé, arbre preuve/inférence/manque et citations vérifiables.

### C. Détecteur de lacunes (n°2)
Résout un besoin métier concret : savoir si le dossier est complet. **MVP :** checklist depuis un objectif libre, couverture des exigences par preuves, statuts partiel/absent/à vérifier.

### D. Agents experts en équipe (n°8)
Une expérience spectaculaire mais utile si elle est contrôlée. **MVP :** Analyste, Vérificateur, Contradicteur ; outils read-only, budget fixe et validation humaine.

### E. Cockpit de fiabilité (n°1)
Rend la confiance compréhensible et améliore tout le reste. **MVP :** état d'ingestion, fraîcheur, erreurs, couverture des citations et panneau de preuves.

## 22. Trois prochaines fonctionnalités — avis produit

1. **Cockpit de fiabilité documentaire** : faible risque relatif, forte réutilisation du modèle existant, améliore la confiance avant d'introduire plus d'autonomie.
2. **Détecteur de lacunes** : construit un cas d'usage différenciant et réutilise le RAG, les citations et les artefacts action_plan/specification.
3. **Raisonnement multi-sources traçable** : donne de la profondeur au cœur du produit et prépare le moteur de contradictions.

Le moteur de contradictions est la prochaine grande innovation à lancer après un MVP de raisonnement et une base de faits fiable. Les agents autonomes doivent venir ensuite, une fois les preuves et les garde-fous consolidés.
