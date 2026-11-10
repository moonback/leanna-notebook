# Modèle de données déduit — Gemini Notebook

Date : 2026-11-09. Méthode : déduction à partir de l'aide officielle et des écrans documentés.
**Aucune API privée n'a été examinée, aucun appel réseau n'a été journalisé, aucun bundle JS n'a été lu.**
Confiance : `haute` = plusieurs articles concordent ; `moyenne` = un seul article ; `supposition` = notre déduction.

Ce document décrit ce que l'original *semble* stocker. Ce n'est pas un schéma : `/replica-architect` le transformera en SQL.

---

```
User
  id, email, display_name, avatar, locale, age_verified (bool), country
  plan (free | plus | pro | ultra | workspace_* | enterprise), plan_badge
  output_language (par défaut = langue du compte), theme (light | dark | device)
  web_notifications_enabled, visible_watermark (bool, Pro/Ultra seulement)
  evidence: 16261963, 16225229, 16206563 (notifications), 16213268 (badge, watermark), 16269187 (âge)
  confidence: haute (préférences) ; supposition (noms de champs)

Notebook
  id, owner_id, title, emoji (auto, modifiable), created_at, updated_at
  access (restricted | anyone_with_link), allow_copies (bool)
  custom_instructions (texte, synchronisé avec Gemini Apps et AI Mode)
  chat_style (default | learning_guide | custom), chat_custom_prompt, response_length
  is_featured (bool), source_summary (résumé généré affiché dans le chat), suggested_prompts[]
  evidence: 16206563, 16322204, 16179559, 17003757
  confidence: haute ; title auto = supposition

NotebookMember            (partage privé)
  notebook_id, user_id | email | group_id, role (viewer | editor), invited_at
  limites : 50 destinataires pour un compte perso, pas de groupe Google pour un compte perso
  evidence: 16206563
  confidence: haute

Collection                (onglet « Collections » observé sur S03, fonctionnement inconnu)
  id, owner_id, name ; CollectionNotebook (collection_id, notebook_id)
  evidence: capture/liste-notebook.PNG
  confidence: supposition (seul l'onglet est observé)

NotebookVisit             (notebook public ou featured ajouté à l'accueil d'un visiteur)
  notebook_id, user_id, first_opened_at, removed (bool)
  evidence: 16322204 (« Remove notebook », disparition quand le notebook redevient privé)
  confidence: moyenne

Source
  id, notebook_id, type (pdf | docx | txt | md | csv | pptx | epub | image | audio | web_url | youtube
                         | pasted_text | gdoc | gslides | gsheet | playbook | note | gemini_chat)
  title (modifiable pour un texte collé), origin_url | drive_file_id | file_blob_ref
  status (importing | ready | failed | inactive), failure_reason
  extracted_text (≤ 500 000 mots), word_count, size_bytes (≤ 200 Mo pour un upload)
  source_guide_summary (résumé automatique), language
  synced_at, auto_sync (bool, Drive), deleted_upstream_at (YouTube supprimé → purge sous 30 j)
  selected (bool, peut-être par utilisateur et non par notebook → voir Q07)
  label_id
  evidence: 16215270, 16269187, 16262519, 17003757
  confidence: haute (types, limites) ; selected par utilisateur = supposition

SourceLabel               (catégorisation automatique à partir de 5 sources)
  id, notebook_id, name, origin (auto | manual), position
  evidence: 16215270, 16206563
  confidence: moyenne

Chunk / Passage           (unité citée)
  id, source_id, text, position (page | offset | timestamp), embedding?
  evidence: indirecte. Une citation pointe vers « la citation en contexte » (16179559) ; une source
            courte reçoit une citation globale (16215270). Un découpage en passages est donc probable.
  confidence: supposition

Note
  (dans la version actuelle, une note EST une Source de type note)
  id, notebook_id, author_id, title, body (texte riche ? tableaux conservés), origin (manual | chat_response | pasted)
  has_citations (bool, édition verrouillée tant qu'elles restent), legacy_studio_note (bool, « Convert »)
  evidence: 16262519
  confidence: haute (comportement) ; format du body = supposition

ChatMessage
  id, notebook_id, user_id, role (user | assistant), content, created_at
  selected_source_ids[] (contexte au moment de la question)
  citations[] → Citation, thinking_steps[], attachments[] (fichiers générés : png, svg, pdf, docx, md, csv, json, xlsx, pptx)
  status (streaming | done | stopped | refused), feedback (up | down + motif)
  evidence: 16179559, 16269187
  confidence: moyenne. L'historique est « privé à l'utilisateur » (16179559), donc probablement par
              (notebook, user) et non partagé entre collaborateurs. Fil unique = supposition.

Citation
  id, message_id | note_id | artifact_id, index (n° affiché), chunk_id | source_id, quote_text
  evidence: 16179559, 16262519, 16206563 (citations dans le 2e onglet Sheets d'une Data Table)
  confidence: haute

Artifact                  (sortie du Studio)
  id, notebook_id, creator_id, type (audio | video | mind_map | report | data_table | flashcards
                                      | quiz | slide_deck | infographic)
  title (modifiable), status (scheduled | outline_ready | generating | ready | failed)
  custom_prompt (« View custom prompt »), options (json : format, langue, longueur, difficulté,
                 nombre, orientation, style, niveau de détail…)
  source_ids_snapshot[] (modifier ou supprimer une source ne change pas l'artefact)
  generate_later (bool), auto_generated (bool, gratuit, une seule fois), unread_by[] (point bleu)
  public_link_enabled (bool), file_ref (mp3/mp4/pdf/pptx/png/csv), cost_estimate
  parent_artifact_id (révision de deck = nouveau deck)
  evidence: 16206563, 16212820, 16454555, 16757456, 16758265, 16958963, 18323649, 17670842
  confidence: haute (champs fonctionnels) ; noms = supposition

ArtifactOutline           (plan d'un deck / « producer notes » d'une vidéo)
  artifact_id, content, user_feedback, proceeded_at
  evidence: 16454555, 16757456
  confidence: moyenne

StudyProgress             (flashcards / quiz)
  artifact_id, user_id, card_id, state (got_it | missed | unseen), quiz_answer, score, last_position
  evidence: 16958963 (« se souvient de la progression »)
  confidence: moyenne

FlashcardItem / QuizItem
  id, artifact_id, front | question, back | choices[], answer, hint, explanation, deleted (bool)
  evidence: 16958963
  confidence: moyenne

SlideRevision
  artifact_id, slide_index, instruction, action (edit | delete | restore | move)
  evidence: 16757456 (« Pending Changes »)
  confidence: moyenne

MindMapNode
  artifact_id, node_id, parent_id, label
  evidence: 16212283 (branches, nœud cliquable)
  confidence: moyenne

ResearchJob               (Fast / Deep Research)
  id, notebook_id, query, scope (web | drive), mode (fast | deep), status, report_text,
  results[] (title, url, relevance_blurb, cited bool, selected bool)
  evidence: 16215270
  confidence: moyenne

UsageLedger
  user_id, feature, units_consumed, window (5 h glissantes | jour | semaine | mois), resets_at
  evidence: 17670842 (quotas « compute-based » rafraîchis toutes les 5 h, plafond hebdo),
            16337734 (quotas fixes par jour et par fonctionnalité)
  confidence: moyenne. Les deux modèles coexistent (voir Q05).

NotebookAnalyticsDaily
  notebook_id, date, active_users, queries
  évaluation : seulement si le notebook est partagé avec au moins 4 utilisateurs, mise à jour toutes les 24 h, fenêtre de 7 jours
  evidence: 16206563
  confidence: haute

ConnectedApp / NotebookAppToggle
  app_id, user_id, connected (bool) ; notebook_id, app_id, enabled (bool)
  evidence: 18784282
  confidence: haute

AbuseReport / Feedback
  id, reporter_id, notebook_id | artifact_id | message_id, kind, text, screenshot_ref
  evidence: 16179536, 17004255 (conservation jusqu'à 3 ans)
  confidence: haute
```

## Relations

- User 1–n Notebook (propriétaire) ; User n–n Notebook via NotebookMember (viewer | editor).
- Notebook 1–n Source ; Source n–1 SourceLabel ; Source 1–n Chunk.
- Note ⊂ Source (type = note) ; ancienne Note du Studio → convertible.
- Notebook 1–n ChatMessage (par utilisateur) ; ChatMessage 1–n Citation → Chunk / Source.
- Notebook 1–n Artifact ; Artifact n–n Source (instantané) ; Artifact 1–n Item (cartes, nœuds, slides).
- User 1–n UsageLedger ; Notebook 1–n NotebookAnalyticsDaily.

## Règles métier relevées (DOC)

1. Un notebook est isolé : aucune question ne porte sur plusieurs notebooks à la fois (16206563).
2. Modifier ou supprimer une source **ne régénère pas** les artefacts déjà produits (16215270).
3. Une source Drive se resynchronise toutes les quelques minutes. Si l'accès est perdu, elle passe « inactive » mais compte toujours dans la limite (16215270).
4. Une vidéo YouTube supprimée ou rendue privée entraîne la suppression de la source sous 30 jours (16215270).
5. Copier un notebook copie les sources et les artefacts, mais **pas** le chat ni les notes (16206563).
6. Seuls les éditeurs génèrent ou suppriment des artefacts ; un lecteur voit les sources et les notes (16206563, 16212820).
7. Supprimer un artefact invalide son lien public (16212820).
8. Repasser un notebook en privé coupe l'accès et le retire de l'accueil des anciens visiteurs (16322204).
9. Contexte du prompt : sources sélectionnées, notes seulement si cochées, historique de conversation (16269187).
10. Une note supprimée est irrécupérable (16269187).
11. Les artefacts générés automatiquement à la création ne comptent pas dans le quota (16213268).
12. Une révision de slide deck crée un nouveau deck et consomme du quota (16757456).
