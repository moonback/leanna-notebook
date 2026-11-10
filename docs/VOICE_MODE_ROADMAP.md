# Vision et feuille de route — Mode vocal de Leanna Notebook

> Analyse du mode vocal à partir du code applicatif du dépôt. Les fichiers Markdown existants n'ont pas servi de source pour les recommandations.

- **Produit :** Leanna Notebook
- **Périmètre :** Mode vocal documentaire, conversation temps réel et commandes vocales
- **Date :** 10 novembre 2026
- **Branche :** `docs/voice-mode-feature-roadmap`

---

## 1. Vision

Le mode vocal de Leanna ne doit pas être une simple interface qui remplace le clavier par un microphone. Il doit devenir **un véritable compagnon de travail oral**, capable d'écouter, de comprendre le contexte d'un notebook, de consulter les documents, d'expliquer ses réponses, de prendre des notes et d'aider à produire des livrables.

L'utilisateur doit pouvoir travailler avec ses sources comme avec un collègue présent à ses côtés : poser une question spontanée, interrompre une explication, demander une précision, faire comparer deux documents, dicter une note ou demander un compte rendu oral.

La promesse :

**« Parlez naturellement à vos documents. Leanna les consulte, vous répond avec des preuves et vous aide à passer à l'action. »**

Le mode vocal doit conserver les qualités fondamentales de Leanna Notebook :
- réponses ancrées dans les sources du notebook ;
- citations vérifiables et navigation vers les passages ;
- respect des sources sélectionnées et des permissions ;
- transparence sur les informations introuvables ou contradictoires ;
- contrôle utilisateur sur le microphone, les données et les actions ;
- continuité entre conversation vocale, chat et Studio.

---

## 2. État actuel observé dans le code

L'analyse a porté notamment sur :
- `apps/web/app/notebook/[id]/voice-assistant.tsx`
- `apps/web/app/notebook/[id]/voice-turn.ts`
- `apps/web/app/api/v1/notebooks/[id]/voice-token/route.ts`
- `apps/web/app/api/v1/notebooks/[id]/voice-search/route.ts`

### Capacités déjà présentes

1. Connexion temps réel à Gemini Live avec le modèle configuré côté serveur.
2. Création d'un jeton éphémère ; la clé API longue durée reste côté serveur.
3. Capture microphone via Web Audio / AudioWorklet.
4. Conversion audio PCM et envoi audio bidirectionnel.
5. Lecture des réponses audio PCM en flux.
6. Transcriptions entrantes et sortantes.
7. Détection d'interruption par le modèle et arrêt de la lecture audio en cours.
8. Commande d'outil `search_notebook_sources` pour interroger les sources sélectionnées.
9. Recherche documentaire hybride dans le notebook et retour de passages sourcés.
10. Déduplication des citations et attente des recherches en cours avant de finaliser un tour.
11. Affichage des transcriptions, réponses et sources consultées.
12. Enregistrement des tours vocaux dans l'historique de conversation.

Le composant possède également un contrôle de microphone muet et un bouton pour terminer la session.

### Limites et opportunités constatées

- La voix est envoyée en dur au démarrage (`Aoede`) alors que le serveur accepte plusieurs voix Gemini.
- Le composant vocal concentre beaucoup de responsabilités : capture, transport, lecture, recherche, état UI et persistance.
- La configuration de session n'est pas encore exposée comme un profil utilisateur complet.
- L'interface présente les tours terminés, mais le contrôle du déroulement, des sources et des actions reste limité.
- La recherche vocale réserve actuellement l'usage sous la fonctionnalité `chat` ; une mesure distincte de la consommation vocale mérite d'être définie.
- Il n'y a pas encore de gestion produit complète de la reconnexion, de la reprise, du diagnostic audio ou des préférences de confidentialité.
- La fonction de recherche est le seul outil métier exposé dans la configuration vocale inspectée : la voix ne pilote pas encore réellement les autres fonctions du notebook.

Ces observations décrivent les fichiers consultés ; elles ne constituent pas un audit d'exécution ni une validation de chaque scénario en production.

---

## 3. Les 20 fonctionnalités à développer

Les fonctionnalités sont des propositions d'évolution, pas des capacités prétendument déjà disponibles. Lorsqu'une fonction existe partiellement, la proposition vise son approfondissement.

### Priorité P0 — Rendre l'expérience vocale fiable et personnalisable

#### 1. Profils vocaux et choix de voix persistant

Permettre de choisir la voix de Leanna et de conserver ce choix entre les sessions.

- Catalogue des voix prises en charge par le modèle réellement sélectionné.
- Échantillon d'écoute avant validation, lorsque le fournisseur le permet.
- Préférences par utilisateur et éventuellement par notebook.
- Paramètres de débit, style et expressivité uniquement si le modèle expose ces contrôles.
- Fallback clair si une voix devient indisponible.

**Réussite :** la voix choisie est utilisée à chaque nouvelle session sans valeur codée en dur dans le composant.

#### 2. Modes de prise de parole : mains libres et push-to-talk

Adapter l'interaction à différents environnements.

- Mode conversation mains libres avec détection de fin de parole.
- Mode appuyer pour parler, puis relâcher pour envoyer.
- Mode écoute continue avec commande claire de pause.
- Indicateur visible du mode actif et de l'état du micro.
- Raccourci clavier configurable pour activer/désactiver l'écoute.

**Réussite :** l'utilisateur sait toujours quand le microphone capte et peut contrôler l'écoute sans ambiguïté.

#### 3. Gestion robuste des connexions et reprise de session

Éviter qu'une coupure réseau détruise une conversation en cours.

- Détecter les pertes réseau, fermetures WebSocket et expirations de jeton.
- Reconnexion avec temporisation progressive et limite de tentatives.
- Renouveler le jeton éphémère en respectant les règles du fournisseur.
- Préserver localement le dernier tour finalisé et les brouillons de transcription.
- Proposer de reprendre le contexte ou de démarrer une nouvelle session.

**Réussite :** une coupure temporaire n'efface pas les tours déjà enregistrés et le statut de reprise est explicite.

#### 4. Diagnostic micro et qualité audio

Aider l'utilisateur à résoudre les problèmes de son avant de commencer.

- Sélection du périphérique d'entrée et de sortie.
- Test de niveau micro avec indicateur visuel.
- Détection d'entrée silencieuse, saturation et périphérique déconnecté.
- Vérification des autorisations navigateur/Electron.
- Conseils de configuration et test de restitution audio.

**Réussite :** l'utilisateur peut identifier si le problème vient du micro, de la sortie, des permissions ou du service vocal.

#### 5. Réglages audio et contrôle de lecture

Donner un contrôle simple sur le confort d'écoute.

- Volume indépendant de la sortie vocale de Leanna.
- Sélection du périphérique audio.
- Contrôle de vitesse de lecture si compatible avec la restitution.
- Couper temporairement la sortie sans fermer le microphone.
- Arrêt immédiat de tout audio en cours lors d'une interruption ou d'un arrêt de session.

**Réussite :** les commandes audio sont accessibles pendant une session et leur état est immédiatement compréhensible.

### Priorité P1 — Faire du vocal un assistant documentaire puissant

#### 6. Navigation vocale dans les citations

Rendre les références aussi utiles à l'oral qu'à l'écran.

- Leanna annonce le titre et la page ou l'horodatage du passage.
- Commandes naturelles : « ouvre cette source », « montre le passage », « relis la citation ».
- Synchronisation de l'ouverture du document avec la lecture vocale.
- Possibilité de revenir au passage précédent ou suivant.
- Affichage du niveau de preuve et du contexte autour du passage.

**Réussite :** chaque réponse documentaire importante peut être vérifiée sans rechercher manuellement le document.

#### 7. Commandes vocales de contrôle du notebook

Permettre de piloter les opérations courantes sans toucher l'interface.

- « Sélectionne cette source », « retire cette source de la sélection ».
- « Passe au Studio », « ouvre le document ».
- « Arrête de parler », « répète », « résume en une phrase ».
- « Garde ce passage », « ajoute une note ».
- Demander confirmation avant toute suppression, partage ou action sensible.

**Réussite :** les commandes sont interprétées comme des intentions structurées et les actions sensibles restent soumises à validation.

#### 8. Interrogation ciblée d'une source ou d'un groupe

Laisser l'utilisateur définir oralement le périmètre de recherche.

- Questionner une seule source, plusieurs sources ou tout le notebook.
- Utiliser le contexte de la conversation pour comprendre « ce document » ou « les deux précédents ».
- Confirmer le périmètre lorsque le référent est ambigu.
- Montrer les sources incluses dans la recherche.
- Respecter strictement les sélections et permissions serveur.

**Réussite :** l'utilisateur peut changer le périmètre en langage naturel et voir quelles sources ont été consultées.

#### 9. Comparaison orale de documents

Transformer la voix en outil de comparaison.

- « Compare ces deux contrats », « quelles différences entre les versions ? ».
- Comparer dates, montants, engagements, définitions et conclusions.
- Lire les différences principales à l'oral.
- Afficher les deux preuves en parallèle.
- Signaler les informations absentes ou contradictoires.

**Réussite :** chaque différence annoncée possède une référence vérifiable dans chacun des documents concernés.

#### 10. Dictée intelligente de notes et mémos

Capturer les idées de l'utilisateur pendant qu'il travaille.

- Créer une note par dictée.
- Structurer automatiquement en titre, paragraphes, tâches et points clés.
- Corriger la ponctuation et les répétitions sans modifier le sens.
- Demander avant d'enregistrer dans le notebook.
- Relier la note à la conversation ou aux sources concernées.

**Réussite :** une note dictée devient un contenu éditable et sauvegardé dans le bon notebook après confirmation.

#### 11. Résumé oral à la demande

Proposer des synthèses adaptées à l'écoute.

- Résumé express, détaillé ou exécutif.
- Résumé d'une source, d'une sélection ou du notebook complet.
- Durée cible : 30 secondes, 2 minutes ou 5 minutes.
- Annonce des limites et des points non couverts.
- Possibilité de demander un approfondissement sur un point.

**Réussite :** la longueur et le niveau de détail respectent la demande, avec des preuves consultables.

#### 12. Détection des contradictions avec explication vocale

Ne pas masquer les désaccords entre sources.

- Détecter les chiffres, dates ou conclusions incompatibles.
- Expliquer oralement les deux positions.
- Citer les documents et passages concernés.
- Demander à l'utilisateur quelle source fait autorité lorsque nécessaire.
- Ne jamais arbitrer une contradiction sans fondement.

**Réussite :** les contradictions sont présentées comme telles et ne sont pas fusionnées en une réponse artificiellement certaine.

#### 13. Assistant vocal orienté Studio

Passer de la conversation à la création de livrables.

- « Prépare un rapport sur ce sujet ».
- « Transforme cette réponse en plan ».
- « Crée un quiz à partir de ces documents ».
- « Prépare une présentation de dix diapositives ».
- Prévisualiser le type de livrable, son périmètre et ses sources avant lancement.
- Suivre la génération et annoncer lorsque le résultat est prêt.

**Réussite :** une commande vocale déclenche un job Studio traçable, avec confirmation du périmètre et accès au résultat.

### Priorité P2 — Créer une expérience vocale différenciante

#### 14. Conversation à deux voix : Leanna et Roxane

Créer un mode de discussion avec deux personnalités vocales complémentaires.

- Deux profils configurables : nom, voix, rôle et style de dialogue.
- Leanna peut mener l'analyse ; Roxane peut challenger, synthétiser ou apporter un second angle.
- Répartition des prises de parole sans chevauchement audio.
- L'utilisateur peut adresser une question à l'une ou aux deux.
- Commandes pour mettre en pause une voix ou revenir au mode mono.
- Transcription identifiant clairement chaque intervenante.

**Réussite :** les deux voix sont distinctes, les tours sont synchronisés et les réponses restent ancrées dans les mêmes sources.

#### 15. Débat documentaire et contradicteur IA

Permettre de confronter deux interprétations d'un corpus.

- Un agent formule une synthèse ; un second cherche les objections et contre-exemples.
- Chaque intervenant doit justifier ses affirmations avec des passages.
- L'utilisateur choisit la profondeur et la durée du débat.
- Possibilité d'intervenir à tout moment.
- Conclusion finale distinguant consensus, désaccords et questions ouvertes.

**Réussite :** le débat enrichit l'analyse sans inventer de preuves ni transformer une hypothèse en fait.

#### 16. Mode entretien et questions successives

Faire de Leanna un interviewer documentaire ou un coach d'apprentissage.

- Poser une question à la fois à partir des sources.
- Adapter la question suivante à la réponse de l'utilisateur.
- Modes : révision, entretien, découverte d'un sujet, préparation de réunion.
- Évaluer les réponses avec explications et références.
- Générer un bilan final des points maîtrisés et à approfondir.

**Réussite :** les questions sont adaptées au niveau de l'utilisateur et le bilan renvoie aux sources du notebook.

#### 17. Marque-pages vocaux et moments importants

Permettre de retrouver facilement un moment d'une session.

- « Marque ce passage », « garde cette idée ».
- Enregistrer le timestamp, la transcription et le contexte de la conversation.
- Ajouter un titre ou une catégorie.
- Retrouver les marque-pages dans l'historique.
- Transformer un marque-page en note ou en tâche.

**Réussite :** un moment vocal peut être retrouvé et réutilisé sans réécouter toute la session.

#### 18. Historique vocal enrichi et exportable

Faire de chaque session une ressource documentaire.

- Historique des sessions avec durée, notebook, participants et sujets.
- Transcription éditable avec séparation utilisateur/assistant.
- Recherche dans les conversations vocales.
- Export TXT, Markdown et PDF.
- Liens vers les citations et les notes créées pendant la session.
- Suppression d'une session et de ses données associées.

**Réussite :** l'utilisateur peut retrouver, corriger, exporter ou supprimer une session selon des règles de conservation explicites.

#### 19. Mode vocal multilingue

Permettre de travailler avec des documents et interlocuteurs de langues différentes.

- Détection de la langue parlée.
- Choix de la langue de réponse indépendamment de celle des sources.
- Traduction orale d'un passage avec accès au texte original.
- Préservation des noms propres, chiffres et termes métier.
- Gestion explicite des langues non prises en charge par le modèle.

**Réussite :** l'utilisateur peut poser une question dans une langue et obtenir une réponse dans une autre sans perdre les références originales.

#### 20. Confidentialité, consentement et contrôle des données vocales

Faire de la confiance un élément visible de l'expérience.

- Indicateur permanent d'écoute et de transmission audio.
- Explication claire des traitements effectués par le fournisseur vocal.
- Contrôles de conservation des transcriptions et de l'historique.
- Option de ne pas enregistrer un tour vocal dans l'historique, lorsque le produit peut garantir ce comportement.
- Suppression des données vocales selon une politique documentée.
- Ne jamais enregistrer l'audio brut sans consentement explicite.
- Journal des commandes vocales ayant déclenché une action.

**Réussite :** l'utilisateur sait ce qui est capté, transmis, conservé et supprimé ; les choix sont respectés côté serveur et côté client.

---

## 4. Parcours vocal cible

1. L'utilisateur ouvre le mode vocal depuis son notebook.
2. Il choisit son profil, sa voix et son mode d'interaction.
3. Leanna vérifie les permissions, le micro et la connexion.
4. L'utilisateur parle naturellement et peut interrompre la réponse.
5. Leanna identifie l'intention : question, recherche, comparaison, dictée ou commande.
6. Si la question concerne le corpus, Leanna recherche dans les sources autorisées.
7. Elle répond oralement, affiche les passages et ouvre les citations à la demande.
8. L'utilisateur peut demander un approfondissement, dicter une note ou lancer une création Studio.
9. Les éléments importants sont enregistrés selon les préférences de l'utilisateur.
10. La session se termine proprement ; l'historique et les livrables restent accessibles.

---

## 5. Architecture recommandée

### Séparer les responsabilités

Le composant vocal actuel gère plusieurs responsabilités. Il serait préférable de les isoler progressivement :

- **VoiceSessionManager** : cycle de vie, connexion, jeton, reconnexion et état de session.
- **AudioCaptureService** : microphone, AudioWorklet, conversion PCM et mute.
- **AudioPlaybackService** : file de lecture, interruption, volume et périphérique de sortie.
- **LiveProviderAdapter** : protocole Gemini Live, messages, événements et outils.
- **VoiceIntentRouter** : classification des intentions et validation des commandes.
- **VoiceTools** : recherche, comparaison, création de notes et déclenchement Studio.
- **VoiceTranscriptStore** : transcription, tours, participants, citations et persistance.
- **VoicePreferences** : voix, langue, mode mains libres, préférences audio et confidentialité.

Cette séparation facilitera les tests et permettra de faire évoluer le fournisseur vocal sans réécrire l'interface.

### Principes de sécurité

- Les jetons Live restent éphémères et limités à une session.
- Les clés fournisseurs restent côté serveur.
- Chaque outil métier revérifie l'utilisateur, le notebook et le rôle requis.
- Les documents sont des données non fiables, jamais des instructions système.
- Toute action destructive, externe ou engageante exige une confirmation.
- Les commandes vocales ne contournent jamais les permissions des routes API.
- Les transcriptions et données audio suivent une politique de conservation explicite.

### Mesure de la consommation

Créer une fonctionnalité d'usage distincte pour la voix, avec au minimum :
- durée de session ;
- durée audio entrante et sortante si disponible ;
- modèle et fournisseur ;
- coût estimé et coût réel lorsque disponible ;
- erreurs et reconnexions ;
- recherches documentaires déclenchées ;
- actions Studio déclenchées.

Éviter de comptabiliser les recherches vocales sous le seul identifiant `chat` si cela empêche de mesurer correctement le coût du mode vocal.

---

## 6. Roadmap de réalisation proposée

| Phase | Fonctionnalités | Objectif |
|---|---|---|
| **A — Fiabilité** | 1 à 5 | Une session vocale stable, réglable et diagnostiquable. |
| **B — Travail documentaire** | 6 à 13 | Consulter, comparer, dicter et produire à la voix. |
| **C — Expérience avancée** | 14 à 17 | Duo vocal, débat, entretien et marque-pages. |
| **D — Produit mature** | 18 à 20 | Historique, multilingue et confidentialité avancée. |

### Les 5 développements à commencer

1. **Profils vocaux persistants** : éliminer la voix codée en dur et rendre la configuration cohérente.
2. **Gestion de session et reconnexion** : fiabiliser le socle temps réel avant d'ajouter des outils.
3. **Navigation vocale dans les citations** : rendre l'avantage documentaire immédiatement perceptible.
4. **Commandes vocales et dictée de notes** : donner une utilité concrète au microphone au-delà des questions/réponses.
5. **Conversation à deux voix Leanna/Roxane** : développer une expérience différenciante, une fois la gestion des tours et de l'audio stabilisée.

---

## 7. Indicateurs de qualité

- Temps médian entre clic sur « démarrer » et première écoute possible.
- Taux de sessions connectées avec succès.
- Taux de reconnexion réussie après incident.
- Latence entre fin de parole utilisateur et début de réponse.
- Taux de compréhension des commandes vocales.
- Taux de réponses documentaires avec citations valides.
- Taux d'interruptions correctement prises en compte.
- Taux d'échec des outils vocaux et des actions Studio.
- Coût moyen par minute et par session.
- Satisfaction après session et taux de réutilisation du mode vocal.

---

## 8. Expérience finale recherchée

Le mode vocal de Leanna doit donner l'impression de parler à un assistant qui connaît le dossier ouvert, pas à un assistant vocal générique.

Il doit pouvoir :
- expliquer un document en langage simple ;
- retrouver immédiatement une preuve ;
- comparer plusieurs versions ;
- transformer une idée dictée en note structurée ;
- faire émerger les contradictions ;
- préparer un rapport ou une présentation ;
- mener un échange à deux voix ;
- reprendre une conversation sans perdre les éléments importants.

**La vision finale : Leanna devient une interface vocale intelligente sur l'ensemble du savoir contenu dans le notebook, capable de comprendre et d'agir, tout en restant vérifiable, transparente et sous le contrôle de l'utilisateur.**
