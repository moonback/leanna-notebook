# Inventaire des écrans — Gemini Notebook (ex-NotebookLM), web

Date : 2026-11-09. Plateforme principale : web (desktop). Le mobile est mentionné seulement pour mémoire.

## Légende de l'état de reconnaissance

| code | signification |
| --- | --- |
| **OBS** | Observé directement par nous. Seule la landing publique est concernée. |
| **DOC** | Décrit dans l'aide officielle, avec le n° d'article (voir `recon.md` § Sources). |
| **HYP** | Hypothèse à vérifier dans le compte de l'utilisateur. |
| **INA** | Inaccessible pour nous : 18+, compte Workspace/Cloud, achat Play Books, mobile. |

> Aucun écran situé derrière la connexion Google n'a été observé. Pour l'intérieur de l'app, les composants
> et les états listés ci-dessous viennent de l'aide officielle (DOC) ou de déductions (HYP).
> La checklist de captures à fournir se trouve en fin de `open-questions.md`.

## Écrans

| ID | écran | accès | rôle | composants clés | états connus | reco |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | Landing publique | `notebook.google.com` sans session | Positionnement et entrée | Titre « comprendre n'importe quoi », CTA « Get the app », CTA « Sign in », visuel produit | rempli | OBS |
| S02 | Connexion | CTA Sign in → `/login?continue=…` (compte Google) | Authentification | Écran de connexion Google (hors produit) | non vu | HYP |
| S03 | Accueil / tableau de bord | après connexion | Lister, filtrer, rechercher, ouvrir les notebooks | En-tête : onglets **Tous / Mes notebooks / Découvrir / Collections**, champ « Rechercher des notebooks », bascule **grille/liste**, réglages, lanceur d'apps, avatar ; titre « Notebooks récents » + icône de tri ; vue liste à colonnes **Titre (emoji + titre) / Sources (« N sources ») / Création (date) / Rôle (« Propriétaire »)** + menu ⋮ par ligne ; lien « Voir plus » ; titre par défaut « Notebook sans titre » | rempli ; **bannière « nombre maximal de notebooks atteint » + lien Passer à l'édition supérieure** ; notebook à 0 source | **OBS** (capture/liste-notebook.PNG, 2026-11-09) ; vue grille, contenu du menu ⋮ et état vide : HYP |
| S04 | Onglet Featured notebooks | onglet de S03 (comptes grand public seulement) | Parcourir des notebooks curés | Liste de notebooks éditoriaux | rempli | DOC 16322204 |
| S05 | Modale « Ajouter des sources » | à la création d'un notebook (pop-up) ou bouton « + Add » | Importer des sources | Zone d'upload de fichiers, Google Drive, URL web (plusieurs, séparées par espace ou retour à la ligne), YouTube, texte copié, Play Books, champ de recherche (Fast Research / Deep Research, bascule Web/Drive) | vide, upload en cours ?, échec d'import, compteur de sources / limite | DOC 16215270, 16206563 |
| S06 | Résultats Fast Research | recherche depuis S05 ou le panneau Sources | Découvrir des sources | Liste de résultats (titre, raison de la pertinence, lien externe), cases à cocher, bouton « View » pour déplier, import | chargement, résultats, aucun résultat ? | DOC 16215270 |
| S07 | Deep Research | bascule « Deep Research » dans la recherche | Rapport multi-page avec sources | Rapport, liste des sources citées et non citées, sélection, « Import », « Cancel » / réduire | en cours (plusieurs minutes, non bloquant), terminé, import partiel si limite atteinte | DOC 16215270 ; INA (18+) |
| S08 | Vue notebook (3 panneaux) | ouvrir un notebook, route `/notebook/{uuid}` | Espace de travail principal | En-tête : logo, titre, « + Créer un notebook », « Partager », ⋮, réglages, avatar. **Sources** (repliable) : « + Ajouter des sources », recherche web avec sélecteurs « Web » et « Fast Research », « Tout sélectionner », liste à cases (icône de type + nom de fichier). **Chat** : grand emoji, titre, « N sources · date », résumé en prose avec termes en gras, actions Enregistrer dans une note / copier / 👍 / 👎, 3 cartes de questions suggérées, champ « Posez une question ou créez quelque chose » avec icône de réglages et compteur « N sources », avertissement de fiabilité en pied. **Studio** (repliable) : 9 tuiles (Résumé audio, Présentation, Résumé vidéo, Carte mentale, Rapports avec badge « Nouveau ! », Fiches d'apprentissage, Quiz, Infographie, Tableau de données), liste d'artefacts (icône, titre, « N sources · Il y a 1 h », durée audio + progression + ▶, point bleu non lu, ⋮), bouton flottant « Ajouter une note » | rempli avec artefacts auto-générés | **OBS** (capture/notebook.PNG) |
| S09 | Panneau Sources | partie de S08 | Gérer et sélectionner les sources | « + Add », « Create note », liste de sources avec case à cocher et icône de type, labels auto (à partir de 5 sources) avec ajout, renommage, suppression et déplacement, menu ⋮ par source (dont Export to Docs pour une note), sources inactives (Drive inaccessible) avec lien « demander l'accès » | 0 source, 1+, ≥5 avec labels, source inaccessible, sync Drive | DOC 16215270, 16262519 |
| S10 | Visionneuse de source + Source Guide | clic sur une source | Lire la source et son résumé auto | Texte extrait de la source, **Source Guide** (résumé auto), surlignage du passage cité, « Click to sync with Google Drive » | chargement, rendu différent de l'original (documenté) | DOC 16215270, 16179559 |
| S11 | Panneau Chat | partie de S08 | Q&R ancrées sur les sources | Résumé généré de toutes les sources, prompts suggérés, champ de saisie avec sélecteur de sources, chips de citation (survol = extrait, clic = saut vers la source), « Save to note », bouton Stop / « Keep generating », chips d'action (Mind Map, Audio), étapes de réflexion dépliables, cartes interactives (création de vidéo ou de deck), message de quota en pied, emoji du notebook, menu ⋮ « Delete chat history » | vide (aucune source), génération en cours, réponse, refus « ne peut pas répondre », limite proche ou atteinte | DOC 16179559, 16269187, 17670842 |
| S12 | Configure Chat | icône dans S11 | Personnaliser le chat | Style (Default / Learning Guide / Custom + texte libre), longueur de réponse, apps connectées activées ou non pour ce notebook, Save | — | DOC 16179559, 18784282 |
| S13 | Panneau Studio | partie de S08 | Générer et lister les artefacts | Tuiles : Audio Overview, Video Overview, Mind Map, Reports, Flashcards, Quiz, Infographic, Slide Deck, Data Table ; icône crayon pour personnaliser ; liste des artefacts générés avec menu ⋮ (renommer, télécharger, partager, supprimer, « View custom prompt ») ; point bleu « non lu » ; jauge de coût IA estimé ; « Generate now » / « Generate later » ; notes héritées avec « Convert » | vide, génération en arrière-plan, prêt (non lu), échec ?, quota atteint → Generate later / Upgrade | DOC 16206563, 17670842, 16262519 |
| S14 | Dialogue de personnalisation (générique) | crayon sur une tuile Studio | Paramétrer une génération | Selon le type : format, langue, longueur, difficulté, nombre, orientation, style visuel, niveau de détail, sélection des sources, prompt libre, bascule « Review outline / producer notes » | — | DOC 16212820, 16454555, 16757456, 16758265, 16958963, 18323649 |
| S15 | Lecteur audio | ouvrir un Audio Overview | Écouter le podcast IA | Play/Pause, avance et retour, vitesse, Share, Download, 👍/👎, « Load » (anciens audios), « Interactive mode » → « Join » | chargement (« Load »), lecture, interactif (anglais) | DOC 16212820 ; INA (mode interactif non testable) |
| S16 | Lecteur vidéo | ouvrir un Video Overview | Regarder la vidéo explicative | Play, curseur, vitesse, plein écran, Share, Download, retour « good » / « bad » video, « Show prompt » | génération longue (> 30 min possible) | DOC 16454555 |
| S17 | Revue « producer notes » / plan | « Review » dans le Studio | Valider le plan avant le rendu | Plan ou notes éditables (feedback groupé), « Proceed » (irréversible) | prêt à revoir | DOC 16454555, 16757456 |
| S18 | Visionneuse Mind Map | ouvrir la note Mind Map | Explorer la carte mentale | Zoom, défilement, branches dépliables et repliables, clic sur un nœud → question dans le chat, plein écran, téléchargement, sortie, 👍/👎 | — | DOC 16212283 |
| S19 | Visionneuse de rapport / Data Table | ouvrir un rapport | Lire et exporter | Rendu texte avec citations, Share → « Copy link to Report », ⋮ Export to Docs / Sheets, Flag ; rapport interactif avec artefacts suggérés à « Add » | — | DOC 18323649, 16206563 |
| S20 | Visionneuse Flashcards | ouvrir des flashcards | Réviser | Carte recto/verso, précédent/suivant, « Got it » / « Missed it », Explain, Shuffle, supprimer une carte, Restart, plein écran, export CSV, écran de résultats (Same / All / Only missed) | en cours (progression mémorisée), terminé | DOC 16958963 |
| S21 | Visionneuse Quiz | ouvrir un quiz | S'évaluer | Question QCM, Hint, Explain, précédent/suivant, plein écran, score final, Retake / Review | en cours, terminé | DOC 16958963 |
| S22 | Visionneuse Slide Deck | ouvrir un deck | Présenter et réviser | Défilement, zoom, « Start slideshow » (flèches, Échap), Revise (instructions par slide → « Pending Changes », supprimer ou restaurer une slide, glisser-déposer pour réordonner, « Generate revised deck »), export PDF/PPTX, Share | révision en attente | DOC 16757456 ; INA (18+) |
| S23 | Visionneuse Infographie | ouvrir une infographie | Voir et exporter | Zoom, Share, Download PNG, 👍/👎 | — | DOC 16758265 ; INA (18+) |
| S24 | Note (éditeur) | « Create note » ou une note existante | Écrire ou relire une note | Éditeur texte (riche ?), titre, citations conservées si la note vient du chat (non éditable tant que les citations restent), ⋮ Export to Docs, Delete | — | DOC 16262519 ; HYP (riche ou markdown ?) |
| S25 | Dialogue Share | bouton Share | Partager le notebook | Champ email + rôle Viewer/Editor, accès « Restricted » / « Anyone with a link », « Copy link », « Copy link to chat view », case « Allow copies », Save ; icône cadenas, personnes ou globe | privé, partagé, public | DOC 16206563, 16322204, 16269187 |
| S26 | Copy notebook | bouton Copy → Create | Dupliquer | Confirmation de copie | — | DOC 16206563 (contredit par la FAQ 16269187 → voir open-questions) |
| S27 | Analytics | bouton Analytics | Usage sur 7 jours | Utilisateurs par jour, requêtes par jour | « pas assez de données » (< 4 utilisateurs) | DOC 16206563 |
| S28 | Settings (menu) | icône en haut à droite | Préférences | Output Language, Device (Clair / Sombre / Appareil), Notifications (web), Usage, Connected apps, Send Feedback, Report notebook | — | DOC 16225229, 16261963, 17670842, 18784282, 16179536 |
| S29 | Usage | Settings → Usage | Voir le quota | Consommation, plafond hebdo, heure de réinitialisation, Upgrade | normal, proche, atteint | DOC 17670842 ; HYP (mise en page) |
| S30 | Connected apps | Settings → Connected apps | Activer des intégrations | Liste d'apps, fiche (description, actions, exemples de prompts) | — | DOC 18784282 |
| S31 | Send feedback / Report notebook | Settings | Signaler | Texte libre, capture d'écran optionnelle, type d'abus, « Submit Abuse Report » | — | DOC 16179536 |
| S32 | Vue partagée « Chat view » | lien « chat view » | Interface de chat seule pour les lecteurs | Chat sans panneaux Sources/Studio visibles | — | DOC 16206563 |
| S33 | Vue d'un artefact public | lien partagé d'un artefact | Consulter sans compte | Lecteur de l'artefact, Flag | — | DOC 16206563, 18323649 |
| S34 | Upgrade / plans | « Upgrade » depuis le chat ou le Studio | Vente | Redirection vers les plans Google AI | — | DOC 17670842 ; page `/plans` non lisible (SPA) |

Total : **34 écrans**, dont 3 OBS (S01, S03, S08), 27 DOC (dont 4 DOC+INA), 4 à dominante HYP (S02, S24, S29, + parties de S03).

## Composants récurrents (pour replica-design)

| composant | variantes | états | écrans |
| --- | --- | --- | --- |
| Bouton | primaire, secondaire, icône, chip d'action | défaut, survol, focus, désactivé, chargement | tous |
| Menu ⋮ (kebab) | carte, source, artefact, chat | ouvert, fermé | S03, S09, S11, S13, S22 |
| Carte notebook | perso, partagé, public, featured | défaut, survol | S03, S04 |
| Ligne de source | fichier, URL, YouTube, audio, Drive, note, chat Gemini | sélectionnée, désélectionnée, inactive, en import, en échec | S09 |
| Label de source (groupe) | auto, manuel | replié, déplié, en édition | S09 |
| Chip de citation | numérotée | survol (popover d'extrait), actif | S11, S19, S24 |
| Bulle de chat | utilisateur, IA, carte interactive | streaming, terminé, stoppé, refus | S11 |
| Tuile Studio | 9 types d'artefacts | inactif, en génération, prêt, non lu (point bleu) | S13 |
| Dialogue de personnalisation | radios, sélecteur de langue, slider de longueur, prompt | — | S14 |
| Lecteur média | audio, vidéo | chargement, lecture, pause, plein écran | S15, S16 |
| Viewer plein écran | mind map, deck, infographie, flashcards, quiz | normal, plein écran | S18–S23 |
| Jauge de coût IA | barre | faible → élevé | S13 |
| Bannière de quota | info, alerte, bloquant | — | S11, S13 |
| Toast / notification web | artefact prêt | — | global |
| Dialogue de partage | privé, public | — | S25 |
| Feedback 👍/👎 | avec motif | — | S11, S15, S16, S18, S22, S23 |
| Sélecteur d'emoji | recherche | — | S11 |
