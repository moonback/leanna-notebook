# Roadmap — Génération d'images IA dans Leanna Notebook

> Statut : proposition à valider. Aucune phase de développement n'a été lancée.

## Principes d'exécution

- Travailler sur une branche dédiée après validation du plan.
- Préserver tous les formats Studio actuels.
- Construire une capacité image séparée du client LLM texte.
- Garder la clé API côté serveur/worker.
- Chaque phase doit être testée et livrée avec critères d'acceptation explicites.
- Ne pas annoncer un test réussi sans exécution observée.

## Vue d'ensemble

| Phase | Objectif | Priorité | Dépendance | Complexité |
|---|---|---:|---|---|
| P0 | Audit / décisions de contrat | Critique | Aucune | Faible |
| P1 | Catalogue et adaptateur OpenRouter Images | Haute | P0 | Moyenne |
| P2 | Modèle de données, stockage et crédits | Haute | P0, P1 | Élevée |
| P3 | Génération text-to-image via worker | Haute | P1, P2 | Moyenne |
| P4 | Interface Images IA dans Studio | Haute | P3 | Moyenne |
| P5 | Bibliothèque, viewer, export et suppression | Haute | P2, P4 | Moyenne |
| P6 | Génération à partir des sources | Haute | P3, P4 | Élevée |
| P7 | Édition conversationnelle et versions | Moyenne | P5, P6 | Élevée |
| P8 | Variantes, profils et finition commerciale | Moyenne | P7 | Moyenne |
| P9 | Robustesse, coûts, sécurité et lancement | Critique avant GA | P1–P8 | Élevée |

## P0 — Contrat et validation fournisseur

**Objectif :** verrouiller les capacités exactes des modèles et les décisions de produit avant le code.

Tâches :
- Interroger `GET /api/v1/images/models` avec la clé d'environnement de test.
- Interroger les endpoints de chaque slug retenu.
- Archiver les capacités par fournisseur : `input_modalities`, `output_modalities`, paramètres, ratios, résolutions, coût par ligne, streaming.
- Vérifier les paramètres spécifiques `image_config` des modèles Gemini sur le chemin choisi.
- Choisir un seul modèle par défaut et un modèle premium.
- Définir le coût interne des crédits et les plafonds de sécurité.
- Décider si le type d'artefact est `image` ou `image_generation` (alignement UI/API/enum SQL).

**Fichiers :** aucun fichier applicatif ; documentation et décision produit uniquement.

**Tests / critères d'acceptation :**
- Modèles retenus réellement présents au catalogue Images.
- Un test de requête minimal en environnement sandbox, génération réelle, réponse image et usage enregistrés.
- Aucune clé ou URL signée dans les logs.
- Contrat de paramètres généré à partir des capacités vérifiées, pas de liste codée en dur.

## P1 — Catalogue et adaptateur OpenRouter

**Objectif :** un accès stable aux modèles d'image via OpenRouter.

Fichiers existants :
- `apps/web/lib/ai/openrouter.ts` (configuration partagée).
- `apps/web/app/api/v1/ai/models/route.ts` (référence de catalogue dynamique).
- `apps/worker/src/ai/llm.ts` (référence de client worker texte).

Nouveaux fichiers indicatifs :
- `apps/worker/src/ai/image-generation.ts` : interface et adaptateur Images API.
- `apps/web/lib/ai/image-models.ts` ou route dédiée : lecture et cache du catalogue.

Tâches :
- Appeler `/images/models` et `/images/models/{author}/{slug}/endpoints`.
- Normaliser les capabilities par provider.
- Sélectionner le modèle/endpoint côté serveur à partir d'un identifiant autorisé.
- Valider chaque paramètre par les `supported_parameters` du provider choisi.
- Parser `data[].b64_json`, `media_type`, `usage.cost`.
- Implémenter Chat Completions multimodal uniquement pour les modèles non servis via Images API ou pour une capacité précisément documentée.

**Dépendances :** P0.  
**Risques :** différences de paramètres et de format de réponse ; modèles retirés/repricing.  
**Tests :** catalogue mocké, provider sans paramètre, modèle indisponible, réponse invalide, coût absent, base64 invalide.  
**Acceptation :** aucun modèle non compatible n'est proposé ; les erreurs sont normalisées ; la clé reste serveur.

## P2 — Données, Storage, crédits et transactions

**Objectif :** assurer la persistance et la facturation fiable avant d'exposer le générateur.

Fichiers existants :
- `supabase/migrations/20261109000000_init.sql` (référence schéma).
- `supabase/migrations/20261109010000_storage.sql` (bucket privé existant).
- `apps/worker/src/worker.ts` (settlement).
- `apps/web/lib/billing.ts` (abonnement workspace distinct du ledger crédits).

Nouveaux fichiers :
- migration table `artifact_image_versions` (nom à valider).
- éventuelles fonctions SQL de création/settlement si besoin.

Tâches :
- Créer la table version/asset liée à `artifacts`.
- Définir RLS lecture via rôle notebook ; écritures serveur seulement.
- Définir stockage versionné dans bucket privé `artifacts`.
- Enregistrer dimensions, MIME, bytes, prompt, modèle, provider, sources, coût USD et usage.
- Ajouter une feature de crédits image, un coût interne et une réservation atomique.
- Vérifier le remboursement en échec/annulation et le comportement d'un échec Storage après génération.
- Mettre en place une suppression Storage fiable et un nettoyage des orphelins.

**Risques :** incohérence DB/Storage, suppression partielle, coût externe malgré timeout.  
**Tests :** migrations, RLS, idempotence, deux requêtes simultanées, succès/échec/remboursement, suppression/cleanup.  
**Acceptation :** une seule réservation par idempotency key ; un échec terminal rembourse ; coût fournisseur réel conservé sans remplacer arbitrairement le prix interne.

## P3 — Génération text-to-image

**Objectif :** premier parcours fonctionnel avec prompt simple.

Fichiers existants :
- `apps/web/app/api/v1/notebooks/[id]/artifacts/route.ts`.
- `apps/worker/src/main.ts`.
- `apps/worker/src/studio/generate.ts`.
- `apps/worker/src/worker.ts`.

Nouveaux fichiers indicatifs :
- `apps/worker/src/studio/image-generation.ts`.
- `apps/worker/src/studio/image-prompt.ts`.

Tâches :
- Ajouter type d'artefact et schéma Zod strict.
- Réutiliser le job `generate_artifact` et le worker.
- Générer l'image, valider et stocker le résultat, mettre à jour l'artefact.
- Ajouter progression : préparation, génération, validation, stockage, finalisation.
- Conserver modèle, prompt final et coût.
- Rendre les retries idempotents et éviter une double requête fournisseur.

**Tests :** prompt-only, provider success, réponse sans image, timeout, erreur 429/5xx, stockage fail, double POST.  
**Acceptation :** image visible en statut ready, artefact listé dans le Studio, pas de base64 dans Postgres, crédit remboursé en cas d'échec terminal.

## P4 — Interface Images IA dans Studio

**Objectif :** ajouter la nouvelle catégorie sans changer le paradigme du Studio.

Fichier principal :
- `apps/web/app/notebook/[id]/studio.tsx`.

Composants potentiels :
- `ImageCreateDialog`, `ImageArtifactViewer`, `ImagePreview` (à créer seulement si le découpage apporte de la lisibilité).

Tâches :
- Ajouter catégorie Images IA.
- Formulaire prompt + modèle compatible + ratio + résolution réellement supportés.
- Afficher le coût en crédits avant confirmation.
- État de génération avec progression et étapes.
- Prévisualisation responsive et haute qualité.
- Réutiliser composants UI et conventions visuelles actuelles.

**Tests frontend :** formulaire, validation, disabled state, loading, ready, failed, permission viewer/editor, mobile.  
**Acceptation :** aucune régression des 13 formats existants ; UX cohérente desktop/mobile ; options non supportées masquées/désactivées.

## P5 — Bibliothèque, viewer, export et suppression

**Objectif :** gérer les créations comme de vrais assets de notebook.

Fichiers :
- `apps/web/app/notebook/[id]/studio.tsx`.
- `apps/web/app/api/v1/artifacts/[id]/route.ts`.
- nouvelle route de lecture/versions si nécessaire.
- migration P2.

Tâches :
- Liste/filtre Images IA.
- Viewer zoomable avec métadonnées et prompt.
- Télécharger via URL signée.
- Dupliquer une création en nouveau parent/artefact ou version selon le modèle validé.
- Supprimer version ou création avec suppression Storage.
- Filtrer par notebook (la liste existante est déjà notebook-scoped).

**Tests :** accès unauthorized, URL expirée, asset absent, delete, duplicate, filtre, format MIME.  
**Acceptation :** seuls les membres autorisés accèdent aux images ; aucun objet orphelin après suppression nominale.

## P6 — Génération à partir des sources

**Objectif :** créer des images factuellement cohérentes avec le notebook.

Fichiers existants :
- `apps/worker/src/studio/generate.ts` (sélection passages et prompt).
- `apps/worker/src/ingest/handler.ts`.
- `apps/worker/src/ingest/extract.ts`.
- `apps/web/app/notebook/[id]/studio.tsx`.

Tâches :
- Réutiliser les sourceIds sélectionnés et la recherche hybride.
- Construire un brief visuel structuré : faits, chiffres, séquences, relations, termes.
- Ajouter provenance/citations au brief.
- Séparer les instructions des documents et le prompt système.
- Détecter les demandes de chiffres non sourcés et les exclure.
- Permettre le choix sources sélectionnées/toutes uniquement si le parcours Studio le permet.

**Risques :** passages incomplets, sources contradictoires, statistiques inventées, prompt injection.  
**Tests :** source vide, sources contradictoires, chiffre absent, injection dans source, aucune source sélectionnée.  
**Acceptation :** aucun chiffre factuel inventé ; les éléments du brief sont traçables vers des sources ; les éléments décoratifs sont explicitement non factuels.

## P7 — Édition conversationnelle et versions

**Objectif :** transformer une image existante par instruction et conserver l'historique.

Tâches :
- Utiliser la version précédente comme référence image.
- Ajouter instruction d'édition courte et structurée.
- Créer une nouvelle version liée à la précédente.
- Préserver prompt original, instruction d'édition, modèle et paramètres.
- Ajouter comparaison avant/après et restauration d'une version antérieure.
- Autoriser plusieurs images de référence selon limites modèle/endpoint.

**Fichiers :** adaptateur P1, table P2, UI P4/P5, worker P3.  
**Tests :** référence manquante, plusieurs références, modèle ne supportant pas image input, édition sans changement, restauration.  
**Acceptation :** chaque édition crée une version distincte ; l'original n'est jamais écrasé.

## P8 — Variantes et finition commerciale

- Génération de variantes uniquement si `n` est supporté par l'endpoint ; sinon plusieurs jobs séparés et tarifés.
- Profils de style et prompts système administrables via le système existant.
- Favoris, recherche, tags et export si demandés par les usages réels.
- Limites par plan : résolution, modèles premium, nombre de générations, stockage.
- Mesure de marge par modèle/provider et alertes sur dérive de coût.

**Acceptation :** les capacités sont pilotées par catalogue ; pas de paramètres fictifs ; limites de plan cohérentes.

## P9 — Stabilisation et lancement

- Tests unitaires, intégration fournisseur mocké et test réel contrôlé.
- Tests E2E des permissions, quota, storage, retry, annulation, suppression.
- Mesure latence, coût moyen, taux d'échec, taille moyenne.
- Politique de rétention et suppression de données.
- Vérification confidentialité et conditions OpenRouter/providers.
- Runbook d'incident et mécanisme de réconciliation des jobs dont le résultat fournisseur est incertain.

**Critère de sortie :** aucun défaut critique de sécurité ou de facturation ; tests ciblés réellement exécutés ; observabilité et nettoyage validés.

## Développement indépendant / parallélisable

- **Voie A :** catalogue OpenRouter et matrice des capacités (P1), indépendant du design UI.
- **Voie B :** schéma d'assets/version et politiques Storage/RLS (P2), après accord sur le modèle.
- **Voie C :** maquette UX du formulaire et viewer (P4), sur fixtures locales, sans appel fournisseur.
- **Voie D :** tests du ledger et de la réservation (P2), en parallèle de l'adaptateur.
- P3 dépend des contrats A et B ; P5 dépend de P2/P4 ; P6 dépend de P3/P4 ; P7 dépend de P5/P6.

## Estimation indicative

| Phase | Complexité | Estimation relative |
|---|---|---|
| P0 | Faible | 0,5–1 j |
| P1 | Moyenne | 1–2 j |
| P2 | Élevée | 2–4 j |
| P3 | Moyenne | 1,5–3 j |
| P4 | Moyenne | 1,5–3 j |
| P5 | Moyenne | 1,5–2,5 j |
| P6 | Élevée | 2–4 j |
| P7 | Élevée | 2–4 j |
| P8 | Moyenne | 1–3 j |
| P9 | Élevée | 2–4 j |

Ces estimations sont des ordres de grandeur pour un développeur connaissant le dépôt, non des engagements. Elles excluent les délais de revue, de configuration de compte et les éventuelles corrections de l'infrastructure existante.
