# Rapport d'audit documentaire

Date : 11 novembre 2026. Dépôt : moonback/leanna-notebook. Branche : docs/full-documentation-audit.

## Fichiers inspectés
README.md, package.json racine, pnpm-workspace.yaml, supabase/config.toml, apps/web/package.json, apps/worker/package.json, apps/desktop/package.json et apps/worker/.env.example.

## Limites
La lecture de plusieurs chemins (apps/web/.env.example et replica/*) a retourné 404. L'arborescence complète, le contenu existant de docs/, les migrations SQL, les handlers API et les sources de prompts n'ont pas pu être récupérés. Cette livraison est un audit partiel, pas l'audit exhaustif demandé.

## Écarts identifiés dans le README existant
- Facturation simulée, pas de paiement réel.
- Email applicatif non branché.
- OCR PDF scanné non disponible.
- Google Drive, infographies et présentations classés à faire.
- Audio Overview sur branche dédiée, validation locale/benchmark à faire.
- Gestionnaire de prompts et overrides non confirmés.
- Duo vocal Leanna/Roxane non confirmé par les fichiers consultés.
- electron-updater présent, mais parcours de mise à jour non validé.

## Vérifications
Scripts des manifestes lus ; configuration Supabase locale lue ; exemple worker lu ; routes reprises du README sans vérification handler par handler. Aucun test, lint, typecheck, build, contrôle automatique des liens ou rendu Mermaid exécuté. Tables/colonnes/RLS et prompts non audités migration/fichier par fichier. Aucun secret réel ajouté, scan automatisé du diff non exécuté.

## Recommandations
1. Refaire une inspection avec clone local et arborescence complète.
2. Documenter migrations, tables, colonnes, index et politiques RLS.
3. Lire chaque handler API et publier les schémas réels.
4. Extraire toutes les variables d'environnement depuis les sources.
5. Inventorier prompts et points d'assemblage avec tests.
6. Vérifier l'état des fonctionnalités sur main.
7. Exécuter tests, builds, contrôle des liens et rendu Mermaid.
8. Réécrire le README racine à partir des résultats complets.

Conclusion : cette branche améliore la découvrabilité et rend visibles les inconnues, mais le critère d'audit exhaustif n'est pas atteint sans accès complet au code et validations locales.