# Prompts système

Leanna Notebook dispose d'un gestionnaire de prompts dans les réglages : `apps/web/app/settings/system-prompts.tsx`.

## Fonctionnalités de l'interface

- Parcourir les prompts par catégorie et rechercher par libellé, groupe ou description.
- Consulter le prompt de référence sans le modifier.
- Saisir une personnalisation et l'enregistrer.
- Réinitialiser un prompt personnalisé pour revenir au comportement de référence.
- Voir si le prompt est personnalisé ou utilise le défaut.

## API et stockage

Route : `/api/v1/settings/system-prompts`.

- `GET` retourne le catalogue, les personnalisations de l'utilisateur et leurs dates de mise à jour.
- `PUT` enregistre une personnalisation ; un contenu vide supprime l'override et restaure le défaut.
- `DELETE?key=<prompt_key>` supprime explicitement une personnalisation.

Les handlers appellent `requireUser()`, valident la clé contre `SYSTEM_PROMPT_CATALOG` et stockent les valeurs dans `public.ai_prompt_overrides`. La table est isolée par `user_id` et limite le contenu à 12 000 caractères.

## Portée

Le catalogue contient les prompts de conversation, Studio, résumés et voix Leanna/Roxane. Les points de consommation confirmés sont le chat, les deux personas Live et le worker Studio. Le raccordement de chaque prompt de résumé automatique doit encore être vérifié séparément.

Le texte de référence est conservé dans le code. L'interface indique que les personnalisations sont combinées aux instructions de référence ; elles ne doivent pas remplacer les contrôles applicatifs de permissions, RAG, validation et citations.

Voir le [catalogue détaillé](../AI_PROMPTS_CATALOG.md) et la [référence API](../API_REFERENCE.md).
