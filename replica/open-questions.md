# Questions ouvertes et vérifications à faire

Date : 2026-11-09. Chaque question renvoie à un écran (Sxx), un parcours (Fxx) ou une ligne de `features.csv`.

## A. Contradictions dans la documentation officielle

| # | question | sources en conflit | impact |
| --- | --- | --- | --- |
| Q01 | Deux articles listés sur l'accueil de l'aide renvoient une erreur 404 (16341349, 16972047). Ils pourraient couvrir « renommer ou supprimer un notebook » ou un autre sujet. | accueil de l'aide | F23, S03 |
| Q02 | La copie de notebook est-elle disponible ? La FAQ dit « pas encore prise en charge », alors que l'article de création documente Copy → Create. La FAQ est probablement périmée. | 16269187 vs 16206563 | F22, S26 |
| Q03 | Plafond de sources pour le palier « Ultra 20 To » : 500 (plans grand public) ou 400 (tableau Workspace « Expanded ») ? | 16213268 vs 16337734 | features.csv (limites) |
| Q04 | Quel modèle de quota s'applique au grand public : des quotas fixes par jour et par fonctionnalité (tableau : 50 chats/jour, 3 audios/jour…) ou des quotas « compute-based » rafraîchis toutes les 5 h avec un plafond hebdomadaire (×2 Plus, ×4 Pro) ? | 16337734 vs 17670842 | modèle économique du clone |
| Q05 | Prix publics. La page `notebooklm.google/plans` n'a pas pu être lue (SPA). Des sources tierces avancent environ 4,99 $ (Plus), 19,99 $ (Pro), 99,99 / 199,99 $ (Ultra) par mois aux États-Unis en 2026, sans concordance totale. **À confirmer sur la page officielle.** | blogs tiers | positionnement prix |

## B. Hypothèses à vérifier dans le compte de l'utilisateur

| # | hypothèse | comment vérifier | écran |
| --- | --- | --- | --- |
| Q06 | ~~Vue grille/liste, tri, filtres~~ **Résolue (capture 2026-11-09)** : onglets Tous / Mes notebooks / Découvrir / Collections, recherche, grille/liste, tri, colonnes Titre/Sources/Création/Rôle. Reste à voir : contenu de « Collections » (dossiers de notebooks ? non documenté) et du menu ⋮ | capture de Collections et du menu ⋮ | S03 |
| Q07 | La sélection des sources (cases à cocher) est-elle mémorisée par utilisateur ou partagée entre les collaborateurs ? | deux comptes sur un notebook partagé | S09 |
| Q08 | Un seul fil de chat par notebook (pas de multi-conversations) ? Seul « Delete chat history » est documenté. | menu ⋮ du chat | S11 |
| Q09 | Le titre du notebook est-il généré automatiquement (comme l'emoji) ? Comment le renomme-t-on ? | créer un notebook, cliquer sur le titre | S08, F23 |
| Q10 | Comment supprime-t-on un notebook (menu ⋮ de la carte ? confirmation ? corbeille ?) | menu ⋮ de la carte | S03 |
| Q11 | L'éditeur de notes est-il riche (gras, listes, tableaux) ou en markdown ? Y a-t-il une sauvegarde auto ? | ouvrir une note | S24 |
| Q12 | Que se passe-t-il quand aucune source n'est cochée ? (blocage, réponse générale, message) | décocher toutes les sources | S11 |
| Q13 | État pendant l'import d'une source : barre de progression, spinner, durée pour un PDF de 100 pages ? | importer un PDF lourd | S05, S09 |
| Q14 | Messages d'erreur exacts lors d'un échec d'import (fichier trop gros, paywall, YouTube sans sous-titres). | tenter ces cas | S05 |
| Q15 | Que contiennent les états vides : nouveau notebook sans source, Studio vide, chat vide ? | captures | S08, S11, S13 |
| Q16 | Format visuel des citations : numéros en exposant ? chips ? popover ? | survol | S11 |
| Q17 | Les artefacts générés automatiquement (gratuits) apparaissent-ils systématiquement ? Lesquels ? | créer un notebook | S13 |
| Q18 | Liste réelle des « Connected apps » proposées. | Settings → Connected apps | S30 |
| Q19 | Contenu de l'écran Usage : jauge, pourcentage, heure de réinitialisation ? | Settings → Usage | S29 |
| Q20 | Les fonctions « agentiques » du chat (exécution de code, génération de xlsx/pptx) sont-elles visibles pour tous ? | demander un graphique dans le chat | S11 |
| Q31 | À quoi ressemble un artefact dont la génération échoue ? Peut-on relancer ? Le quota est-il rendu ? (non documenté) | provoquer un échec (sources très courtes, par exemple) | S13 |
| Q32 | Quelle erreur s'affiche dans le chat en cas de coupure réseau ou de timeout ? | couper le réseau pendant une réponse | S11 |
| Q33 | Que se passe-t-il avec un email de partage invalide ou sans compte Google ? Au-delà de 50 destinataires ? | saisir un email invalide | S25 |
| Q34 | Validation du titre d'un notebook ou d'une note : longueur maximale, titre vide accepté ? | coller un titre très long | S08, S24 |

## C. Fonctions inaccessibles pour nous

| # | fonction | raison | conséquence |
| --- | --- | --- | --- |
| Q21 | Deep Research, Slide Deck, Infographie, Cinematic Video, styles visuels | réservés aux 18+ ; non testés | décrites d'après la doc uniquement |
| Q22 | Mode interactif de l'audio, chat vocal live | anglais seulement ; mobile seulement pour le vocal | non testés |
| Q23 | Plafonds Plus/Pro/Ultra, Analytics (≥ 4 utilisateurs), suppression du watermark | nécessitent un abonnement ou plusieurs comptes | non testés |
| Q24 | Workspace, Education, Enterprise (VPC-SC, IAM) | compte pro requis | hors périmètre |
| Q25 | Sources Play Books | achat requis ; contenu sous licence | `skip` |
| Q26 | Apps mobiles Android et iOS | non installées | hors périmètre de cette reco |

## D. Questions juridiques et produit (décisions pour l'utilisateur)

| # | question |
| --- | --- |
| Q27 | **Conditions d'utilisation Google.** Les règles d'usage de l'IA générative interdisent « d'utiliser du contenu généré par l'IA de nos services pour développer des modèles de machine learning ou une technologie d'IA associée ». Les conditions additionnelles disent aussi qu'on ne peut pas « utiliser les Services pour développer des modèles de machine learning ou une technologie associée ». Les conditions générales interdisent la rétro-ingénierie. **Conséquence pratique** : observer l'interface pour en tirer des parcours reste raisonnable. En revanche, il ne faut **jamais** réutiliser des sorties de Gemini Notebook (audios, rapports, réponses) comme données d'entraînement, d'évaluation, de prompts few-shot ou de démo pour notre produit. La formule « technologie associée » est large : faire valider par un juriste avant la commercialisation. |
| Q28 | Nom et identité : « Notebook » est générique, mais le dépôt s'appelle `Notebook`. Éviter toute confusion avec « Gemini Notebook » ou « NotebookLM ». Voir `/replica-brand`. |
| Q29 | Fournisseur LLM, TTS et vidéo pour le clone (Claude, OpenAI, ElevenLabs…) : coûts unitaires à chiffrer avant de fixer les quotas. |
| Q30 | Cible commerciale prioritaire (étudiants, équipes B2B, juristes, chercheurs) ? Elle oriente les P1/P2. |

## E. Checklist de captures à fournir par l'utilisateur

Merci de parcourir **votre propre compte** à vitesse humaine et de déposer les captures dans
`replica/screens/` en les nommant par ID (ex. `S03-vide.png`). Masquez vos données personnelles si besoin.
Ces captures servent uniquement de référence et ne seront jamais intégrées au produit.

- [ ] **S03** tableau de bord : vide (compte neuf ou après archivage), rempli, menu ⋮ d'une carte, options de vue et de tri → Q06, Q10
- [ ] **S03/S04** onglet Featured notebooks
- [ ] **S05** modale « Ajouter des sources » : chaque onglet ou option (upload, Drive, URL, YouTube, texte copié)
- [ ] **S05** import en cours et import en échec (ex. URL derrière un paywall, YouTube sans sous-titres) → Q13, Q14
- [ ] **S06** résultats de Fast Research
- [ ] **S08** notebook neuf juste après la première source : résumé, prompts suggérés, Studio → Q15, Q17
- [ ] **S09** panneau Sources avec au moins 5 sources (labels automatiques), menu ⋮ d'une source
- [ ] **S10** visionneuse de source avec Source Guide
- [ ] **S11** réponse avec citations + popover au survol d'une citation + clic (saut dans la source) → Q16
- [ ] **S11** menu ⋮ du chat (historique, nouvelle conversation ?) → Q08
- [ ] **S11** toutes les sources décochées, puis une question → Q12
- [ ] **S12** Configure Chat
- [ ] **S13** panneau Studio vide puis avec 2 ou 3 artefacts (point bleu, jauge de coût)
- [ ] **S14** dialogue de personnalisation : Audio, Video, Report, Flashcards, Quiz (un par un)
- [ ] **S15** lecteur audio ; **S16** lecteur vidéo (si généré)
- [ ] **S18** carte mentale ; **S19** rapport ; **S20** flashcards ; **S21** quiz
- [ ] **S24** éditeur de note (manuelle et issue du chat) → Q11
- [ ] **S25** dialogue Share (privé, puis « Anyone with a link »)
- [ ] **S08** clic sur le titre (renommer ?) → Q09
- [ ] **S28** menu Settings ; **S29** Usage ; **S30** Connected apps → Q18, Q19
- [ ] Tout message de limite atteinte, si vous en rencontrez un
- [ ] **S13** artefact en échec, si cela arrive → Q31
- [ ] **S11** erreur réseau pendant une réponse → Q32
- [ ] **S25** email de partage invalide → Q33
