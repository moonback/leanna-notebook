# Cahier des charges — Leanna Browser piloté à la voix (Leanna + Roxane)

- Dépôt : moonback/leanna-notebook
- Branche : feat/browser-voice-duo-integration
- Base : main, commit de départ vérifié avant création de la branche
- Statut : spécification approuvée, implémentation à réaliser
- Date : 2026-11-13
- Configuration : navigateur Electron intégré, autonomie hybride, duo vocal Leanna + Roxane.

## 1. Objectif

Permettre à l'utilisateur de piloter le Leanna Browser déjà intégré par la conversation vocale existante. L'utilisateur parle à Leanna ; elle comprend l'intention, planifie une mission, appelle les outils du navigateur, observe les résultats réels, vérifie les changements et restitue le résultat oralement. Roxane intervient comme seconde voix pour apporter une remarque critique, relever une limite ou poser une question utile.

Parcours cible :
1. « Leanna, ouvre le site de mon fournisseur et cherche le modèle X. »
2. Leanna ouvre le site dans le navigateur intégré et annonce l'étape.
3. Elle lit la page, recherche les informations et peut comparer plusieurs onglets.
4. Elle restitue les résultats oralement ; Roxane peut relever une limite ou une contradiction.
5. Toute action engageante déclenche une confirmation visible et explicite.
6. L'utilisateur peut dire « stop » ou utiliser le bouton d'arrêt à tout moment.

Ce projet est une intégration, pas une réécriture du navigateur. Chromium, WebContentsView, BrowserManager, BrowserAgent, les contrats IPC et la boucle d'agent existante sont conservés.

## 2. Audit de l'existant

### 2.1 Navigateur déjà implémenté

Le dépôt contient :
- Electron 38 et WebContentsView par onglet.
- Renderer Next.js communiquant avec le processus Main via window.leannaDesktop.browser.
- Pages distantes isolées : pas de preload, pas de Node, sandbox et context isolation.
- Agent dans le processus Main : apps/desktop/src/browser/browser-agent.ts.
- Outils et validation stricte : apps/desktop/src/browser/agent-tools.ts.
- Garde-fous, provenance URL/texte, modes, confirmations, interruption et signature de l'élément approuvé.
- 19 outils navigateur ; les copies desktop et web sont maintenues cohérentes par un test.
- Boucle web existante : apps/web/app/browser/agent-runner.ts, route POST /api/v1/browser/agent, contexte non fiable et continuation HMAC limitée à 12 étapes.

### 2.2 Assistant vocal et duo déjà implémentés

Les points d'entrée vocaux réels sont :
- apps/web/app/notebook/[id]/voice-assistant.tsx
- apps/web/app/notebook/[id]/voice-turn.ts
- apps/web/app/api/v1/notebooks/[id]/voice-token/route.ts

La voix utilise Gemini Live en WebSocket avec jetons éphémères provisionnés côté serveur. Le client sait déjà :
- ouvrir une session Leanna (voix Aoede) ;
- ouvrir une session Roxane (voix Kore) ;
- gérer deux sockets et une file audio partagée ;
- couper le micro principal pendant l'intervention de Roxane ;
- attendre la fin réelle de lecture audio avant de redonner la parole ;
- inviter Roxane à partir du troisième échange ;
- traiter les appels d'outils vocaux existants search_notebook_sources et create_studio_artifact.

**Conséquence :** ne pas créer un second système de duo, un second composant vocal ou un nouveau fournisseur IA. Ajouter les outils Browser au flux d'outils Gemini Live de Leanna et faire exécuter les actions par l'API Browser déjà exposée au renderer. Roxane reste une session de co-intervention : elle ne reçoit aucun droit d'action Browser en V1.

### 2.3 Risque de concurrence à traiter

Le processus Main construit actuellement un BrowserAgent dans browserHandlers() et le conserve dans la fermeture des handlers IPC. Il possède donc un état mutable de mission : registre URL, compteur, confirmations en attente et interruption. Le Browser UI et la voix pourraient se perturber si les deux pilotent simultanément cette même instance.

**Exigence bloquante :** sérialiser les commandes d'agent par navigateur et définir une propriété explicite de mission (source UI ou voix). La V1 doit refuser ou mettre en attente une deuxième mission concurrente ; elle ne doit jamais permettre à une mission d'annuler ou d'approuver celle d'une autre. Le verrou doit être imposé côté Main, pas uniquement dans React.

### 2.4 Distinction des moteurs IA

L'agent du panneau Browser passe par POST /api/v1/browser/agent et OpenRouter. La voix utilise Gemini Live directement avec des functionDeclarations dans le jeton éphémère. L'intégration vocale doit donc respecter le protocole Gemini Live existant ; elle ne doit pas détourner la voix vers OpenRouter.

## 3. Périmètre

### Inclus en V1
- Démarrer et arrêter la navigation vocale depuis le Browser intégré.
- Utiliser le notebook courant et son contexte d'authentification.
- Ouvrir, lire, rechercher, cliquer, saisir, faire défiler, revenir en arrière et ouvrir un onglet.
- Comparer 2 à 4 onglets déjà ouverts.
- Enregistrer une page dans le Notebook via le mécanisme existant, avec confirmation.
- Retourner les résultats des outils à Gemini Live par toolResponse.functionResponses.
- Afficher le statut de mission, l'étape, les actions et les confirmations dans le panneau Browser.
- Autonomie hybride : actions ordinaires autonomes ; actions sensibles toujours confirmées.
- Duo vocal Leanna + Roxane, une seule voix active à la fois.
- Interruption immédiate et gestion de déconnexion/récupération.
- Tests unitaires, intégration et E2E.

### Hors périmètre V1
- Remplacer Chromium ou WebContentsView.
- Playwright/Puppeteer comme moteur de navigation en production.
- Navigation dans des applications desktop externes.
- Upload de fichiers, transfert de fichiers/photos ou accès arbitraire au disque.
- Contournement CAPTCHA, paywall, authentification, DRM, certificats TLS ou restrictions d'un site.
- Achat, paiement, commande, publication, message, suppression ou changement de compte sans confirmation.
- Donner à Roxane un accès direct aux outils d'action.
- Analyse visuelle complète des captures : à évaluer en V2, car les captures Browser actuelles ne sont pas transmises au modèle.
- Refonte du modèle de données ou migration Supabase sans nécessité démontrée.

## 4. Architecture cible

Utilisateur / micro
→ Gemini Live — session Leanna (Aoede)
→ functionCall browser_*
→ Voice Browser Controller dans le renderer Next.js
→ window.leannaDesktop.browser.agentStart / agentCall / agentResolve / agentAbort
→ IPC browser:* avec émetteur vérifié et arguments revalidés
→ BrowserAgent dans le processus Main
→ BrowserManager
→ WebContentsView Chromium existante
→ résultat réel et nouvel état
→ toolResponse.functionResponses vers Gemini Live.

Session Roxane (Kore) : reçoit un résumé borné du tour terminé, intervient vocalement, ne reçoit aucune déclaration browser_* et ne peut pas piloter le navigateur en V1.

Responsabilités :
- Gemini Live : comprendre, choisir un outil, fournir ses arguments, expliquer le résultat. Le modèle ne décide jamais d'une approbation.
- Voice Browser Controller : orchestration des tours, corrélation des appels, gestion des sockets, retours d'outils, état UI et sérialisation des missions.
- Renderer : seul point de jonction entre voix et API Desktop ; aucun accès direct aux objets Electron.
- Processus Main / BrowserAgent : autorité finale pour valider, refuser, demander confirmation et exécuter.
- BrowserManager : propriétaire des onglets et WebContents.
- Roxane : commentaire vocal, synthèse critique et question complémentaire ; aucune action navigateur.

## 5. Contrat des outils Gemini Live

Les noms de fonctions Gemini doivent utiliser le préfixe browser_ (pas de point). Les paramètres sont stricts et bornés. La source de vérité des outils demeure apps/desktop/src/browser/agent-tools.ts. Introduire un adaptateur qui transforme les ToolSpec existants vers le format Gemini Live, ou un test de conformité garantissant l'équivalence. Ne pas maintenir une troisième copie manuelle.

Outils V1 recommandés :

| Fonction Gemini | Outil Main canonique | Paramètres |
|---|---|---|
| browser_get_active_tab | get_active_tab | aucun |
| browser_open_url | open_url | url, tab_id? |
| browser_new_tab | new_tab | url? |
| browser_get_page_content | get_page_content | tab_id? |
| browser_get_page_metadata | get_page_metadata | tab_id? |
| browser_extract_links | extract_links | filter?, tab_id? |
| browser_extract_tables | extract_tables | tab_id? |
| browser_find_text | find_text | query, tab_id? |
| browser_click_element | click_element | element, tab_id? |
| browser_type_text | type_text | element, text, submit?, tab_id? |
| browser_scroll_page | scroll_page | direction, tab_id? |
| browser_go_back | go_back | tab_id? |
| browser_go_forward | go_forward | tab_id? |
| browser_search_web | search_web | query |
| browser_compare_pages | compare_pages | tab_ids |
| browser_save_to_notebook | save_to_notebook | mode, summary?, tab_id? |

Ne pas exposer en V1 close_tab, reload et les actions non indispensables si le cas d'usage ne le justifie pas. take_screenshot n'est pas utile au modèle tant qu'il ne reçoit pas l'image. Le modèle ne reçoit jamais une fonction approve, set_mode, set_permission, agentResolve ou agentAbort.

### Format de résultat

Chaque appel Gemini doit être corrélé par son id et son name. Retourner un résultat compact et sérialisable, sans objets Electron, secret ni dump HTML. Conserver les états réels AgentOutcome : ok, confirmation_required, refused, denied et error. Ne jamais aplatir confirmation_required en simple succès.

Limites :
- Un appel à la fois par session Browser en V1.
- Taille maximale des arguments et résultats conforme aux schémas existants.
- Limite de 8 appels Browser par tour vocal en V1.
- Timeout borné ; en cas de timeout, retourner une erreur explicite.
- Après chaque navigation, clic ou saisie, relire l'état réel de l'onglet avant de continuer.
- Aucun appel reçu après interruption, déconnexion ou expiration de mission ne doit être exécuté.
- Un appel Gemini dupliqué ne doit pas répéter une action déjà exécutée.

## 6. Autonomie hybride et sécurité

Le mode retenu est hybride : actions ordinaires autonomes, confirmation pour les actions sensibles. Dans le modèle Browser existant, cela correspond au mode autonomous avec confirmations sensitive-only. Le mode réel est relu dans le processus Main à chaque appel ; il n'est jamais accepté depuis Gemini.

| Action | Politique |
|---|---|
| Lire contenu, métadonnées, liens, tableaux | Automatique |
| Recherche web demandée | Automatique selon les limites de l'outil |
| Ouvrir une URL demandée ou issue d'un lien observé | Automatique |
| URL fabriquée par le modèle / domaine inconnu | Confirmation |
| Clic ordinaire sur un lien ou contrôle non engageant | Automatique |
| Saisie de texte fourni par l'utilisateur dans un champ non sensible | Automatique |
| Saisie composée par le modèle et absente de la demande | Confirmation |
| Connexion, mot de passe, paiement, donnée personnelle | Confirmation obligatoire |
| Soumission POST ou formulaire sensible | Confirmation obligatoire |
| Achat, paiement, commande, abonnement, réservation, envoi, publication, partage, suppression | Confirmation obligatoire |
| Téléchargement | Contrôles existants et confirmation si classé à risque ; jamais d'ouverture automatique |
| Enregistrement dans le Notebook | Confirmation obligatoire |
| Permission d'un site, changement de réglage ou mode | Jamais décidé par le modèle |

### Flux de confirmation
1. BrowserAgent renvoie confirmation_required avec actionId, résumé et raison.
2. Le contrôleur suspend la séquence et affiche une carte dans le panneau Browser, hors WebContentsView.
3. Le résumé décrit l'action, le domaine, l'élément, les données à transmettre (masquées si sensibles) et la conséquence.
4. Leanna annonce qu'une autorisation est requise.
5. L'utilisateur clique Autoriser ou Refuser. La décision vocale peut être utilisée pour les actions non critiques si elle est non ambiguë et liée à l'action en attente.
6. Pour paiement, achat, publication, suppression et envoi, conserver un clic explicite en V1 même si l'utilisateur dit oui. La voix ne remplace pas le consentement visuel.
7. Le contrôleur appelle agentResolve({ actionId, approve }). Main vérifie à nouveau l'action et sa signature.
8. Refus, expiration ou interruption ferment l'attente et renvoient un résultat négatif à Gemini.

### Prompt injection et exfiltration
- Tout texte de page, résultat d'outil, titre, lien et métadonnée est une donnée non fiable, jamais une instruction système.
- Conserver les frontières untrusted_web_content et neutraliser les balises structurelles.
- Ne jamais transmettre à Gemini les clés API, cookies, jetons, stockage local ou contenu privé du Notebook non demandé.
- Les sorties vers URL inconnue, saisies de texte non fournies et formulaires engageants restent gardées par Main.
- Les protections restent actives même si Gemini demande de les ignorer.
- Les logs ne contiennent ni contenu de page complet, ni champs de formulaire, ni token, ni arguments sensibles.

## 7. Missions, propriété et interruption

Cycle mission :
1. Comprendre l'intention depuis la transcription.
2. Planifier et annoncer une courte feuille de route pour les tâches multi-étapes.
3. Agir avec un outil autorisé.
4. Observer l'issue réelle de BrowserAgent.
5. Vérifier l'URL, le titre, le contenu ou le résultat attendu.
6. Récupérer : autre méthode sûre ou explication du blocage.

Créer un contexte VoiceBrowserMission côté renderer :
- missionId (UUID généré par l'application, pas par le modèle) ;
- owner = voice ;
- notebookId et activeTabId ;
- startedAt et status ;
- pendingToolCalls (IDs Gemini) ;
- pendingConfirmationActionId facultatif ;
- toolCallCount ;
- signal d'annulation ;
- lastObservedUrl et lastObservedTitle.

Un verrou Browser partagé garantit qu'une mission UI ou vocale détient le contrôle. Si une mission est déjà active, ne pas la remplacer silencieusement. Annoncer que le navigateur est occupé et proposer de terminer ou arrêter la mission actuelle. Ne jamais réutiliser les confirmations ni le registre URL d'une autre mission.

Le verrou est libéré dans finally, y compris sur exception, fermeture de socket, déconnexion, changement de notebook ou démontage du composant.

### Interruption
- Bouton Arrêter toujours visible.
- Mot-clé d'arrêt traité par une voie locale déterministe ; ne pas dépendre d'un appel de fonction du modèle.
- Appeler agentAbort() immédiatement et invalider missionId.
- Fermer les confirmations et rejeter tous les tool calls tardifs.
- Arrêter la navigation en cours via le mécanisme Main existant.
- Ne pas fermer automatiquement le navigateur ni perdre les onglets.
- Interrompre Roxane et vider sa file audio.
- Une nouvelle mission n'est autorisée qu'après retour à idle.

## 8. Duo vocal

Réutiliser les deux sessions Gemini Live et la file audio partagée déjà présentes dans voice-assistant.tsx.
- Leanna (Aoede) est l'interlocutrice principale et seule détentrice des outils Browser.
- Roxane (Kore) intervient après un tour complet, selon le réglage existant et le comportement actuel à partir du troisième échange.
- Roxane reçoit uniquement un résumé borné : demande, actions réalisées, résultats synthétiques et limites.
- Roxane ne reçoit aucune déclaration browser_* et ne peut pas appeler Browser.
- Une seule voix parle à la fois ; couper le micro pendant la lecture de Roxane et attendre la fin réelle des buffers PCM.
- Roxane signale une contradiction, un risque, une donnée manquante ou une question utile. Elle ne répète pas Leanna et n'invente aucun résultat.
- Si Roxane est indisponible, Leanna continue seule ; la mission Browser n'est pas annulée.
- Si Leanna est déconnectée pendant une mission, interrompre les outils en attente et afficher l'état réel.
- Roxane intervient après une étape ou un tour complet, jamais au milieu d'une confirmation sensible.

## 9. UX dans Leanna Browser

Ajouter au panneau latéral existant, sans recouvrir la zone native Browser :
- Bouton Parler à Leanna / Terminer la conversation.
- Indicateur micro et état : Connexion, Écoute, Planification, Navigation, Lecture, Confirmation requise, Roxane intervient, Terminé, Erreur.
- Nom de mission et étape actuelle.
- Fil chronologique : intention, outil, résumé, résultat, confirmation et erreur.
- Indication discrète du propriétaire : Voix ou Panneau.
- Confirmation avec action, domaine, données concernées et boutons Autoriser / Refuser.
- Bouton Arrêter toujours accessible.
- Transcription et réponses Leanna/Roxane différenciées.
- Option de désactiver Roxane sans arrêter Leanna.
- Messages explicites en cas d'indisponibilité du micro, de Gemini, du Browser ou d'IPC.

Les confirmations ne doivent jamais être rendues dans la page visitée ni à l'intérieur de WebContentsView.

## 10. Fichiers à examiner et modifier

Avant chaque modification, relire la version exacte sur la branche. Adapter les noms au code réel et ne pas créer de doublon si un module équivalent existe.

### Web / voix
| Fichier | Intervention |
|---|---|
| apps/web/app/notebook/[id]/voice-assistant.tsx | Réutiliser les utilitaires Live et le duo existant ; ajouter le routage Browser uniquement quand la voix est lancée depuis Browser. |
| apps/web/app/api/v1/notebooks/[id]/voice-token/route.ts | Ajouter les déclarations Gemini Browser à la configuration Leanna uniquement ; préserver les outils Notebook et les contrôles d'accès. |
| apps/web/app/browser/browser-client.tsx | Composer le contrôleur vocal dans la page Browser et relier onglets, panneau et mission. |
| apps/web/app/browser/ai-panel.tsx | Afficher statut, chronologie et confirmation, ou extraire un composant dédié. |
| apps/web/app/browser/voice-browser-controller.ts (nouveau si utile) | Orchestration testable hors React : corrélation, verrou, arrêt, résultats Gemini. |
| apps/web/app/browser/voice-browser-controller.test.ts | Tests de séquencement et concurrence. |
| apps/web/lib/browser/voice-tools.ts (nouveau si adaptateur requis) | Conversion des ToolSpec vers Gemini sans copie divergente. |
| apps/web/lib/ai/prompts/leanna.ts et/ou prompt vocal dédié | Planification, vérification, anti-injection et compte-rendu ; préserver les overrides utilisateur. |

### Desktop / Main
| Fichier | Intervention |
|---|---|
| apps/desktop/src/browser/agent-tools.ts | Source de vérité des schémas ; outils V1 seulement. |
| apps/desktop/src/browser/browser-agent.ts | Propriété de mission, appels tardifs, confirmations et anti-rejeu. |
| apps/desktop/src/browser/browser-ipc.ts | Verrou et contrôle de mission si nécessaire ; conserver isTrusted et revalidation Main. |
| apps/desktop/src/shared/desktop-api.ts | Contrat sérialisable si le verrou doit être exposé. |
| apps/desktop/src/preload.ts | Exposer uniquement les méthodes explicitement typées. |

### Tests et documentation
- apps/web/app/notebook/[id]/voice-turn.test.ts : préserver les tests du duo, de la file audio et des citations.
- apps/web/app/browser/agent-runner.test.ts : non-régression de l'agent texte.
- apps/desktop/test/browser-agent.test.cjs : politique, confirmations et interruption.
- apps/desktop/e2e/ui.e2e.cjs et browser.e2e.cjs : parcours Electron.
- Mettre à jour AGENT_TOOLS.md, SECURITY.md, ARCHITECTURE.md et LIMITATIONS.md après implémentation et validation.

## 11. Plan d'implémentation par lots

### Lot 0 — Préflight (bloquant)
- Confirmer HEAD de la branche et comparer avec main.
- Relire complètement les fichiers voix, Browser, IPC, prompts et tests.
- Établir le contrat exact des tool calls Gemini Live : forme des arguments, réponses, erreurs et IDs.
- Vérifier que le composant vocal peut être réutilisé dans Browser avec le bon notebookId.
- Vérifier les rôles : lecture vocale viewer, sauvegarde selon les permissions editor.
- Décider où vit le verrou ; privilégier Main comme autorité.
- Aucun changement de code avant la fin du préflight.
Livrable : note de conception et liste finale des fichiers.

### Lot 1 — Contrat Gemini et adaptateur
- Construire les déclarations Gemini à partir des ToolSpec.
- Exposer les outils V1 à la session Leanna uniquement.
- Tester noms, paramètres, required, enum et limites.
- Préserver search_notebook_sources et create_studio_artifact.
- Refuser explicitement tout outil inconnu.
Livrable : les tool calls Browser arrivent au client, sans action navigateur.

### Lot 2 — Contrôleur vocal Browser
- Créer une mission propriétaire voice.
- Connecter les appels Gemini à agentStart puis agentCall.
- Retourner AgentOutcome par toolResponse.functionResponses.
- Sérialiser les appels et imposer le plafond d'étapes.
- Relire l'état Browser après chaque action.
- Gérer expiration, appels dupliqués, résultats tardifs et erreurs réseau.
Livrable : parcours vocal lecture/navigation fonctionnel.

### Lot 3 — Confirmation hybride et interruption
- Afficher les confirmations dans le panneau Browser.
- Relier Autoriser/Refuser à agentResolve.
- Conserver le clic visuel pour les actions à haut risque.
- Verrouiller les missions concurrentes UI/voix.
- Implémenter arrêt immédiat, invalidation et rejet des tool calls tardifs.
- Tester injection et exfiltration.
Livrable : sécurité hybride validée.

### Lot 4 — Duo et UX
- Réutiliser les deux sockets et l'ordonnanceur audio existants.
- Activer Roxane selon le réglage existant.
- Fournir à Roxane un résumé minimal de la mission terminée.
- Interdire ses appels Browser.
- Ajouter suivi, indicateurs, journal de session et désactivation de Roxane.
- Tester interruption, déconnexion et reprise Leanna.
Livrable : duo vocal stable dans Browser.

### Lot 5 — Validation et livraison
- Exécuter typecheck, lint, tests Web et Desktop.
- E2E avec vrai Electron et serveur API de test.
- E2E voix avec simulateur WebSocket Gemini déterministe.
- Test réel Gemini Live manuel avec clé configurée, sans secret dans les logs.
- Test d'acceptation utilisateur sous Windows, notamment micro et audio.
- Documenter les limites réellement observées.
- Ouvrir une PR vers main après validation ; ne jamais merger automatiquement.

Commandes minimales, à vérifier contre les scripts package.json :
- pnpm typecheck
- pnpm lint
- pnpm --dir apps/web test
- pnpm --dir apps/desktop test
- pnpm --dir apps/desktop test:e2e

Les évaluations avec modèle réel sont séparées des tests unitaires et peuvent être facturées. Ne jamais déclarer un test Gemini réel si seul un simulateur a été utilisé.

## 12. Matrice d'acceptation

| ID | Scénario | Résultat attendu |
|---|---|---|
| VBR-001 | Ouvrir une URL explicitement demandée | Onglet intégré ouvert ; titre réel annoncé |
| VBR-002 | Lire une page | Contenu nettoyé et borné ; synthèse fidèle |
| VBR-003 | Recherche puis ouverture d'un résultat | URL issue de la demande ou d'un lien observé ; sinon confirmation |
| VBR-004 | Cliquer un lien ordinaire | Action exécutée et état relu |
| VBR-005 | Saisir texte fourni dans champ non sensible | Saisie autorisée selon politique |
| VBR-006 | Saisir texte inventé par le modèle | Confirmation obligatoire |
| VBR-007 | Soumettre formulaire POST | Confirmation obligatoire avant envoi |
| VBR-008 | Achat, paiement, publication, suppression | Confirmation visuelle obligatoire ; aucun double déclenchement |
| VBR-009 | Enregistrer dans Notebook | Confirmation ; source créée réellement ou erreur annoncée |
| VBR-010 | Page contenant une instruction malveillante | Contenu non fiable ; aucune action sensible |
| VBR-011 | Stop pendant une action | Abort Main immédiat ; aucun outil tardif |
| VBR-012 | Mission UI active puis commande vocale | Conflit annoncé ; aucun mélange d'état |
| VBR-013 | Deux appels Gemini simultanés | Sérialisation stricte |
| VBR-014 | Déconnexion Gemini pendant confirmation | Confirmation expirée ; action non exécutée |
| VBR-015 | Roxane intervient | Pas de chevauchement audio ; aucun outil Browser |
| VBR-016 | Roxane indisponible | Leanna continue ; mission conservée |
| VBR-017 | Permission demandée par un site | Dialogue natif ; Gemini ne peut pas approuver |
| VBR-018 | Téléchargement | Contrôles existants ; aucun lancement automatique |
| VBR-019 | Page inaccessible ou DOM non pilotable | Erreur explicite ; aucune réussite inventée |
| VBR-020 | Quitter la route ou changer de notebook | Mission annulée, sockets fermés, micro et verrou libérés |
| VBR-021 | Outil inconnu ou arguments supplémentaires | Refus strict |
| VBR-022 | Session Roxane tente un outil Browser | Aucun outil déclaré et aucune exécution possible |
| VBR-023 | Plus de 8 appels dans un tour | Arrêt contrôlé avec explication |
| VBR-024 | Résultat après abort | Ignoré grâce au missionId et au statut annulé |

## 13. Definition of Done

- Le navigateur utilisé est celui déjà intégré dans Electron.
- Leanna reçoit et exécute les appels Browser via Gemini Live.
- Roxane fonctionne avec sa voix distincte, sans outil Browser.
- Les outils existants ne sont pas dupliqués en une source de vérité concurrente.
- Les confirmations sensibles sont imposées par BrowserAgent dans Main.
- Les pages restent non fiables et ne peuvent pas approuver ou déclencher une action.
- Les missions voix et panneau ne partagent pas un état mutable sans verrou.
- L'interruption stoppe réellement les actions et invalide les réponses tardives.
- Les parcours lecture, navigation, confirmation, refus, abort, duo et déconnexion passent.
- Les tests Browser existants restent verts.
- Les documents décrivent les comportements effectivement testés.
- Aucun secret, contenu sensible ou transcription privée n'apparaît dans les logs.
- La branche reste indépendante de main ; une PR est proposée pour revue, jamais fusionnée sans accord.

## 14. Risques

| Risque | Mesure |
|---|---|
| Format Gemini Live différent du ToolSpec | Adaptateur, tests de contrat et WebSocket simulé |
| Conflit entre Browser UI et voix | Verrou de mission propriétaire vérifié côté Main |
| Tool call tardif après abort | missionId, statut terminal et vérification avant exécution |
| Confirmation vocale ambiguë | Clic visuel obligatoire pour actions à haut risque |
| Deux voix simultanées | File audio unique, micro coupé et attente du drain |
| Prompt injection | Bloc non fiable, garde-fous Main et tests adversariaux |
| Trop de résultats transmis | Résultats compacts, bornés et extraits |
| Notebook sans permission d'écriture | Respect du rôle API ; sauvegarde seulement si autorisée |
| Tests réels impossibles faute de compte Supabase | Simulateurs en CI, parcours authentifié manuel documenté |

## 15. Décisions figées

1. Navigateur : Leanna Browser intégré (Chromium / Electron WebContentsView).
2. Autonomie : hybride, actions ordinaires autonomes et confirmation des actions sensibles.
3. Voix : Leanna + Roxane, en réutilisant le duo existant.
4. Moteur IA vocal : Gemini Live existant, pas OpenRouter pour le flux vocal.
5. Moteur de navigation : BrowserAgent existant dans le processus Main.
6. Sécurité : fail-closed, validation Main, aucune approbation par modèle.
7. Portée initiale : lecture, recherche, navigation, interaction web limitée et sauvegarde Notebook confirmée.
8. Livraison : branche dédiée, tests, puis PR vers main après revue.
