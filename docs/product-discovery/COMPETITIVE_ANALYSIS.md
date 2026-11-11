# Analyse concurrentielle — Leanna Notebook

- Date de consultation : 11 novembre 2026
- Analyse des pages officielles et documentations publiques ; les offres et disponibilités évoluent rapidement.
- But : identifier les standards à atteindre et les espaces de différenciation, pas reproduire une interface concurrente.

## 1. Synthèse

Le marché converge vers quatre blocs : (1) recherche et réponses sourcées, (2) espaces de contexte / projets, (3) génération de livrables, (4) agents capables d'enchaîner des tâches et d'utiliser des connecteurs. Leanna possède déjà un bon socle des blocs 1 et 2, un Studio riche pour le bloc 3 et un début de multimodalité vocale. Le différenciateur durable doit donc se situer dans la **cohérence du dossier, la complétude, la temporalité et la preuve**, plutôt que dans un nouveau chat ou une nouvelle forme de résumé.

## 2. Lecture par concurrent

### Google NotebookLM / Gemini Notebook
- Forces : notebooks centrés sur les sources, import de PDF, URL, YouTube, audio, Docs/Slides, réponses avec citations et transformations en guides, résumés audio et cartes mentales. Les capacités de communication incluent texte, graphiques, images et audio selon la documentation Google.
- Attentes créées : expérience documentaire simple, sources visibles, réponses fiables, génération de formats pédagogiques.
- Espace différenciant : suivi des versions, détection de contradictions, dossiers incomplets, raisonnement probant et workflows métier.
- Positionnement Leanna : ne pas gagner par copie des formats audio ou cartes mentales ; gagner par gouvernance et exploitation d'un corpus documentaire.
- Source : aide officielle Gemini Notebook / NotebookLM, https://support.google.com/gemininotebook/answer/16164461?hl=fr

### Notion AI
- Forces : agent dans l'espace de travail, Enterprise Search, connecteurs d'apps (par ex. Slack, Google Drive, Jira), notes de réunion, autofill de bases et création de fichiers. Les résultats de recherche d'entreprise citent les sources et respectent le périmètre d'accès.
- Attentes : recherche transversale, automatisation des tâches, contexte du workspace et livrables.
- Espace différenciant : analyse verticale et très profonde d'un dossier, avec preuves atomiques, lacunes, contradictions et versionnage.
- Positionnement Leanna : être un « dossier de connaissance vérifiable » complémentaire aux outils de travail généralistes.
- Sources : https://www.notion.com/help/enterprise-search ; https://www.notion.com/en-gb/help/notion-ai-faqs

### Perplexity
- Forces : recherche web, exploration et synthèse de sources publiques, orientation réponse/citations et parcours de recherche itératif.
- Espace différenciant : réconcilier les informations web avec les documents privés, marquer les divergences et suivre l'évolution d'une source.
- Positionnement Leanna : faire du web une source additionnelle au dossier et non le centre du produit. La recherche web existante via Tavily fournit un point d'intégration.
- Note : les capacités précises Perplexity n'ont pas été auditées dans le code ; cette section décrit le positionnement public général.

### ChatGPT
- Forces : projets et chats, fichiers, recherche web, outils connectés, création de livrables et mode Work pour des tâches longues avec suivi, approbations et tâches planifiées.
- Attentes : assistant généraliste capable de recherche, analyse et production de documents.
- Espace différenciant : spécialisation sur les preuves internes, provenance au niveau de l'affirmation, qualité du corpus et cohérence dans le temps.
- Positionnement Leanna : éviter de rivaliser sur la largeur d'outils généralistes ; exceller dans la traçabilité documentaire.
- Sources : https://chatgpt.com/overview/ ; https://help.openai.com/en/articles/6825453-chatgpt-release-notes

### Claude
- Forces : Projects et connaissances de projet, RAG lorsque le corpus augmente, recherche agentique multi-requêtes, Artifacts éditables et tâches planifiées selon les offres.
- Attentes : raisonnement approfondi, production de livrables, itération et contexte persistant.
- Espace différenciant : audit des faits, contradictions et complétude avec workflow de validation documentaire.
- Positionnement Leanna : rendre le raisonnement inspectable dans le corpus de l'utilisateur, avec décisions et preuves versionnées.
- Sources : https://support.anthropic.com/en/articles/9517075-what-are-projects ; https://support.anthropic.com/en/articles/11088861-using-research-on-claude ; https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them

### Glean
- Forces : recherche d'entreprise dans de nombreux outils, contrôle des permissions, réponses sourcées, compréhension des personnes/équipes, agents qui planifient, explorent, itèrent et produisent.
- Attentes : contexte organisationnel, recherche fédérée et automatisation multi-étapes.
- Espace différenciant : Leanna peut être plus accessible et plus profonde sur un ensemble circonscrit de dossiers, avec comparaison documentaire, qualité des preuves et complétude.
- Positionnement Leanna : ne pas tenter d'égaler immédiatement un catalogue de centaines de connecteurs ; commencer par une expérience excellente sur un notebook.
- Sources : https://docs.glean.com/user-guide/about/what-is-glean ; https://docs.glean.com/agents/introduction ; https://www.glean.com/ai-assistant

## 3. Capacités devenues des standards

Ces fonctions ne suffisent plus à différencier à elles seules :
- Chat sur fichiers / documents.
- Citations et recherche RAG.
- Résumés, quiz, fiches et cartes mentales.
- Audio Overview / synthèse vocale.
- Espaces de projet avec instructions personnalisées.
- Recherche web assistée.
- Génération de rapports et de contenus.
- Choix de modèles ou personnalisation du style.

Leanna possède déjà plusieurs de ces éléments. Il faut les rendre plus fiables et cohérents plutôt que multiplier les variantes.

## 4. Espaces moins banalisés et opportunités

| Espace | Valeur utilisateur | Potentiel Leanna |
|---|---|---|
| Contradictions temporelles | Évite une synthèse erronée | Très fort |
| Complétude d'un dossier | Réduit les oublis et les allers-retours | Très fort |
| Preuve au niveau des affirmations | Permet audit et validation | Très fort |
| Diff de versions et impact sur livrables | Maintient le travail à jour | Fort |
| Graphe d'entités et relations sourcées | Comprend un corpus complexe | Fort |
| Mémoire de projet explicable | Continuité contrôlée | Fort |
| Agents spécialisés en désaccord | Analyse plus robuste | Fort, mais coûteux |
| Workflow documentaire réutilisable | Productivité métier | Fort |
| Veille et changement des sources | Connaissance actualisée | Fort |
| Révision collaborative de preuves | Gouvernance d'équipe | Fort en B2B |

## 5. Positionnement recommandé

**Leanna Notebook : l'espace de travail qui transforme vos documents en connaissances vérifiables, dossiers complets et décisions traçables.**

Trois piliers :
1. **Comprendre** : importer, rechercher, résumer, comparer et visualiser.
2. **Vérifier** : citer, détecter les contradictions, suivre les versions, identifier les lacunes.
3. **Exploiter** : produire des livrables, orchestrer des workflows et collaborer autour des preuves.

## 6. Matrice de différenciation

| Capacité | NotebookLM | Notion AI | ChatGPT / Claude | Glean | Leanna — cible |
|---|---|---|---|---|---|
| Chat sourcé | Cœur de produit | Oui | Oui | Oui | Déjà présent |
| Génération de formats | Forte | Forte | Forte | Forte | Déjà présente |
| Recherche multi-apps | Limitée au corpus / intégrations Google | Forte | Via connecteurs | Très forte | Plus tard |
| Agents et tâches | Progression rapide | Agents | Agents / Work | Agents | Roadmap contrôlée |
| Contradictions entre pièces | Pas le positionnement central | Pas central | Possible par prompt | Possible | Différenciateur prioritaire |
| Dossier incomplet | Pas central | À construire par workflow | Possible par prompt | Possible | Différenciateur prioritaire |
| Preuve atomique et versionnée | Citations | Citations selon recherche | Citations selon outil | Citations | Ambition centrale |
| Mémoire de projet explicable | Notes / contexte selon produit | Workspace | Projects / mémoire | Contexte d'entreprise | Roadmap |

Cette matrice est qualitative, pas un benchmark exhaustif de chaque plan ou version.

## 7. Recommandations stratégiques

- Ne pas investir d'abord dans un catalogue massif de connecteurs.
- Ne pas ajouter des formats Studio sans besoin utilisateur démontré.
- Faire de la preuve une entité produit : provenance, date, version, confiance, revue.
- Prioriser les cas d'usage dossiers (juridique, conformité, achats, recherche, formation) avant de choisir un vertical.
- Mesurer les performances sur un benchmark interne de questions, citations et contradictions.
- Faire de l'agentique une orchestration explicable et approuvable, pas une autonomie opaque.

## Sources officielles consultées

- Google Gemini Notebook : https://support.google.com/gemininotebook/answer/16164461?hl=fr
- Notion Enterprise Search : https://www.notion.com/help/enterprise-search
- Notion AI FAQ : https://www.notion.com/en-gb/help/notion-ai-faqs
- ChatGPT overview : https://chatgpt.com/overview/
- ChatGPT release notes : https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Claude Projects : https://support.anthropic.com/en/articles/9517075-what-are-projects
- Claude Research : https://support.anthropic.com/en/articles/11088861-using-research-on-claude
- Claude Artifacts : https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them
- Glean product guide : https://docs.glean.com/user-guide/about/what-is-glean
- Glean Agents : https://docs.glean.com/agents/introduction
- Glean Assistant : https://www.glean.com/ai-assistant
