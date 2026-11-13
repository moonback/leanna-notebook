# Leanna Browser — outils de l'agent

Source : `apps/desktop/src/browser/agent-tools.ts` (définitions et validation qui font autorité) ;
copie déclarée au modèle : `apps/web/lib/browser/tools.ts` (un test échoue si elles divergent).

- **Nom canonique** : `browser.<outil>`. **Nom transmis au modèle** : `browser_<outil>` — les API de *function calling*
  n'acceptent pas le point dans un nom de fonction. La validation accepte les deux formes.
- **Schéma fermé** : `additionalProperties: false`, longueurs bornées, énumérations. Un appel non conforme est refusé tel quel.
- `tab_id` est facultatif partout où il figure ; par défaut, l'onglet actif.
- **L** = lecture (seuls outils permis en mode observation). **A** = action.

| Outil | Type | Arguments | Résultat (résumé) |
|---|---|---|---|
| `browser.open_url` | A | `url` (http/https complet), `tab_id?` | onglet, URL, titre, `loaded` ou `failed` |
| `browser.new_tab` | A | `url?` | idem |
| `browser.close_tab` | A | `tab_id?` | `closed` |
| `browser.go_back` / `go_forward` / `reload` | A | `tab_id?` | état de l'onglet |
| `browser.get_page_content` | L | `tab_id?` | statut, titre, description, date, plan, texte borné (24 000 car.), éléments interactifs avec repères `e1…` |
| `browser.get_page_metadata` | L | `tab_id?` | titre, URL, description, site, auteur, langue, date, URL canonique, nombre de mots |
| `browser.extract_links` | L | `tab_id?`, `filter?` | jusqu'à 150 liens (texte, URL) |
| `browser.extract_tables` | L | `tab_id?` | jusqu'à 10 tableaux (légende, lignes) |
| `browser.find_text` | L | `query`, `tab_id?` | nombre d'occurrences, 10 extraits |
| `browser.click_element` | A | `element` (repère ou texte visible), `tab_id?` | élément cliqué, état de l'onglet |
| `browser.type_text` | A | `element`, `text`, `submit?`, `tab_id?` | idem |
| `browser.scroll_page` | A | `direction` (`up`/`down`/`top`/`bottom`), `tab_id?` | position de défilement |
| `browser.take_screenshot` | L | `tab_id?` | dimensions ; l'image est montrée à l'utilisateur, **pas** envoyée au modèle |
| `browser.get_active_tab` | L | — | onglet actif et liste des onglets |
| `browser.search_web` | A | `query` | page de résultats du moteur choisi, jusqu'à 40 liens |
| `browser.compare_pages` | L | `tab_ids` (2 à 4) | contenu borné (6 000 car.) et tableaux de chaque onglet |
| `browser.save_to_notebook` | A | `mode` (`link`/`text`/`summary`/`selection`), `summary?`, `tab_id?` | résultat réel de l'enregistrement |

## Ce que décide l'application pour chaque appel

```
appel ─► schéma valide ? ── non ──► refused (invalid…)
            │ oui
        outil de lecture ? ── oui ──► exécution
            │ non
        mode observation ? ── oui ──► refused (observation_mode)
            │ non
        save_to_notebook, action sensible, adresse inconnue, texte non fourni par l'utilisateur ?
            │ oui ──► confirmation_required ──► Autoriser ──► exécution   /   Refuser ──► denied
            │ non
        mode assistance (ou « confirmer chaque action ») ? ── oui ──► confirmation_required
            │ non
        exécution
```

Les définitions exactes des « actions sensibles », des « adresses connues » et du « texte fourni par l'utilisateur » sont dans
`SECURITY.md` §3.

## Erreurs renvoyées au modèle

`observation_mode`, `mission_aborted`, `user_denied`, `no_active_tab`, `tab_not_found`, `invalid_url`, `element_not_found`,
`element_changed`, `not_editable`, `nothing_to_do`, `page_unavailable`, `empty_selection`, `capture_failed`, `expired`,
ainsi que les erreurs de schéma (`unknown_tool`, `missing_argument:…`, `invalid_argument:…`, `unexpected_argument:…`).
Une page inaccessible renvoie `status: "unavailable"` avec la note « Contenu indisponible : ne pas l'inventer. »

## Limites des outils

- Les clics et saisies passent par le DOM (`element.click()`, setter natif + événements `input`/`change`). Les sites qui
  exigent des événements matériels (certains éditeurs riches, glisser-déposer, canvas) ne sont pas pilotables.
- Pas d'outil pour les cadres (`iframe`) d'une autre origine, les menus natifs, l'envoi de fichiers, ni les boîtes
  `alert/confirm/prompt`.
- `search_web` lit les liens de la page de résultats ; il dépend de la mise en page du moteur.
- Les captures ne sont pas transmises au modèle (pas d'analyse visuelle).
