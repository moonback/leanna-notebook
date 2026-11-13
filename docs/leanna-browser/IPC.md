# Leanna Browser — schéma IPC

Contrat typé : `apps/desktop/src/shared/desktop-api.ts` (`DesktopBrowserApi`). Côté renderer :
`window.leannaDesktop.browser.<méthode>(…)`, qui appelle le canal `browser:<méthode>` (`ipcRenderer.invoke`).

## Règles communes

- **Émetteur** : chaque appel est rejeté (`forbidden`) si l'émetteur n'est pas le cadre principal de la fenêtre de
  l'application, sur l'origine `LEANNA_WEB_URL`. Les onglets n'ont pas de preload : ils n'ont aucun moyen d'émettre.
- **Arguments** : revalidés dans Main (`browser-ipc.ts`). Identifiant d'onglet = UUID, sinon `invalid_tab_id`.
- **Valeurs échangées** : objets sérialisables uniquement. Aucun `WebContents`, aucune poignée Electron.
- **Enregistrement** : une seule fois par processus (`registerBrowserIpc`), y compris si la fenêtre est recréée.
- La liste des méthodes du preload est vérifiée à la compilation contre le contrat (`satisfies` + type `Missing`).

## Canaux (renderer → Main)

| Canal `browser:` | Arguments | Retour |
|---|---|---|
| `init` | — | `{ state, settings }` ; restaure la session au premier appel |
| `getState` | — | `BrowserState` |
| `createTab` | `{ url?, isPrivate? }` | onglet ou `null` |
| `activateTab`, `closeTab`, `goBack`, `goForward`, `reload`, `stop` | `id` | booléen |
| `duplicateTab` | `id` | onglet ou `null` |
| `moveTab` | `id`, `index` | booléen |
| `navigate` | `id`, `adresse ou recherche` | booléen (`false` si l'adresse est refusée) |
| `setZoom` | `id`, `"in" \| "out" \| "reset"` | booléen |
| `runCommand` | commande (liste fermée) | booléen |
| `key` | `{ key, control, meta, shift, alt }` | booléen (raccourci reconnu) |
| `setBounds` | `{ x, y, width, height }` | booléen |
| `setVisible` | booléen | `true` |
| `getSettings` / `updateSettings` | — / correctif partiel | réglages (valeurs invalides ignorées) |
| `getHistory` | `recherche?` | visites |
| `removeVisit` | `id` | booléen |
| `clearHistory` | `depuisMs?` | nombre d'entrées supprimées |
| `getBookmarks` | `recherche?` | `{ bookmarks, folders }` |
| `addBookmark` | `{ url, title, folder? }` | favori ou `null` |
| `updateBookmark` | `id`, `{ title?, folder? }` | favori ou `null` |
| `removeBookmark`, `addFolder`, `renameFolder`, `removeFolder` | — | booléen / nom |
| `cancelDownload`, `showDownloadInFolder`, `removeDownload` | `id` | booléen |
| `getPermissions` | — | `{ origine: { permission: "allow" \| "deny" } }` |
| `setPermission` | `origine`, `permission`, `"allow" \| "deny" \| null` | booléen |
| `clearBrowsingData` | — | `true` (cookies, stockage, cache du profil normal) |
| `extractPage` | `id`, `{ full? }` | `PageContent` (jamais d'exception : `status: "unavailable"`) |
| `getSelection` | `id` | texte sélectionné |
| `agentStart` | `{ text, reset? }` | `{ mission, mode }` |
| `agentCall` | `{ name, args }` | `AgentOutcome` |
| `agentResolve` | `{ actionId, approve }` | `AgentOutcome` |
| `agentAbort` | — | `true` |

`AgentOutcome` :

```ts
| { status: "ok"; tool; summary; result; image?; save? }
| { status: "confirmation_required"; tool; summary; actionId; reason }
| { status: "refused" | "denied" | "error"; tool; summary; error; message }
```

## Événements (Main → renderer)

| Canal | Charge utile | Quand |
|---|---|---|
| `browser:state` | `BrowserState` (`activeTabId`, `tabs[]`, `fullscreen`, `downloads[]`) | À chaque changement, regroupé par tranches de 30 ms |
| `browser:command` | commande d'interface (`focus-address`, `toggle-ai-panel`, `bookmark`, `show-history`, `show-downloads`) | Raccourci clavier pressé dans un onglet ou dans l'interface |

## État d'un onglet (`DesktopBrowserTab`)

`id`, `url`, `title`, `favicon`, `loading`, `canGoBack`, `canGoForward`, `isPrivate`, `zoom` (%),
`security` (`secure` / `insecure` / `internal`), `error` (`{ code, message, url }` ou `null`), `crashed`, `blockedPopups`.

## Raccourcis clavier

Ctrl+T nouvel onglet · Ctrl+W fermer · Ctrl+Tab / Ctrl+Maj+Tab onglet suivant / précédent · Ctrl+Maj+K dupliquer ·
Ctrl+L, F6, Alt+D barre d'adresse · Ctrl+R, F5 recharger · Ctrl+Maj+R recharger sans cache · Alt+← / Alt+→ précédent / suivant ·
Ctrl+plus / Ctrl+moins / Ctrl+0 zoom · F11 plein écran · Ctrl+D favori · Ctrl+H historique · Ctrl+J téléchargements ·
Ctrl+Maj+L panneau Leanna. Sur macOS, Cmd remplace Ctrl.
