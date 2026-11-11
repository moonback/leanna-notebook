# Rapport d'audit documentaire

Dernière passe : 11 novembre 2026. Dépôt : `moonback/leanna-notebook`. Première refonte documentaire : PR #55, fusionnée dans `main`. Seconde passe source : PR #56, ouverte sur `docs/verified-source-audit`.

## Sources inspectées lors des passes

- Arborescence Git complète de `main` : 237 fichiers suivis, dont 38 handlers API `route.ts` et les fichiers SQL de migrations, seed et tests.
- Les 11 migrations de schéma ont été lues ou échantillonnées ; la migration initiale a été parcourue pour inventorier les tables et fonctions.
- Catalogue des prompts, prompts Leanna/Roxane, route de gestion des prompts et composant des réglages.
- Les 38 handlers API ont été parcourus pour inventorier les méthodes exportées. Les contrats et comportements ont été lus plus en détail pour le chat, les artefacts, les modèles IA, les prompts système, le jeton vocal, la recherche vocale et plusieurs routes de partage.
- Composants Studio et assistant vocal, logique de tour vocal et tests associés.
- Générateur Studio worker, pipeline Audio Overview et tests de génération.
- README racine et pages documentaires précédemment créées.

## Corrections factuelles importantes

- **Prompts système :** gestionnaire dans les réglages, avec recherche, affichage du prompt de référence, sauvegarde et réinitialisation. Les overrides sont stockés par utilisateur.
- **Studio :** l'API et l'interface acceptent 13 types, dont infographie et chronologie. Le prompt infographie demande une synthèse structurée en Markdown ; ne pas promettre un rendu SVG/HTML autonome sur cette seule base.
- **Mode vocal :** Leanna et Roxane sont présentes dans le code. Roxane est désactivée par défaut et la logique la garde silencieuse pendant les deux premiers échanges.
- **Audio Overview :** le worker contient la génération du script à deux voix, la synthèse segment par segment, le mixage ffmpeg et le stockage MP3 privé.
- **Base :** les migrations exposent les tables de préférences IA et d'overrides de prompts, ainsi que les types d'artefacts étendus.
- **API :** les 38 handlers ont été recensés et leurs méthodes exportées ajoutées à la référence API. Les contrats détaillés ne couvrent encore qu'un sous-ensemble des routes.

## Limites restantes

Cette passe repose sur l'API GitHub distante. Elle ne remplace pas une exécution locale : aucun `pnpm install`, typecheck, lint, test Vitest, test pgTAP, build Next.js ou build Electron n'a été lancé. Les 38 handlers ont été parcourus pour leurs méthodes, mais pas tous analysés ligne par ligne. Les contrats de toutes les routes, toutes les policies RLS, toutes les colonnes et index, l'ensemble des variables d'environnement et le comportement de bout en bout des fonctionnalités ne sont pas validés.

Le catalogue contient `summary.source` et `summary.notebook` ; leurs points de consommation complets restent à tracer. Les tests présents ont été inspectés mais non exécutés.

## Suite recommandée

1. Exécuter les scripts de validation dans un clone local propre.
2. Auditer toutes les policies RLS et les fonctions SECURITY DEFINER.
3. Tracer l'application effective des prompts de résumé.
4. Inventorier toutes les lectures de `process.env` et les comparer aux exemples de configuration.
5. Vérifier les parcours Studio et vocal en environnement configuré, notamment les erreurs fournisseur et les cas de quota.
6. Ajouter un contrat OpenAPI maintenu par code ou des tests de contrat pour les routes publiques.
7. Mettre à jour ce rapport après chaque validation exécutée.

**Conclusion :** la documentation a été confrontée à une part significative du code et les méthodes des 38 handlers sont recensées. L'audit de sécurité complet et les validations d'exécution restent ouverts.
