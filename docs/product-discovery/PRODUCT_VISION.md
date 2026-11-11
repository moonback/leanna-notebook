# Vision produit — Leanna Notebook à 12 mois

## Ambition

Faire de Leanna Notebook l'espace de travail documentaire qui aide les personnes et les équipes à passer de documents dispersés à des connaissances vérifiables, des dossiers complets et des décisions traçables.

**Promesse : « Comprendre ce que vos documents disent, vérifier ce qu'ils ne disent pas, et décider avec des preuves. »**

Leanna ne doit pas devenir un assistant généraliste de plus. Elle doit être particulièrement bonne lorsqu'une réponse dépend de plusieurs pièces, de versions, de dates, de preuves et de zones d'incertitude.

## Utilisateurs à servir

Commencer par des utilisateurs qui manipulent des dossiers complexes :
- indépendants et petites équipes ;
- consultants et chefs de projet ;
- équipes administratives, achats et opérations ;
- formation et recherche ;
- fonctions conformité / juridique, sous réserve d'une validation réglementaire et sécurité dédiée.

Ne pas choisir définitivement un vertical avant entretiens utilisateurs et tests de disposition à payer.

## Problèmes utilisateurs prioritaires

1. Je ne sais pas si mon corpus est complet.
2. Deux documents ne racontent pas la même chose.
3. Je ne sais pas sur quel passage repose une conclusion.
4. Une nouvelle version rend-elle mon rapport obsolète ?
5. Je dois transformer un dossier en livrable fiable rapidement.
6. Je perds le contexte et les décisions prises entre plusieurs sessions.

## Les trois piliers

### 1. Comprendre
Import robuste, extraction, recherche hybride, chat, raisonnement multi-sources, carte des connaissances et expériences audio.

### 2. Vérifier
Preuves atomiques, citations, qualité du corpus, détection des lacunes, contradictions, temporalité, versions et revue humaine.

### 3. Exploiter
Studio, briefs de décision, scénarios, workflows, agents spécialisés, collaboration et connecteurs.

## Expérience cible

À l'ouverture d'un notebook, l'utilisateur voit :
- les sources et leur santé ;
- l'objectif du dossier ;
- ce qui est couvert, manquant ou contradictoire ;
- les dernières décisions et livrables ;
- une entrée unique pour demander, rechercher ou lancer une tâche.

Une réponse importante présente :
- une conclusion concise ;
- les preuves directes ;
- les inférences ;
- les informations manquantes ;
- les contradictions ou versions divergentes ;
- les actions proposées, soumises à validation.

Le Studio ne doit plus être uniquement une galerie de générateurs : il devient l'endroit où l'on produit et maintient les livrables liés au dossier.

## Différenciateurs durables

- **Provenance au niveau de l'affirmation** : source, version, page/horodatage, extrait.
- **Contradiction temporelle** : distinguer changement de valeur, période différente et désaccord réel.
- **Complétude** : relier les exigences à des preuves et rendre visibles les pièces manquantes.
- **Raisonnement inspectable** : chaque étape d'une conclusion peut être vérifiée.
- **Mémoire explicable** : les éléments retenus sont visibles, sourcés, modifiables et supprimables.
- **Agentique contrôlée** : plan visible, outils limités, budget, annulation et approbation.

## Architecture produit cible

Ne pas réécrire le monorepo. Faire évoluer progressivement les couches existantes :

1. **Ingestion** : extracteurs spécialisés, OCR, empreintes, versions.
2. **Index** : chunks, embeddings, FTS et métadonnées temporelles.
3. **Knowledge layer** : claims, entités, relations, exigences, preuves et décisions.
4. **Reasoning** : retrieval, décomposition, validation, contradictions et abstention.
5. **Orchestration** : jobs, étapes, budgets, permissions, retries et approbations.
6. **Experience** : workspace, preuves, Studio, voix, revue et alertes.

PostgreSQL et pgvector peuvent porter les premières versions ; un graphe externe ne devient pertinent qu'après mesure des limites.

## Principes de confiance et sécurité

- Le contenu des sources est non fiable et ne peut pas injecter des instructions système.
- Les citations ne peuvent pointer que vers des passages réellement récupérés.
- Une hypothèse ne doit jamais être affichée comme un fait source.
- « Absent du corpus » n'est pas « faux » ou « inexistant ».
- Toute action externe ou écriture nécessite un consentement explicite.
- Les permissions du notebook et du workspace sont vérifiées à chaque étape agentique.
- Les données de veille et connecteurs sont isolées par utilisateur/workspace.
- Les coûts IA sont visibles et plafonnés.
- Les utilisateurs peuvent inspecter, corriger et supprimer les faits mémorisés.

## Roadmap de maturité

- **0–3 mois :** cockpit fiabilité, complétude, déduplication/version simple, OCR MVP, benchmark RAG.
- **3–6 mois :** raisonnement traçable, faits et contradictions, graphe de preuves, brief de décision, provenance Studio.
- **6–9 mois :** agents experts, workflows, veille, revue collaborative, mémoire explicable.
- **9–12 mois :** connecteurs synchronisés, expérience vocale outillée, scénarios avancés et tuteur adaptatif.

## Modèle commercial à explorer

- Offre individuelle : notebooks, limites sources et générations, OCR / voix selon coût.
- Offre Pro : corpus plus grands, analyses multi-documents, versions, veille et workflows.
- Offre Équipe : partage, revue de preuves, rôles, historique et gouvernance.
- Offre métier éventuelle : modèles de dossiers et workflows verticaux.

Ne pas fixer les quotas ni les prix avant mesure du coût par source, génération, minute audio, OCR et tâche agentique.

## Mesures de réussite à 12 mois

- La plupart des réponses factuelles du benchmark ont des citations valides.
- Les contradictions importantes connues sont détectées avec un taux de faux positifs acceptable.
- Les utilisateurs confirment les lacunes identifiées et complètent leur dossier.
- Les artefacts restent cohérents après changement de source.
- Les agents terminent des workflows bornés avec approbation humaine et coût prévisible.
- Les utilisateurs reviennent sur leurs notebooks car ceux-ci deviennent des dossiers vivants, pas des chats jetables.

## Ce qu'il faut éviter

- Ajouter des formats Studio redondants.
- Construire un système multi-agent autonome avant la couche de preuves.
- Multiplier les intégrations OAuth avant d'avoir validé le cas d'usage.
- Créer un graphe visuel décoratif sans preuve et sans navigation utile.
- Exposer des scores de confiance non calibrés.
- Confondre présence d'une route, d'un enum ou d'une documentation avec une fonctionnalité réellement opérationnelle.

## Décision stratégique

La direction recommandée est une plateforme de **dossiers intelligents vérifiables**. La prochaine séquence produit est : cockpit de fiabilité, détection de lacunes, raisonnement multi-sources, puis moteur de contradictions. C'est le chemin le plus cohérent avec le code actuel, le plus défendable face aux concurrents et le moins dépendant d'une refonte architecturale.
