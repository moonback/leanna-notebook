# Leanna Browser — Floating Launcher

**Branche :** `feat/browser-floating-leanna-launcher`  
**Base :** `feat/browser-voice-cinematic-compact`  
**Périmètre :** lanceur d'accès au Studio vocal dans Leanna Browser desktop uniquement.

## Problème confirmé

Les pages sont affichées par des `WebContentsView` natives Electron ajoutées au `contentView` de la fenêtre. Elles sont compositées au-dessus du DOM React. Un bouton React avec `position: fixed` et un grand `z-index` reste donc derrière la page distante et ne peut pas être utilisé comme lanceur flottant.

## Direction UX

- Un bouton flottant compact dans le coin inférieur droit de la zone web.
- Orbe Leanna violet, halo lumineux discret et finition glassmorphism sombre.
- Taille cible 56–64 px, marge 20–24 px du bord inférieur et droit.
- Tooltip accessible « Ouvrir Leanna » ; état visuel distinct si une session vocale est active.
- Le panneau vocal existant conserve son design Cinematic Compact et sa logique Leanna/Roxane.
- Le lanceur ne doit pas recouvrir la barre d'adresse, les onglets ni les commandes de navigation.
- Le lanceur est masqué lorsque Browser n'est pas la vue active, quand aucun onglet exploitable n'est affiché ou lorsque l'application quitte Browser.

## Architecture requise

### Couche native

Créer un petit overlay Electron appartenant à la fenêtre principale (fenêtre enfant sans cadre, fond transparent, sans entrée dans la barre des tâches). Il doit être placé au-dessus de la WebContentsView, mais rester attaché à la fenêtre Leanna Notebook : il ne doit pas devenir une fenêtre flottante au-dessus des autres applications.

Le BrowserManager est propriétaire de son cycle de vie :
- création lors de l'attachement à la fenêtre principale ;
- positionnement à partir des bounds Browser transmis par le renderer ;
- repositionnement sur déplacement, redimensionnement, zoom de l'application et changement d'écran ;
- affichage uniquement quand Browser et son onglet actif sont visibles ;
- masquage pendant les changements de route et le plein écran HTML si le placement n'est pas fiable ;
- destruction lors de la fermeture ou du dispose du BrowserManager.

### Activation du Studio vocal

Le clic du lanceur doit être relayé exclusivement vers le renderer principal de confiance via un canal dédié. Le renderer déclenche l'ouverture du composant VoiceAssistant déjà monté. Il ne faut créer ni seconde instance de VoiceAssistant, ni seconde connexion Gemini Live.

Le bouton « Mode vocal » intégré au VoiceAssistant est masqué dans le contexte Browser pour éviter les doublons. Le bouton et le panneau du Notebook classique restent inchangés.

### Sécurité

- Aucun preload ni API Node dans les WebContents des sites visités.
- Aucun code ou événement du site distant ne peut déclencher l'ouverture du panneau.
- Le canal de lancement est émis par l'overlay natif et validé côté Main.
- Aucun accès à l'agent Browser, au stockage ou aux permissions n'est ajouté à l'overlay.

## État d’implémentation

Le lanceur natif et son raccordement au Studio vocal sont implémentés dans cette branche : fenêtre enfant Electron transparente, événement de lancement relayé par le Main process vers le renderer de confiance, déclenchement de l’instance VoiceAssistant déjà montée, masquage du bouton React redondant et réservation d’un dock à droite pour que le WebContentsView ne recouvre pas le panneau vocal. Le lanceur est masqué lorsque le Browser ou le notebook associé n’est pas actif, ainsi que pendant le plein écran HTML.

La validation runtime Electron (Windows, DPI, multi-écran, plein écran et clic réel) reste à effectuer : le dépôt distant ne fournit pas ici de session Electron locale permettant de l’exécuter.

## Critères d'acceptation

- [ ] Le lanceur reste au-dessus de Google, YouTube et des pages longues avec scroll.
- [ ] Il reste visible pendant la navigation et les changements d'URL.
- [ ] Il suit correctement le viewport lors du déplacement/redimensionnement de la fenêtre.
- [ ] Il ne se positionne pas au-dessus des barres système ou hors écran en multi-écran / DPI différent.
- [ ] Un clic ouvre le VoiceAssistant Browser existant.
- [ ] Le cycle Gemini Live, le micro, l'interruption et Roxane restent inchangés.
- [ ] Le mode vocal du Notebook hors Browser n'est pas modifié.
- [ ] Le lanceur est masqué quand Browser n'est pas actif et détruit à la fermeture.
- [ ] Respect de `prefers-reduced-motion`, focus visible, libellé accessible et zone cliquable suffisante.

## Tests à ajouter

- Tests unitaires du calcul de position et des cas viewport trop petit.
- Tests BrowserManager : visibilité, déplacement, redimensionnement, fermeture et dispose.
- Test renderer : réception du signal et ouverture d'une seule instance VoiceAssistant.
- Validation manuelle Electron : Google, YouTube, page scrollable, plein écran, fenêtre maximisée/restaurée, déplacement entre écrans et mise à l'échelle Windows 100/125/150 %.

## Fichiers identifiés à inspecter / modifier

- `apps/desktop/src/browser/browser-manager.ts`
- `apps/desktop/src/main.ts` si un relais IPC Main est nécessaire
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/shared/desktop-api.ts`
- `apps/web/app/browser/browser-client.tsx`
- `apps/web/app/notebook/[id]/voice-assistant.tsx`
- `apps/web/app/browser/browser-voice-studio.module.css`

Ne pas modifier les routes API, les tokens Gemini, les prompts, Supabase, les migrations ou le moteur agent Browser pour cette évolution.
