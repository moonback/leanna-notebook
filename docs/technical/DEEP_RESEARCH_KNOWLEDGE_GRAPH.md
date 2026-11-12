# Deep Research, Knowledge Graph et contradictions

Ce document décrit trois modules : la recherche approfondie autonome (Deep Research), le graphe de connaissances (Knowledge Graph) et la détection des contradictions entre sources. Il couvre l'architecture, le modèle de données, l'API, la sécurité, le déploiement et la validation.

## 1. Vue d'ensemble

```mermaid
flowchart LR
  UI[Notebook : Recherche · Graphe · Contradictions] -->|POST / GET| API[Routes /api/v1]
  API -->|RPC service_role| DB[(PostgreSQL + RLS)]
  DB --> Q[File jobs]
  Q -->|deep_research : plan → iterate×N → ingest → await_ingest → write| W[Worker]
  W -->|add_source| Q
  Q -->|ingest_source| W
  W -->|knowledge_extract (par source)| W
  W -->|knowledge_contradictions (par notebook, différé)| W
  W -->|rapport + citations| ST[Studio : artifacts / citations]
```

Les deux modules sont reliés sans code dédié. Deep Research ajoute ses sources par `add_source`, comme un import manuel. Chaque ingestion réussie déclenche `knowledge_extract`. Le graphe se met donc à jour pour **toutes** les sources du notebook, qu'elles aient été importées à la main ou trouvées par une recherche. L'analyse des contradictions est ensuite reprogrammée, avec un délai de 30 s pour regrouper les extractions rapprochées.

## 2. Deep Research

### 2.1 Exécution en étapes courtes

La recherche est découpée en jobs `deep_research`. Chaque job exécute **une** étape bornée, la persiste, puis programme la suivante avec `research_enqueue_step`, sous une clé d'idempotence `deep_research:<run>:<n° d'étape>`.

| Étape | Statuts affichés | Travail |
|---|---|---|
| `plan` | `planning` | Analyse de la demande, objectifs, sous-questions et requêtes (LLM, JSON validé) |
| `iterate` | `searching` → `reading` → `extracting` → `cross_checking` | Requêtes web, lecture **complète** des pages, extraction d'informations à citation vérifiée, recoupement, lacunes |
| `ingest` | `extracting` | Ajout des sources retenues au notebook (`add_source`, dédoublonnage) |
| `await_ingest` | `extracting` | Attente **non bloquante** de l'indexation : le job se reprogramme toutes les 8 s, 15 min au plus |
| `write` | `writing` | Passages pertinents (`match_chunks` par sous-question), rapport Markdown, citations vérifiées, artefact Studio |

Ce découpage apporte quatre garanties :

- **Pas d'interblocage.** Un worker unique peut ingérer les sources pendant qu'une recherche attend.
- **Reprise après crash.** Chaque étape repart de l'état enregistré. Les pistes trouvées mais non lues restent au statut `candidate` et sont reprises au tour suivant.
- **Équité.** Une recherche experte ne monopolise pas le worker.
- **Pause, reprise et annulation réelles.** Elles prennent effet entre deux étapes et entre deux pages.

### 2.2 Budgets et arrêt

Les budgets sont figés à la création, dans `create_deep_research` :

| Profondeur | Tours | Sous-questions | Requêtes | Pages | Tokens | Durée |
|---|---|---|---|---|---|---|
| Rapide | 1 | 3 | 4 | 8 | 120 k | 10 min |
| Approfondie | 2 | 5 | 10 | 20 | 300 k | 20 min |
| Experte | 3 | 7 | 18 | 36 | 600 k | 35 min |

- **Répartition par tour.** Chaque tour ne consomme que sa part des requêtes et des pages (`passAllowance`). Il reste ainsi de quoi lancer les recherches complémentaires qui comblent les lacunes.
- **Conditions d'arrêt.** La boucle s'arrête quand l'une de ces conditions est remplie :
  - aucune lacune n'est détectée ;
  - le nombre de tours est atteint ;
  - les requêtes ou les pages sont épuisées ;
  - le budget de tokens, de durée ou de coût est atteint (coût fixé par `DEEP_RESEARCH_MAX_COST_USD`, facultatif) ;
  - le nombre maximal de sources est atteint.
- **Requêtes dédoublonnées.** Une requête complémentaire déjà jouée est ignorée.

### 2.3 Lecture des pages

- **Fournisseur.** Le moteur de recherche passe par l'abstraction `SearchProvider` (`apps/worker/src/research/search.ts`). L'implémentation actuelle est Tavily.
- **Un résultat n'est qu'une piste.** La page est toujours téléchargée et lue en entier (`reader.ts`). Le téléchargement passe par `safeFetch`, qui applique ces protections :
  - DNS résolu une seule fois, IP vérifiée, adresses privées et locales refusées (anti-SSRF) ;
  - 5 redirections au plus, chacune revérifiée ;
  - 10 Mo et 15 s au plus.
- **Contenu retenu.** Le texte principal est extrait avec Readability (ou par extraction PDF). Les métadonnées viennent de la page elle-même, sans rien deviner : URL canonique, auteur, date de publication.
- **Pages écartées.** Chaque page écartée reçoit un motif :
  - contenu trop pauvre (< 600 caractères) ;
  - type non pris en charge ;
  - page injoignable, refusée ou réservée aux abonnés ;
  - doublon d'URL canonique, doublon de contenu (empreinte SHA-256) ou source déjà présente dans le notebook ;
  - pertinence < 50 % ;
  - aucune information vérifiable ;
  - budget atteint.

### 2.4 Citations et rapport

- **Pendant la recherche.** Chaque information extraite d'une page porte une citation **retrouvée mot pour mot** dans le texte lu (`locateQuote`). Une citation introuvable est éliminée.
- **Rapport.** Le rapport est rédigé uniquement à partir des passages indexés du notebook. `resolveCitations` (`packages/core`) supprime tout numéro de passage qui n'a pas été fourni au modèle. Une affirmation non étayée est signalée « (non étayé par les sources) ».
- **Références.** La section « Sources et références » est générée par le code, pas par le modèle. Elle donne l'URL, le domaine, l'auteur, la date de publication et la date de consultation.
- **Artefact Studio.** Le rapport est un artefact `report` (option `template: deep_research`). Il s'ouvre, s'exporte et s'importe comme source avec les fonctions existantes du Studio. Ses citations sont des lignes `citations`. Cliquer sur une citation ouvre la source dans la visionneuse avec le passage surligné, et un lien « Ouvrir la page originale » y est disponible.
- **Formats disponibles :**
  - rapport structuré ;
  - synthèse exécutive ;
  - analyse comparative ;
  - rapport détaillé ;
  - dossier documentaire ;
  - chronologie ;
  - tableau des acteurs ;
  - analyse des risques ;
  - bibliographie ;
  - sans rapport (sources seulement).

## 3. Knowledge Graph

### 3.1 Extraction (job `knowledge_extract`, une source)

1. **Fenêtres.** Les chunks sont découpés en fenêtres d'environ 9 000 caractères. Au-delà de 90 000 caractères par source, l'échantillonnage est régulier.
2. **Appel au modèle.** Le modèle renvoie, en JSON validé élément par élément, des entités, des relations et des affirmations.
3. **Conditions de conservation.** Un élément n'est conservé que s'il est **prouvé** :
   - une entité doit être mentionnée dans le texte, sous son nom ou un alias ;
   - une relation ou une affirmation doit avoir une citation retrouvée dans le passage indiqué.

   Les éléments rejetés sont comptés dans `knowledge_source_state.dropped`.
4. **Relations.** Une relation est `explicit` (déclarée par le texte) ou `inferred` (déduite par le modèle). Une relation déduite est plafonnée à 60 % de confiance, affichée en pointillés et marquée « hypothèse ».
5. **Écriture atomique.** `replace_source_knowledge` remplace en une transaction tout l'apport de la source. Une ré-extraction est donc idempotente.
6. **Isolation des erreurs.** Une fenêtre en échec n'empêche pas les autres. Le job échoue seulement si toutes les fenêtres échouent.

### 3.2 Résolution d'identité

- **Clé normalisée.** La résolution utilise une clé (`entityKey`) calculée ainsi :
  - accents, articles et descripteurs (« l'entreprise ») retirés ;
  - pour les organisations, suffixes juridiques et espaces supprimés : « OpenAI », « Open AI », « l'entreprise OpenAI, Inc. » donnent tous `openai` ;
  - pour les personnes, nom complet conservé : « Martin » ≠ « Paul Martin ».
- **Fusion automatique.** Elle se fait uniquement sur clé ou alias **identique**, dans le même groupe de types (organisation, entreprise et institution forment un groupe). Il n'y a **jamais** de fusion floue de personnes ou d'organisations.
- **Fusion et séparation manuelles.** `merge_knowledge_entities` et `split_knowledge_alias` sont tracées dans `knowledge_merges`, avec un instantané de l'état.

### 3.3 Suppression et réindexation

- **Suppression d'une source.** Mentions, preuves et affirmations sont supprimées en cascade. Le trigger `zz_sources_prune_knowledge` élague ensuite ce qui n'est plus justifié. Une entité encore citée par une autre source est conservée.
- **Réindexation.** `POST /notebooks/:id/knowledge/reindex` relance l'extraction pour toutes les sources prêtes, ou pour une seule.

### 3.4 Visualisation

- **Données.** Le graphe est borné par la base (`knowledge_graph`) : il renvoie les N entités les plus connectées, avec N compris entre 10 et 500 (150 par défaut), et les relations entre elles.
- **Expansion à la demande.** Le voisinage d'un nœud est calculé côté serveur par la fiche entité.
- **Rendu.** SVG avec une simulation `d3-force`. Les interactions disponibles :
  - déplacement des nœuds ;
  - zoom à la molette ou au pincement ;
  - déplacement de la caméra ;
  - recentrage ;
  - double clic pour déplier, puis replier ;
  - connexions indirectes (2 sauts) ;
  - regroupement par communautés (propagation d'étiquettes).
- **Filtres :** type, source, période, confiance minimale, faits déclarés seulement, nombre de nœuds.
- **Panneau latéral.** Pour une entité : alias, passages, affirmations, relations et historique. Pour une relation : « Pourquoi ce lien ? », passages qui confirment ou contredisent, relations parallèles et contradictions liées.

## 4. Contradictions

Le pipeline compte cinq étapes (job `knowledge_contradictions`) :

1. **Affirmations normalisées.** Elles sont produites à l'extraction (`normalize.ts`) :
   - dates avec leur précision (jour, mois, trimestre, année) ;
   - montants avec multiplicateur et devise ;
   - quantités avec unité ;
   - noms normalisés.
2. **Regroupement.** Les affirmations sont regroupées par (entité, attribut). Seules les paires issues de **sources différentes** sont comparées.
3. **Comparaison déterministe** (`compare.ts`). Deux dates compatibles à la précision la plus grossière ne sont pas en contradiction (« mars 2024 » ≈ « 15 mars 2024 »). Les montants ont une tolérance de 0,5 %, portée à 15 % si une valeur est approximative. Des devises ou des unités différentes rendent la paire incomparable.
4. **Classement déterministe** de chaque paire :

   | Situation | Nature |
   |---|---|
   | Valeurs chiffrées incompatibles | `direct` |
   | Contextes différents | `contextual` |
   | Dates d'observation différentes | `obsolete` |
   | Valeur approximative ou peu étayée | `insufficient` |
   | Texte libre divergent | `divergence` |

5. **Qualification par le modèle.** Le LLM **qualifie** les paires candidates, par lots de 8, avec un budget de 60 cas. Il ne peut ni découvrir seul un cas ni effacer un écart chiffré mesuré : un tel écart est seulement rétrogradé « à vérifier ». Un texte libre n'est retenu qu'avec son avis.

L'enregistrement se fait par `replace_contradictions`. L'empreinte d'un cas est stable : elle ne dépend que des sources et des **valeurs normalisées**. Les décisions humaines (`contradiction_reviews`, en ajout seul) sont ainsi restaurées après une réindexation. Un cas revu n'est jamais supprimé automatiquement.

Les actions humaines possibles :

- vérifiée ;
- confirmée ;
- rejetée ;
- obsolète ;
- résolue ;
- rouverte ;
- explication ;
- association d'une source.

## 5. Modèle de données

Migrations :

- `20261112030000_research_knowledge_kinds.sql` : nouvelles valeurs de `job_kind` ;
- `20261112040000_deep_research.sql` ;
- `20261112050000_knowledge_graph.sql`.

| Table | Rôle |
|---|---|
| `research_runs` | Recherche : question, consignes, profondeur, budget et consommation, plan, couverture, étape suivante, rapport, modèles utilisés, crédit |
| `research_events` | Journal en ajout seul des événements `research.*` (base du suivi temps réel) |
| `research_sources` | Pages examinées : URL d'origine et canonique, métadonnées, empreinte, pertinence, statut et motif, source du notebook liée |
| `research_findings` | Informations extraites avec citation vérifiée et support (`single` / `corroborated` / `contested`) |
| `knowledge_entities` / `_entity_aliases` / `_mentions` | Entités, alias normalisés, passages qui les mentionnent |
| `knowledge_relations` / `knowledge_evidence` | Relations typées (`explicit` / `inferred`, confiance, statut de validation) et leurs passages (`supports` / `contradicts`) |
| `knowledge_claims` | Affirmations normalisées avec passage exact |
| `knowledge_merges` | Provenance des fusions et séparations |
| `knowledge_source_state` | État d'extraction par source (statistiques, dernière synchronisation) |
| `knowledge_contradictions` / `contradiction_evidence` / `contradiction_reviews` | Cas détectés, sources ajoutées par un humain, historique des décisions |

- **Sécurité des tables.** Toutes les tables ont la RLS activée. La seule policy est `select` avec `private.notebook_role(notebook_id) >= 'viewer'`. L'accès `anon` est révoqué et aucune écriture n'est ouverte aux clients.
- **Écritures.** Elles passent par les routes serveur, en `service_role`, après `requireRole` et validation Zod, ou par le worker.
- **Fonctions réservées.** Les RPC sont réservées à `service_role`.

`requeue_stale_jobs` passe aussi en échec une recherche dont le worker est mort, et rend le crédit associé.

## 6. API

Toutes les routes exigent une session. Le rôle est vérifié avec `my_notebook_role` (lecture : `viewer`, écriture : `editor`). Une ressource invisible renvoie 404.

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/notebooks/:id/deep-research` | Historique (progression dérivée de l'état persisté) |
| POST | `/api/v1/notebooks/:id/deep-research` | Lancer une recherche. Corps : `question`, `depth`, `maxSources`, `reportFormat`, `instructions?`, `parentRunId?`. En-tête `Idempotency-Key` accepté |
| GET | `/api/v1/deep-research/:runId?after=<eventId>` | État complet : recherche, nouveaux événements, sources, informations, état du job courant |
| POST | `/api/v1/deep-research/:runId` | Action `cancel` / `pause` / `resume` (relance aussi une recherche échouée) / `instruct` |
| GET | `/api/v1/notebooks/:id/knowledge?limit&types&source&from&to&minConfidence` | Graphe borné et indicateurs |
| GET | `/api/v1/notebooks/:id/knowledge/entities?q&type&page&pageSize` | Recherche paginée d'entités |
| POST | `/api/v1/notebooks/:id/knowledge/reindex` | Réextraction. Corps : `{ sourceId? }` |
| GET / POST | `/api/v1/knowledge/entities/:id` | Fiche, voisinage et preuves ; POST `merge` / `split` |
| GET / PATCH | `/api/v1/knowledge/relations/:id` | Preuves et justification ; PATCH du statut de validation |
| GET | `/api/v1/notebooks/:id/knowledge/contradictions?status&kind&page` | Liste et compteurs |
| GET / POST | `/api/v1/knowledge/contradictions/:id` | Fiche et historique ; POST d'une décision humaine |

## 7. Temps réel

La progression vient exclusivement de l'état **persisté** : étape enregistrée, tours effectués, événements `research_events`. Elle ne repose jamais sur un minuteur.

- **Mécanisme.** Le client interroge `GET /deep-research/:runId?after=<dernier événement>` toutes les 2 s tant que la recherche est active. En cas d'erreur, l'intervalle s'allonge progressivement jusqu'à 15 s, puis la synchronisation reprend dès que la connexion revient ou que l'onglet redevient visible.
- **Reconnexion.** Une reconnexion relit simplement l'état. Aucun événement n'est perdu, puisqu'aucun ne transite uniquement par un WebSocket.
- **Supabase Realtime.** Il n'est pas utilisé pour ce module, comme pour le reste de l'application qui s'appuie sur le même mécanisme de relecture.

Événements émis :

- `research.created`, `research.started`, `research.planning` ;
- `research.query.completed` et `research.query.failed` ;
- `research.source.discovered`, `research.source.processed`, `research.source.rejected`, `research.source.added` ;
- `research.progress.updated`, `research.contradiction.detected`, `research.cross_check.failed`, `research.budget` ;
- `research.report.generated`, `research.completed`, `research.failed` ;
- `research.paused`, `research.pause_requested`, `research.resumed`, `research.cancelled`, `research.instruction.added`.

## 8. IA et configuration

- **Fournisseur.** Le module réutilise OpenRouter (`llmFromEnv`). Il ajoute un délai maximal configurable, `OPENROUTER_TIMEOUT_MS`, de 180 s par défaut.
- **Choix du modèle.** Il se fait par tâche dans **Réglages → Intelligence artificielle** (table `ai_model_preferences`) : « Recherche approfondie », « Graphe de connaissances », « Contradictions ». Le rapport utilise le modèle « Rapports ».
- **Sorties JSON.** Elles sont validées par Zod. Une sortie invalide est redemandée une fois avec l'erreur (`llmJson`), puis le job est réessayé avec un backoff.
- **Traçabilité.** Le modèle utilisé est conservé : `research_runs.models`, `knowledge_source_state.model`, `knowledge_contradictions.detector`, `artifacts.content.model`.
- **Injection de prompt.** Pages, passages et citations sont encadrés comme des **données non fiables**, avec une consigne explicite d'ignorer toute instruction qu'ils contiennent. Une sortie du modèle ne peut produire que des éléments vérifiés contre le texte réel.

## 9. Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `TAVILY_API_KEY` | worker (et web pour Fast Research) | **Requise** pour Deep Research. Sans elle, la recherche échoue explicitement et le crédit est rendu |
| `OPENROUTER_API_KEY`, `OPENROUTER_CHAT_MODEL` | worker | Requises pour Deep Research, le graphe et les contradictions |
| `EMBEDDINGS_*` | worker | Facultatives. Améliorent la sélection des passages du rapport (recherche hybride) |
| `DEEP_RESEARCH_MAX_COST_USD` | worker | Facultative. Plafond de coût par recherche, à partir du coût renvoyé par OpenRouter |
| `OPENROUTER_TIMEOUT_MS` | worker | Facultative. Délai maximal d'un appel LLM (180000 par défaut) |

## 10. Déploiement

L'ordre est obligatoire :

1. **Appliquer les migrations** (`supabase db push`), **avant** de déployer le web. L'écran Réglages IA enregistre une préférence pour chaque tâche listée. Tant que la contrainte `ai_model_preferences_feature_key_check` n'est pas mise à jour, l'enregistrement des réglages IA échoue.
2. **Déployer le worker.** Il réclame les nouveaux types de jobs.
3. **Déployer le web.**

Point produit à trancher : `plans.limits.credit_cost.deep_research` n'est pas défini. Une recherche approfondie coûte donc **1 crédit**, comme les autres fonctions sans tarif.

## 11. Tests et validation

| Suite | Commande | Contenu |
|---|---|---|
| Worker (unitaires) | `pnpm --dir apps/worker exec vitest run src/knowledge src/research` | Normalisation (dates FR/EN, montants, quantités, clés d'entités), 6 jeux déterministes de contradictions, faux positifs et faux négatifs, provenance (citation inventée rejetée, offsets exacts), homonymes, décision combinée déterministe + LLM, lecture de pages (canonique, métadonnées, contenu pauvre, SSRF, injoignable), budgets et répartition par tour, fournisseur de recherche, garde-fous du job |
| Web (unitaires) | `pnpm --dir apps/web test` | Progression dérivée de l'état, validation des entrées, filtres bornés, communautés |
| Base (pgTAP) | `pnpm db:test` | `07_deep_research_knowledge.test.sql`, 22 assertions : création atomique et idempotente, pause et reprise, worker mort, annulation, résolution « OpenAI / Open AI », provenance, décisions humaines conservées, isolation RLS entre comptes, élagage à la suppression d'une source |

### Procédure de validation de bout en bout

Prérequis : migrations appliquées, worker démarré avec `TAVILY_API_KEY` et `OPENROUTER_API_KEY`.

1. **Préparer le notebook.** Créer un notebook et y ajouter 2 à 3 sources (PDF ou pages web). Vérifier que l'onglet **Graphe** se remplit après l'indexation : entités, relations, « Dernière synchronisation ».
2. **Lancer une recherche.** Onglet **Recherche approfondie**, profondeur « Rapide », 5 sources. Lancer, puis suivre les étapes, les requêtes, les pages lues et écartées (avec motifs) et l'état du worker.
3. **Tester la reconnexion.** Recharger la page en cours de recherche, puis rouvrir la recherche dans l'historique : l'état est identique.
4. **Contrôler le résultat.** À la fin :
   - les sources apparaissent dans le panneau Sources ;
   - « Ouvrir le rapport » ouvre l'artefact dans le Studio ;
   - cliquer sur une citation surligne le passage ;
   - « Ouvrir la page originale » fonctionne.
5. **Explorer le graphe.** Sélectionner une entité, consulter ses relations, puis ouvrir un passage justificatif.
6. **Provoquer une contradiction.** Ajouter deux textes : « Le projet Atlas a été lancé en mars 2024. » et « Le projet Atlas a été lancé en septembre 2024. » L'onglet **Contradictions** affiche une contradiction directe de date. La confirmer avec une explication, recharger la page : décision et historique sont conservés.
7. **Tester l'isolation.** Se connecter avec un autre compte et ouvrir les URL d'API avec les mêmes identifiants : réponse 404.
8. **Tester l'arrêt.** Annuler une recherche en cours : le worker s'arrête à la vérification suivante et le crédit est rendu.

## 12. Limites connues

- Pour être indexée, une source retenue est téléchargée une seconde fois par le pipeline d'ingestion existant.
- La séparation manuelle d'un alias déplace les mentions écrites sous cette forme, mais pas les relations : elles restent sur l'entité d'origine.
- Le graphe affiche au plus 500 nœuds à la fois. La recherche et l'expansion permettent d'atteindre les autres.
- Le rapport n'est pas éditable en place dans le Studio, comme les autres rapports existants. Il est exportable et peut être importé comme source (note).

## 13. Guide utilisateur

- **Recherche approfondie** (onglet central) :
  1. Posez votre question.
  2. Choisissez la profondeur, le nombre de sources et le format du rapport, et ajoutez au besoin des consignes.
  3. Suivez la recherche en direct. Pendant qu'elle tourne, vous pouvez la mettre en pause, l'annuler, ajouter une consigne ou ouvrir une source.
  4. À la fin, ouvrez le rapport dans le Studio ou approfondissez une sous-question.
- **Graphe** : explorez les personnes, organisations, lieux, technologies… de vos sources. Cliquez sur un élément pour voir **pourquoi** il est là : document, passage exact, page, confiance. Les traits en pointillés sont des hypothèses déduites, et ne sont pas présentés comme des faits.
- **Contradictions** : Leanna compare les affirmations des différentes sources. Chaque cas présente les deux passages et propose vos décisions (vérifiée, confirmée, rejetée, obsolète, résolue…). Les cas revus ne sont jamais supprimés automatiquement.
