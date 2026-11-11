# Référence API

Préfixe : `/api/v1`. Les 38 handlers ci-dessous ont été parcourus sur `main` le 11 novembre 2026 pour relever les méthodes exportées. Les contrôles d'accès utilisent la session utilisateur et, pour les ressources notebook, des rôles tels que `viewer`, `editor`, `chat` et `owner`. La matrice des rôles doit être lue dans chaque handler : elle n'est pas uniforme pour toutes les méthodes d'une même route.

## Inventaire exhaustif des handlers et méthodes

| Ressource | Méthodes |
|---|---|
| `/ai/models` | GET, PUT |
| `/artifacts/:id` | GET, DELETE |
| `/artifacts/:id/audio` | GET |
| `/artifacts/:id/progress` | PUT, DELETE |
| `/artifacts/:id/share` | POST |
| `/conversations/:id/messages` | GET, POST, DELETE |
| `/conversations/:id/voice-messages` | POST |
| `/discover/:id/open` | POST |
| `/me` | GET, PATCH, DELETE |
| `/me/export` | GET |
| `/messages/:id/feedback` | POST |
| `/messages/:id/save-note` | POST |
| `/notebook-members/:id` | PATCH, DELETE |
| `/notebooks` | GET, POST |
| `/notebooks/:id` | GET, PATCH, DELETE |
| `/notebooks/:id/artifacts` | GET, POST |
| `/notebooks/:id/artifacts/suggestions` | POST |
| `/notebooks/:id/conversations` | GET, POST |
| `/notebooks/:id/copy` | POST |
| `/notebooks/:id/links` | GET, POST |
| `/notebooks/:id/members` | GET, POST |
| `/notebooks/:id/notes` | POST |
| `/notebooks/:id/research` | POST |
| `/notebooks/:id/selection` | PUT |
| `/notebooks/:id/sources` | GET, POST |
| `/notebooks/:id/uploads` | POST |
| `/notebooks/:id/visit` | PATCH |
| `/notebooks/:id/voice-search` | POST |
| `/notebooks/:id/voice-token` | POST |
| `/notes/:id` | GET, PATCH |
| `/reports` | POST |
| `/research/:jobId` | GET |
| `/research/:jobId/import` | POST |
| `/settings/system-prompts` | GET, PUT, DELETE |
| `/share-links/:id` | DELETE |
| `/sources/:id` | GET, PATCH, DELETE |
| `/sources/:id/file` | GET |
| `/workspaces/:id/billing` | POST |

## Contrats et comportements vérifiés

### Chat — `/conversations/:id/messages`

- `GET` : historique de la conversation.
- `POST` : corps `{ text, sourceIds? }`, texte de 1 à 4 000 caractères et au plus 600 identifiants de sources.
- `DELETE` : efface les messages non en cours de la conversation.
- Le handler vérifie la session, l'appartenance de la conversation et le rôle notebook `chat`. La réponse est diffusée en SSE. Il réserve l'usage, récupère les passages via `match_chunks`, assemble le prompt avec l'override `chat` et règle les quotas selon le résultat.

### Création des artefacts — `/notebooks/:id/artifacts`

- `GET` : liste les artefacts, leur état, progression et indicateur non lu ; rôle minimal `viewer`.
- `POST` : rôle minimal `editor`, validation Zod, clé d'idempotence facultative ; réserve quota, crée l'artefact et le job via `create_artifact`, puis retourne HTTP 202.
- Types acceptés : `report`, `flashcards`, `quiz`, `mind_map`, `audio`, `infographic`, `timeline`, `comparison`, `glossary`, `faq`, `diagram`, `editorial`, `study_plan`.

### Jeton vocal — `/notebooks/:id/voice-token`

- `POST` : rôle minimal `viewer`, corps avec voix et persona facultatives.
- Personas : `leanna` ou `roxane`. Voix préconstruites acceptées : Aoede, Charon, Fenrir, Kore, Puck, Leda, Orus, Zephyr.
- Le serveur utilise `GEMINI_API_KEY` et fournit un jeton éphémère Gemini Live ; la clé longue durée reste côté serveur.

### Recherche vocale — `/notebooks/:id/voice-search`

- `POST` : rôle minimal `viewer`, corps `{ query }` (2 à 2 000 caractères).
- Recherche limitée aux sources prêtes et sélectionnées du notebook courant ; retourne des extraits et leurs métadonnées de citation. Le handler réserve puis règle l'usage.

### Prompts système — `/settings/system-prompts`

- `GET` : catalogue et overrides de l'utilisateur.
- `PUT` : enregistre ou réinitialise une clé connue.
- `DELETE?key=...` : supprime un override.
- L'accès est lié à la session et les clés sont validées contre le catalogue.

### Modèles IA — `/ai/models`

- `GET` : fonctionnalités, modèles compatibles et préférences utilisateur.
- `PUT` : valide les modèles et modalités avant d'enregistrer les préférences.

### Partage et fichiers

- La gestion des membres et liens de partage est réservée au propriétaire du notebook.
- Les fichiers sources et audio sont délivrés via des URL signées à durée limitée après contrôle du rôle.
- La copie de notebook utilise la fonction SQL `copy_notebook` et copie également les objets Storage concernés.

## Conventions d'accès observées

- `viewer` : lecture des notebooks, sources, artefacts et accès vocal.
- `editor` : création/modification de sources, notes, recherche et artefacts.
- `chat` : accès aux conversations et à certaines actions de consultation.
- `owner` : gestion des membres et liens de partage, et suppression du notebook.
- Certaines routes hors notebook utilisent directement `requireUser()` ou des vérifications métier spécifiques.

Cette synthèse ne remplace pas la lecture du handler avant toute intégration cliente : les validations Zod, champs facultatifs, codes d'erreur, effets secondaires et règles de rôle varient selon la route. Aucun schéma OpenAPI généré n'est présent dans cette documentation.
