# Référence API

Préfixe indiqué dans le README : `/api/v1`. Authentification par cookie de session ; validation Zod et contrôle d'origine sur les écritures selon le README.

| Ressource | Routes recensées dans le README |
|---|---|
| Profil | GET/PATCH/DELETE /me ; GET /me/export |
| Notebooks | GET/POST /notebooks ; GET/PATCH/DELETE /notebooks/:id ; POST /notebooks/:id/copy |
| Sources | POST /notebooks/:id/uploads ; GET/POST /notebooks/:id/sources ; PUT /notebooks/:id/selection ; GET/PATCH/DELETE /sources/:id |
| Notes | POST /notebooks/:id/notes ; GET/PATCH /notes/:id ; POST /messages/:id/save-note |
| Chat | GET/POST /notebooks/:id/conversations ; GET/POST/DELETE /conversations/:id/messages ; POST /messages/:id/feedback |
| Vocal | POST /notebooks/:id/voice-token ; POST /notebooks/:id/voice-search |
| Studio | GET/POST /notebooks/:id/artifacts ; GET/DELETE /artifacts/:id ; PUT/DELETE /artifacts/:id/progress |
| Partage | GET/POST /notebooks/:id/members ; PATCH/DELETE /notebook-members/:id ; GET/POST /notebooks/:id/links ; DELETE /share-links/:id |
| Autres | POST /workspaces/:id/billing ; POST /reports |

Codes signalés : 401, 403, 404, 409, 422, 429 et 503. Les handlers n'ayant pas été inspectés route par route, ceci n'est pas un contrat OpenAPI ; paramètres, schémas et réponses exactes restent à extraire.