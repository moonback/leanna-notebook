# Rapport d'audit documentaire

Dernière passe : 11 novembre 2026. Dépôt : `moonback/leanna-notebook`. Première refonte documentaire : PR #55, fusionnée dans `main`. Cette passe de vérification est proposée sur la branche `docs/verified-source-audit`.

## Sources inspectées lors de cette passe

- Arborescence Git complète de `main` : 237 fichiers suivis, dont 38 handlers API `route.ts), 18 fichiers SQL (migrations, seed et tests).
- Les 11 migrations de schéma ont été lues ou échantillonnées ; la migration initiale a été parcourue pour inventorier les tables et fonctions.
- Catalogue des prompts, prompts Leanna/Roxane, route de gestion des prompts et composant des réglages.
- Handlers de chat, création Studio, jeton vocal, recherche vocale et préférences de modèles IA.
- Composants Studio et assistant vocal, logique de tour vocal et tests associés.
- Générateur Studio worker, pipeline Audio Overview et tests de génération.
- README racine et pages documentaires précédemment créées.

## Corrections factuelles importantes

- **Prompts système :** un gestionnaire existe dans les réglages, avec recherche, affichage du prompt de référence, sauvegarde et réinitialisation. Les overrides sont stockés par utilisateur.
- **Studio :** l'API et l'interface acceptent 13 types, dont infographie et chronologie. Le prompt infographie demande un rendu de contenu Markdown ; cela ne prouve pas un rendu SVG/HTML autonome.
- **Mode vocal :** Leanna et Roxane sont présentes dans le code. Roxane est désactivée par défaut et la logique testée la garde silencieuse pendant les deux premiers échanges.
- **Audio Overview :** le worker contient la génération du script à deux voix, la synthèse segment par segment, le mixage ffmpeg et le stockage MP3 privé.
- **Base :** les migrations exposent les tables de préférences IA et d'overrides de prompts, ainsi que les types d'artefacts étendus.
- **API :** 38 fichiers de route sont présents ; seuls certains contrats ont été lus en détail et documentés dans cette passe.

## Limites restantes

Cette passe repose sur l'API GitHub distante. Elle ne remplace pas une exécution locale : aucun `pnpm install`, typecheck, lint, test Vitest, test pgTAP, build Next.js ou build Electron n'a été lancé. Les 38 handlers n'ont pas tous été lus individuellement. Les contrats de toutes les routes, toutes les policies RLS, toutes les colonnes et index, l'ensemble des variables `process.env` et le comportement de bout en bout des fonctionnalités n'ont pas été validés.

Le catalogue contient aussi `summary.source` et `summary.notebook` ; leurs points de consommation complets restent à tracer. Les tests présents ont été inspectés mais non exécutés.

## Suite recommandée

1. Exécuter les scripts de validation dans un clone local propre.
2. Lire les handlers API restants et produire un contrat OpenAPI généré ou maintenu par code.
3. Auditer toutes les policies RLS et les fonctions SECURITY DEFINER.
4. Tracer l'application effective des prompts de résumé.
5. Vérifier les parcours Studio et vocal en environnement configuré, notamment les erreurs fournisseur et les cas de quota.
6. Mettre à jour ce rapport après chaque validation exécutée.

**Conclusion :** la première documentation comportait plusieurs statuts obsolètes. Cette passe les corrige à partir des fichiers source inspectés, mais l'audit complet et les validations d'exécution restent ouverts.
