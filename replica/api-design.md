# Conception de l'API

Date : 2026-11-09. Les références **Fxx** renvoient à [user-flows.md](user-flows.md), **Sxx** à [screens-inventory.md](screens-inventory.md) et les identifiants comme A03 ou C01 à [features.csv](features.csv).

## Conventions

- **Format** : REST JSON sous `/api/v1`, implémenté en Route Handlers Next.js. Le même contrat sert l'interface et la future API publique (Z03).
- **Authentification** : cookie de session Supabase, ou `Authorization: Bearer <jwt>`. Les routes publiques sont marquées « anonyme ».
- **Qui peut appeler**, d'après `notebook_role` :
  - `auth` : toute personne connectée ;
  - `chat+` : au moins le rôle chat ;
  - `viewer+` : au moins lecteur ;
  - `editor+` : au moins éditeur ;
  - `owner` : propriétaire uniquement.

  Le rôle est vérifié dans le handler. La RLS s'applique en plus à toutes les lectures, et les écritures passent en `service_role` avec une liste blanche de colonnes.
- **Entrées** : validées par des schémas Zod (`packages/core/schemas`). Une entrée invalide renvoie `422 {error:"validation", fields}`.
- **Erreurs** : `{error: code, message}`. Codes possibles :
  - `401 auth_required`, `403 forbidden`, `404 not_found` (la ressource existe peut-être, mais elle est invisible pour cet utilisateur) ;
  - `409 conflict`, `413 too_large` ;
  - `429 quota_daily_exceeded | quota_monthly_exceeded | rate_limited`, avec `resetAt` ;
  - `502 upstream_error`.
- **Asynchrone** : une route qui lance un traitement long renvoie `202 {jobId, …}`. La progression arrive par Realtime (`jobs`), avec `GET /jobs/:id` en repli.
- **Idempotence** : en-tête `Idempotency-Key` accepté sur tous les POST qui créent un job.
- **Pagination** : par curseur (`?cursor=&limit=50`).

---

## F01 Inscription, connexion

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| *(SDK Supabase Auth)* signUp / signInWithPassword / signInWithOtp / signInWithOAuth(google) | Authentification | anonyme | email, mot de passe / fournisseur | session (cookie) |
| GET `/auth/callback` | Échange du code OAuth ou du lien magique contre une session | anonyme | `code`, `next` | redirection 302 |
| POST `/auth/signout` | Déconnexion | auth | — | 204 |

## F02, F03 : créer un notebook et importer des sources

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| POST `/api/v1/notebooks` | Créer un notebook (A03) | auth | `{workspaceId?, title?}` | `201 {notebook}`. 409 `max_notebooks` au-delà du plafond |
| POST `/api/v1/notebooks/:id/uploads` | Obtenir une URL d'upload signée (10 min) | editor+ | `{filename, size, mimeType}` | `{uploadUrl, storagePath}`. 413 si > 200 Mo |
| POST `/api/v1/notebooks/:id/sources` | Créer une ou plusieurs sources et lancer l'ingestion (B01–B04, B08) | editor+ | `{items:[{type:"upload",storagePath,title} \| {type:"url",url} \| {type:"text",title,text} \| {type:"gdrive",fileId}]}` (≤ 50 par appel) | `202 {sources:[{id,status:"pending"}], jobIds}`. 409 `max_sources` |
| GET `/api/v1/notebooks/:id/sources` | Lister les sources, labels et sélection personnelle | viewer+ | — | `{sources[], labels[], deselected[]}` |
| POST `/api/v1/sources/:id/retry` | Relancer une ingestion en échec | editor+ | — | `202 {jobId}` |

## F04, F05 : recherche de sources (Fast / Deep Research)

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| POST `/api/v1/notebooks/:id/research` | Lancer une recherche web (B17) ou approfondie (B18) | editor+ | `{query, mode:"fast"\|"deep", scope:"web"}` | `202 {jobId}` (quota `research` ou `deep_research`) |
| GET `/api/v1/research/:jobId` | Résultats : `[{title,url,why,cited?}]` et rapport (deep) | editor+ | — | `{status, report?, results[]}` |
| POST `/api/v1/research/:jobId/import` | Importer les résultats choisis comme sources | editor+ | `{urls[], includeReport?}` | `202 {sources[], jobIds}` |
| POST `/api/v1/jobs/:id/cancel` | Annuler la recherche (ou tout autre job) | auteur ou editor+ | — | 202 |

## F06, F07, F08, F11 : chat

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| GET `/api/v1/notebooks/:id/conversations` | Liste des conversations de l'utilisateur (un fil au MVP) | chat+ | — | `{conversations[]}` |
| POST `/api/v1/notebooks/:id/conversations` | Créer une conversation (C06, plus tard) | chat+ | `{title?}` | `201` |
| GET `/api/v1/conversations/:id/messages` | Historique avec citations (C04) | propriétaire de la conversation | `?cursor` | `{messages[{…, citations[]}]}` |
| POST `/api/v1/conversations/:id/messages` | **Poser une question, réponse en streaming** (C01, C02) | chat+ | `{text (1–4000), sourceIds?}` | `text/event-stream` : `meta{messageId}`, `delta{text}`, `citation{marker,sourceId,quote,charStart,charEnd,verified}`, `done{usage}`, `error{code}`. 429 si quota épuisé |
| POST `/api/v1/messages/:id/stop` | Arrêter la génération (C07) | auteur | — | 204 (le message passe en `stopped`) |
| POST `/api/v1/messages/:id/feedback` | Avis 👍/👎 (C09) | auteur | `{value:1\|-1, reason?, offensive?}` | 204 |
| DELETE `/api/v1/conversations/:id/messages` | Effacer l'historique (C05) | auteur | — | 204 |
| PUT `/api/v1/notebooks/:id/selection` | Sélection des sources (B12) | chat+ | `{deselectedSourceIds[]}` | 204 |
| PATCH `/api/v1/notebooks/:id/chat-settings` | Style et longueur de réponse (C08) | editor+ | `{chatStyle, customPrompt?, responseLength, outputLanguage?}` | `{notebook}` |
| GET `/api/v1/notebooks/:id/overview` | Résumé et questions suggérées (C03) | chat+ | — | `{overview, suggestedQuestions[]}` |

## F09, F10 : notes

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| POST `/api/v1/notebooks/:id/notes` | Créer une note (D01) | editor+ | `{title, body (doc Tiptap)}` | `201 {source}` + job de réindexation |
| POST `/api/v1/messages/:id/save-note` | Enregistrer une réponse en note avec ses citations (D02) | auteur et editor+ | — | `201 {source}` |
| PATCH `/api/v1/notes/:id` | Modifier une note. Refus si elle contient encore des citations (comportement original) | editor+ | `{title?, body?}` | `{source}`. 409 `note_locked` |
| GET `/api/v1/notes/:id/export` | Exporter (D04) | viewer+ | `?format=md\|docx` | fichier |

## Sources : lecture et gestion (S09, S10)

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| GET `/api/v1/sources/:id` | Détail, Source Guide (B14) et texte extrait pour la visionneuse (B13) | viewer+ | `?range=` (pagination du texte) | `{source, guide, text}` |
| GET `/api/v1/sources/:id/file` | URL signée de l'original (5 min) | viewer+ | — | 302 |
| PATCH `/api/v1/sources/:id` | Renommer ou changer de label (B15, B16) | editor+ | `{title?, labelId?}` | `{source}` |
| DELETE `/api/v1/sources/:id` | Supprimer (les artefacts existants restent inchangés) | editor+ | — | 204 + `purge_storage` |
| POST `/api/v1/sources/:id/sync` | Resynchroniser une source Drive (B08) | editor+ | — | `202 {jobId}` |
| POST `/api/v1/notebooks/:id/labels` | Créer un label | editor+ | `{name}` | 201 |
| POST `/api/v1/notebooks/:id/labels/auto` | Étiquetage automatique (≥ 5 sources) | editor+ | — | `202 {jobId}` |
| PATCH / DELETE `/api/v1/labels/:id` | Renommer ou supprimer un label | editor+ | `{name?, position?}` | 200 / 204 |

## F12 à F18 : Studio

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| POST `/api/v1/notebooks/:id/artifacts` | Générer un artefact (E01–E06, F01–F03, G01, G04, G05) | editor+ | `{type, options (schéma par type), customPrompt?, sourceIds?, reviewOutline?, generateLater?}` | `202 {artifact{id,status}, jobId, creditCost}`. 429 avec `canScheduleLater:true` |
| GET `/api/v1/notebooks/:id/artifacts` | Liste du Studio avec indicateur non lu | viewer+ | — | `{artifacts[{…, unread}]}` |
| GET `/api/v1/artifacts/:id` | Contenu, plan, citations, prompt | viewer+ | — | `{artifact, citations[]}` |
| PATCH `/api/v1/artifacts/:id` | Renommer | editor+ | `{title}` | `{artifact}` |
| DELETE `/api/v1/artifacts/:id` | Supprimer (les liens publics de l'artefact cessent de fonctionner) | editor+ | — | 204 |
| POST `/api/v1/artifacts/:id/proceed` | Valider le plan et lancer le rendu (deck, vidéo) | editor+ | `{feedback?}` | `202 {jobId}` |
| POST `/api/v1/artifacts/:id/revise` | Réviser un deck (crée un nouvel artefact enfant) | editor+ | `{slides:[{index, instruction?, action:"edit"\|"delete"\|"move", to?}]}` | `202 {artifact, jobId}` |
| POST `/api/v1/artifacts/:id/retry` | Relancer après un échec | editor+ | — | `202 {jobId}` |
| GET `/api/v1/artifacts/:id/download` | Fichier (MP3, PNG, PDF, PPTX, CSV, DOCX) | viewer+ | `?format=` | 302 vers une URL signée |
| POST `/api/v1/artifacts/:id/read` | Marquer comme lu (fait disparaître le point bleu) | viewer+ | — | 204 |
| PUT `/api/v1/artifacts/:id/progress` | Progression flashcards / quiz | viewer+ | `{items:[{key,state,answer?}]}` | 204 |
| POST `/api/v1/artifacts/:id/explain` | Expliquer une carte ou une réponse (« Explain ») | viewer+ | `{itemKey}` | `{text, citations[]}` (quota `chat`) |
| POST `/api/v1/artifacts/:id/feedback` | Avis 👍/👎 | viewer+ | `{value, reason?}` | 204 |
| GET `/api/v1/notebooks/:id/cost-estimate` | Coût estimé avant génération (K05) | editor+ | `?type=&options=` | `{credits, remaining}` |

## F19 à F22 : partage et copie

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| GET `/api/v1/notebooks/:id/members` | Liste des membres et invitations (H01) | viewer+ | — | `{members[], links[]}` |
| POST `/api/v1/notebooks/:id/members` | Inviter par email | editor+ | `{emails[] (≤ 50 au total), role}` | `201 {members[]}` + emails. 422 email invalide (Q33), 409 plafond |
| PATCH `/api/v1/notebooks/:id/members/:memberId` | Changer de rôle | editor+ | `{role}` | 200 |
| DELETE `/api/v1/notebooks/:id/members/:memberId` | Retirer un membre (ou se retirer soi-même) | editor+ ou la personne | — | 204 |
| POST `/api/v1/notebooks/:id/links` | Créer un lien public (H02, H03, H04). **Le jeton n'est renvoyé qu'une seule fois.** | editor+ | `{scope:"full"\|"chat_only"\|"artifact", artifactId?}` | `201 {url}` |
| DELETE `/api/v1/links/:id` | Révoquer un lien | editor+ | — | 204 |
| PATCH `/api/v1/notebooks/:id/sharing` | Autoriser les copies | owner | `{allowCopies}` | 200 |
| POST `/api/v1/share/:token/accept` | Ouvrir un lien public : enregistre la visite (S32) | auth | — | `{notebookId, role}`. 404 si le lien est invalide ou révoqué |
| GET `/a/:token` | Page publique d'un artefact, accessible sans compte (S33) | anonyme | — | HTML (lecteur seul) |
| POST `/api/v1/notebooks/:id/copy` | Copier le notebook avec ses sources et artefacts, sans le chat ni les notes (H05) | owner, ou viewer+ si `allowCopies` | `{title?}` | `202 {notebookId, jobId}` |
| GET `/api/v1/notebooks/:id/analytics` | Utilisateurs et requêtes par jour sur 7 jours (H06) | owner | — | `{days[]}` |

## Tableau de bord, collections, notebook (F01, F21, F23 ; S03)

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| GET `/api/v1/notebooks` | Liste paginée (A02, A08) | auth | `?tab=all\|mine\|shared\|featured&q=&sort=recent\|title\|created&collection=&cursor` | `{items[{id,emoji,title,sourceCount,createdAt,role}], nextCursor, limitReached}` |
| GET `/api/v1/notebooks/:id` | En-tête du notebook et rôle courant | chat+ | — | `{notebook, role}` |
| PATCH `/api/v1/notebooks/:id` | Renommer, changer l'emoji (A04, A06) | editor+ | `{title?, emoji?}` | `{notebook}` |
| DELETE `/api/v1/notebooks/:id` | Supprimer, après confirmation côté UI (A05) | owner | — | 204 + `purge_storage` |
| PATCH `/api/v1/notebooks/:id/visit` | Retirer un notebook public de l'accueil | visiteur | `{hidden:true}` | 204 |
| GET / POST `/api/v1/collections` | Lister ou créer une collection (A07) | auth | `{name}` | 200 / 201 |
| PATCH / DELETE `/api/v1/collections/:id` | Renommer ou supprimer | propriétaire | `{name}` | 200 / 204 |
| PUT / DELETE `/api/v1/collections/:id/notebooks/:nbId` | Ajouter un notebook à la collection ou l'en retirer | propriétaire | — | 204 |

## F24, F25, F26 : paramètres, usage, facturation, signalements

| méthode et chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| GET / PATCH `/api/v1/me` | Profil et préférences (J01–J03) | auth | `{displayName?, outputLanguage?, theme?, webNotifications?, dashboardView?}` | `{profile}` |
| POST `/api/v1/me/push-subscription` | Enregistrer l'abonnement Web Push | auth | `{endpoint, keys}` | 204 |
| GET `/api/v1/workspaces/:id/usage` | Crédits restants, plafonds journaliers, date de réinitialisation (K01) | membre | — | `{plan, monthly{used,limit,resetAt}, daily{…}}` |
| POST `/api/v1/workspaces/:id/billing/checkout` | Session Stripe Checkout (K03) | owner / admin | `{planId, interval}` | `{url}` |
| POST `/api/v1/workspaces/:id/billing/portal` | Portail client Stripe | owner / admin | — | `{url}` |
| GET `/api/v1/plans` | Plans publics (page tarifs) | anonyme | — | `{plans[]}` |
| POST `/api/v1/me/export` | Export RGPD (ZIP) | auth | — | `202 {jobId}`, puis email avec lien |
| DELETE `/api/v1/me` | Supprimer le compte | auth (double confirmation + ré-authentification) | `{confirm:"SUPPRIMER"}` | `202 {jobId}` |
| POST `/api/v1/reports` | Envoyer un avis ou signaler un abus (J04) | auth | `{kind, category?, notebookId?, artifactId?, messageId?, body, screenshotPath?}` | 201 |
| GET / PUT / DELETE `/api/v1/integrations/google-drive` | Connecter ou déconnecter Drive (OAuth) | auth | — | état / redirection |

## Jobs

| méthode et chemin | rôle | qui | sortie |
| --- | --- | --- | --- |
| GET `/api/v1/jobs/:id` | État d'un job, en repli si Realtime est indisponible | auteur ou viewer+ | `{status, progress, stage, errorCode}` |
| POST `/api/v1/jobs/:id/cancel` | Annuler (déjà listé en F04/F05) | auteur ou editor+ | 202 |

---

## Webhooks

**Entrants**

| chemin | source | traitement |
| --- | --- | --- |
| POST `/api/webhooks/stripe` | Stripe | Vérification de signature ; `insert into stripe_events … on conflict do nothing` (idempotence) ; événements traités : `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed` ; mise à jour de `subscriptions` et `workspaces.plan_id`. Réponse 200 rapide, traitement synchrone court. |

Google Drive : pas de push notifications au MVP, la synchronisation se fait par cron.

**Sortants** : aucun au MVP. Les webhooks client (`artifact.ready`, `source.ready`) sont prévus avec l'API publique (Z03).

**Appels sortants vers des tiers** (API officielles uniquement, avec nos clés ou l'OAuth de l'utilisateur) :
- Anthropic Messages, avec les server tools web pour la recherche ;
- fournisseur d'embeddings ;
- OCR, STT, TTS ;
- Google Drive API ;
- Stripe ;
- Resend.

**Aucune API privée de Gemini Notebook n'est appelée.**

## Jobs planifiés (pg_cron, avec le worker)

| job | fréquence | rôle |
| --- | --- | --- |
| `requeue_stale_jobs()` | chaque minute | Remet en file les jobs dont le bail a expiré (worker mort), avec backoff |
| `sync_drive_sources` | toutes les 10 min | Crée des jobs `sync_source` pour les sources Drive des notebooks actifs depuis moins de 7 jours |
| `purge_storage` | toutes les heures | Supprime les objets Storage orphelins (notebook, source ou artefact supprimés) et les uploads abandonnés depuis plus de 24 h |
| `release_scheduled` | toutes les 5 min | Repasse en `queued` les artefacts « générer plus tard » dont le quota est de nouveau disponible |
| `expire_reservations` | toutes les 15 min | Rembourse les réservations `reserved` de plus d'1 h sans job actif (filet de sécurité) |
| `cleanup_invitations` | chaque jour | Supprime les invitations sans compte de plus de 30 jours |
| `usage_rollup` | chaque jour | Vue matérialisée du coût IA par workspace (suivi de marge) |

Le worker traite aussi les jobs déclenchés par des événements : `ingest_source`, `source_guide`, `auto_label`, `notebook_overview`, `generate_artifact`, `research`, `copy_notebook`, `export_account`, `delete_account`.

## Décompte

- **84 opérations HTTP au total** (dont 2 pages : `/a/:token` et `/auth/callback`), plus **1 webhook** entrant. Les 4 appels d'authentification passent directement par le SDK Supabase. Ce décompte a été obtenu par script sur ce fichier.
- **7 jobs planifiés**, **9 types de jobs** déclenchés par événement.
