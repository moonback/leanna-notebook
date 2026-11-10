# Recon map : Gemini Notebook, ex-NotebookLM (web)

- **Cible** : `notebook.google.com`. Le produit a été renommé de NotebookLM en « Gemini Notebook », a priori le 16/07/2026 d'après des sources tierces. L'aide officielle utilise déjà le nouveau nom.
- **Périmètre** : application web desktop. Tout ce qui est listé dans la demande est couvert. Le mobile n'est traité qu'en annexe.
- **Pour** : un SaaS commercial indépendant, dépôt `moonback/Notebook`.
- **Date** : 2026-11-09.
- **Fichiers liés** : [screens-inventory.md](screens-inventory.md), [user-flows.md](user-flows.md), [data-model-observations.md](data-model-observations.md), [features.csv](features.csv), [open-questions.md](open-questions.md).

## 0. Méthode et honnêteté

| niveau | sens | volume |
| --- | --- | --- |
| **Observé (OBS)** | Vu directement : la landing publique S01, puis le tableau de bord S03 et la vue notebook S08 grâce aux captures de l'utilisateur (`capture/`, 2026-11-09). Aucune fonction n'a été *testée* par nous. | 3 écrans |
| **Documenté (DOC)** | Tiré des 26 articles d'aide officiels lisibles, en paraphrase et avec le n° d'article. | ~80 % du contenu |
| **Hypothèse (HYP)** | Déduction à valider sur captures (liste dans `open-questions.md` § E). | tableau de bord, renommer/supprimer, états vides et d'erreur |
| **Inaccessible (INA)** | 18+, abonnement, Workspace, Play Books, mobile, mode interactif. | voir Q21 à Q26 |

Règles appliquées :
- lecture à vitesse humaine de pages publiques ;
- aucun crawler, aucune lecture de bundle JS, aucune API privée, aucun log réseau ;
- aucune connexion à un compte ;
- texte de l'original paraphrasé, jamais recopié.

### Conditions d'utilisation (vérifiées le 2026-11-09)

- Les **règles d'usage de l'IA générative** de Google interdisent d'utiliser du contenu généré par leurs services pour développer des modèles de ML ou une technologie d'IA associée.
- Les **conditions additionnelles IA générative** interdisent d'utiliser les Services pour développer des modèles de ML ou une technologie associée.
- Les **conditions générales** interdisent la rétro-ingénierie pour extraire des secrets commerciaux, ainsi que l'accès automatisé contraire à robots.txt.

**Conséquence pour ce projet.** Étudier les fonctionnalités et les parcours est compatible avec ces textes. En revanche :

1. **Ne jamais réutiliser** une sortie de Gemini Notebook (audio, rapport, réponse, prompt affiché) comme donnée d'entraînement, d'évaluation, de few-shot, de jeu de test ou de démo.
2. Les captures de l'utilisateur restent dans `replica/screens/` comme référence de mise en page.
3. La formule « technologie associée » est large. Faire valider par un juriste avant le lancement commercial (Q27).

## 1. Sources

| # | source | URL | apport |
| --- | --- | --- | --- |
| 1 | Landing publique (OBS) | https://notebook.google.com/ | positionnement, CTA |
| 2 | Pages marketing et plans | https://notebooklm.google/ , https://notebooklm.google/plans | SPA : titres seulement, prix **non lus** |
| 3 | Aide : présentation | https://support.google.com/gemininotebook/answer/16164461 | fonctions clés, données |
| 4 | Aide : créer un notebook (Studio, partage, copie, analytics, emoji, notifications) | …/answer/16206563 | **article pivot** |
| 5 | Aide : sources (types, limites, Drive, URL, YouTube, audio, Fast/Deep Research, labels) | …/answer/16215270 | import |
| 6 | Aide : chat | …/answer/16179559 | chat, citations, configuration |
| 7 | Aide : notes | …/answer/16262519 | notes-sources |
| 8 | Aide : Mind Maps | …/answer/16212283 | carte mentale |
| 9 | Aide : Audio Overview | …/answer/16212820 | audio |
| 10 | Aide : Video Overview | …/answer/16454555 | vidéo |
| 11 | Aide : Slide Decks | …/answer/16757456 | présentations |
| 12 | Aide : Infographies | …/answer/16758265 | infographies |
| 13 | Aide : Flashcards et Quiz | …/answer/16958963 | révision |
| 14 | Aide : Rapports | …/answer/18323649 | rapports |
| 15 | Aide : plans | …/answer/16213268 | paliers, limites |
| 16 | Aide : limites d'usage | …/answer/17670842 | quotas, Generate later |
| 17 | Aide : comptes pro et école | …/answer/16337734 | tableau de quotas détaillé |
| 18 | Aide : notebooks publics et featured | …/answer/16322204 | partage public |
| 19 | Aide : FAQ | …/answer/16269187 | erreurs, contexte du prompt |
| 20 | Aide : thème, langue de sortie | …/answer/16225229 , …/answer/16261963 | paramètres |
| 21 | Aide : apps connectées | …/answer/18784282 | intégrations |
| 22 | Aide : Gemini Apps, AI Mode | …/answer/17003757 , …/answer/17513891 | écosystème (skip) |
| 23 | Aide : confidentialité, signalement | …/answer/17004255 , …/answer/16179536 | données, modération |
| 24 | Aide : app mobile | …/answer/16296687 | mobile (annexe) |
| 25 | CGU Google + règles IA générative | https://policies.google.com/terms , https://policies.google.com/terms/generative-ai/use-policy , https://policies.google.com/terms/generative-ai | conformité |
| 26 | Presse et blogs (secondaire) | https://techcrunch.com/2026/06/08/notebooklms-new-update-will-help-you-build-source-repository-from-chat/ , https://elephas.app/blog/notebooklm-plus-worth-it.md , https://aiproductivity.ai/pricing/notebooklm/ | renommage, prix indicatifs |

Non consultés : changelog officiel, fiches App Store / Play Store, vidéos de démonstration. Voir § 9.

## 2. Boucle cœur

> **Importer ses propres documents → poser des questions dont chaque réponse est citée et vérifiable en un clic → transformer le tout en formats d'étude (note, rapport, flashcards, audio).**

Le chat ancré avec citations est ce qui fait revenir l'utilisateur. Le Studio, et l'audio en particulier, est ce qui fait parler du produit. Les quotas de génération du Studio sont le principal levier de monétisation.

## 3. Écrans, parcours, composants

- **34 écrans** (S01–S34) : voir [screens-inventory.md](screens-inventory.md).
- **26 parcours** (F01–F26) : voir [user-flows.md](user-flows.md).
- **17 composants récurrents** : en bas de l'inventaire.

Disposition centrale documentée : **3 panneaux, Sources | Chat | Studio** (S08).

## 4. Fiches fonctionnelles

Chaque fiche suit la même grille de 12 attributs, plus l'état de reconnaissance.

**Abréviations et marqueurs**

| abréviation | sens |
| --- | --- |
| OBS / DOC / HYP / INA | statut de reconnaissance (voir § 0) |
| Fxx | parcours utilisateur (`user-flows.md`) |
| Sxx | écran (`screens-inventory.md`) |
| Qxx | question ouverte (`open-questions.md`) |
| « non documenté » | absent de l'aide officielle |
| ? | à confirmer sur captures |

### 4.1 Tableau de bord et gestion des notebooks — DOC partiel + HYP — **P0**
| attribut | contenu |
| --- | --- |
| Description | Accueil qui liste les notebooks possédés, partagés et publics visités ; onglet « Featured » pour les comptes grand public |
| Parcours | F01, F02, F21, F23 |
| Écrans | S03, S04 |
| Composants | bouton Créer, cartes (emoji, titre), menu ⋮ par carte, onglets, badge de plan à côté de l'avatar |
| Actions | ouvrir ; créer ; retirer un notebook public de l'accueil (DOC) ; renommer et supprimer depuis la carte (HYP, Q09, Q10) ; vue grille ou liste et tri (HYP, Q06) |
| Chargement | non documenté (Q15) |
| Vide | non documenté ; on suppose un CTA « Créer » (Q15) |
| Erreur | plafond de notebooks atteint (100, 200 ou 500 selon le plan) : message non vu |
| Validation | quota de notebooks par utilisateur |
| Données | Notebook, NotebookMember, NotebookVisit |
| Dépendances | authentification |

### 4.2 Création, renommage, suppression, emoji — DOC + HYP — **P0**
| attribut | contenu |
| --- | --- |
| Description | Créer un notebook en un clic (la pop-up d'ajout de sources s'ouvre) ; emoji auto modifiable ; renommer ; supprimer |
| Parcours | F02, F23 |
| Écrans | S03, S05, S08, S11 (sélecteur d'emoji) |
| Composants | bouton Créer, titre éditable (HYP), sélecteur d'emoji avec recherche, dialogue de confirmation (HYP) |
| Actions | créer (DOC 16206563) ; changer l'emoji (DOC) ; renommer et supprimer (HYP : deux articles en 404, Q01) |
| Chargement | génération de l'emoji après les sources (DOC) ; titre auto (HYP, Q09) |
| Vide | notebook sans source → pop-up d'ajout |
| Erreur | non documenté |
| Validation | titre non vide et longueur max (Q34) ; confirmation avant suppression (à imposer dans le clone) |
| Données | Notebook.title, emoji ; la suppression retire les sources et casse les liens publics (DOC 17003757, 16322204) |
| Dépendances | LLM (emoji, titre auto) |

### 4.3 Partage — DOC — **P1**
| attribut | contenu |
| --- | --- |
| Description | Partage privé (Lecteur ou Éditeur), lien public, « chat view », liens d'artefact, autorisation de copie, analytics |
| Parcours | F19, F20, F21, F22 |
| Écrans | S25, S26, S27, S32, S33 |
| Composants | dialogue Share (champ email, rôle, accès Restricted ou Anyone with a link, Copy link, Copy link to chat view, case Allow copies, Save) ; icône cadenas, personnes ou globe ; bouton Copy ; onglet Analytics |
| Actions | inviter, changer de rôle, passer en public ou en privé, copier un lien, autoriser les copies, copier le notebook |
| Chargement | analytics mises à jour toutes les 24 h |
| Vide | analytics indisponibles sous 4 utilisateurs ou sans activité sur 7 jours |
| Erreur | email invalide (Q33) ; plus de 50 destinataires pour un compte perso ; Google Groups refusés ; public interdit en Workspace/Edu ; lien d'un artefact supprimé |
| Validation | format email, plafond de destinataires, rôle obligatoire ; seuls owner et éditeurs gèrent l'accès public |
| Données | NotebookMember, Notebook.access, allow_copies, Artifact.public_link_enabled, NotebookAnalyticsDaily |
| Dépendances | envoi d'emails ; la « chat view » ne retire pas l'accès réel dans l'original (à corriger dans le clone, H03) |

### 4.4 Importation de sources et formats acceptés — DOC — **P0**

**Formats et contraintes**

| catégorie | formats | particularités |
| --- | --- | --- |
| Fichiers | PDF, DOCX, TXT, MD, CSV, PPTX, EPUB | ≤ 200 Mo et ≤ 500 000 mots ; PDF protégé contre la copie refusé |
| Images | avif, bmp, gif, heic/heif, ico, jp2, jpeg, png, tiff, webp | « certains types fonctionnent moins bien » |
| Audio | ~22 extensions (mp3, wav, m4a, ogg, opus…) | transcrit à l'import ; ~70 langues ; refus si pas de parole |
| Web | URL HTML : texte seul, sans images, vidéos ni pages imbriquées ; PDF par URL | paywall refusé ; plusieurs URL à la fois |
| YouTube | URL publique avec sous-titres | transcript seul ; vidéo de moins de 72 h parfois indisponible ; source supprimée sous 30 j si la vidéo disparaît |
| Google | Docs, Slides (≤ 100), Sheets (≤ 100k tokens) | sync auto ; sans notes de bas de page ni commentaires ; plusieurs onglets réunis en une source |
| Texte | copier-coller | titre modifiable |
| Autres | Play Books (skip), chats Gemini (skip) | — |

**Grille de la fiche**

| attribut | contenu |
| --- | --- |
| Description | Ajout de sources depuis un fichier, Drive, une URL, YouTube, un texte collé, ou par recherche (Fast et Deep Research) |
| Parcours | F02, F03, F04, F05 |
| Écrans | S05, S06, S07, S09 |
| Composants | zone d'upload, sélecteur Drive, champ URL multi-lignes, champ texte avec titre, recherche avec bascules Web/Drive et Deep Research, résultats à cocher avec « View », Import, Cancel |
| Actions | téléverser, coller, rechercher, cocher des résultats, importer, annuler |
| Chargement | import (visuel non vu, Q13) ; Deep Research de plusieurs minutes, non bloquante ; Play Books jusqu'à 1 min |
| Vide | aucun résultat de recherche (non documenté) |
| Erreur | taille, nombre de mots, PDF protégé, paywall, YouTube (lien invalide, dangereux, sans sous-titres, langue non prise en charge), audio sans parole ou de mauvaise qualité, Drive sans droit ; import partiel au-delà du quota (libellés non vus, Q14) |
| Validation | type de fichier, ≤ 200 Mo, ≤ 500k mots, nombre de sources (50 → 600 selon le plan), URL valide |
| Données | Source, ResearchJob |
| Dépendances | stockage objet, parseurs, OCR/vision, STT, transcripts YouTube, API Drive (OAuth), API de recherche web, agent Deep Research |

### 4.5 Extraction et traitement des documents — DOC + HYP — **P0**
| attribut | contenu |
| --- | --- |
| Description | Conversion de chaque source en texte exploitable, résumé automatique (Source Guide), découpage pour la recherche |
| Parcours | F02, F03, F06 |
| Écrans | S09 (statut), S10 (texte extrait et Source Guide) |
| Composants | indicateur d'état sur la ligne de source, visionneuse, bloc Source Guide, bouton « Click to sync with Google Drive » |
| Actions | resynchroniser une source Drive, ouvrir le Source Guide |
| Chargement | extraction ou transcription (durée non documentée, Q13) ; resync Drive toutes les quelques minutes |
| Vide | source trop courte → citée en bloc, sans extrait (DOC) |
| Erreur | rendu différent de l'original (documenté) ; source Drive inactive si l'accès est perdu (compte dans le quota, n'est plus utilisée) |
| Validation | 500k mots maximum |
| Données | Source.extracted_text, source_guide_summary, Chunk (HYP) |
| Dépendances | pipeline RAG (découpage, embeddings, base vectorielle : HYP) ; LLM |

### 4.6 Gestion et sélection des sources — DOC — **P0**
| attribut | contenu |
| --- | --- |
| Description | Cocher les sources utilisées par le chat et le Studio ; labels thématiques automatiques à partir de 5 sources ; renommer et supprimer |
| Parcours | F07, F03 |
| Écrans | S09, S11 (sélecteur dans le champ de saisie) |
| Composants | cases à cocher, « tout sélectionner » (HYP), groupes de labels, menu ⋮ par source, icône note |
| Actions | cocher ou décocher ; créer, renommer, supprimer un label ; déplacer une source ; renommer et supprimer une source (HYP) |
| Chargement | création des labels automatiques (non documenté) |
| Vide | 0 source : invitation à ajouter |
| Erreur | aucune source cochée (Q12) ; source inactive |
| Validation | au moins 1 source cochée pour le chat (HYP) |
| Données | Source.selected (par utilisateur ou partagé ? Q07), SourceLabel |
| Dépendances | LLM pour les labels |

### 4.7 Chat IA contextualisé — DOC — **P0**
| attribut | contenu |
| --- | --- |
| Description | Questions et instructions avec réponses tirées **uniquement** des sources cochées ; résumé initial ; prompts suggérés ; personnalisation ; fonctions agentiques expérimentales (code, fichiers, recherche web) |
| Parcours | F06, F07, F08 |
| Écrans | S11, S12 |
| Composants | champ de saisie avec sélecteur de sources, bulles, chips d'action (Mind Map, Audio), Stop / Keep generating, étapes de réflexion dépliables, cartes interactives, pied de quota, 👍/👎 |
| Actions | envoyer, arrêter, reprendre, configurer (style Default / Learning Guide / Custom, longueur), donner un avis, signaler une réponse offensante |
| Chargement | réponse en streaming (HYP sur le rendu) |
| Vide | résumé de toutes les sources et prompts suggérés |
| Erreur | « ne peut pas répondre » (information absente ou tâche créative) ; filtre de sécurité ; quota proche ou atteint avec heure de réinitialisation ; erreur réseau (Q32) |
| Validation | message non vide ; quota de chat (50/jour en gratuit selon le tableau Workspace) |
| Données | ChatMessage, Notebook.chat_style, custom_instructions |
| Dépendances | LLM, index vectoriel, compteur d'usage ; sandbox d'exécution pour les fonctions agentiques |

### 4.8 Citations — DOC — **P0**
| attribut | contenu |
| --- | --- |
| Description | Citations numérotées dans le texte, chacune reliée au passage exact (texte ou image) ; présentes aussi dans les notes, les rapports et l'export Sheets |
| Parcours | F06, F09, F16 |
| Écrans | S11, S10, S19, S24 |
| Composants | chip de citation, popover d'extrait au survol, surlignage dans la visionneuse |
| Actions | survoler (voir l'extrait complet), cliquer (ouvrir la source au bon endroit) |
| Chargement | ouverture de la visionneuse (non documenté) |
| Vide | source courte → citation globale sans extrait |
| Erreur | source supprimée après coup (comportement non documenté) |
| Validation | chaque citation pointe vers un passage existant (à garantir dans le clone) |
| Données | Citation → Chunk / Source |
| Dépendances | découpage avec positions (page, offset, timestamp) |

### 4.9 Historique des conversations — DOC + HYP — **P0**
| attribut | contenu |
| --- | --- |
| Description | Historique conservé, privé pour chaque utilisateur, effaçable ; non copié lors de la copie d'un notebook |
| Parcours | F06, F11 |
| Écrans | S11 |
| Composants | fil de messages, menu ⋮ → « Delete chat history » |
| Actions | relire, effacer |
| Chargement | rechargement de l'historique (non documenté) |
| Vide | après effacement → vue initiale (HYP) |
| Erreur | non documenté |
| Validation | confirmation avant effacement (HYP) |
| Données | ChatMessage (notebook_id, user_id) ; un seul fil par notebook (HYP, Q08) |
| Dépendances | aucune |

### 4.10 Notes — DOC — **P0**
| attribut | contenu |
| --- | --- |
| Description | Notes manuelles, réponses sauvegardées ou textes collés ; **une note est une source** (cochable, citable, utilisée par le Studio) |
| Parcours | F09, F10 |
| Écrans | S09, S24, S13 (anciennes notes à convertir) |
| Composants | bouton Create note, éditeur (riche ? Q11), bouton Save to note, menu ⋮ (Export to Docs, Delete), bouton Convert / Convert all |
| Actions | créer, éditer, sauvegarder une réponse, exporter, supprimer, convertir |
| Chargement | export Docs dans un nouvel onglet |
| Vide | aucune note (non documenté) |
| Erreur | une note issue du chat n'est pas éditable tant que les citations y sont ; une note supprimée est irrécupérable |
| Validation | non documenté (Q34) |
| Données | Note = Source de type note ; has_citations ; origin |
| Dépendances | API Docs pour l'export dans l'original (DOCX ou Markdown dans le clone) |

### 4.11 Studio (socle commun) — DOC — **P1**
| attribut | contenu |
| --- | --- |
| Description | Panneau de génération de 9 types d'artefacts, en arrière-plan et en parallèle, avec personnalisation, quotas et notifications |
| Parcours | F12 à F18, F25 |
| Écrans | S13, S14, S17 |
| Composants | tuiles par type, crayon (personnaliser), liste d'artefacts avec menu ⋮ (renommer, télécharger, partager, supprimer, View custom prompt), point bleu « non lu », jauge de coût IA, Generate now / Generate later, Upgrade |
| Actions | générer, personnaliser, revoir le plan, renommer, supprimer, télécharger, partager, consulter le prompt, donner un avis |
| Chargement | génération en arrière-plan de quelques minutes (plus de 30 min pour la vidéo) ; notification navigateur, titre d'onglet animé, point bleu |
| Vide | Studio vide ; un artefact peut être offert à la création (hors quota) |
| Erreur | quota atteint → Generate later (exécution différée de quelques heures) ou Upgrade ; pas de droit d'édition ; **échec de génération non documenté (Q31)** |
| Validation | droit d'édition requis ; quota par type ; options obligatoires selon le type |
| Données | Artifact (type, status, options, custom_prompt, source_ids_snapshot, unread_by), ArtifactOutline, UsageLedger |
| Dépendances | file de jobs, stockage, Web Push, LLM ; fournisseurs média selon le type |

### 4.12 Audio Overview — DOC (mode interactif INA) — **P2**
| attribut | contenu |
| --- | --- |
| Description | Discussion entre hôtes IA à partir des sources. Formats : Deep Dive (2 voix), Brief (1 voix, < 2 min), Critique, Debate |
| Parcours | F12 |
| Écrans | S13, S14, S15 |
| Composants | dialogue (format, langue 80+, longueur courte / normale / longue, prompt), lecteur (lecture, avance et retour, vitesse, Share, Download, 👍/👎, Load, Interactive mode / Join) |
| Actions | générer, écouter en continuant à chatter, changer la vitesse, télécharger, partager, rejoindre la conversation (anglais seulement) |
| Chargement | quelques minutes ; « Load » pour les audios déjà générés |
| Vide | aucun audio |
| Erreur | quota (3/jour en gratuit) ; pas de droit d'édition ; artefacts glitchés ; échec (Q31) |
| Validation | droit d'édition ; longueur « longue » réservée à l'anglais ; mode interactif réservé aux nouveaux audios |
| Données | Artifact type=audio, file_ref MP3, options |
| Dépendances | LLM (script), TTS multi-voix ; STT et TTS temps réel pour le mode interactif |

### 4.13 Cartes mentales — DOC — **P1**
| attribut | contenu |
| --- | --- |
| Description | Arbre des thèmes et sous-thèmes des sources |
| Parcours | F14 |
| Écrans | S11 (chip), S13, S18 |
| Composants | canvas zoomable, nœuds dépliables, boutons plein écran, téléchargement et fermeture, 👍/👎 |
| Actions | zoomer, défiler, déplier ou replier, **cliquer un nœud pour poser une question dans le chat**, télécharger |
| Chargement | génération (durée non documentée) |
| Vide | aucune |
| Erreur | quota (10/jour en gratuit) ; pour régénérer, il faut supprimer la note |
| Validation | au moins 1 source |
| Données | Artifact type=mind_map, MindMapNode |
| Dépendances | LLM, bibliothèque de graphe |

### 4.14 Flashcards et quiz — DOC — **P1**
| attribut | contenu |
| --- | --- |
| Description | Supports de révision interactifs à partir des sources |
| Parcours | F15 |
| Écrans | S13, S14, S20, S21 |
| Composants | dialogue (difficulté, nombre, prompt) ; carte recto/verso, Got it / Missed it, Explain, Shuffle, supprimer une carte, Restart, plein écran, export CSV ; QCM, Hint, Explain, navigation, score |
| Actions | réviser, marquer, demander une explication, recommencer (mêmes cartes, toutes, ou seulement les ratées), Retake |
| Chargement | génération en arrière-plan |
| Vide | aucune |
| Erreur | quota (10/jour en gratuit) ; pas de droit d'édition |
| Validation | difficulté parmi 3 valeurs ; nombre parmi 3 valeurs |
| Données | Artifact, FlashcardItem / QuizItem, StudyProgress (progression mémorisée) |
| Dépendances | LLM |

### 4.15 Rapports, présentations, infographies, tableaux, vidéo — DOC (deck, infographie et vidéo cinematic INA 18+) — **P1 / P2**
| attribut | contenu |
| --- | --- |
| Description | Rapports « Document » (FAQ, Study guide, Briefing, suggestion IA, personnalisé) et « Interactive » ; Data Table ; Slide Deck révisable ; Infographie ; Video Overview (Explainer, Short, Cinematic) |
| Parcours | F13, F16, F17, F18 |
| Écrans | S13, S14, S16, S17, S19, S22, S23 |
| Composants | sélecteur de modèle, dialogue (format, langue, longueur, niveau de détail, orientation, style visuel, sources, prompt, revue du plan) ; viewer avec zoom, slideshow, mode Revise (instructions par slide, Pending Changes, supprimer, restaurer, réordonner) ; exports |
| Actions | générer, revoir le plan (Proceed irréversible), réviser un deck (crée un nouveau deck), exporter (Docs, Sheets, PDF, PPTX, PNG, MP4), partager, signaler |
| Chargement | quelques minutes ; plus de 30 min pour la vidéo |
| Vide | aucune |
| Erreur | quota (rapports 10/jour ; decks et infographies « limités ») ; réservé aux 18+ ; les sources ne sont pas relues pendant une révision ; échec (Q31) |
| Validation | droit d'édition ; Cinematic en anglais seulement ; options parmi des listes fermées |
| Données | Artifact, ArtifactOutline, SlideRevision, Citation (rapports et tables) |
| Dépendances | LLM ; génération d'images et de vidéos ; export PPTX/PDF ; API Docs/Sheets dans l'original |

### 4.16 Paramètres et préférences — DOC — **P0 / P1**
| attribut | contenu |
| --- | --- |
| Description | Langue de sortie (80+), thème (clair, sombre, appareil), notifications web, Usage, apps connectées, feedback, signalement, watermark visible (Pro et plus) |
| Parcours | F24, F26 |
| Écrans | S28, S29, S30, S31 |
| Composants | menu Settings, sélecteur de langue, bascule de thème, interrupteur de notifications, fiches d'apps, formulaire de feedback avec capture, formulaire d'abus |
| Actions | modifier une préférence, autoriser les notifications du navigateur, connecter ou déconnecter une app, envoyer un avis ou un signalement |
| Chargement | — |
| Vide | aucune app connectée (Q18) |
| Erreur | notifications refusées par le navigateur |
| Validation | langue parmi la liste ; type d'abus obligatoire |
| Données | User (output_language, theme, notifications, visible_watermark), ConnectedApp, NotebookAppToggle, AbuseReport |
| Dépendances | Web Push ; OAuth des apps tierces |

### 4.17 Limites d'usage et premium — DOC (contradictions Q04, Q05) — **P1**

**Paliers documentés**

| limite (palier gratuit → plus haut) | valeur |
| --- | --- |
| Notebooks par utilisateur | 100 → 200 → 500 |
| Sources par notebook | 50 → 100 → 300 → 400/500 → 600 |
| Chats par jour (tableau Workspace) | 50 → 200 → 500 → 1k → 5k |
| Audio et vidéo par jour | 3 → 6 → 20 → 40 → 200 |
| Rapports, flashcards, quiz, mind maps par jour | 10 → 20 → 100 → 200 → 1k |
| Deep Research | 10 par mois → 3, 20, 30, 200 par jour |
| Data tables, infographies, decks | « Limited » → « Highest » (non chiffré) |
| Différences premium | partage avancé (payant), accès anticipé, retrait du watermark visible (Pro et plus, sauf IN/KR/VN) |

Un second modèle est aussi documenté (17670842) : limites « compute-based », rafraîchies toutes les 5 h jusqu'à un plafond hebdomadaire, ×2 pour Plus, ×4 pour Pro, ×5 ou ×20 de Pro pour Ultra.

Prix indicatifs aux États-Unis, issus de sources tierces et non vérifiés : Plus ~4,99 $/mois, Pro ~19,99 $/mois, Ultra ~99,99 $ ou 199,99 $/mois.

**Grille de la fiche**

| attribut | contenu |
| --- | --- |
| Description | Quotas par plan, écran d'usage, génération différée, montée en gamme |
| Parcours | F25 |
| Écrans | S29, S34, S11 (pied de quota), S13 (jauge de coût) |
| Composants | jauge d'usage, bannières « presque atteint » et « atteint, réinitialisation à HH:MM », jauge de coût estimé, Generate later, Upgrade, badge de plan |
| Actions | consulter l'usage, différer une génération, passer au plan supérieur |
| Chargement | — |
| Vide | — |
| Erreur | limite atteinte (bloquant jusqu'à la réinitialisation) |
| Validation | contrôle côté serveur de chaque action par rapport au quota |
| Données | UsageLedger, User.plan |
| Dépendances | paiement (Stripe pour le clone), compteur d'usage |

## 5. Modèle de données

Voir [data-model-observations.md](data-model-observations.md) : 22 entités (dont Collection, observée) et 12 règles métier documentées.
Point clé : **une note est une source**, et un artefact garde un **instantané** des sources utilisées.

## 6. Matrice des fonctionnalités

Voir [features.csv](features.csv) : **88 lignes** (A07 Collections et A08 Recherche du tableau de bord ajoutées après les captures ; B05 YouTube passée en P2).

| | nombre |
| --- | --- |
| P0 | 22 |
| P1 | 25 |
| P2 | 23 |
| P3 | 18 |
| must | 22 |
| should | 25 |
| could | 41 |
| skip | 7 |
| fonctions absentes de l'original (différenciation, `original=no`) | 8 |

Le fichier est compatible avec `replica-diff/parity.py`, déjà vérifié : 71 lignes comptées.

## 7. Hors périmètre (ne peut pas ou ne doit pas être cloné)

- Ebooks Play Books : catalogue sous licence et partenariat.
- Intégration Gemini Apps et AI Mode : écosystème Google.
- Contenu des notebooks « featured » : éditorial sous licence. La **mécanique** de galerie reste clonable.
- Modèles Gemini, Veo, Nano Banana et watermark SynthID : propriétaires. À remplacer par des fournisseurs tiers.
- Sécurité Google Cloud (VPC-SC, IAM) et offres Workspace.
- Nom, logo, couleurs, textes et voix de l'original : identité à recréer (`/replica-brand`).
- **Toute sortie générée par Gemini Notebook** : interdite comme donnée pour le clone (voir § 0).

## 8. Différenciation et opportunités commerciales

Faiblesses relevées **dans la doc officielle** :
- un notebook ne voit pas les autres ;
- une note supprimée est irrécupérable ;
- la « chat view » n'isole pas vraiment le contenu ;
- les artefacts ne se mettent pas à jour quand les sources changent ;
- un seul fil de chat (supposé) ;
- l'export Docs n'est pas synchronisé ;
- le partage public est impossible en Workspace ;
- de nombreuses fonctions sont réservées aux 18+ ;
- les quotas sont opaques et ont changé plusieurs fois ;
- l'outil est fermé, sans API ;
- l'écosystème est enfermé chez Google (Drive uniquement).

Pistes pour un produit vendable :
1. **Confiance et conformité UE** : hébergement en UE, pas d'entraînement, DPA, journal d'audit. C'est l'argument principal en B2B européen (Z04).
2. **Recherche transverse** sur plusieurs notebooks ou sur tout un espace d'équipe (Z02).
3. **Multi-conversations** nommées par notebook (C06) et **corbeille / versions** des notes (D05).
4. **Artefacts « vivants »** : bandeau « sources modifiées, régénérer ? » et comparaison des différences.
5. **Connecteurs ouverts** : Notion, OneDrive/SharePoint, Dropbox, Confluence, Zotero (B09).
6. **Espaces d'équipe** avec SSO et facturation par siège (Z01), et une **chat view réellement restreinte** (H03) pour publier une base de connaissance à des clients.
7. **API et webhooks** (Z03) pour intégrer l'outil dans des workflows.
8. **Verticalisation** : juridique (citations au paragraphe, export des références), recherche académique (BibTeX, DOI), formation (répétition espacée FSRS, F04, et suivi de cohorte).
9. **Quotas lisibles** : crédits affichés en euros ou en unités, prix stables.
10. **Choix du modèle LLM** et option « BYO key » pour les clients sensibles.

## 9. Taille et rapport de couverture

**Taille** :
- Volumes : 34 écrans, 26 parcours, 20 entités, 86 fonctionnalités.
- Parties difficiles :
  1. RAG avec citations précises au passage, plus la visionneuse qui surligne ;
  2. pipeline d'ingestion multi-format (OCR, STT, YouTube, web anti-SSRF) et file de jobs asynchrones ;
  3. génération audio multi-voix, puis vidéo et decks.
- Périmètre complet : **XL → à recadrer**.
- MVP proposé, taille **M** (quelques semaines) : boucle cœur P0 = sources (PDF, DOCX, TXT, MD, URL, texte) → chat ancré avec citations → notes comme sources, avec le tableau de bord et les paramètres de base.
- Ensuite : P1 (Studio texte : rapports, flashcards, quiz, mind map ; partage ; plans), puis P2 (audio, deck, infographie).

**Couverture** :

| domaine demandé | couverture | manque |
| --- | --- | --- |
| Tableau de bord, gestion | 🟠 partielle (doc pauvre) | captures S03, renommer, supprimer (Q06, Q09, Q10) |
| Création, renommage, suppression, partage | 🟢 partage / 🟠 renommer et supprimer | 2 articles en 404 (Q01) |
| Import de sources, formats | 🟢 complète (doc) | messages d'erreur visuels (Q14) |
| Extraction, traitement | 🟠 inféré | interne non observable par nature |
| Gestion et sélection des sources | 🟢 | sélection perso ou partagée (Q07) |
| Chat, citations | 🟢 doc / 🔴 non observé | visuel des citations (Q16) |
| Historique | 🟠 | multi-fils ? (Q08) |
| Notes | 🟢 | format de l'éditeur (Q11) |
| Studio, audio, mind map, flashcards, quiz, rapports | 🟢 doc | aucun rendu vu |
| Slides, infographies, vidéo cinematic, Deep Research | 🟡 doc, INA 18+ | — |
| Paramètres | 🟢 | contenu de l'écran Usage (Q19) |
| Limites, premium | 🟠 contradictions | prix officiels (Q05), modèle de quota (Q04) |
| Mobile | ⚪ annexe | hors périmètre |

**Non fait** :
- interface authentifiée vue uniquement sur 2 captures statiques (S03, S08) fournies par l'utilisateur ; aucune interaction testée ;
- inventaire de l'aide **non exhaustif** : 28 articles repérés via les liens de l'accueil de l'aide et d'un seul article, sans parcours du sitemap (choix délibéré : pas de crawl). « Toutes les pages publiques » n'est donc pas garanti ;
- pas de changelog officiel, ni de fiches stores, ni de vidéos ;
- pas d'avis utilisateurs (→ `/replica-entrepreneur`) ;
- page de prix officielle illisible (SPA).

**Prochaine étape** : l'utilisateur fournit les captures de la checklist (`open-questions.md` § E), puis on met à jour les lignes HYP et on lance `/replica-architect`.
