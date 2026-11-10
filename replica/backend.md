# Backend : état et checklist

Date : 2026-11-09. Environnement : Supabase **local** (`supabase start`, ports 583xx).

Les clés présentes dans `.env.local` et `apps/worker/.env` sont les **clés de démonstration publiques** de la CLI Supabase. Elles ne valent qu'en local.

## Ce qui fonctionne (vérifié par des tests)

| domaine | état | preuve |
| --- | --- | --- |
| Authentification | ✅ email + mot de passe, lien magique, callback, déconnexion (POST), middleware de session | parcours testé dans le navigateur, 6 tests Vitest (validation, open redirect) |
| Isolation entre clients | ✅ RLS sur 100 % des tables, clients en lecture seule, `my_notebook_role` comme contrôle unique | 24 tests pgTAP + test d'intégration « B ne voit rien de A » (base, Storage, écriture) |
| Rattachement propriétaire | ✅ chaque notebook appartient à un workspace ; chaque source, chunk, conversation, message, artefact et citation porte `workspace_id` et `notebook_id`, en cascade | schéma + tests |
| Stockage des fichiers | ✅ 3 buckets **privés**, aucune policy client ; upload par URL signée dont le chemin est imposé par le serveur ; préfixe `{workspace}/{notebook}/` vérifié à l'enregistrement | migration `20261109010000_storage.sql` ; test : téléchargement et URL signée refusés à B |
| Traitement asynchrone | ✅ `POST /sources` renvoie **202** immédiatement ; le worker extrait le texte (txt, md, csv, texte collé, pdf, docx, URL), le découpe, l'indexe ; statuts persistants `pending → processing → ready / failed` avec `error_code` | test d'intégration : pending → ready, PDF invalide → `failed / unreadable_file` |
| Tâches et progression | ✅ file `jobs` (claim `SKIP LOCKED`, bail + heartbeat, nouvelles tentatives, échec définitif, annulation, remboursement du quota) ; progression 0–100 et étape | 3 tests worker + pgTAP |
| Sécurité de l'import d'URL | ✅ protection SSRF : DNS résolu une fois, IP privées et métadonnées refusées, ports 80/443, redirections revérifiées, 10 Mo, 15 s | 21 tests |
| Journalisation | 🟡 JSON structuré sans données utilisateur (champs `token`, `key`, `email`… masqués) côté web | `lib/log.ts` ; pas encore Sentry |

## Ajouté le 2026-11-09 (décisions de l'utilisateur)

| domaine | état | preuve |
| --- | --- | --- |
| **IA via OpenRouter** (chat + embeddings) | ✅ connecteur unique, compatible OpenAI ; modèles et clé dans la configuration, sans nom de modèle codé en dur | parcours complet testé contre un **faux serveur OpenRouter local** ; sans clé, `503 ai_not_configured` (aucune réponse inventée) |
| **API de conversation** | ✅ `POST /api/v1/conversations/:id/messages` en SSE (`meta`, `delta`, `done`, `error`) ; recherche hybride (vecteur + plein texte) ; historique privé ; arrêt client = statut `stopped` | test de bout en bout : réponse en flux, message et citation enregistrés |
| **Citations vérifiables** | ✅ le modèle cite les passages fournis par `[n]` ; le serveur **supprime les numéros inventés**, renumérote, choisit la phrase citée et stocke les offsets absolus (`verified`) | 5 tests unitaires + parcours réel (`[9]` inventé retiré) |
| **Quotas** | ✅ crédit `chat` réservé avant l'appel IA, confirmé à la fin, **rendu** en cas de panne du fournisseur | ledger vérifié en base |
| **Facturation** | ✅ **SIMULÉE** (`BILLING_MODE=simulated`) : même contrat que Stripe (checkout → abonnement → `plan_id`, annulation en un clic), lignes marquées `sim_…`, journal d'audit. **Aucun paiement réel.** `BILLING_MODE=stripe` renvoie `501 billing_not_configured` | test : passage en Pro, plan invalide 422, annulation, workspace d'autrui 404 |

## Ce qui reste à faire

| domaine | ce qu'il faut |
| --- | --- |
| Clés OpenRouter | `OPENROUTER_API_KEY` et `OPENROUTER_CHAT_MODEL` dans `apps/web/.env.local` ; `EMBEDDINGS_MODEL` et `EMBEDDINGS_API_KEY` dans `apps/worker/.env`, plus `OPENROUTER_EMBEDDINGS_MODEL` côté web (**même modèle**, 1024 dimensions) |
| Stripe réel | Clés de test, puis Checkout, Customer Portal et webhook signé et idempotent (table `stripe_events` prête) |
| Email (Resend), Sentry, OCR, audio | Comptes ou fournisseurs à choisir |
| Limitation de débit `/api/*`, `pnpm audit` | Avant le déploiement |
| Interface | Les écrans (S03, S08, chat) consomment ces API à partir du prochain lot de `/replica-build` |

## Checklist de sécurité

- [x] Secrets uniquement dans des variables d'environnement ; `.env*` ignorés par git ; `.env.example` sans valeurs (web et worker)
- [x] Entrées validées côté serveur avec Zod sur chaque route (liste blanche de colonnes)
- [x] Autorisation contrôlée à chaque lecture (RLS) et à chaque écriture (`requireRole`), testée avec un second utilisateur
- [ ] Limitation de débit sur l'auth : celle de Supabase par défaut ; rien côté `/api/*` pour l'instant
- [ ] Webhooks signés (pas encore de Stripe)
- [x] Uploads : taille (200 Mo) et types limités (bucket + route), bucket privé
- [x] Aucune donnée utilisateur dans les URL ni dans les journaux
- [ ] `pnpm audit` à lancer avant le déploiement
- [ ] Politique de confidentialité listant les sous-traitants (avant le lancement)

## Commandes

```
pnpm db:start          # Supabase local
pnpm db:test           # pgTAP (24)
pnpm -r test           # Vitest web (11) + worker (33, dont intégration)
pnpm -r typecheck
pnpm --dir apps/worker start   # worker (handler ingest_source)
```
