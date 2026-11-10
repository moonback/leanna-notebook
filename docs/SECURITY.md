# Sécurité

Contrôles décrits dans le README : Supabase Auth, contrôle de rôle par notebook/workspace, RLS, buckets privés, validation Zod, contrôle d'origine des écritures, protection SSRF pour les pages web, limites sur archives Office, secrets fournisseurs côté serveur, contrôle des citations et rendu Markdown sans HTML.

Limites connues mentionnées : une purge de stockage peut échouer et nécessite une reprise manuelle ; le job purge_storage existe mais son traitement n'est pas écrit. L'export du compte est construit en mémoire dans la requête et peut devenir coûteux pour les très gros comptes.

Ces éléments sont un résumé documentaire et non un audit de sécurité indépendant. Ne jamais exposer SUPABASE_SERVICE_ROLE_KEY au navigateur ni versionner les fichiers .env.