# Feuille de route d'implémentation

Date : 2026-11-09.

**Hypothèse de charge** : 1 développeur ou développeuse à temps plein, assisté par l'IA.

**Repères** :
- écrans : `Sxx` ([screens-inventory.md](screens-inventory.md)) ;
- parcours : `Fxx` ([user-flows.md](user-flows.md)) ;
- fonctionnalités : IDs de [features.csv](features.csv) ;
- routes : [api-design.md](api-design.md) ;
- tables : [schema.sql](schema.sql).

**Principe** : on construit d'abord une **tranche verticale** qui traverse toute la stack, puis les fonctionnalités indispensables (*must*), puis les souhaitables (*should*), puis les optionnelles (*could*). Chaque jalon a un critère de sortie mesurable et met à jour la colonne `clone` de `features.csv` (score via `/replica-diff`).

| jalon | durée | contenu | à la fin |
| --- | --- | --- | --- |
| M0 Fondations | 1 sem. | dépôt, CI, BDD, auth, worker vide | déploiement de bout en bout |
| M1 Tranche verticale | 2 sem. | F02 → F06 → F09 | PDF → question → citation → note |
| M2 Indispensables | 2 sem. | les 22 fonctionnalités P0 | parité *must* à 100 % |
| M3 Studio texte + monétisation | 3 sem. | rapports, cartes mentales, flashcards, quiz, Stripe | **MVP vendable** (Free + Pro) |
| M4 Partage + RGPD | 2 sem. | partage, liens, export/suppression du compte | **bêta publique** |
| M5 Audio + connecteurs | 3 sem. | résumé audio, Drive, import audio | parité *should* |
| M6 P2 | 3 sem. | deck, infographie, Deep Research, équipes | différenciation |
| M7 | continu | P3 + correctifs issus de `/replica-entrepreneur` | — |

**Total jusqu'au MVP vendable** : environ 8 semaines (M0 à M3). **Jusqu'à la bêta publique** : environ 10 semaines. **Périmètre complet P0 à P2** : environ 16 semaines, soit une **taille L**.

---

## M0 : Fondations (1 semaine) — ✅ fait le 2026-11-09 (sauf déploiements cloud)

> **Réalisé** : monorepo pnpm, Supabase local (ports 583xx), migration `20261109000000_init.sql`, 24 tests pgTAP, auth email + lien magique, `/api/v1/me`, worker (claim/heartbeat/échec/remboursement, 3 tests d'intégration), workflow CI (écrit, non vérifié sur GitHub à la demande de l'utilisateur).
> **Reste** : projet Supabase cloud UE, Vercel, Fly, Sentry (comptes requis), Google OAuth (client Google requis), suivi Realtime de la progression côté UI (aucun job réel avant M1).

| | |
| --- | --- |
| Écrans | S01 (landing minimale), S02 (connexion / inscription) |
| Fonctionnalités | A01 |
| Tables | les 26 tables créées par `0001_init.sql` (= `schema.sql`) ; utilisées à ce stade : `profiles`, `workspaces`, `workspace_members`, `plans` |
| Routes | `/auth/callback`, `/auth/signout`, `GET/PATCH /api/v1/me` |
| Infra | monorepo pnpm (`apps/web`, `apps/worker`, `packages/core`, `packages/db`) ; projet Supabase UE (Francfort) + `supabase start` en local ; Vercel `fra1` ; Fly `fra` (worker : boucle `claim_jobs` + heartbeat, job factice) ; GitHub Actions (lint, typecheck, Vitest, pgTAP, `supabase db lint`, recherche de secrets dans le build) ; Sentry |
| Tests | **pgTAP** : reprendre les 40 assertions déjà validées dans pglite, et ajouter un test vérifiant que chaque table de `public` a la RLS active et aucun droit d'écriture pour `anon` et `authenticated`, puis en ajouter pour Realtime et Storage, qui n'ont pas pu être testés |
| Critère de sortie | Un compte créé en preview donne un workspace personnel ; un job factice passe de `queued` à `succeeded`, sa progression est visible en Realtime ; la CI est verte |

## M1 : Tranche verticale (2 semaines) → F02 → F06 → F09

| | |
| --- | --- |
| Écrans | S03 (liste minimale), S05 (upload, URL, texte), S08 (3 panneaux), S09, S10 (visionneuse avec surlignage), S11 (chat + citations), S24 (note issue du chat, en lecture) |
| Fonctionnalités | A03, B01 (PDF), B03 (URL), B04 (texte), B12, B13, C01, C02, C04, D02, D03 |
| Tables | `notebooks`, `sources`, `chunks`, `source_deselections`, `conversations`, `chat_messages`, `citations`, `jobs`, `usage_ledger` |
| Routes | `POST /notebooks`, `POST /notebooks/:id/uploads`, `POST/GET /notebooks/:id/sources`, `GET /sources/:id`, `PUT /notebooks/:id/selection`, `GET/POST /notebooks/:id/conversations`, `GET/POST /conversations/:id/messages` (SSE), `POST /messages/:id/save-note` |
| Code central | `extract/pdf`, `extract/html` (fetch protégé contre le SSRF), `rag/chunker`, `match_chunks`, adaptateur Claude (streaming + citations sur documents personnalisés), `rag/citations` (mapping et vérification), prompt système d'ancrage |
| Décisions | **D1** fournisseur d'embeddings (test recall@10 sur 50 questions maison) ; mesure du coût par question → éléments pour **D2** |
| Critère de sortie | E2E Playwright : créer un notebook, importer un PDF de 30 pages, poser 3 questions, cliquer une citation (bon passage surligné), enregistrer en note, la note apparaît cochable. Sur le jeu d'évaluation : citations vérifiées ≥ 98 %, refus correct quand l'info est absente, délai avant le premier token (p50) < 3 s |

## M2 : Indispensables (2 semaines) → parité *must* = 22/22

> **État au 2026-11-09 : 22/22 indispensables faits** (M1 + M2), avec en plus le chat via OpenRouter, la facturation simulée et les écrans S03, S08, S10, S11, S24, S28. Testé avec un faux OpenRouter local ; la vraie clé reste à fournir. M3 : Studio texte (rapport, fiches, quiz, carte mentale) et quotas visibles faits le 2026-11-09 ; reste Stripe réel (clés de l'utilisateur) pour clore le MVP vendable. M4 commencé : H01 partage privé, H02 lien de partage et H03 chat seul faits.

| | |
| --- | --- |
| Écrans | S03 complet (onglets, recherche, liste ; état vide ; bannière de limite), S05 complet (états d'import et d'erreur), S24 (éditeur Tiptap), S28 (langue de sortie) |
| Fonctionnalités | A02, A04, A05, B02 (docx, txt, md, csv, pptx, epub), B10, B11, B15, C10, D01, J01, plus A08 (recherche et filtres, *should* observé, peu coûteux) |
| Tables | `profiles` (préférences), `collections` (onglet présent mais vide) |
| Routes | `GET /notebooks` (onglets, recherche, tri), `GET/PATCH/DELETE /notebooks/:id`, `PATCH/DELETE /sources/:id`, `POST /sources/:id/retry`, `POST /notebooks/:id/notes`, `PATCH /notes/:id`, `PATCH /me` |
| Critère de sortie | `/replica-diff` : toutes les *must* à `yes` ; messages d'erreur pour chaque cas d'échec d'import documenté (taille, mots, PDF protégé, paywall) ; suppression d'un notebook qui purge aussi Storage |

## M3 : Studio texte + monétisation (3 semaines) → **MVP vendable**

| | |
| --- | --- |
| Écrans | S12 (Configure Chat), S13 (Studio), S14 (dialogues), S18 (carte mentale), S19 (rapport), S20 (flashcards), S21 (quiz), S29 (Usage), S34 (passage à l'offre supérieure) |
| Fonctionnalités | E01, E02, E03, E04, F01, F02, F03, C03, C05, C07, C08, C09, B14, K01, K03, J02, J03, J04 |
| Tables | `artifacts`, `artifact_reads`, `study_progress`, `subscriptions`, `stripe_events`, `reports` ; `plans` (Free, Pro) |
| Routes | les routes Studio (artefacts : créer, lister, détail, renommer, supprimer, retry, download, read, progress, explain, feedback, cost-estimate) ; `GET /notebooks/:id/overview` ; `PATCH /chat-settings` ; `POST /messages/:id/stop` et `/feedback` ; `DELETE /conversations/:id/messages` ; usage ; billing checkout et portal ; webhook Stripe ; `/plans` ; `/reports` ; `/me/push-subscription` |
| Jobs | `source_guide`, `notebook_overview`, `generate_artifact` (rapport, mind map, flashcards, quiz) ; pg_cron : `requeue_stale_jobs`, `expire_reservations`, `purge_storage` |
| Décisions | **D2** modèles par tâche (selon le coût mesuré au M1–M3) ; calibrage de `credit_cost` ; prix (`/replica-launch`) |
| Critère de sortie | Un compte Free atteint son plafond et voit le message correspondant ; il passe en Pro via Stripe (mode test) et son quota augmente ; un artefact en échec rembourse le crédit ; marge brute estimée positive sur l'usage médian |

## M4 : Partage + RGPD (2 semaines) → **bêta publique**

| | |
| --- | --- |
| Écrans | S25 (Partager), S26 (copie), S32 (vue chat seul), S33 (artefact public), S04 (onglet Découvrir) |
| Fonctionnalités | H01, H02, H03, H04, H05, B17 (Fast Research, fournisseur Tavily via worker), Z04 (posture UE : DPA, registre, page confidentialité) |
| Tables | `notebook_members`, `share_links`, `notebook_visits`, `audit_log` |
| Routes | members (CRUD), links (créer, révoquer), `PATCH /sharing`, `POST /share/:token/accept`, `GET /a/:token`, `POST /notebooks/:id/copy`, `POST /notebooks/:id/research` + `/research/:jobId` + `/import`, `PATCH /notebooks/:id/visit`, `POST /me/export`, `DELETE /me` |
| Jobs | `copy_notebook`, `research` (mode rapide), `export_account`, `delete_account` ; pg_cron `cleanup_invitations` |
| Critère de sortie | Tests pgTAP + E2E : un lien « chat seul » ne permet jamais de lire une source ou un chunk ; la révocation est immédiate ; l'export RGPD contient toutes les données de l'utilisateur ; la suppression du compte ne laisse aucun objet dans Storage |

> **État au 2026-11-10 (M4 en cours)**
>
> | Élément | État |
> | --- | --- |
> | H01 partage privé, H02 lien lecture + chat, H03 lien chat seul | fait |
> | H04 lien public d'un artefact | implémentation ajoutée sur `feat/m4-public-artifacts-research` : jeton aléatoire haché, lecture anonyme limitée au contenu, révocation ; tests et vérification runtime encore à faire |
> | `PATCH /notebooks/:id/visit` | implémenté : un visiteur connecté peut masquer de son accueil le notebook ouvert via un lien, sans révoquer ce lien ; tests à ajouter |
> | H05 copie de notebook (`POST /notebooks/:id/copy`, option `allow_copies`, migration `20261110000000_copy_notebook.sql`) | fait ; test pgTAP `03_copy.test.sql` passé (suite complète : 44 tests) |
> | Export RGPD (`GET /me/export`) | fait, synchrone et en JSON (au lieu du ZIP via job `export_account` prévu) ; à passer en job si les volumes grossissent |
> | Suppression du compte (`DELETE /me`) | fait, synchrone (au lieu du job `delete_account`) avec confirmation par e-mail, au lieu de la double confirmation + ré-authentification prévue ; purge Storage ratée seulement journalisée, le job `purge_storage` n'est pas écrit |
> | Z04 pages `/privacy` et `/terms` | faites ; restent DPA, registre des sous-traitants, rétention chez les fournisseurs d'IA, mentions légales, relecture juridique |
> | B17 Fast Research | implémentation ajoutée sur `feat/m4-public-artifacts-research` : job avec quota atomique, worker Tavily, progression, 5 résultats maximum, sélection et import via `add_source` / `ingest_source` ; tests et validation runtime à faire |
> | S04 Découvrir | interface galerie, recherche locale, ouverture en lecture seule et copie conditionnelle implémentées sur la branche ; migration et tests pgTAP ajoutés, validation runtime à faire |
> | pg_cron `cleanup_invitations` | fonction et planification quotidienne ajoutées si pg_cron est préchargé ; invitations en attente expirent après 30 jours ; test pgTAP ajouté, validation runtime à faire |
>
> Critère de sortie M4 : le critère « suppression sans objet restant dans Storage » n'est garanti qu'en l'absence d'erreur de purge ; aucun test E2E de la suppression ni de l'export n'existe encore. Annulation Stripe à brancher avec le paiement réel.

## M5 : Audio + connecteurs (3 semaines)

> **État au 2026-11-10 — M5 poursuivi sur `feat/m5-audio-connectors`, navigation audio ajoutée sur `feat/m5-audio-overview`**
>
> | Élément | État |
> | --- | --- |
> | B06 import audio | Première tranche implémentée : formats MP3/WAV/M4A/AAC/OGG/FLAC/WEBM acceptés, upload privé Supabase, job d'ingestion, transcription Deepgram Nova-3, segmentation en chunks et stockage des timestamps millisecondes. |
> | Adaptateur STT | Interface isolée dans `apps/worker/src/ai/transcription.ts` ; clé uniquement côté worker (`DEEPGRAM_API_KEY`). Modèle et langue configurables. |
> | Tests | Tests unitaires ajoutés pour l'adaptateur et l'association des timestamps aux chunks ; non exécutés à ce stade. |
> | Reste B06 | Lecteur source et navigation transcript → position audio ajoutés dans la visionneuse : chaque segment horodaté permet de reprendre la lecture au bon instant. Restent le benchmark français (qualité, latence, coût/minute) et les tests d'intégration réels. |
> | B08 Google Drive | Pas encore implémenté : OAuth, sélecteur, import Docs/Slides/Sheets et synchronisation restent à faire. |
> | G01 Audio Overview | G01 génération deux voix ; G02 formats, durées, styles, vitesse et téléchargement ; G03 mixage stéréo, pauses inter-répliques, normalisation loudnorm (−16 LUFS / −1,5 dBTP) et métriques de consommation TTS. Restent validation locale, test réel ffmpeg/ElevenLabs et benchmark qualité/coût. |
>
> **Décision D3 provisoire** : Deepgram Nova-3 est le premier adaptateur STT, car son API expose des segments horodatés. Ce n'est pas une décision fournisseur définitive : comparer la qualité française et le coût réel avant lancement. Sans clé Deepgram, les autres types de sources continuent à fonctionner et une source audio échoue avec un code explicite.
>

| | |
| --- | --- |
| Écrans | S15 (lecteur audio), S30 (apps connectées : Drive) |
| Fonctionnalités | G01, B06, B08, B07, D04, E06, E07, K02, K05 |
| Routes | `/integrations/google-drive`, `POST /sources/:id/sync`, `GET /notes/:id/export` |
| Jobs | `generate_artifact:audio` (script → TTS par segment → ffmpeg), ingestion audio (STT avec horodatage), `sync_source` ; pg_cron `sync_drive_sources`, `release_scheduled` |
| Décisions | **D3** STT et TTS (qualité en français, coût à la minute), **D5** YouTube |
| Critère de sortie | Un audio de 10 minutes généré en moins de 6 minutes, coût mesuré ; une source Drive modifiée est resynchronisée en moins de 15 minutes ; un retry d'audio ne repaie pas les segments TTS déjà produits |

## Studio : extension des formats (tranche en cours)

> Implémentation sur `feat/studio-expanded-artifacts`, PR #49 — à valider par typecheck, tests et exécution avec sources réelles.

| Format | État |
| --- | --- |
| Infographie | Génération Markdown sourcée, rendu SVG dans le Studio, export SVG ; mise en page basée sur les sections et repères détectés. |
| Chronologie | Génération chronologique en Markdown avec citations cliquables vers les passages. |
| Comparaison | Tableau Markdown sourcé ; données manquantes explicitement signalées. |
| Glossaire / FAQ / éditorial / plan d'étude | Génération Markdown dédiée avec citations résolues côté worker. |
| Diagramme | Génération Mermaid ; prévisualisation SVG et éditeur local limités aux flowcharts simples ; export SVG. Les modifications locales ne sont pas persistées dans l'artefact. |
| Suite | Persistance des éditions, moteur Mermaid complet, rendu visuel de la chronologie, version/diff, régénération ciblée, Pack d'étude, exports DOCX/PDF/PPTX, quiz adaptatif et répétition espacée. |

## M6 : P2 (3 semaines)

- Fonctionnalités : G04 (deck : plan → rendu → révisions, PPTX/PDF), G05 (infographie en SVG), B16 (labels automatiques), B18 (Deep Research), C06 (multi-conversations), D05 (corbeille des notes), A06, A07 (collections), B05 (YouTube selon D5), Z01 (workspaces d'équipe + facturation par siège), Z02 (recherche multi-notebooks), B09 (Notion ou OneDrive), F04 (répétition espacée).
- Écrans : S07, S17, S22, S23.
- Routes : `proceed`, `revise`, `labels/auto`, `collections/*`.
- Critère de sortie : parité *should* = 100 %, parité pondérée ≥ 85 %.

## M7 : en continu

- P3 : C11, C13, E05, G02, G03, G06, H06, H07, K04, M01, Z03.
- Correctifs prioritaires issus de `/replica-entrepreneur` (avis réels des utilisateurs de l'original).
- Inférence UE (D4) avant la première vente Entreprise.

---

## Risques principaux et parades

| risque | impact | parade | jalon |
| --- | --- | --- | --- |
| **Coût IA par utilisateur** supérieur au prix de l'offre | marge négative | mesure dès M1, mode intégral avec cache, crédits calibrés, modèle par tâche (D2) | M1 → M3 |
| **Qualité des citations** (passage faux ou citation non vérifiée) | perte de la promesse principale du produit | citations natives sur des chunks + vérification serveur + jeu d'évaluation en CI | M1 |
| **Fuite de données entre tenants** | fatal (confiance, RGPD) | RLS unique et testée par pgTAP, service_role confiné, rôle `chat` sans lecture | M0 → M4 |
| Ingestion fragile (PDF scannés, pages web) | frustration à l'onboarding | OCR de repli, erreurs explicites, retry | M2 |
| Durée et coût de l'audio | quotas épuisés trop vite, attente | worker dédié, cache des segments, plafond journalier | M5 |
| Promesse « UE » mal formulée | risque juridique et commercial | message honnête (stockage en UE, inférence hors UE sauf offre Entreprise) | M4 |
| CGU Google (rappel de la recon) | légal | ne jamais réutiliser de sortie de Gemini Notebook comme donnée ; avis juridique | avant le lancement |

## Définition de « terminé » pour chaque fonctionnalité

1. Les critères d'acceptation de `features.csv` sont vérifiés par un test : E2E, pgTAP ou unitaire.
2. Les états vide, chargement et erreur de l'écran concerné sont implémentés.
3. La RLS est couverte pour lecteur, éditeur, rôle chat et étranger.
4. Le coût IA (si la fonctionnalité en consomme) est enregistré dans `usage_ledger`.
5. La ligne `clone` de `features.csv` passe à `yes` et `/replica-diff` est relancé.

---

## Electron : mises à jour automatiques

> **Implémentation ajoutée sur `feat/electron-auto-updates` — validation de build et publication encore requises.**

- Détection automatique au démarrage d'une version packagée, avec délai initial de 12 secondes.
- Vérification manuelle depuis le menu natif **Leanna Notebook → Rechercher les mises à jour…**.
- Distribution des versions Windows via les GitHub Releases du dépôt `moonback/leanna-notebook`, avec `electron-updater`.
- Consentement explicite avant téléchargement ; progression exposée au renderer via l'API preload sécurisée ; aucune installation forcée pendant une session.
- Une fois le téléchargement terminé, l'utilisateur choisit de redémarrer immédiatement ou de reporter l'installation.
- Publication automatisée par le workflow `.github/workflows/desktop-release.yml` à chaque tag SemVer simple (`1.2.0`) ou préfixé (`v1.2.0`).

**Mise en service :** configurer le secret GitHub Actions `LEANNA_WEB_URL` avec l'origine HTTPS de l'application web ; créer une release en poussant un tag correspondant à la version de `apps/desktop/package.json` (par exemple `1.1.1` ou `v1.1.1`). Le workflow doit publier l'installateur NSIS, `latest.yml` et les artefacts de mise à jour. La version installée doit provenir d'une release GitHub publique.

**À valider avant diffusion :** installation propre, détection d'une version supérieure, téléchargement interrompu/repris, report du redémarrage, installation après fermeture, signature de code Windows (non configurée) et fonctionnement sur une installation existante.
