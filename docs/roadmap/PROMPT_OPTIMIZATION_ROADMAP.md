# Feuille de route — optimisation des prompts

## P0 — Sécuriser les contrats

- [x] Conserver le prompt de référence du chat lorsqu'un override utilisateur existe.
- [ ] Harmoniser la priorité des overrides dans chat, Studio, résumés et voix.
- [ ] Ajouter des tests de composition et de non-régression pour chaque clé du catalogue.
- [ ] Vérifier les contrats SQL et API du catalogue sur toutes les migrations.

## P1 — Compléter la cartographie locale

- [ ] Cloner le dépôt et rechercher tous les appels LLM, messages système, templates et prompts inline.
- [ ] Associer chaque prompt à son consommateur, modèle, variables, schéma, retry et tests.
- [ ] Vérifier les chemins de génération image, recherche, extraction, OCR, agents et intégrations non couverts.
- [ ] Vérifier les clés catalogue qui ont un texte de référence différent du prompt réellement envoyé.

## P1 — Qualité documentaire et Studio

- [ ] Définir les critères de couverture des sources pour les résumés de grands corpus.
- [ ] Ajouter une sélection de passages par pertinence ou une synthèse hiérarchique si le benchmark le justifie.
- [ ] Tester systématiquement les citations des sorties Markdown et structurées.
- [ ] Ajouter des cas de contradiction, d'absence d'information et d'injection documentaire.

## P2 — Observabilité et efficacité

- [ ] Mesurer tokens, latence et coût par fonctionnalité et modèle.
- [ ] Comparer l'échantillonnage uniforme et la récupération par pertinence sur des corpus de référence.
- [ ] Mesurer l'utilité de l'historique de six messages et définir un résumé de conversation seulement si nécessaire.
- [ ] Distinguer les prompts statiques, contextuels et conditionnels dans les métriques.

## P2 — Gestionnaire de prompts

- [ ] Afficher le prompt final assemblé avec valeurs d'exemple.
- [ ] Afficher les variables et les consommateurs réels.
- [ ] Afficher taille caractères et estimation tokens clairement marquée comme estimation.
- [ ] Ajouter versionnage, diff et restauration.
- [ ] Ajouter un banc d'essai mocké puis un test réel explicitement opt-in.
- [ ] Valider les modifications avant sauvegarde et prévenir les conflits de format.

## P3 — Gouvernance

- [ ] Versionner les prompts avec tests de référence.
- [ ] Définir une procédure de revue pour les changements de prompts système.
- [ ] Mettre à jour les scores uniquement à partir de runs reproductibles.
- [ ] Déprécier les clés inutilisées après vérification des consommateurs et migrations.