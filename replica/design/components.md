# Design system « Papier & encre »

Date : 2026-11-09. Ce document décrit le système visuel et les composants de l'application.

**Fichiers sources**
- `replica/design/tokens.json` : source unique des tokens. Le fichier `tokens.dark.json` en est généré.
- `apps/web/scripts/build-tokens.mjs` : génère `apps/web/app/tokens.css` (variables CSS + mapping Tailwind v4 dans `@theme inline`). La commande `pnpm tokens` relance cette génération.
- `apps/web/components/ui/*` : les primitives React.
- `apps/web/app/design` : page de contrôle visuel, accessible sur la route `/design`.
- `replica/design/contrast-report.txt` : résultat de la vérification des contrastes.

**Contrastes** : 30 paires de couleurs testées en mode clair et 30 en mode sombre, **aucun échec** au niveau AA des WCAG.

---

## 1. Direction et différenciation

L'original repose sur Material : fond blanc, accent bleu, pilules arrondies, sans-serif partout. Nous prenons une direction propre, **« papier & encre »**, pensée pour la lecture et la vérification.

- **Neutres chauds**, couleur papier (`#fbfaf8`), au lieu du blanc pur. Les longues sessions de lecture fatiguent moins.
- **Accent vert-encre** (`#0e6e62`). Ce n'est pas le bleu de Google, et il se distingue des outils IA habituels, souvent en violet. Il reste provisoire : `/replica-brand` ne change que les **valeurs**, jamais les rôles.
- **Couleur « surligneur »** (`highlight`, jaune) **réservée aux passages cités**. C'est la signature visuelle du produit : on lit, on vérifie.
- **Deux voix typographiques** :
  - **Geist** (sans-serif, licence OFL) pour l'interface ;
  - **Source Serif 4** (OFL) pour le texte lu : réponses, sources, rapports.

  Le sans-serif sert à agir, le serif à lire.
- **Iconographie Lucide** (licence ISC). Aucune ressource Google n'est utilisée : ni logo, ni Material Symbols, ni illustrations, ni textes.

## 2. Tokens

| catégorie | valeurs | règle d'usage |
| --- | --- | --- |
| **Couleurs (26 rôles × 2 thèmes)** | `bg` → `surface` → `surface-raised` / `surface-sunken` ; `border`, `border-strong`, `border-input` ; `text`, `text-muted`, `text-subtle` ; `accent` (+ `hover`, `soft`, `on-*`) ; `highlight` ; `danger`, `success`, `warning` (+ `soft`) ; `focus` ; `overlay` | Toujours via les classes (`bg-surface`, `text-muted`), jamais en hexadécimal. **Six niveaux de neutres**, comme dans l'original mesuré (5 à 7). |
| **Typographie** | `2xs` 11/16 · `xs` 12/16 · `sm` 14/20 · `base` **15**/24 · `reading` 17/28 serif · `lg` 18/26 · `xl` 22/30 · `2xl` 28/36 · `display` 40/48 serif | La taille 15 pour l'interface, plus dense que 16, convient à un outil de productivité. La taille 17 en serif sert à la lecture. Graisses : 400, 500, 600. |
| **Espacement (base 4)** | 0 · 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 | Gouttières des panneaux : 12. Rembourrage d'une carte : 16. Espace entre sections : 40. |
| **Rayons** | `xs` 4 · `sm` 6 · `md` 8 (contrôles) · `lg` 12 (cartes, menus) · `xl` 16 (panneaux, modales) · `pill` | Des rayons plus modérés que l'original (tout en pilules). Les pilules sont réservées aux onglets, badges et recherche. |
| **Ombres** | `xs` · `card` · `pop` (menus, infobulles) · `dialog` | La hiérarchie passe d'abord par les bordures, puis par les ombres. |
| **Mouvement** | 120 / 180 / 280 ms, courbe `cubic-bezier(.2,.8,.2,1)` | `prefers-reduced-motion` est respecté globalement. |
| **Z-index** | sticky 10 · panel 20 · dropdown 40 · overlay 50 · dialog 60 · toast 70 · tooltip 80 | Variables `--z-*`. |
| **Contrôles** | hauteurs 32 / 36 / 44 ; cible tactile minimale de 44 | 36 sur desktop, 44 sur mobile (`lg`). |

## 3. Grille, proportions, navigation

- **En-tête d'application** : 56 px, avec logo, onglets de section, recherche, réglages et avatar.
- **Tableau de bord (S03)** : largeur maximale de 1280 px. Grille de cartes en 1, 2, 3 ou 4 colonnes (`sm`, `lg`, `xl`) ou table. Le mode d'affichage est mémorisé dans `profiles.dashboard_view`. Onglets en pilules : Tous, Les miens, Partagés, Explorer, Collections.
- **Espace de travail (S08)** : `Sources 320 px | Chat (fluide, contenu ≤ 760 px) | Studio 360 px`, avec une gouttière de 12 px. Les panneaux latéraux se replient en rail de 56 px. Le texte de lecture est limité à 720 px.
- **Points de rupture** : `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536.

| largeur | espace de travail | tableau de bord |
| --- | --- | --- |
| ≥ 1280 | 3 panneaux | grille de 4 colonnes ou table |
| 1024–1279 | Studio replié en rail par défaut | 3 colonnes |
| 768–1023 | Chat seul ; Sources et Studio en panneaux coulissants (Dialog latéral) | 2 colonnes ; table réduite (colonne Rôle masquée) |
| < 768 | **barre d'onglets en bas : Sources / Chat / Studio**, une vue à la fois, champ de saisie collé en bas (`100dvh`, zone sûre) | 1 colonne ; liste au lieu de table ; FAB « Nouveau » |

## 4. Composants

Pour tous les composants, **le focus visible est assuré par un anneau de 2 px `focus`** (contraste ≥ 3:1, vérifié). Cela est garanti globalement dans `globals.css`.

### Button · `button.tsx`
- **Variantes** : `primary` (une seule par zone), `secondary`, `soft` (actions IA et Studio), `ghost` (barres d'outils), `danger`.
- **Tailles** : `sm` 32, `md` 36, `lg` 44, `icon` 36, `icon-sm` 32.
- **États** : défaut, survol, actif, focus visible, désactivé (opacité 50 %), `loading` (spinner + `aria-busy`, le libellé est conservé, le bouton est désactivé).
- **Accessibilité** :
  - c'est un vrai `<button>` ;
  - `size="icon"` **exige** un `aria-label` ;
  - `asChild` permet d'en faire un lien (`<a>`) quand il s'agit d'une navigation.
- **Écrans** : tous (S03, S05, S08, S13, S25…).

### Champs · `field.tsx`
- **Composants** : `Input` (36 px), `Textarea` (au moins 96 px, redimensionnable verticalement), `SearchInput` (forme pilule, loupe), `Field` (libellé + aide + erreur).
- **États** : défaut (bordure `border-input`, contraste ≥ 3:1), focus (bordure et anneau `focus`), désactivé (`surface-sunken`), erreur (bordure `danger`, `aria-invalid`, message `role="alert"` relié par `aria-describedby`), lecture seule.
- **Rédaction** : les erreurs disent quoi faire (« Cette page est réservée aux abonnés… »), jamais « Erreur 403 ».
- **Écrans** : S05 (URL, texte), S12, S14 (prompt), S25 (email), S28.

### Checkbox, Switch, Tabs · `controls.tsx`
- **Checkbox** (18 px) : coché, décoché, **partiel** (« Tout sélectionner »), désactivé. Dans une ligne, le libellé est fourni par `aria-label`. Écrans : S09, S06.
- **Switch** : réservé aux préférences prises en compte immédiatement (notifications, apps). Écrans : S12, S28, S30.
- **Tabs** en pilules : navigation par flèches, état actif `accent-soft`. Écrans : S03, S20/S21 (viewer), S25.

### Overlays · `overlay.tsx`
- **Dialog** (`sm` 384, `md` 512, `lg` 768 px ; marge de 16 px sur mobile, défilement interne) :
  - titre obligatoire, lu à l'ouverture ;
  - focus piégé, Échap et le bouton × ferment, le focus revient sur le déclencheur ;
  - une **confirmation destructive** décrit ce qui sera perdu, avec « Annuler » en secondaire et l'action en `danger` ;
  - écrans : S05 (ajout de sources), S14, S17, S25, S26, suppression d'un notebook.
- **DropdownMenu** (menu ⋮) :
  - éléments de 36 px avec icône, séparateur, élément `danger` en dernier ;
  - flèches, Entrée, Échap, saisie de la première lettre ;
  - écrans : S03, S09, S11, S13.
- **Tooltip** : délai de 300 ms. Il **complète** un libellé et ne le remplace jamais. Il ne contient jamais d'action.

### Citation · `citation.tsx` (signature)
- **Apparence** : pastille `[n]` en police mono, fond `accent-soft`.
- **Survol ou focus** : carte affichant la source et l'extrait **surligné** (`highlight`, en serif).
- **Clic ou Entrée** : ouvre la visionneuse S10, défile jusqu'au passage et le surligne.
- **Citation non vérifiée** (`verified=false`, voir architecture § 10) : bordure pointillée `warning` **et** texte explicite. L'information ne passe jamais par la couleur seule.
- **Accessibilité** : `aria-label="Citation 2, rapport.pdf, non vérifiée"`.
- **Écrans** : S11, S19, S24.

### Surfaces · `surfaces.tsx`
- **Card** : `surface-raised`, bordure, rayon `lg`, ombre `xs`. La variante `interactive` ajoute survol, ombre `card` et focus interne. **Toute la carte est cliquable via un vrai lien** (`after:inset-0`), pas avec un `div onClick`. Écrans : S03 (grille), S06, S04.
- **Panel** : `<section>` nommée par son titre (landmark). En-tête de 48 px avec titre, actions et bouton replier (`aria-expanded`, `aria-controls`). Corps défilant. Rail de 56 px quand il est replié. Écrans : S08 (Sources, Studio).
- **ListRow** : icône 28, titre + méta tronqués, élément de fin (case à cocher, badge, ⋮, point non lu). Hauteur ≥ 44 px. États : survol, sélectionné (`accent-soft`). Écrans : S09, S13, S06.
- **Table** : `<table>` sémantique, `caption` (en `sr-only`), en-têtes `scope="col"` avec `aria-sort` pour le tri, lignes de 48 px, défilement horizontal si nécessaire. La colonne d'actions a un libellé `sr-only`. Écrans : S03 (liste), S27.

### Feedback · `feedback.tsx`
- **Badge** (`neutral`, `accent`, `success`, `warning`, `danger`) : statuts d'import, rôle, « Nouveau ».
- **Skeleton** : reprend la forme du contenu ; le parent porte `aria-busy`. Utilisé pour les listes, la réponse en cours et le Studio. **Aucun spinner plein écran.**
- **Progress** : déterminée (jobs avec `progress` 0–100, `aria-valuenow`) ou indéterminée. Utilisée pour les imports, les générations et la transcription.
- **EmptyState** : icône Lucide dans une tuile `accent-soft`, titre, explication de ce qui va se passer, action principale. Un texte original pour chaque cas :
  - S03 sans notebook ;
  - S08 sans source ;
  - Studio vide ;
  - chat vide (questions suggérées) ;
  - recherche sans résultat.
- **Alert** : bandeau dans la page. `status` pour info, warning et succès ; `alert` pour danger. Cas : quota proche ou atteint (S11, S13), erreur d'import, limite de notebooks (observée sur S03).

### Notifications · `toast.tsx`
- **Placement** : en bas à droite ; en bas au centre sur mobile. Au maximum 3 visibles.
- **Durée** : 5 s, mise en pause au survol et au focus. Raccourci **F8** pour atteindre la zone. Glissement vers la droite pour fermer.
- **Tons** : `info`, `success`, `error`. Une erreur est annoncée de façon `assertive`, les autres de façon `polite`.
- **Action** : une seule action optionnelle (« Écouter », « Réessayer », « Annuler »).
- **Appel** : `toast({...})` depuis n'importe quel composant client.
- **Usages** :
  - fin d'une génération du Studio (accompagnée de la notification navigateur si elle est autorisée, et du point « non lu ») ;
  - échec avec crédit restitué ;
  - copie de lien.

## 5. Accessibilité (WCAG 2.2 AA) : règles du système

1. Contraste vérifié en CI : `python3 .claude/skills/replica-design/contrast.py replica/design/tokens.json` (et `tokens.dark.json`). Le script sort en code 1 en cas d'échec.
2. Focus toujours visible (anneau 2 px `focus`) ; ordre de tabulation = ordre visuel ; lien d'évitement vers le chat sur S08.
3. Repères (landmarks) : `header`, `nav`, `main`, une `section` nommée par panneau ; un seul `h1` par page.
4. Cibles ≥ 24 px (≥ 44 px sur mobile) ; aucun survol obligatoire (citations accessibles au focus, menus au clavier).
5. Statut jamais exprimé par la couleur seule : badge texte, icône + libellé, « non vérifiée ».
6. Progression annoncée (`role="progressbar"`, `aria-live` pour la fin d'un job) ; réponse en streaming dans une région `aria-live="polite"` annoncée **à la fin** (pas mot à mot).
7. `prefers-reduced-motion`, `prefers-color-scheme` (clair, sombre, système, choix enregistré dans `profiles.theme`), zoom à 200 % sans perte (`rem` partout).
8. Langue : `<html lang="fr">` ; les sources dans une autre langue sont rendues avec un attribut `lang`.

## 6. Ce que ce système ne reprend pas de l'original

- Pas de logo ni d'icônes Google (Material Symbols).
- Pas de police Google Sans : Geist et Source Serif 4, sous licence OFL.
- Pas de bleu de la marque Google.
- Pas de libellés repris : tous les textes sont réécrits. Exemples : « Fiches » et non « Fiches d'apprentissage » ; « Explorer » et non « Découvrir ».
- La disposition en 3 panneaux est un schéma fonctionnel courant (sources, conversation, outils), mais **ses proportions, rayons, couleurs et typographie sont les nôtres**. `/replica-brand` finalise le nom, le logo et la couleur avant le lancement.

## 7. Contrôle

- Page `/design` (lancer `pnpm --dir apps/web dev`, puis ouvrir `http://localhost:3000/design`) : tous les composants dans tous leurs états, avec bascule clair / sombre.
- Vérifiée le 2026-11-09 à 1440 px : rendu correct, console sans erreur, `tsc` et `eslint` propres, `next build` réussi.
- Vérifiée aussi à 375 px (mobile) en thème sombre : aucun débordement horizontal.
- Non vérifié : appareil mobile réel, audit au lecteur d'écran (NVDA ou VoiceOver), tests automatisés axe. À ajouter dans `/replica-test` (Playwright + `@axe-core/playwright`).
