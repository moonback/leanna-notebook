# Parcours utilisateurs — Gemini Notebook (web)

Date : 2026-11-09. Les identifiants d'écran renvoient à `screens-inventory.md`.

**Avertissement.** Aucun de ces parcours n'a été exécuté par nous. Ils sont reconstitués à partir de l'aide
officielle (DOC) et complétés par des hypothèses (HYP). Les nombres de clics sont **estimés d'après la
doc** et seront à recompter sur captures. Ils servent de cible à battre.

Format : `Fxx objectif` → écrans traversés → clics estimés (chemin nominal) → cas limites → reco.

---

### F01 Découvrir le produit et se connecter
S01 → S02 → S03
Clics estimés : 2 (Sign in, choix du compte).
Cas limites : âge non vérifié dans le compte Google (accès refusé), pays non pris en charge, compte Workspace sur lequel l'admin n'a pas activé le service.
Reco : S01 OBS ; le reste HYP, d'après la FAQ 16269187.

### F02 Créer un notebook avec une première source (boucle cœur, étape 1)
S03 → S05 → S08
1. « Create new notebook »
2. La pop-up d'ajout s'ouvre et l'utilisateur choisit un type (upload, Drive, URL, YouTube, texte).
3. Sélection du fichier ou saisie de l'URL, puis validation.
4. Arrivée sur la vue notebook. Le résumé de toutes les sources s'affiche dans le chat, l'emoji et le titre sont attribués automatiquement, et le Studio peut produire un artefact automatique (gratuit, une seule fois).

Clics estimés : 3 à 4.
Cas limites : fichier de plus de 200 Mo ou de plus de 500 000 mots ; PDF protégé contre la copie ; page payante (paywall) ; vidéo YouTube sans sous-titres, privée, de moins de 72 h ou non sûre ; audio sans parole ou de mauvaise qualité ; type non pris en charge ; quota de notebooks atteint (100 en gratuit).
Reco : DOC 16206563, 16215270, 16269187. Titre automatique : **HYP** (seul l'emoji automatique est documenté).

### F03 Ajouter des sources à un notebook existant
S08 → S09 « + Add » → S05 → S09
Clics estimés : 3.
Cas limites : limite de 50 sources (gratuit), import de plusieurs URL en une fois (séparées par espace ou retour à la ligne), import Drive sans droit de lecture.
Reco : DOC 16215270.

### F04 Découvrir des sources par recherche (Fast Research)
S09 → champ de recherche → choix Web ou Drive → S06 → sélection → Import
Clics estimés : 4.
Cas limites : aucun résultat (HYP), résultats non pertinents, limite de sources atteinte.
Reco : DOC 16215270.

### F05 Lancer une Deep Research et importer
S09 → bascule Web + Deep Research → S07 (plusieurs minutes, non bloquant) → Import de tout ou d'une sélection
Clics estimés : 4 à 5.
Cas limites : utilisateur de moins de 18 ans ; quota mensuel ou journalier (10/mois en gratuit d'après le tableau Workspace) ; import partiel si la limite est atteinte ; « Cancel » qui jette les résultats non importés.
Reco : DOC 16215270, 16337734 ; INA (18+, non testé).

### F06 Poser une question et vérifier une citation (boucle cœur, étape 2)
S11 → saisie → réponse en streaming → survol d'une citation (extrait) → clic → S10 au passage surligné
Clics estimés : 2 (envoyer, cliquer la citation).
Cas limites : réponse absente des sources (refus « ne peut pas répondre ») ; filtre de sécurité ; source trop courte (citation globale, sans extrait) ; arrêt manuel (« Stop », puis reprise avec « Keep generating ») ; quota de chat atteint (50/jour en gratuit d'après le tableau Workspace).
Reco : DOC 16179559, 16269187.

### F07 Restreindre le contexte à certaines sources
S09 : cocher ou décocher des sources (ou le sélecteur dans le champ de saisie), puis poser la question dans S11.
Clics estimés : 1 par source.
Cas limites : aucune source cochée (comportement **HYP**) ; note non cochée, donc exclue ; source inactive (Drive) ignorée.
Reco : DOC 16179559, 16262519, 16296687.

### F08 Personnaliser le chat
S11 → S12 → style (Default / Learning Guide / Custom) + longueur → Save
Clics estimés : 4.
Reco : DOC 16179559. Les consignes personnalisées sont partagées avec Gemini Apps et AI Mode (17003757).

### F09 Sauvegarder une réponse en note (boucle cœur, étape 3)
S11 → « Save to note » → la note apparaît dans S09 comme source (citations conservées)
Clics estimés : 1.
Cas limites : édition impossible tant que les citations restent dans la note ; une note supprimée est irrécupérable.
Reco : DOC 16262519, 16269187.

### F10 Écrire une note manuelle et l'exporter
S09 « Create note » → S24 → saisie → (⋮ Export to Docs)
Clics estimés : 2 à 4.
Reco : DOC 16262519. Sauvegarde automatique ou bouton : **HYP**.

### F11 Effacer l'historique du chat
S11 → ⋮ → « Delete chat history » → confirmation (HYP)
Clics estimés : 2 à 3.
Reco : DOC 16179559. Pas de multi-conversations documenté : **HYP**, un fil unique par notebook.

### F12 Générer un Audio Overview personnalisé et l'écouter
S13 → crayon Audio → S14 (format Deep Dive / Brief / Critique / Debate, langue, longueur, prompt) → Generate → génération en arrière-plan (quelques minutes) → notification et point bleu → S15
Clics estimés : 3 (génération par défaut : 1).
Cas limites : quota journalier (3/jour en gratuit) → « Generate later » ou Upgrade ; pas de droit d'édition sur le notebook ; nouvelle génération pendant qu'une autre tourne (possible d'après la doc) ; mode interactif réservé à l'anglais.
Reco : DOC 16212820, 17670842.

### F13 Générer une Video Overview avec revue des « producer notes »
S13 → crayon Video → S14 (Cinematic / Explainer / Short, langue, style visuel, sujet) → activer la revue → Generate → S17 Review → feedback groupé → Proceed (irréversible) → plus de 30 min possibles → S16
Clics estimés : 6.
Variante : déclenchement depuis le chat par une carte interactive.
Reco : DOC 16454555 ; Cinematic INA (18+, anglais).

### F14 Générer une carte mentale et rebondir dans le chat
S11 chip « Mind Map » → note dans S13 → S18 → clic sur un nœud → question pré-remplie dans S11
Clics estimés : 3.
Cas limites : pour régénérer, il faut supprimer la note (aucun bouton « regénérer » n'est documenté).
Reco : DOC 16212283.

### F15 Réviser avec des flashcards puis un quiz
S13 → crayon Flashcards (difficulté, nombre, prompt) → S20 → Got it / Missed it → résultats → « Only cards you missed »
S13 → Quiz → S21 → Hint / Explain → score → Retake
Clics estimés : 1 clic par carte plus 3 à 4 de mise en route.
Cas limites : quitter en cours de session (progression mémorisée) ; supprimer une carte ; export CSV.
Reco : DOC 16958963.

### F16 Générer un rapport et l'exporter
S13 → Reports → Document (FAQ / Study guide / Briefing / suggestion IA / personnalisé) ou Interactive (Learning Overview) → S19 → ⋮ Export to Docs / Sheets
Clics estimés : 3 à 4.
Reco : DOC 18323649, 16206563. Export Google : dépendance externe.

### F17 Générer et réviser un slide deck
S13 → crayon Slide Deck (format, langue, longueur, sources, prompt) → [revue du plan, S17] → S22 → Revise → instructions par slide, suppression, réordonnancement → « Generate revised deck » → PDF / PPTX
Clics estimés : 8 ou plus.
Cas limites : chaque révision crée un nouveau deck et consomme du quota ; les sources ne sont pas relues pendant la révision.
Reco : DOC 16757456 ; INA (18+).

### F18 Générer une infographie
S13 → crayon (langue, détail, orientation, style, prompt) → S23 → Download PNG
Clics estimés : 3.
Reco : DOC 16758265 ; INA (18+).

### F19 Partager un notebook en privé
S08 → Share → S25 → email + rôle Viewer/Editor → (Allow copies) → Save / Copy link
Clics estimés : 4.
Cas limites : plus de 50 destinataires (compte Gmail perso) ; Google Groups refusés pour les comptes perso ; pas de notification email quand on partage à un groupe ; le lien « chat view » ne retire pas réellement l'accès.
Reco : DOC 16206563.

### F20 Publier un notebook, puis un artefact
S25 → accès « Anyone with a link » (globe) → Copy link ; puis dans le lecteur d'artefact → Share → « Copy link to … » → Save
Clics estimés : 3 + 3.
Cas limites : public interdit pour Workspace / Education ; notebook contenant des sources Play Books ; artefact supprimé (le lien meurt) ; repasser en « Restricted » (le notebook disparaît chez les anciens visiteurs).
Reco : DOC 16322204, 16212820.

### F21 Visiter un notebook public ou featured
Lien → S08 en lecture (chat possible, pas de génération ni d'ajout de source) → le notebook apparaît sur S03 → ⋮ « Remove notebook »
Reco : DOC 16322204.

### F22 Copier un notebook
S08 → Copy → Create → nouveau notebook (sources et Studio copiés ; chat et notes non copiés)
Clics estimés : 2.
Reco : DOC 16206563, **contradiction** avec la FAQ 16269187 (voir open-questions Q02).

### F23 Renommer, changer l'emoji ou supprimer un notebook
Emoji : S11 → clic sur l'emoji → recherche → choix (DOC 16206563).
Renommer : clic sur le titre dans S08 ou ⋮ sur la carte de S03 (**HYP**).
Supprimer : ⋮ sur la carte de S03 → confirmation (**HYP**). La doc confirme qu'une suppression retire les sources (17003757).

### F24 Changer les préférences
S28 → Output Language / Device (thème) / Notifications (autorisation du navigateur) / Usage / Connected apps
Reco : DOC 16225229, 16261963, 16206563, 17670842, 18784282.

### F25 Atteindre une limite d'usage
Chat : bannière « presque atteint » puis « limite atteinte, réinitialisation à HH:MM ». Studio : jauge de coût, puis « Generate later » (exécution différée de quelques heures, avec notification) ou « Upgrade » → S34.
Reco : DOC 17670842.

### F26 Signaler un contenu ou envoyer un avis
S28 → Send feedback (texte + capture) ou Report notebook (type d'abus) ; 👎 sur une réponse → « Offensive/unsafe »
Reco : DOC 16179536, 16269187.

---

**Total : 26 parcours.** Boucle cœur proposée pour le MVP : **F02 → F06 → F07 → F09**, soit environ 7 à 9 clics
de la création du notebook à une note citée.
