# Fonctionnalité — Images IA dans le Studio

## 1. Vision

Faire du Studio un espace de production multimodale cohérent : les utilisateurs peuvent créer des images originales, les ancrer dans les connaissances de leur notebook, les éditer et conserver leurs versions au même endroit que leurs rapports, infographies, chronologies et autres artefacts.

L'image IA est une **nouvelle catégorie d'artefact Studio**. Elle n'est pas une galerie externe déconnectée des sources, des droits et de l'historique du notebook.

## 2. Publics et cas d'usage

- Étudiants et enseignants : illustrations pédagogiques et schémas conceptuels.
- Chercheurs et analystes : visualisations conceptuelles de sujets documentés.
- Créateurs de contenu : couvertures, visuels d'article, illustrations éditoriales.
- Professionnels : visuels marketing, supports de présentation, images de synthèse.
- Équipes : supports visuels partagés et contextualisés dans un notebook.

## 3. Parcours utilisateur recommandé

### Parcours A — Création libre

1. Ouvrir le Studio.
2. Choisir **Images IA**.
3. Décrire le résultat souhaité.
4. Choisir un modèle parmi ceux compatibles et disponibles.
5. Choisir uniquement les options proposées par ce modèle : ratio, résolution, qualité et nombre d'images.
6. Voir le coût en crédits avant lancement.
7. Générer ; le Studio affiche la progression.
8. Ouvrir le résultat, télécharger, dupliquer ou poursuivre l'édition.

### Parcours B — Depuis les sources

1. Sélectionner les sources dans le notebook.
2. Ouvrir Images IA et activer « Utiliser les sources sélectionnées ».
3. Décrire le but de l'image (expliquer, résumer, illustrer, comparer).
4. Leanna construit un brief visuel à partir des passages récupérés.
5. Le brief distingue les faits sourcés des choix purement esthétiques.
6. L'utilisateur peut relire/modifier le brief avant génération (recommandé pour les images scientifiques ou chiffrées).
7. L'image est produite et associée aux sources utilisées.

### Parcours C — Édition conversationnelle

1. Ouvrir une image existante.
2. Écrire une instruction (« change le fond en bleu nuit, garde le sujet et le cadrage »).
3. Le système envoie l'image de la version courante comme référence, avec l'instruction.
4. Une nouvelle version est créée ; l'original reste accessible.
5. L'utilisateur compare, restaure ou continue depuis une version antérieure.

## 4. Organisation UX recommandée

Retenir une combinaison des trois options étudiées :

- **Option A comme point d'entrée :** catégorie Images IA dans la grille de création du Studio.
- **Option B comme expérience de création :** un dialogue/panneau spécialisé, réutilisant le CreateDialog et les composants UI existants, pas une nouvelle application.
- **Option C comme raccourci contextuel :** action « Créer une image à partir de ce contenu » depuis un artefact ou une sélection de sources, qui ouvre le même formulaire prérempli.

Éviter une deuxième navigation principale et une galerie indépendante. Le Studio garde la liste unifiée des artefacts ; le filtre Images IA sert de bibliothèque.

## 5. Formulaire de création

### Champs essentiels
- Prompt utilisateur.
- Modèle (avec libellé, niveau de qualité, coût et capacités).
- Utiliser les sources : aucune / sélection actuelle / toutes les sources.
- Ratio d'image.
- Résolution.
- Nombre d'images/variantes si pris en charge.
- Images de référence, selon la limite du modèle.
- Style ou intention visuelle (presets de prompt, pas forcément paramètre fournisseur).

### Paramètres conditionnels
- Qualité, format de sortie, transparence, seed, compression : visibles uniquement si `supported_parameters` de l'endpoint sélectionné les autorise.
- Prompt négatif : ne pas l'afficher par défaut pour Nano Banana tant que le modèle/endpoint n'en déclare pas le support.
- « Niveau de détail » et « style » sont des instructions de prompt sauf si l'API expose explicitement un paramètre correspondant.

## 6. Bibliothèque et viewer

Chaque image affiche :
- aperçu ;
- titre ;
- date de création ;
- modèle et provider ;
- prompt final et instruction d'édition ;
- ratio/résolution réels ;
- sources associées ;
- coût fournisseur si disponible et crédits débités ;
- numéro de version et parent.

Actions :
- ouvrir en haute qualité ;
- zoomer/ajuster ;
- télécharger ;
- modifier ;
- créer une variante ;
- dupliquer ;
- consulter les versions ;
- restaurer une version ;
- supprimer.

Les URL Storage doivent être privées et temporaires. L'interface ne doit pas stocker une URL signée comme identifiant durable.

## 7. Fidélité aux sources

La génération contextuelle est une aide à l'illustration, pas une preuve scientifique. Leanna doit :
- récupérer les passages sélectionnés ;
- extraire faits, relations, dates, chiffres et termes ;
- conserver les références sources dans les métadonnées ;
- interdire l'invention de chiffres ou de citations ;
- signaler les informations contradictoires ou absentes ;
- distinguer les éléments factuels des éléments décoratifs ;
- proposer une validation du brief avant génération dans les usages à enjeu.

Pour une infographie contenant du texte long ou des données exactes, envisager à terme un pipeline hybride : générer les éléments graphiques puis composer le texte vérifié côté application. Le rendu textuel des modèles image peut rester imparfait malgré les améliorations.

## 8. États et erreurs

États :
- prêt à générer ;
- validation ;
- en file d'attente ;
- préparation du brief ;
- génération fournisseur ;
- validation du fichier ;
- sauvegarde ;
- prêt ;
- échec ;
- annulation ;
- résultat à réconcilier (si l'appel fournisseur a pu aboutir mais que la connexion/stockage a échoué).

Les erreurs doivent être formulées sans exposer les détails internes : modèle indisponible, paramètre non supporté, limite atteinte, erreur fournisseur, fichier invalide, stockage impossible, génération expirée. Afficher clairement le remboursement des crédits en cas d'échec final.

## 9. Responsive et accessibilité

- Desktop : aperçu large, panneau de prompt/options et historique latéral.
- Mobile : formulaire empilé, aperçu pleine largeur, historique en tiroir.
- Boutons avec libellés accessibles, focus visible, états busy, annonces de progression.
- Ne pas dépendre uniquement de la couleur pour le statut.
- Les actions de suppression doivent demander confirmation.

## 10. Critères d'acceptation produit

1. Images IA apparaît comme une catégorie Studio cohérente avec les formats existants.
2. Une création prompt-only est possible.
3. Une création avec sources est traçable et n'invente pas de données.
4. Une image générée est persistée dans le bucket privé et visible après rechargement.
5. Le modèle et le coût sont consultables.
6. Une édition crée une nouvelle version et conserve l'original.
7. Les options affichées reflètent les capacités effectives du modèle/endpoint.
8. Un utilisateur sans rôle éditeur ne peut pas générer ni supprimer.
9. Une génération échouée ne consomme pas définitivement les crédits internes.
10. La bibliothèque ne duplique pas les fonctionnalités de navigation et de stockage déjà présentes dans le Studio.

## État d’implémentation — 11 novembre 2026

Le socle de génération est maintenant intégré sur la branche `feat/studio-ai-image-generation` :

- type d’artefact Studio `image`, avec le même cycle de job et de crédits que les autres artefacts ;
- catalogue dynamique des modèles disponibles via `GET /api/v1/ai/image-models` ;
- sélection du modèle dans le dialogue Studio ; modèle par défaut `google/gemini-3.1-flash-image` (Nano Banana 2), surcharge possible avec `OPENROUTER_IMAGE_MODEL` ;
- génération asynchrone dans le worker via l’Images API OpenRouter ;
- édition non destructive d’une image existante : l’image originale est transmise comme référence, et une nouvelle création est reliée par `artifacts.parent_id` ;
- stockage binaire dans le bucket privé `artifacts`, table `artifact_image_versions`, URL signée temporaire et suppression des assets avec l’artefact ;
- validation du MIME par signature binaire et plafond de 20 Mo ;
- coût utilisateur interne configuré à 5 crédits et plafond journalier à 10 générations par workspace ; le coût fournisseur USD est conservé séparément lorsque OpenRouter le renvoie.

### Configuration

Le worker et l’application serveur doivent disposer de `OPENROUTER_API_KEY`. Le modèle peut être forcé avec `OPENROUTER_IMAGE_MODEL`. Sans surcharge, Nano Banana 2 est utilisé. Aucune clé OpenRouter n’est exposée au navigateur.

### Déploiement et vérifications restantes

Appliquer les migrations `20261111020000_studio_image_generation.sql` et `20261111030000_image_generation_credits.sql`, puis redémarrer le worker et vérifier que la clé OpenRouter autorise le modèle image sélectionné. Les tests automatisés, le typecheck et un appel réel au fournisseur restent à exécuter dans l’environnement du projet ; ils ne sont pas déclarés comme validés par cette PR.

### Suggestions visuelles contextuelles

Le dialogue de création analyse maintenant les extraits des sources sélectionnées (ou toutes les sources prêtes si cette portée est choisie) et propose quatre concepts d'images distincts. Chaque suggestion comprend un titre, une justification liée au contenu et un prompt prêt à l'emploi. Un clic sur une suggestion remplit le champ de description ; l'utilisateur peut ensuite la modifier librement avant génération. L'analyse est servie par `POST /api/v1/notebooks/[id]/artifacts/image-suggestions` via le modèle de conversation OpenRouter et n'entraîne pas de génération d'image ni de réservation des crédits image.
