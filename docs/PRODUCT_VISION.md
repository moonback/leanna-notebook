# Vision produit — Leanna Notebook

> Document de vision produit fondé sur l'inspection du code applicatif du dépôt, et non sur les fichiers Markdown de conception ou de présentation.

- **Produit :** Leanna Notebook
- **Dépôt :** `moonback/leanna-notebook`
- **Date de l'analyse :** 10 novembre 2026
- **Branche documentaire :** `docs/product-vision-and-feature-opportunities`

---

## 1. Résumé exécutif

Leanna Notebook doit devenir un **espace de travail intelligent qui transforme les documents et les connaissances dispersées en compréhension, décisions et livrables fiables**.

L'utilisateur ne devrait pas avoir à lire intégralement dix fichiers, retrouver manuellement une information ou reformuler sans cesse le même contexte. Il rassemble ses sources dans un notebook, interroge l'ensemble en langage naturel, vérifie les réponses dans les documents originaux, puis transforme les résultats en productions concrètes : rapports, synthèses, plans, supports d'apprentissage, présentations et contenus audio.

La différence essentielle ne doit pas être « un chatbot qui accepte des fichiers ». Le produit doit relier trois expériences dans un même espace :

1. **Comprendre** : retrouver, croiser et expliquer l'information provenant des sources.
2. **Construire** : transformer cette information en documents et supports structurés.
3. **Exploiter** : réutiliser, partager, actualiser et suivre les connaissances dans la durée.

La confiance est une propriété centrale du produit : une réponse doit pouvoir être vérifiée, les limites doivent être explicites et les données d'un espace ne doivent jamais fuiter vers un autre.

## 2. Ce que le code actuel démontre

Cette section décrit uniquement les comportements repérés dans les composants, routes API, validations et traitements du dépôt.

### Fondations déjà présentes

- **Espace notebook** avec panneaux Sources, Chat et Studio ; les panneaux latéraux peuvent être repliés et redimensionnés, et leurs largeurs sont conservées localement.
- **Gestion des sources** : import de fichiers, ajout d'URL, ajout de texte et notes ; traitement asynchrone par worker avec états persistants.
- **Formats actuellement déclarés à l'import** : PDF, TXT, Markdown, CSV, DOCX, PPTX, EPUB et plusieurs formats audio (MP3, WAV, M4A, AAC, OGG, FLAC, WEBM). La limite d'upload déclarée est de 200 Mo.
- **Extraction et indexation** : normalisation, découpage en passages, indexation plein texte et embeddings lorsque le fournisseur est configuré ; conservation des positions de page et des repères temporels audio.
- **Chat documentaire** avec recherche hybride, réponses en flux et citations vérifiables reliées aux passages.
- **Sélection des sources** pour délimiter le corpus utilisé dans les échanges.
- **Assistant vocal Gemini Live** : conversation bidirectionnelle, transcription des tours, recherche documentaire via outil et rattachement des passages retrouvés aux réponses vocales.
- **Studio** avec génération de rapports, fiches de révision, quiz, cartes mentales et Audio Overview.
- **Recherche web rapide** avec sélection des résultats avant import comme sources.
- **Modèles OpenRouter configurables par fonctionnalité**, avec filtrage de compatibilité, informations de modalité, contexte et coût/gratuité.
- **Collaboration et contrôle d'accès** : rôles, invitations, liens de partage et séparation des accès côté serveur.
- **Application Electron Windows** et mécanisme de mise à jour automatique intégré au processus desktop.

### Limites techniques visibles dans le code inspecté

- Les PDF scannés sans couche texte remontent encore une erreur `needs_ocr` : la reconnaissance OCR n'est pas opérationnelle dans le parcours d'ingestion inspecté.
- Le catalogue d'import ne déclare pas encore certains formats souhaités comme XLSX, DOC, PPT, RTF, images ou vidéo.
- Le connecteur Google Drive n'est pas présent dans les parcours d'import et d'ingestion inspectés.
- Les formats de sortie du Studio sont aujourd'hui centrés sur le contenu Markdown et les artefacts existants ; une chaîne complète de création et d'export de documents bureautiques riches reste à construire.
- Le paiement est encore simulé dans le code de configuration inspecté ; il ne constitue donc pas encore une chaîne d'abonnement commerciale finalisée.
- Le traitement des sources est asynchrone et robuste dans son principe, mais le produit gagnerait à rendre davantage visibles la provenance, les versions, les actualisations et la qualité de l'indexation.

Ces constats sont une photographie du code consulté, pas une affirmation que chaque fonction a été validée en production. L'analyse n'a pas exécuté l'application ni ses tests.

---

## 3. Positionnement et promesse

### Positionnement

**Leanna Notebook est un workspace de connaissance assisté par IA, centré sur les sources et orienté vers la production.**

Il s'adresse aux personnes qui travaillent à partir de beaucoup de matière : documents professionnels, cours, recherches, comptes rendus, procédures, dossiers clients, contenus web, fichiers audio et corpus personnels.

### Promesse principale

« Déposez vos connaissances. Posez vos questions. Vérifiez les réponses. Produisez quelque chose d'utile. »

### Principes produit non négociables

1. **Source avant supposition** — les réponses documentaires distinguent ce qui est prouvé, absent, contradictoire ou extrapolé.
2. **Traçabilité native** — chaque élément important doit pouvoir remonter à un document, une page, un passage ou un horodatage.
3. **Contexte maîtrisé** — l'utilisateur contrôle les sources prises en compte et peut comprendre pourquoi une réponse a été produite.
4. **Travail continu** — un notebook est un espace vivant, pas un simple dépôt de fichiers à interroger une fois.
5. **Production exploitable** — les contenus générés doivent être modifiables, exportables et réutilisables.
6. **Sécurité par conception** — séparation stricte des espaces, permissions vérifiées côté serveur, stockage privé et actions sensibles auditées.
7. **Choix IA transparent** — les capacités, coûts, limites et fournisseurs doivent être visibles sans imposer un modèle unique.

---

## 4. Les 20 fonctionnalités recommandées

Les fonctionnalités ci-dessous sont des opportunités nouvelles ou des extensions substantielles. Elles ne doivent pas être considérées comme déjà implémentées simplement parce qu'un composant voisin existe.

### Priorité P0 — Rendre le corpus fiable et complet

#### 1. OCR intelligent pour les documents et images

**Valeur :** rendre consultables les scans, photos de documents, captures d'écran et PDF image.

- Détecter automatiquement si un fichier contient une couche texte exploitable.
- Lancer l'OCR uniquement lorsque nécessaire, via le fournisseur configuré pour cette capacité.
- Conserver les pages, blocs, coordonnées et scores de confiance.
- Permettre de corriger le texte reconnu et de relancer l'extraction.
- Afficher clairement les zones ou mots incertains.

**Critères de réussite :** un PDF scanné devient interrogeable ; chaque citation pointe vers la bonne page ; l'utilisateur peut distinguer texte natif et texte OCR.

#### 2. Connecteur Google Drive avec synchronisation

**Valeur :** éviter le téléchargement manuel et garder les notebooks alignés sur les documents de travail.

- Connexion OAuth sécurisée et révocable.
- Parcourir Drive, sélectionner des fichiers ou dossiers et importer en lot.
- Synchroniser les changements, suppressions et déplacements.
- Détecter les doublons et suivre les versions.
- Permettre une synchronisation manuelle ou planifiée.

**Critères de réussite :** un fichier modifié dans Drive est actualisé dans le notebook sans créer une copie parasite ; la révocation coupe immédiatement les accès.

#### 3. Centre de contrôle de l'ingestion

**Valeur :** expliquer ce qui arrive aux sources et réduire les imports qui échouent silencieusement.

- Vue détaillée des étapes : réception, extraction, OCR/transcription, découpage, indexation et disponibilité.
- Afficher la progression, la durée, le volume extrait et les erreurs compréhensibles.
- Boutons de relance, annulation et réindexation.
- Historique des tentatives et diagnostic exportable.
- Indiquer si la recherche vectorielle ou plein texte est utilisée pour chaque source.

**Critères de réussite :** toute source possède un état explicable et une action de récupération adaptée.

#### 4. Versions et actualisation des sources

**Valeur :** éviter qu'une réponse s'appuie sur un document obsolète.

- Détecter une modification d'un fichier ou d'une URL.
- Conserver les versions précédentes et leurs empreintes.
- Comparer les versions avec un résumé des changements.
- Réindexer sans perdre l'historique ni les références anciennes.
- Montrer la date de dernière vérification et la version utilisée dans une citation.

**Critères de réussite :** l'utilisateur sait quelle version a servi à produire un rapport et peut retrouver l'ancienne.

#### 5. Recherche documentaire avancée et filtres

**Valeur :** retrouver une information dans un corpus important sans dépendre uniquement d'une question en langage naturel.

- Recherche plein texte, sémantique et hybride avec filtres.
- Filtres par source, type, date, auteur, page, tag et statut.
- Opérateurs exacts, exclusions et expressions entre guillemets.
- Aperçu du passage avec contexte avant/après.
- Classement explicable et possibilité d'épingler un résultat.

**Critères de réussite :** les résultats sont filtrables, reproductibles et ouvrent directement le passage original.

### Priorité P1 — Transformer les connaissances en livrables

#### 6. Générateur de documents professionnels multi-formats

**Valeur :** faire du Studio un véritable atelier de production, et non seulement un générateur de texte.

- Générer des documents structurés avec styles, tableaux, en-têtes, pieds de page et sommaire.
- Exporter en DOCX, PDF et Markdown ; ajouter PPTX lorsque le moteur de présentation est prêt.
- Proposer des formats adaptés : compte rendu, rapport d'activité, cahier des charges, procédure, proposition commerciale, dossier de synthèse.
- Préserver les citations et une bibliographie vérifiable à l'export.
- Permettre de choisir le niveau de détail, le ton et le public cible.

**Critères de réussite :** le fichier exporté est immédiatement présentable et chaque affirmation documentaire importante reste traçable.

#### 7. Éditeur de rapport avec réécriture ciblée

**Valeur :** donner à l'utilisateur le contrôle final sur le contenu généré.

- Éditer les sections indépendamment.
- Demander à l'IA de raccourcir, détailler, clarifier ou reformuler une sélection.
- Régénérer une section sans réécrire tout le document.
- Verrouiller les passages validés.
- Afficher les sources utilisées et les modifications apportées.

**Critères de réussite :** une modification locale ne détruit pas les sections déjà validées et les références restent cohérentes.

#### 8. Présentations générées à partir des sources

**Valeur :** transformer une analyse en support oral rapidement partageable.

- Générer un plan de diapositives à partir d'un corpus ou d'un rapport.
- Créer titres, messages clés, notes orateur et suggestions de visuels.
- Ajuster le nombre de diapositives et le niveau de technicité.
- Éditer et réordonner les diapositives.
- Exporter en PPTX et PDF avec références en notes ou en fin de support.

**Critères de réussite :** le support suit un fil narratif, ne surcharge pas les diapositives et reste fidèle aux sources.

#### 9. Tableaux comparatifs et extraction structurée

**Valeur :** passer de documents non structurés à des données directement exploitables.

- Extraire des champs définis par l'utilisateur dans plusieurs documents.
- Construire des tableaux comparatifs avec une cellule par information.
- Signaler les valeurs absentes, contradictoires ou non comparables.
- Relier chaque cellule à sa source exacte.
- Exporter en CSV et XLSX.

**Critères de réussite :** aucune valeur manquante n'est inventée ; chaque cellule est vérifiable.

#### 10. Modèles de Studio personnalisables et réutilisables

**Valeur :** standardiser les productions récurrentes.

- Enregistrer un modèle avec sections, consignes, longueur, ton et formats de sortie.
- Créer des modèles personnels et des modèles partagés dans une équipe.
- Suggérer des modèles à partir du type de sources et de l'objectif déclaré.
- Versionner les modèles.
- Prévisualiser le résultat attendu avant génération.

**Critères de réussite :** un utilisateur peut réutiliser un même cadre de production sans ressaisir ses consignes.

### Priorité P1 — Faire émerger la connaissance

#### 11. Carte de connaissances transversale

**Valeur :** relier les concepts, personnes, organisations, projets et événements présents dans les documents.

- Extraire des entités et relations avec leurs preuves.
- Visualiser les liens entre sources et notions.
- Ouvrir les passages justificatifs depuis un nœud ou une relation.
- Distinguer les relations certaines, probables et contestées.
- Filtrer la carte par période, source ou thème.

**Critères de réussite :** chaque relation visible possède au moins une preuve consultable ; les liens non prouvés ne sont pas présentés comme des faits.

#### 12. Comparaison multi-sources et détection des contradictions

**Valeur :** identifier les divergences plutôt que produire une synthèse artificiellement homogène.

- Comparer plusieurs documents sur un même sujet.
- Repérer les chiffres, dates, définitions et conclusions incompatibles.
- Afficher les éléments qui convergent et ceux qui divergent.
- Expliquer les différences de périmètre ou de période.
- Proposer une question de clarification lorsque les sources ne permettent pas de trancher.

**Critères de réussite :** les contradictions sont présentées avec leurs deux preuves et ne sont pas résolues arbitrairement.

#### 13. Briefing automatique et veille sur un notebook

**Valeur :** faire remonter ce qui a changé sans devoir relire tout le corpus.

- Produire un résumé des nouvelles sources et des versions modifiées.
- Repérer les changements importants par rapport au dernier briefing.
- Laisser l'utilisateur définir les sujets à surveiller.
- Envoyer un digest dans l'application et, ultérieurement, par email.
- Exiger une preuve pour chaque changement signalé.

**Critères de réussite :** chaque briefing indique sa période, son périmètre et les sources nouvelles ou modifiées.

#### 14. Recherche approfondie multi-étapes

**Valeur :** passer de la recherche web rapide à une investigation structurée.

- Décomposer une question complexe en sous-questions.
- Chercher sur le web et dans le corpus existant.
- Évaluer la pertinence et la diversité des sources.
- Comparer les informations et relever les incertitudes.
- Produire un dossier de recherche avec sources, dates et limites.

**Critères de réussite :** l'utilisateur peut inspecter les étapes de recherche et retirer une source avant la synthèse finale.

### Priorité P2 — Améliorer le travail quotidien et la collaboration

#### 15. Agent de tâches documentaires avec validation humaine

**Valeur :** permettre à l'IA d'exécuter un processus multi-étapes sans perdre le contrôle.

- Définir un objectif : analyser un dossier, préparer un rapport, comparer des contrats, etc.
- Afficher un plan d'exécution avant de commencer.
- Exécuter les étapes longues en arrière-plan avec progression.
- Demander une validation avant toute action externe ou irréversible.
- Conserver un journal des actions, sources consultées et livrables créés.

**Critères de réussite :** aucune action sensible n'est exécutée sans autorisation explicite ; l'utilisateur peut interrompre et reprendre une tâche.

#### 16. Commentaires, annotations et validation collaborative

**Valeur :** transformer le partage d'un notebook en véritable travail d'équipe.

- Commenter une source, un passage, une réponse ou une section de rapport.
- Mentionner un collaborateur et attribuer une action.
- Marquer une section comme à vérifier, validée ou rejetée.
- Conserver les discussions et décisions liées au contenu.
- Filtrer les éléments qui nécessitent une revue.

**Critères de réussite :** les décisions de l'équipe restent attachées à l'élément concerné et respectent les rôles d'accès.

#### 17. Historique des conversations et mémoire de travail contrôlée

**Valeur :** reprendre un travail sans répéter les mêmes éléments de contexte.

- Résumer les décisions, questions ouvertes et hypothèses d'une conversation.
- Permettre de réutiliser un résumé dans une autre conversation du même notebook.
- Séparer faits issus des sources, préférences utilisateur et hypothèses de travail.
- Modifier, épingler ou supprimer les éléments de mémoire.
- Afficher ce qui a été injecté dans le contexte d'une réponse.

**Critères de réussite :** la mémoire ne mélange pas les notebooks et chaque fait mémorisé peut être relié à son origine ou identifié comme préférence.

#### 18. Connecteurs de travail supplémentaires

**Valeur :** faire du notebook un point de convergence des informations professionnelles.

- Ajouter progressivement OneDrive/SharePoint, Dropbox, Notion et des espaces de stockage compatibles.
- Prévoir des connecteurs email et calendrier uniquement avec des permissions explicites.
- Normaliser les sources externes derrière un contrat commun.
- Gérer les jetons, révocations, erreurs et limites de chaque fournisseur.
- Autoriser une sélection fine des dossiers et contenus synchronisés.

**Critères de réussite :** chaque connecteur peut être déconnecté et ses données synchronisées peuvent être purgées selon une politique claire.

#### 19. Mode desktop hors ligne et synchronisation différée

**Valeur :** rendre l'application Electron utile même avec une connexion instable.

- Mettre en cache les notebooks explicitement choisis.
- Consulter les sources et artefacts déjà téléchargés.
- Enregistrer localement les notes et brouillons.
- Synchroniser les modifications au retour du réseau avec détection des conflits.
- Chiffrer les données locales et proposer une purge à distance ou à la déconnexion.

**Critères de réussite :** le mode hors ligne ne prétend jamais disposer d'une information distante non synchronisée et les conflits sont résolus de façon explicite.

### Priorité P2 — Préparer une offre durable et mesurable

#### 20. Console de confiance, qualité IA et consommation

**Valeur :** rendre le produit compréhensible, maîtrisable et commercialisable.

- Montrer le modèle réellement utilisé pour chaque tâche, son coût estimé et ses capacités.
- Mesurer latence, erreurs, tokens, coût et taux de citations vérifiées.
- Permettre de comparer les modèles sur un jeu de questions de référence.
- Signaler les réponses sans preuve, les citations invalides et les sources insuffisantes.
- Ajouter des quotas et une facturation réelle avec historique, reçus et alertes.
- Fournir un journal de sécurité et des exports de données compréhensibles.

**Critères de réussite :** les coûts sont attribuables à une fonctionnalité ; les évaluations sont reproductibles ; la facturation et les quotas sont cohérents côté serveur.

---

## 5. Ordre de réalisation recommandé

L'ordre ci-dessous optimise la valeur utilisateur et réduit les dépendances techniques.

| Vague | Fonctionnalités | Résultat attendu |
|---|---|---|
| **A — Corpus fiable** | 1 OCR, 3 centre d'ingestion, 4 versions, 5 recherche avancée | Les sources sont exploitables, actualisées et vérifiables. |
| **B — Production** | 6 documents multi-formats, 7 éditeur, 9 tableaux structurés, 10 modèles | Le Studio produit des livrables réellement utilisables. |
| **C — Connexions et intelligence** | 2 Google Drive, 11 carte de connaissances, 12 contradictions, 14 recherche approfondie | Le notebook devient un espace de connaissance vivant. |
| **D — Travail d'équipe et automatisation** | 13 veille, 15 agent, 16 collaboration, 17 mémoire contrôlée, 18 connecteurs | Les usages récurrents et collectifs sont fluidifiés. |
| **E — Produit mature** | 8 présentations, 19 hors ligne, 20 qualité et commercialisation | Leanna devient un produit robuste, différenciant et monétisable. |

### Les 5 premières implémentations à lancer

1. **OCR** : débloque immédiatement une classe importante de documents actuellement inexploitable.
2. **Centre de contrôle d'ingestion** : rend les erreurs et la qualité visibles avant d'ajouter de nouveaux connecteurs.
3. **Versions des sources** : fondation indispensable pour la synchronisation Drive et la veille.
4. **Génération de documents professionnels** : transforme le Studio en valeur tangible pour l'utilisateur.
5. **Recherche avancée** : améliore l'expérience à mesure que le corpus grandit.

Google Drive peut être développé en parallèle du centre d'ingestion si le contrat de source et le suivi des versions sont définis avant le connecteur.

---

## 6. Expérience utilisateur cible

### Le parcours principal

1. L'utilisateur crée un notebook autour d'un sujet, d'un projet ou d'un dossier.
2. Il importe des fichiers, ajoute des liens ou connecte une source cloud.
3. Leanna explique ce qui a été traité, ce qui a échoué et ce qui est prêt.
4. L'utilisateur pose une question dans le chat ou à la voix.
5. Leanna répond avec des citations cliquables, les limites et les éventuelles contradictions.
6. L'utilisateur sélectionne une réponse, un ensemble de passages ou tout le corpus.
7. Le Studio transforme cette matière en document, tableau, présentation ou support audio.
8. L'utilisateur révise, annote, valide et exporte.
9. Le notebook reste vivant : les sources peuvent évoluer et Leanna signale les changements pertinents.

### Rôle des trois zones principales

- **Sources** : organiser, filtrer, connecter, inspecter et actualiser le corpus.
- **Chat** : comprendre, questionner, comparer et décider avec l'aide de l'IA.
- **Studio** : produire, réviser, présenter et exporter les résultats.

Ces zones doivent rester cohérentes : une citation ouverte dans le chat doit retrouver le bon passage dans Sources ; un élément sélectionné dans Studio doit pouvoir être expliqué dans le chat ; un rapport doit conserver les références qui justifient son contenu.

---

## 7. Indicateurs de réussite

Ne pas mesurer le succès uniquement au nombre de fonctionnalités livrées.

### Activation
- Temps entre création du notebook et première source exploitable.
- Part des nouveaux utilisateurs qui posent une première question.
- Part des utilisateurs qui créent un premier livrable.

### Qualité et confiance
- Taux de sources correctement extraites.
- Taux de citations vérifiées et ouvrant le bon passage.
- Taux de réponses signalées comme non pertinentes ou insuffisamment sourcées.
- Nombre de contradictions correctement détectées.
- Taux de réussite des imports OCR et cloud.

### Productivité
- Temps pour produire un rapport exploitable.
- Nombre de documents réutilisés ou actualisés.
- Part des livrables exportés ou partagés.
- Taux de réutilisation des modèles de Studio.

### Fiabilité et économie
- Taux d'échec et de reprise des jobs.
- Latence médiane et au 95e percentile par fonctionnalité.
- Coût IA moyen par notebook actif et par livrable.
- Taux de conflits et de synchronisations cloud échouées.
- Incidents d'accès ou de séparation des données : objectif zéro.

---

## 8. Garde-fous d'architecture

Les nouvelles fonctionnalités doivent prolonger les fondations déjà présentes plutôt que créer une architecture parallèle.

- Garder le worker et la file de jobs pour les traitements longs ; ne pas faire dépendre une requête utilisateur de l'extraction complète d'un gros fichier.
- Définir une interface commune de connecteur avec identifiants externes, versions, permissions, état de synchronisation et stratégie de révocation.
- Séparer extraction, OCR, transcription, normalisation, découpage, embeddings et indexation pour pouvoir relancer une étape sans tout recommencer.
- Conserver les identifiants de source, de version et de passage dans chaque citation et chaque artefact.
- Ne jamais considérer une sortie de modèle comme une preuve ; la validation des références doit rester déterministe côté application.
- Traiter les documents importés comme des données non fiables, jamais comme des instructions système.
- Maintenir les secrets fournisseurs côté serveur ; ne jamais exposer une clé longue durée au navigateur ou au client Electron.
- Appliquer les rôles et les politiques RLS à toutes les nouvelles tables et routes.
- Prévoir quotas, idempotence, annulation, reprise, journalisation et remboursement des unités consommées pour chaque nouveau job.
- Mesurer les coûts et la qualité par fonctionnalité avant de généraliser un modèle ou un fournisseur.

---

## 9. Ce que Leanna Notebook ne doit pas devenir

- Un simple chat générique qui répond sans prouver ses affirmations.
- Un stockage cloud de plus sans intelligence documentaire.
- Un générateur de texte qui ne permet ni révision sérieuse ni export professionnel.
- Une automatisation opaque qui agit sans montrer son plan ou ses conséquences.
- Un catalogue de connecteurs ajoutés sans gestion cohérente des versions et des permissions.
- Une interface surchargée de panneaux et de réglages qui masque le parcours principal.

## 10. Vision à long terme

À terme, un notebook doit pouvoir représenter le dossier de travail complet d'une personne ou d'une équipe : ses sources, ses analyses, ses décisions, ses productions et leur historique.

Leanna doit être capable de répondre à trois questions fondamentales :

- **Que savons-nous ?** — avec des preuves et des limites explicites.
- **Qu'est-ce qui a changé ?** — avec comparaison des versions et veille.
- **Que pouvons-nous en faire ?** — avec des livrables, des plans et des actions contrôlées.

La réussite du produit sera atteinte lorsque l'utilisateur ne viendra plus seulement dans Leanna pour poser une question à ses fichiers, mais pour piloter tout un travail intellectuel de bout en bout, avec une IA utile, vérifiable et sous contrôle.
