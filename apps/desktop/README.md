# Leanna Notebook Desktop

Application Electron pour le SaaS Leanna Notebook. Le client Windows charge l'application via HTTPS ; Supabase, l'authentification et le worker restent côté serveur.

## Développement local

```powershell
pnpm install
pnpm desktop:doctor
pnpm desktop:dev
```

## Packaging Windows

Après déploiement de l'application web, ouvrez PowerShell à la racine :

```powershell
$env:LEANNA_WEB_URL = "https://votre-domaine-public"
pnpm desktop:dist:win
```

L'installateur NSIS x64 est généré dans `apps/desktop/release/`. Il permet de choisir le dossier d'installation et crée des raccourcis dans le menu Démarrer et sur le Bureau.

La commande exige une origine HTTPS (sans chemin, query, fragment ni identifiants). Seule cette URL publique est intégrée au build. Aucun secret Supabase, Gemini ou worker n'est embarqué. Le client desktop n'est pas hors ligne : le SaaS, Supabase et le worker doivent être disponibles.

L'installateur n'est pas encore signé ; Windows peut afficher SmartScreen. La signature, l'icône de marque, les mises à jour automatiques et les liens profonds OAuth restent à traiter.

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Le preload expose une API étroite via `contextBridge`.
- Les dialogues IPC vérifient le processus émetteur.
- La navigation interne est limitée à l'origine configurée ; les liens externes HTTPS sont ouverts dans le navigateur système.
