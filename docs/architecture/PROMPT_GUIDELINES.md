# Conventions de conception des prompts

## Principes

- Un prompt = une responsabilité clairement délimitée.
- Garder les autorisations, quotas, validation et résolution des citations dans le code.
- Séparer les invariants système des préférences utilisateur.
- Délimiter les documents comme données non fiables ; ne jamais suivre les instructions trouvées dans les sources.
- Définir explicitement la source de vérité, le périmètre, les inconnues et les critères de réussite.
- Décrire précisément le schéma de sortie et le valider côté code.
- Ne pas demander au modèle de produire des identifiants de citations inventés : les références doivent être vérifiées contre les passages fournis.
- Injecter uniquement le contexte utile à la tâche.
- Éviter les consignes dupliquées dans le catalogue, le template et les routes ; documenter les couches lorsqu'une duplication est nécessaire.

## Patron recommandé

1. Rôle et résultat attendu.
2. Contexte utile et source de vérité.
3. Périmètre et limites.
4. Procédure ou critères de qualité.
5. Gestion des informations manquantes et contradictions.
6. Format de sortie explicite.
7. Règles de citation et de provenance.
8. Préférences personnalisées, dans un bloc séparé et non prioritaire.

## Préférences utilisateur

Les personnalisations ne doivent pas pouvoir remplacer les règles de fidélité aux sources, les contraintes de format, les protections contre les instructions contenues dans les documents ou les contrôles applicatifs. Les encadrer par des balises explicites et les présenter comme préférences de style/priorité.

## Sorties structurées

- Utiliser JSON mode lorsque le fournisseur le prend en charge.
- Valider chaque sortie avec Zod ou un validateur équivalent.
- Rejeter les champs hors limites, tableaux vides interdits, indices invalides et valeurs incohérentes.
- Les retries doivent être bornés et observables.
- Ne pas convertir silencieusement une sortie invalide en contenu partiel sans le signaler.

## Mesure

Pour chaque modification, conserver un jeu de cas de référence et comparer :
- réussite de la tâche ;
- exactitude des citations ;
- taux d'informations non supportées ;
- validité du schéma ;
- tokens d'entrée/sortie ;
- latence et nombre d'appels ;
- comportement sur demandes ambiguës et corpus contradictoires.

Ne pas publier un score qualitatif non reproductible.

## Implémentation recommandée pour les overrides

- Ne jamais concaténer une personnalisation libre dans le message système principal.
- Conserver le rôle système pour les invariants, la tâche, les règles de citation et le schéma de sortie.
- Envoyer les préférences personnalisées dans un message utilisateur distinct, clairement délimité et non prioritaire.
- Garder les passages documentaires dans un message séparé des préférences.
- Afficher dans le gestionnaire la composition runtime réelle, et pas seulement le texte d'override éditable.
