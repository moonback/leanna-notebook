# Référence API

Préfixe : `/api/v1`. Les handlers Next.js utilisent les utilitaires d'authentification/autorisation du projet et plusieurs valident les payloads avec Zod. Les chemins ci-dessous proviennent de l'arborescence actuelle ; les méthodes indiquées comme confirmées ont été vérifiées dans le handler correspondant. Ce document n'est pas encore une spécification OpenAPI exhaustive.

## Inventaire des routes

| Domaine | Chemins |
|---|---|
| IA et réglages | `/ai/models`, `/settings/system-prompts` |
| Profil | `/me`, `/me/export` |
| Notebooks | `/notebooks`, `/notebooks/:id`, `/notebooks/:id/copy`, `/notebooks/:id/visit` |
| Sources | `/notebooks/:id/sources`, `/notebooks/:id/uploads`, `/notebooks/:id/selection`, `/sources/:id`, `/sources/:id/file` |
| Recherche | `/notebooks/:id/research`, `/research/:jobId`, `/research/:jobId/import`, `/discover/:id/open` |
| Chat et notes | `/notebooks/:id/conversations`, `/conversations/:id/messages`, `/conversations/:id/voice-messages`, `/messages/:id/feedback`, `/messages/:id/save-note`, `/notebooks/:id/notes`, `/notes/:id` |
| Vocal | `/notebooks/:id/voice-token`, `/notebooks/:id/voice-search` |
| Studio | `/notebooks/:id/artifacts`, `/notebooks/:id/artifacts/suggestions`, `/artifacts/:id`, `/artifacts/:id/progress`, `/artifacts/:id/audio`, `/artifacts/:id/share` |
| Partage | `/notebooks/:id/members`, `/notebook-members/:id`, `/notebooks/:id/links`, `/share-links/:id` |
| Autres | `/reports`, `/workspaces/:id/billing` |

## Contrats vérifiés

### Chat — `/conversations/:id/messages`

- `GET` : historique de la conversation et citations.
- `POST` : corps `{ text, sourceIds? }`, texte de 1 à 4 000 caractères et au plus 600 identifiants de sources.
- `DELETE` : efface les messages non en cours de la conversation.
- Le handler vérifie que la conversation appartient à l'utilisateur et le rôle notebook `chat`. La réponse est diffusée en SSE ; les citations sont résolues contre les passages réellement récupérés.

### Création des artefacts — `/notebooks/:id/artifacts`

- `GET` : liste les artefacts, leur état, progression et indicateur non lu ; rôle minimal `viewer`.
- `POST` : rôle minimal `editor`, validation Zod, clé d'idempotence facultative ; réserve quota, crée l'artefact et le job via `create_artifact`, puis retourne HTTP 202.
- Types acceptés : `report`, `flashcards`, `quiz`, `mind_map`, `audio`, `infographic`, `timeline`, `comparison`, `glossary`, `faq`, `diagram`, `editorial`, `study_plan`.

### Jeton vocal — `/notebooks/:id/voice-token`

- `POST` : rôle minimal `viewer`, corps `{ voice?, persona? }`.
- Personas : `leanna` ou `roxane`. Voix préconstruites acceptées : Aoede, Charon, Fenrir, Kore, Puck, Leda, Orus, Zephyr.
- Le serveur utilise `GEMINI_API_KEY` et fournit un jeton éphémère Gemini Live ; la clé longue durée reste côté serveur.

### Recherche vocale — `/notebooks/:id/voice-search`

- `POST` : rôle minimal `viewer`, corps `{ query }` (2 à 2 000 caractères).
- Recherche limitée aux sources prêtes et sélectionnées du notebook courant ; retourne des extraits et leurs métadonnées de citation.

### Prompts système — `/settings/system-prompts`

- `GET` : catalogue et overrides de l'utilisateur.
- `PUT` : enregistre ou réinitialise une clé connue.
- `DELETE?key=...` : supprime un override.

### Modèles IA — `/ai/models`

- `GET` : fonctionnalités, catalogue OpenRouter compatible et préférences.
- `PUT` : valide les modèles et leurs modalités avant d'enregistrer les préférences utilisateur.

## Limites

Les 38 fichiers de route sont recensés dans l'arborescence. Les contrats détaillés ci-dessus ne couvrent que les handlers inspectés dans cette passe. Pour les autres routes, consulter directement `apps/web/app/api/v1/**/route.ts` avant de figer méthodes, paramètres, réponses ou codes d'erreur.
