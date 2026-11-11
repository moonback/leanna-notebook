# 10 améliorations prioritaires des fonctionnalités existantes

Ces éléments améliorent des chemins déjà repérés dans le code ; ils ne sont pas comptés parmi les 20 nouvelles fonctionnalités.

| # | Fonction existante | Problème constaté | Amélioration proposée | Résultat attendu | Complexité |
|---:|---|---|---|---|---|
| 1 | Ingestion des sources | PDF scannés explicitement rejetés ; erreurs réparties dans le parcours | Pipeline OCR optionnel, diagnostic par page, retry et reprise sans réimport | Plus de documents exploitables et moins d'échecs incompris | Élevée |
| 2 | RAG / chat | Recherche hybride et citations présentes, mais qualité non mesurée par benchmark intégré | Évaluer retrieval, diversité, couverture, citations et abstention ; afficher preuves concurrentes | Réponses plus fiables et diagnostic des mauvaises réponses | Élevée |
| 3 | Studio (13 types API) | Beaucoup de formats, mais parcours de choix et provenance perfectibles | Regrouper par objectifs, afficher aperçu, sources exactes, prompt/modèle et versions | Moins d'hésitation et livrables plus vérifiables | Moyenne |
| 4 | Infographie | La route de génération construit du Markdown ; rendu graphique final non prouvé dans ce code | Définir contrat de rendu déterministe, validation du résultat et fallback Markdown explicite | Réduire les échecs opaques et améliorer le rendu visuel | Élevée |
| 5 | Audio Overview | Pipeline TTS/ffmpeg dépendant de variables et binaire externes | Préflight des voix, durée, ffmpeg, progression par segment, reprise et diagnostic | Générations audio plus robustes | Moyenne |
| 6 | Studio vocal Leanna + Roxane | Gemini Live et RAG présents ; composants concentrent audio, réseau, état et UI | Séparer transport/audio/orchestration/UI, ajouter reconnexion et diagnostic périphériques | Moins de pertes de session et maintenance plus simple | Élevée |
| 7 | Roxane | Toggle et règle de silence initial existent ; son apport peut être irrégulier | Rendre la politique d'intervention observable, réglable (fréquence, seuil, rôle) et testable | Duo vocal prévisible et moins intrusif | Moyenne |
| 8 | Modèles IA | Préférences par fonctionnalité existent, mais capacité réelle et fallback sont peu visibles | Matrice compatibilité feature × modèle, test de connexion, coût estimé et fallback | Moins de configurations invalides et coûts maîtrisés | Moyenne |
| 9 | Prompts système | Catalogue et overrides éditables existent ; pas de versioning ni de test de non-régression exposé | Diff défaut/personnalisé, aperçu simulé, versionnage, validation et bouton restaurer | Personnalisation sûre et débogable | Moyenne |
| 10 | Electron / mises à jour | electron-updater et menu de vérification présents ; packaging / publication non validés dans cette mission | Canal stable/bêta, checksum/signature, journal de version, reprise download et test release | Distribution plus fiable et transparente | Moyenne |

## Détail et critères d'acceptation

### 1. Ingestion
- Identifier les formats réellement acceptés par le schéma upload, pas uniquement par l'enum SQL.
- Conserver les pages, offsets et métadonnées d'extraction.
- Rendre les erreurs actionnables et permettre de relancer le job existant.
- Tests sur PDF natifs, scans, PDF protégés, DOCX malformés, archives hostiles et URL SSRF.

### 2. RAG et citations
- Créer un jeu de questions avec réponses attendues et passages pertinents annotés.
- Mesurer recall@5, precision@5, exactitude de citation et taux d'abstention correcte.
- Tester français/anglais et corpus multi-sources.
- Montrer quand aucune preuve suffisante n'a été trouvée.

### 3. Studio
- Préserver les 13 types acceptés par la route actuelle.
- Ajouter des objectifs guidés : apprendre, comprendre, comparer, produire.
- Attacher chaque artefact à un snapshot de sources et paramètres.
- Vérifier la cohérence route, enum SQL, handler worker et renderer.

### 4. Infographie
- Clarifier si le résultat contractuel est Markdown, SVG ou rendu HTML ; le code du worker consulté construit un prompt Markdown et interdit HTML/JS.
- Valider schéma et rendu avant de débiter définitivement le quota.
- Fournir un rendu de secours lisible, avec message d'erreur exploitable.
- Tests visuels automatisés sur contenus longs, chiffres, accents et petits écrans.

### 5. Audio Overview
- Préflight des variables ElevenLabs, deux identifiants de voix distincts et disponibilité ffmpeg.
- Progression réelle : script, TTS segment, mixage, stockage.
- Réessayer uniquement le segment défaillant et éviter les fichiers orphelins.
- Tester audio long, interruption worker et téléchargement.

### 6. Mode vocal
- Extraire une machine d'état indépendante du composant React.
- Gérer expiration du jeton, coupure WebSocket, permissions micro, device change et audioContext suspendu.
- Conserver les tours terminés et expliquer si le dernier tour est incomplet.
- Tests de course sur interruption, arrêt pendant recherche RAG et reconnexion.

### 7. Roxane
- Conserver désactivée par défaut et silence sur les deux premiers tours comme comportement de référence.
- Expliquer pourquoi Roxane intervient et sur quel point elle apporte un contre-argument.
- Ajouter un seuil et une limite de fréquence, réglables par notebook.
- Tests unitaires de décision d'intervention et tests de session double socket.

### 8. Modèles IA
- Décrire les modalités et fonctionnalités réellement supportées par chaque modèle.
- Vérifier chat, embeddings, JSON structuré, audio et contexte avant sélection.
- Afficher fournisseur, modèle effectif, coût/latence observés et fallback.
- Ne pas promettre une modalité simplement parce qu'un fournisseur la propose.

### 9. Prompts
- Diff clair entre prompt de référence et override ; distinguer ajout et remplacement selon le chemin d'exécution réel.
- Test sandbox sans accès à des données privées.
- Version précédente/restauration, validation de taille et détection d'instructions incompatibles.
- Enregistrer la version du prompt utilisée sur chaque génération.

### 10. Electron
- Valider signature, canal de publication, URL de mise à jour et permissions GitHub Releases.
- Afficher version actuelle, version disponible, notes, progression et état final.
- Tester téléchargement interrompu, absence de réseau, update déjà à jour et retour à la version précédente si supporté.
- Documenter que l'application desktop charge l'app web distante configurée.
