# Suggestions de fonctionnalités

Analyse basée sur le README, `voice-assistant.tsx`, la route `voice-token`, `voice-turn.ts` et le schéma SQL initial. Les routes `voice-search` et `voice-messages` ainsi que le code du worker n'ont pas été lus : les remarques les concernant viennent du README et des noms de fichiers.

## 20 nouvelles fonctionnalités

### Sources et ingestion
1. **OCR des PDF scannés et des images** (`kind = image` existe déjà). Limite connue du README.
2. **Import YouTube** avec transcription et horodatages (le type `youtube` est déjà dans l'enum).
3. **Connecteur Google Drive** (`gdrive` et `sync_source` existent déjà), avec resynchronisation automatique.
4. **Étiquettes automatiques de sources** : la table `source_labels` et le job `auto_label` sont prêts, il manque l'UI de filtrage.
5. **Détection de doublons et de contradictions** entre sources, via `content_sha256` et l'IA.

### Chat et recherche
6. **Recherche globale multi-notebooks** pour interroger toute sa bibliothèque.
7. **Mode comparaison** : une question posée à chaque source séparément, avec un tableau des divergences.
8. **Conversations multiples** par notebook, avec titres automatiques (le schéma le permet, l'UI semble limitée à une conversation).
9. **Citations exportables** en BibTeX, APA ou MLA.
10. **Annotations et surlignages** dans la visionneuse de source, avec commentaires pour les collaborateurs.

### Studio
11. **Tableaux de données** (`data_table`) extraits des sources, export CSV ou XLSX.
12. **Présentations** (`slide_deck`) exportées en PPTX, avec révision via `parent_id`.
13. **Infographies** (`infographic`).
14. **Répétition espacée** pour les fiches (SM-2) à partir de `study_progress`, avec rappels quotidiens.
15. **Quiz adaptatif** ciblant les questions ratées, plus un mode examen chronométré.
16. **Partage public d'un artefact** (`link_scope = artifact` existe, à faire selon le README).

### Collaboration, plateforme et desktop
17. **Emails applicatifs** : invitations, fin de génération, résumé hebdomadaire.
18. **Collections de notebooks** : tables existantes, UI manquante.
19. **Vrai paiement Stripe** (`stripe_events` prête, facturation simulée aujourd'hui).
20. **Desktop : raccourci global et capture rapide** (texte, URL, presse-papiers vers un notebook) avec notifications natives.

## 10 fonctionnalités pour le mode vocal

1. **Sélecteur de voix et de vitesse.** La route accepte 8 voix, mais le client force `Aoede`.
2. **Langue dynamique.** Le prompt force le français ; suivre `output_language` du profil ou du notebook, avec détection automatique.
3. **Reconnexion et reprise de session.** Activer `sessionResumption` et `contextWindowCompression` de Gemini Live pour survivre aux coupures et dépasser les 30 minutes.
4. **Outils vocaux supplémentaires** (function calling) :
   - « enregistre ça en note »
   - « génère un quiz » ou « lance un Audio Overview »
   - « coche ou décoche telle source »
   - « ouvre la citation 2 »
5. **Mode révision vocale.** Leanna interroge l'utilisateur avec ses fiches ou son quiz, évalue ses réponses orales et enregistre le résultat dans `study_progress`.
6. **Podcast interactif.** Interrompre l'Audio Overview à deux voix pour poser une question, puis reprendre.
7. **Contexte enrichi.** Injecter l'historique récent et la liste des sources sélectionnées dans le prompt.
8. **Push-to-talk, raccourci clavier et visualiseur de niveau micro.** Le raccourci global peut s'appuyer sur Electron.
9. **Personas et styles de réponse** : professeur, résumé en 30 secondes, avocat du diable (liés à `chat_style` et `chat_custom_prompt`).
10. **Quota et suivi de consommation vocale** dans `usage_ledger` (feature `voice`), affiché dans l'écran Consommation.

## Points à corriger dans le vocal

- **Modèle non vérifié.** `gemini-3.8-live` est codé en dur dans `voice-token/route.ts`. Je n'ai pas pu confirmer qu'il existe ; un identifiant faux fait échouer la session à l'initialisation.
- **Appel d'outil inconnu sans réponse.** Dans `handleToolCall`, un outil autre que `search_notebook_sources` est ignoré sans `toolResponse`, ce qui peut bloquer le modèle. Renvoyer une erreur explicite.
- **Tour perdu si l'enregistrement échoue.** Si `persistVoiceTurn` échoue, le tour n'est pas retenté et reste en mémoire sans être sauvegardé.

## Priorités suggérées (rapport effort/impact)

1. Sélecteur de voix
2. Langue dynamique
3. Reprise de session
4. Correctif de l'outil inconnu
5. Suivi de consommation vocale
