# Leanna Browser — Voice Studio Cinematic Compact

**Branche :** `feat/browser-voice-cinematic-compact`  
**Périmètre :** interface vocale lancée depuis `apps/web/app/browser/BrowserClient` uniquement.  
**Direction validée :** Cinematic AI · Compact.

## Objectif produit
Remplacer l'apparence du mode vocal dans Leanna Browser par une surface compacte, cinématique et holographique. L'interface doit évoquer une présence IA vivante sans transformer le navigateur en écran vocal plein écran. Le mode vocal Notebook conserve son apparence actuelle.

## Audit du code existant
- Navigateur : `apps/web/app/browser/browser-client.tsx`.
- Composant vocal partagé : `apps/web/app/notebook/[id]/voice-assistant.tsx`.
- `BrowserClient` transmet déjà `browserApi`, ce qui distingue le contexte Browser sans second moteur vocal.
- Le composant gère Gemini Live, PCM, transcription, interruption, historique de session et seconde connexion Roxane.
- Les pages Browser rendent les sites via une `WebContentsView` Electron native : superposition et z-order doivent être vérifiés dans Electron.

## UX cible
1. Bouton d'accès discret dans la barre du navigateur.
2. Panneau flottant compact, sombre et translucide, sans plein écran automatique.
3. Orbe central et anneaux holographiques animés.
4. États lisibles : prêt, connexion, écoute, réponse, erreur.
5. Commandes : démarrer, micro muet/actif, terminer, Roxane.
6. Le mode Duo reste disponible avec le comportement actuel de Roxane.
7. Réduire la densité visuelle ; les commandes principales restent accessibles sans défilement.

## Architecture et isolation
- Réutiliser `VoiceAssistant` et son cycle de vie ; ne pas créer de socket Gemini supplémentaire.
- Distinguer Browser par la prop existante `browserApi`.
- Charger les styles depuis `apps/web/app/browser/browser-voice-studio.module.css`, importés uniquement par `BrowserClient`.
- Scoper les sélecteurs au marqueur DOM Browser, car `DialogContent` est rendu dans un portail.
- Ne pas modifier `globals.css`, les routes API, prompts, tokens Gemini, Electron Main/preload/IPC, Supabase ou migrations.
- Le mode vocal hors Browser doit rester inchangé.

## Contrats à préserver
- Jeton Gemini Live et outils Browser uniquement pour les sessions Browser.
- Capture micro PCM 16 kHz et lecture des réponses PCM.
- Gestion des interruptions et arrêt des buffers.
- Micro coupé pendant l'intervention de Roxane.
- Roxane optionnelle, seconde personnalité Kore.
- Nettoyage WebSockets, MediaStream, AudioWorklet et AudioContext à la fermeture.
- Missions Browser limitées à la session vocale et confirmations de sécurité inchangées.

## Accessibilité et performance
- Conserver les libellés ARIA des commandes.
- Respecter `prefers-reduced-motion`.
- Pas de boucle JS d'animation ni de simulation trompeuse du niveau sonore.
- Animations CSS légères, sans nouvelle dépendance.
- Cibles tactiles d'au moins 40 px.

## Validation
- `pnpm --dir apps/web typecheck`
- `pnpm --dir apps/web lint`
- `pnpm --dir apps/web test`
- Tests desktop/Electron existants.
- Validation manuelle : Browser, permission micro, connexion, écoute, réponse, interruption, arrêt, Roxane, fermeture pendant lecture, et vérification que le vocal Notebook reste inchangé.
- Vérifier explicitement le rendu du panneau face à la `WebContentsView` native.

## Critères d'acceptation
- [ ] Le style s'applique uniquement dans Browser.
- [ ] Le panneau reste compact et ne force pas le plein écran.
- [ ] Orbe et anneaux animés avec réduction de mouvement respectée.
- [ ] Commandes accessibles et fonctionnelles.
- [ ] Leanna/Roxane fonctionnent sans changement du protocole Live.
- [ ] Les autres interfaces vocales restent inchangées.
- [ ] Typecheck, lint, tests et validation Electron réussis.

## Limite
La première livraison isole la direction visuelle et le panneau compact. Le rendu Electron, le z-order natif et les tests audio doivent être validés dans l'environnement local avant mise en production.
