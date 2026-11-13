# Leanna Browser — limitations et fonctionnalités non prises en charge

## Ce qui n'a pas pu être vérifié dans l'environnement de développement

| Élément | Pourquoi | Ce qui a été vérifié à la place |
|---|---|---|
| Parcours authentifié dans l'application Next réelle (connexion → `/browser` → modèle réel → source visible dans le Notebook) | Pas de Supabase local (Docker absent) ; `.env.local` pointe vers un projet hébergé, aucun compte de test fourni | Vraie UI React + vrai moteur dans Electron (35 tests E2E), API serveur simulée ; modèle réel dans l'évaluation des prompts |
| Route `POST /api/v1/browser/agent` de bout en bout (quota, jeton, SSE réel) | Même raison | Typecheck, lint, tests de ses briques (`context`, `continuation`, `tools`), test de conformité des requêtes du client au schéma de la route |
| Écriture de `external_ref.browser` et `origin_url` en base | Même raison | Schéma et corps de requête testés ; code relu contre la définition SQL de `sources` et `add_source` |
| Indexation par le worker d'une source ajoutée depuis le navigateur | Même raison | Lecture de `apps/worker/src/ingest` : un `kind='text'` est ingéré depuis son fichier, `origin_url` est ignoré |
| Application empaquetée (`electron-builder`) | Non construite | `@mozilla/readability` est une dépendance de production ; repli heuristique si le fichier est introuvable |
| macOS et Linux | Développé et testé sous Windows 10 uniquement | — |
| Prompts vocaux v2 à l'oral (Gemini Live) | Pas d'évaluation audio | Tests de structure ; retour arrière `PROMPTS_VERSION=1` |

## Fonctionnalités non réalisées

| Fonctionnalité | Priorité | État |
|---|---|---|
| Reprise des téléchargements interrompus | P1 | Non réalisée (un téléchargement coupé est marqué « interrompu ») |
| Recherche approfondie multi-pages dédiée dans le panneau | P1 | Non réalisée ; l'agent peut enchaîner recherche, ouverture et comparaison, dans la limite de 12 étapes |
| Persistance de la conversation du panneau Leanna | — | Non réalisée : la conversation vit en mémoire et disparaît au rechargement |
| Recherche dans la page (Ctrl+F) pour l'utilisateur | P2 | Non réalisée (l'outil `find_text` existe pour l'agent) |
| Menu contextuel dans les pages (clic droit) | P2 | Non réalisé |
| Suggestions dans la barre d'adresse (historique, favoris) | P2 | Non réalisées |
| Analyse visuelle des captures par le modèle | P2 | Non réalisée : la capture est montrée à l'utilisateur seulement |
| Outils du navigateur dans l'assistant vocal | — | Non réalisés : Leanna et Roxane à la voix n'ont pas les outils `browser.*` |
| Blocage des cookies tiers | — | Non proposé : Electron n'en offre pas de réglage fiable. Disponible : effacement au démarrage et effacement manuel |

## Navigation privée

Session en mémoire, propre à chaque onglet privé, exclue de l'historique et de la restauration, sans mémorisation des
permissions. Elle **ne rend pas anonyme** : l'adresse IP, le fournisseur d'accès et les sites visités voient la navigation.
Les téléchargements faits en privé restent sur le disque et dans la liste.

## Limites liées à Chromium / Electron

- **Pas d'extensions** de navigateur, pas de synchronisation de profil, pas de gestionnaire de mots de passe, pas de
  remplissage automatique.
- **DRM (Widevine) absent** d'Electron standard : Netflix, Spotify Web et services similaires ne lisent pas leurs contenus.
- **Connexion à certains services** (Google notamment) : peut être refusée dans un navigateur embarqué. L'agent utilisateur
  est nettoyé de la mention « Electron », ce qui ne garantit rien.
- **PDF** : comportement non vérifié (affichage ou téléchargement selon la configuration d'Electron) ; pas d'extraction de
  texte par l'agent.
- **Authentification HTTP Basic**, certificats client, Bluetooth, USB, HID, série : non pris en charge (refus par défaut).
- **Erreurs de certificat** : aucune possibilité de « continuer quand même », par conception.
- **Plein écran HTML** : pas de bandeau « appuyez sur Échap » ; Échap et F11 fonctionnent.
- **Retour arrière** : Chromium saute les entrées d'historique créées sans interaction de l'utilisateur ; les actions de
  l'agent portent une activation utilisateur pour l'éviter.
- **Capture** : `capturePage()` ne capture que la zone visible d'un onglet affiché.
- **Vue native** : elle recouvre toujours l'interface HTML. Aucun menu ni dialogue de l'application ne peut s'afficher
  par-dessus une page ; les panneaux sont donc placés à côté.
- **Mises à jour de Chromium** : elles suivent les versions d'Electron. Un navigateur embarqué reçoit les correctifs de
  sécurité plus tard qu'un navigateur grand public ; mettre à jour Electron régulièrement.

## Dette technique

- `apps/desktop/dist/preload.js` et `dist/shared/desktop-api.js` sont suivis par git alors que `dist/` est ignoré (état
  antérieur) : le fichier apparaît modifié après chaque build. Non touché.
- Les définitions d'outils existent en deux copies (desktop et web), gardées identiques par un test.
- Les types du contrat IPC sont importés par l'application web depuis `apps/desktop/src/shared` (types uniquement).
- La classification des actions sensibles est une liste de libellés français/anglais.
- Le test E2E d'IPC lit `ipcMain._invokeHandlers`, une structure interne d'Electron.
