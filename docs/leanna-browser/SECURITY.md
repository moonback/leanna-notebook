# Leanna Browser — modèle de sécurité

Le navigateur charge du contenu non fiable et un agent IA peut y agir. Chaque invariant ci-dessous est
appliqué **dans le code** et vérifié par un test nommé. Les prompts ne sont qu'une couche supplémentaire.

## 1. Frontières de confiance

| Zone | Confiance | Accès |
|---|---|---|
| Processus Main (`apps/desktop/src`) | Totale | Electron, disque, réglages, garde-fous de l'agent |
| Renderer de l'application (origine `LEANNA_WEB_URL`) | Application | `window.leannaDesktop` (IPC `browser:*`), session Supabase |
| Onglets du navigateur (`WebContentsView`) | **Aucune** | Rien : pas de preload, pas d'IPC, pas de Node |
| Modèle IA | **Aucune sur ses actions** | Propose des appels d'outils ; ne peut ni exécuter, ni approuver, ni changer de mode |
| Contenu des pages, résultats d'outils | **Donnée non fiable** | Jamais interprété comme une consigne |

## 2. Invariants et tests

| Invariant | Mise en œuvre | Test |
|---|---|---|
| Pages distantes isolées : `contextIsolation`, `sandbox`, pas de `nodeIntegration`, pas de preload | `browser-manager.ts` (`createTab`) | E2E « aucune API Node, Electron ou IPC n'est exposée aux sites » |
| Un site ne peut appeler aucun canal IPC | Pas de preload ; `isTrustedRenderer` exige le cadre principal de la fenêtre, sur l'origine de l'application | E2E « un IPC venant d'un autre émetteur… est rejeté » ; unitaire « émetteur non approuvé rejeté » |
| Tout IPC est revalidé (types, identifiants, bornes) | `browser-ipc.ts` | unitaire « les arguments sont revalidés côté Main » |
| Seuls `http(s)` sont navigables ; `file:`, `javascript:`, `data:`, `chrome:`… refusés | `browser-validation.ts`, `will-frame-navigate` | unitaires de validation ; E2E « schémas dangereux… bloqués » |
| Redirections contrôlées (vers `file:` ou `javascript:` bloquées) | `will-redirect` | E2E idem (`/vers-fichier`, `/vers-js`) |
| Aucune application externe lancée par une page (`mailto:`, protocoles personnalisés) | `will-frame-navigate` | E2E « une page ne peut pas lancer d'application externe » |
| Pas de fenêtre secondaire : pop-up → onglet ou blocage, débit limité | `setWindowOpenHandler` | E2E « pop-ups » |
| Aucun contournement des erreurs TLS | Aucun gestionnaire `certificate-error` ; page non affichée | E2E « certificat invalide bloqué » (self-signed.badssl.com) |
| Permissions par origine ; refus d'office hors liste ; rien de mémorisé en privé | `decidePermission`, dialogue natif | unitaire « permissions » ; E2E « permissions par origine » |
| Téléchargement : chemin choisi par l'utilisateur, avertissement pour les exécutables, jamais d'ouverture automatique | `will-download` (dialogues synchrones) | E2E « téléchargements » (moteur et UI) |
| Crash d'un onglet sans effet sur l'application ; WebContents fermés libérés | `render-process-gone`, `closeTab` | E2E « résilience », « onglets » |
| Navigation privée : session en mémoire, hors historique, non restaurée | partition sans `persist:` | E2E « navigation privée » |
| Journaux sans secret ni contenu | Main ne journalise rien du navigateur ; la route ne journalise que des identifiants et compteurs | relecture ; `lib/log.ts` masque `token|key|secret|password|…` |

## 3. Agent : ce que le code impose

Toutes ces règles vivent dans `apps/desktop/src/browser/browser-agent.ts` (processus Main).

1. **Schéma strict** (`agent-tools.ts`) : outil inconnu, argument en trop, type ou longueur invalide ⇒ refus. Rien n'est corrigé.
2. **Mode d'autonomie lu dans les réglages à chaque appel.** Il n'existe aucun outil pour le changer.
   - *Observation* : seuls les 8 outils de lecture s'exécutent.
   - *Assistance* : toute action attend l'accord de l'utilisateur.
   - *Autonome* : actions courantes directes ; le reste de cette liste s'applique toujours.
3. **Actions sensibles toujours confirmées**, quel que soit le mode : libellés d'achat, paiement, envoi, publication, compte,
   suppression, téléchargement ; envoi d'un formulaire `POST` ou contenant mot de passe / carte ; champ sensible.
4. **Provenance des adresses** (`UrlLedger`) : une adresse est « connue » si l'utilisateur l'a écrite (ou a cité son domaine)
   ou si elle a été vue telle quelle sur une page consultée. Toute autre adresse — donc toute adresse *fabriquée* par le
   modèle — exige une confirmation.
5. **Provenance du texte saisi** : une saisie dont le texte ne figure pas dans la demande de l'utilisateur exige une confirmation.
6. **`save_to_notebook` toujours confirmé.**
7. **Anti-substitution** : l'élément approuvé est revérifié (signature) dans le même appel que le clic.
8. **Interruption** : `agentAbort` annule les confirmations en attente et refuse tout appel jusqu'au tour suivant.

Tests : `test/browser-agent.test.cjs` (12 tests) et `e2e/ui.e2e.cjs` (« mode observation », « mode assistance »,
« page piégée + modèle manipulé », « saisie dans un formulaire », « interruption »).

### Exfiltration : le triptyque est coupé

Contenu non fiable + données privées + canal de sortie ne se combinent jamais sans humain :

- **Données privées du Notebook** : l'agent navigateur n'a *aucun* outil pour les lire, et la route ne les lui fournit pas.
- **Données privées d'autres onglets** : l'agent peut les lire (c'est sa fonction), mais chaque canal de sortie est gardé —
  navigation (règle 4), saisie (règle 5), envoi de formulaire et clics engageants (règle 3).
- Le test E2E « page piégée + modèle manipulé » simule le pire cas : un modèle qui *obéit* à la page. L'adresse
  d'exfiltration n'est jamais requêtée (`site.hits["/vol"] === undefined`), l'achat n'est jamais passé.

## 4. Injection de prompt

- Séparation stricte, assemblée **côté serveur** (`apps/web/lib/browser/context.ts`) : consignes dans `system` ; demande dans
  `<user_request>` ; page, sélection et résultats d'outils dans `<untrusted_web_content kind=… source=…>`.
- Une page ne peut ni fermer son bloc ni forger une demande : les balises de structure sont neutralisées dans tout contenu.
- Les prompts demandent d'ignorer ces ordres et de **signaler** la tentative (`lib/ai/prompts/browser.ts`).
- Tests : `lib/browser/context.test.ts`, `lib/ai/prompts/prompts.test.ts` ; évaluation réelle, cas 15 à 18 et 22 (`PROMPTS.md`).

## 5. Côté serveur

- Route `POST /api/v1/browser/agent` : authentification, schéma zod strict (rôles, tailles, champs inconnus refusés),
  contrôle d'origine (`parseBody`), quota `chat` réservé par tour utilisateur.
- **Jeton de continuation** HMAC (`lib/browser/continuation.ts`) : lié à l'utilisateur, expirant, porteur du numéro d'étape ;
  12 étapes au plus par demande. Empêche d'enchaîner des appels au modèle hors quota.
- Ajout au Notebook : routes existantes (`requireRole(editor)`, RPC `add_source`), schéma de provenance strict.

## 6. Risques résiduels connus

| Risque | État |
|---|---|
| `search_web` envoie la requête au moteur de recherche choisi : un modèle manipulé pourrait y glisser quelques mots lus ailleurs (300 caractères max) | Accepté en mode autonome ; confirmé en assistance. Destination = moteur choisi par l'utilisateur, pas l'attaquant |
| La classification « action sensible » repose sur des libellés (français/anglais) et la structure du formulaire : un bouton d'achat au libellé anodin, sans formulaire, ne serait pas reconnu en mode autonome | Le mode assistance (défaut) confirme tout ; documenté |
| Clic exécuté par script (`element.click()`), non par un événement matériel : fenêtre de course minime entre vérification de signature et clic | Vérification et clic dans le même appel synchrone |
| Plein écran HTML : une page peut occuper toute la fenêtre sans bandeau d'avertissement | Non traité (voir `LIMITATIONS.md`) |
| L'application web elle-même n'envoie pas d'en-tête CSP (état antérieur au navigateur) : une faille XSS dans l'application donnerait accès à l'IPC `browser:*` | Hors périmètre ; à traiter séparément |
| Les favicons sont chargées par le renderer de l'application (requête GET sans référent vers le site) | Accepté |
| La route serveur de l'agent n'a pas de test d'intégration (Supabase requis) ; ses briques pures sont testées | Voir `LIMITATIONS.md` |
| Lecture de `ipcMain._invokeHandlers` dans un test E2E (API interne d'Electron) | Test à adapter si Electron change cette structure |
