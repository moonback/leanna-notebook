# Audit global — Leanna Notebook

- Date : 11 novembre 2026
- Référence auditée : branche `main`, HEAD `f3269ecdc166eaf9248d9dde30e7da93300a6148`
- Méthode : lecture de l'arbre Git, manifests, routes API, composants clés, worker, migrations SQL, documentation et tests visibles. Audit statique distant : aucune commande de build, aucun test et aucun scénario de production n'a été exécuté.

## 1. Synthèse exécutive

Leanna Notebook est déjà davantage qu'un prototype de chat sur fichiers : c'est un SaaS documentaire multi-utilisateur avec notebooks, rôles, partage, ingestion asynchrone, recherche hybride, citations, Studio multi-formats, recherche web, voix temps réel et client Electron. Le socle produit le plus distinctif est la continuité entre un corpus documentaire privé, des réponses sourcées et des livrables.

Le principal écart stratégique n'est pas le manque de générateurs. Le produit sait déjà transformer les sources en plusieurs formats. Il lui manque surtout une couche de **fiabilité et d'intelligence transversale** : savoir ce qui est couvert, ce qui se contredit, ce qui manque, comment les connaissances évoluent et comment conduire un dossier vers une décision vérifiable.

**Recommandation centrale :** positionner Leanna comme un espace de travail documentaire probant (« de la source à la décision »), plutôt que comme un clone de NotebookLM ou une simple interface multi-modèles.

## 2. Périmètre et limites de preuve

Les affirmations ci-dessous sont classées :
- **Implémenté dans le code inspecté** : comportement repéré dans un composant, une route, un handler ou une migration.
- **Partiel / conditionnel** : chemin présent mais dépendant d'une configuration externe, incomplet ou non validé de bout en bout.
- **Déclaré / non confirmé** : documentation ou enum seuls, sans chemin opérationnel suffisant identifié.
- **Absent dans le périmètre inspecté** : aucun chemin correspondant trouvé dans l'arbre analysé ; cela ne prouve pas une absence absolue hors dépôt.

Les chemins mentionnés sont des points d'ancrage d'audit, pas une garantie de test d'exécution.

## 3. Architecture constatée

### Monorepo

- Racine pnpm workspace avec `apps/web`, `apps/worker`, `apps/desktop`, `packages/core` et `supabase`.
- Web : Next.js 15.5.29, React 19.1, TypeScript, Tailwind CSS 4, Radix UI, Zod et Vitest.
- Worker : Node.js / TypeScript natif, processus séparé qui consomme une file persistée dans PostgreSQL.
- Desktop : Electron 38, electron-builder et electron-updater ; le client charge l'application web configurée, il n'embarque pas un second produit métier indépendant.
- Core : package partagé concentré sur la résolution des citations.
- pnpm-lock et workspace déclarés. Les scripts racine exposent typecheck, test, lint, Supabase et packaging Windows.

### Flux de données

1. Le navigateur authentifié accède aux routes Next.js.
2. Les routes contrôlent utilisateur et rôle notebook, valident les payloads Zod puis utilisent le client Supabase adapté.
3. Les opérations longues créent des jobs en base et répondent généralement HTTP 202.
4. Le worker réclame les jobs via RPC, renouvelle un bail, rapporte une progression et traite les tâches avec retry/backoff.
5. Les résultats sont persistés en base / Storage puis relus par le client.

### Données et sécurité

Les migrations montrent PostgreSQL avec extensions vector, pg_trgm et unaccent ; workspaces, workspace_members, notebooks, sources, chunks, conversations, messages, citations, artifacts, jobs, usage/quota, partage et préférences IA. Les données volumineuses portent des identifiants workspace/notebook dénormalisés pour faciliter RLS. Buckets privés et politiques de sécurité sont présents dans les migrations.

L'accès utilise Supabase Auth, des rôles notebook (chat/viewer/editor/owner), RLS, validations Zod et RPC transactionnelles pour plusieurs opérations critiques. Les routes utilisent parfois service_role après vérification explicite de l'utilisateur et du rôle : chaque nouvelle route devra reproduire cette discipline. Les pages partagées par token constituent une surface à auditer spécifiquement.

### IA et intégrations

- OpenRouter : chat en streaming compatible API OpenAI, embeddings configurables, dimension déclarée 1024.
- Gemini Live : session audio temps réel, jeton éphémère créé côté serveur ; le secret API durable ne part pas au navigateur.
- Deepgram : transcription audio du worker.
- ElevenLabs + ffmpeg : rendu Audio Overview.
- Tavily : recherche web rapide dans le worker.
- Supabase : Auth, Postgres, Storage, RLS et jobs.
- Embeddings optionnels : sans fournisseur configuré, l'ingestion continue en plein texte ; la recherche vectorielle est alors indisponible.

## 4. Inventaire des fonctionnalités vérifiées

| Domaine | État dans le code inspecté | Preuve / réserve |
|---|---|---|
| Authentification | Implémenté | Actions auth, callback, Supabase server client |
| Workspaces / notebooks / rôles | Implémenté | Tables, RPC et contrôle `requireRole` |
| Partage et membres | Implémenté | Routes members, links, share, pages token |
| Import de sources | Implémenté, formats limités | POST sources, worker ingest |
| PDF texte, DOCX, PPTX, EPUB, TXT/MD/CSV, URL, audio | Implémenté selon config | `worker/src/ingest/extract.ts`, `office.ts`, transcription conditionnelle |
| PDF scanné / OCR | Absent | Le code retourne explicitement `needs_ocr` |
| Image / vidéo / YouTube / Google Drive | Non confirmé en ingestion opérationnelle | Types enum existent ; extraction correspondante non repérée dans le switch inspecté |
| Découpage et embeddings | Implémenté / conditionnel | chunker + embedder optionnel |
| Recherche hybride RAG | Implémenté | route messages, match_chunks, embeddings et FTS |
| Chat streaming SSE | Implémenté | route conversations/messages |
| Citations vérifiées | Implémenté | `@notebook/core/citations`, références filtrées aux passages récupérés |
| Résumé source / vue d'ensemble | Implémenté / conditionnel | jobs guide/overview si LLM configuré |
| Notes | Implémenté | routes notes et source kind note |
| Studio | Implémenté pour 13 types API | report, flashcards, quiz, mind_map, audio, infographic, timeline, comparison, glossary, faq, diagram, editorial, study_plan |
| Audio Overview | Implémenté / conditionnel | TTS segmenté et ffmpeg, dépend d'ElevenLabs et du binaire |
| Infographie | Génération textuelle / rendu visuel à valider | Prompt construit du Markdown ; ne pas présumer un SVG ou HTML natif |
| Fast Research | Implémenté / conditionnel | Tavily, résultats limités, import via parcours séparé |
| Découvrir | Implémenté partiellement | Pages et routes open/import présentes ; expérience complète non testée |
| Modèles IA | Implémenté partiellement | préférences par feature et catalogue OpenRouter ; couverture à vérifier feature par feature |
| Prompts système | Implémenté | catalogue + UI + GET/PUT/DELETE, overrides par utilisateur |
| Voix Leanna + Roxane | Implémenté / conditionnel | Gemini Live, RAG, double socket, Roxane off par défaut et invitation après deux tours |
| Mode vidéo | Non confirmé comme capacité opérationnelle | aucune route / pipeline vidéo utilisable prouvée dans le code examiné |
| Electron | Implémenté / validation packaging nécessaire | IPC limité, isolation, mises à jour via electron-updater |
| Facturation | Partielle / simulée par défaut selon README | configuration billing ; flux réel à valider |
| Collaboration temps réel multi-éditeur | Partielle / non confirmée | membres et partage présents ; coédition temps réel non prouvée |
| Historique / mémoire persistante IA | Historique chat présent ; mémoire de connaissances absente | messages stockés ; pas de mémoire longue structurée repérée |
| Tests | Présents | Vitest, tests worker, core et SQL ; non exécutés durant cet audit |

### Point important : écarts de schéma et d'implémentation

La migration initiale contient des enums historiques `source_kind` (image, video, youtube, gdrive) et `artifact_type` (data_table, video, slide_deck) plus larges que les chemins de traitement constatés. La route Studio accepte exactement 13 types, dont certains ont été ajoutés par migrations suivantes. Ne pas déduire une fonctionnalité livrée d'un enum SQL ou d'une documentation.

Le README indique lui-même que Google Drive n'est pas confirmé, que l'OCR n'est pas disponible, que les présentations ne sont pas acceptées par le schéma de création Studio et que les validations end-to-end restent à faire.

## 5. Audit UX/UI

### Forces observées

- Espace notebook organisé en trois zones explicites : Sources, Chat et Studio (`workspace.tsx`).
- Largeurs de panneaux ajustables, repliables et persistées en localStorage.
- Adaptation mobile avec onglets ; rôles distincts pour consultation, chat et édition.
- Citations ouvrables depuis chat, Studio et voix.
- Studio structuré par types d'artefacts, suivi de génération, progression, erreurs contextualisées et notification quand un rendu finit en arrière-plan.
- Mode vocal réductible en barre basse ou déployable plein écran ; états d'écoute/parole, mute, arrêt, historique et sources visibles.
- Réglages par onglets et éditeur de prompts avec recherche, restauration et indication des personnalisations.

### Frictions et risques UX

1. **Découverte** : 13 types de Studio créent une palette riche, mais le choix peut devenir une liste d'outils plutôt qu'un parcours guidé par l'objectif.
2. **Confiance** : les citations existent, mais l'interface ne synthétise pas encore la couverture, les zones non sourcées, les divergences et le niveau de confiance d'un dossier.
3. **État des sources** : états pending/processing/ready/failed sont disponibles ; il manque un tableau de santé du corpus et des actions de résolution groupées.
4. **Recherche** : Fast Research et chat RAG sont deux gestes séparés ; la frontière entre connaissance interne et information web pourrait être plus explicite.
5. **Studio** : la génération est asynchrone, mais la traçabilité des versions, des sources exactes et des changements entre rendus n'est pas un objet produit de premier plan.
6. **Voix** : le composant concentre transport, audio, recherche, état, transcription et interface ; diagnostic, reconnexion et continuité inter-onglets ne sont pas démontrés.
7. **Personnalisation IA** : l'éditeur de prompts est utile mais expose des instructions sensibles sans simulation, comparaison, versionnage ni diagnostic d'impact.
8. **Responsive / accessibilité** : la présence de composants Radix et d'ARIA est positive ; audit clavier, lecteur d'écran, zoom et densité réelle à effectuer sur navigateur.

### Regroupements UX recommandés

- Unifier « poser une question », « rechercher sur le web » et « explorer les sources » sous une entrée Recherche, avec périmètre explicite : notebook, web ou mixte.
- Transformer le Studio en « objectifs » (comprendre, comparer, apprendre, décider, produire) puis proposer le format adéquat.
- Rassembler progression d'ingestion, erreurs, OCR manquant, indexation et disponibilité RAG dans un centre de santé des sources.
- Ajouter une vue « preuves » commune à chat, Studio et voix au lieu de trois présentations de citations légèrement différentes.

## 6. Forces, faiblesses et opportunités

**Forces**
- Base multi-tenant et sécurité structurée.
- Pipeline asynchrone réutilisable.
- Recherche hybride et citations vérifiables.
- Corpus de fonctionnalités déjà riche.
- Personnalisation des prompts et des modèles.
- Première expérience multimodale audio/voix.

**Faiblesses / limites**
- Ingestion hétérogène et OCR absent.
- RAG essentiellement orienté retrieval de passages, pas raisonnement auditable multi-documents.
- Peu de gestion explicite des contradictions, lacunes, temporalité et provenance.
- Pas de mémoire de projet durable, contrôlée et explicable.
- Peu d'automatisations récurrentes ou événementielles.
- Tests et parcours de production non exécutés dans cette mission.
- Architecture du composant vocal monolithique et dépendances fournisseurs.

**Opportunité produit**
Créer une couche de connaissance structurée au-dessus des sources : entités, faits, dates, preuves, contradictions, lacunes, questions ouvertes, décisions et actions. Cette couche rendrait les fonctionnalités Studio et agents plus pertinentes sans multiplier les générateurs.

## 7. Risques techniques transverses

- **Qualité des données** : extraction imparfaite, OCR, doublons, documents versionnés.
- **Hallucinations** : toute nouvelle fonction doit conserver la résolution des citations et marquer les inférences.
- **Sécurité** : cloisonnement workspace/notebook et permissions source par source, y compris dans les jobs.
- **Coûts** : extraction, embeddings, agents parallèles et surveillance périodique nécessitent quotas et budgets par tâche.
- **Asynchronisme** : réutiliser jobs, leases, retries, annulation et progression ; ne pas créer une seconde file.
- **Observabilité** : tracer modèle, prompt version, sources récupérées, coût, latence et erreurs sans enregistrer inutilement des données sensibles.
- **Fournisseurs** : abstraire les capacités réelles, prévoir fallback et éviter les noms de modèles codés en dur.
- **Migration** : évolution incrémentale et indexation arrière-plan ; ne pas déployer une migration de schéma sans tests RLS.

## 8. Recommandations immédiates d'audit complémentaire

Avant une implémentation P0 :
1. Exécuter typecheck, lint, tests Vitest, tests pgTAP et build Electron sur un environnement local.
2. Tester les parcours d'import et d'échec par type de fichier.
3. Vérifier chaque type d'artefact de la création au rendu et à l'export.
4. Auditer toutes les routes utilisant service_role et toutes les policies RLS.
5. Mesurer qualité retrieval/citations sur un corpus de référence.
6. Vérifier la configuration et le cycle de mise à jour Electron en environnement publié.

## 9. Conclusion

Leanna Notebook possède déjà les fondations nécessaires à une plateforme documentaire avancée. Le meilleur investissement n'est pas d'ajouter 20 formats supplémentaires : c'est de rendre le corpus plus intelligent, la preuve plus visible, la recherche plus profonde et les actions plus sûres. Les 20 idées du document associé sont conçues comme des couches réutilisables au-dessus de l'architecture actuelle, pas comme une refonte.
