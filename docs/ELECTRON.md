# Electron

Le package apps/desktop est version 1.2.0 et déclare Electron ^38.0.0, electron-builder 26.0.12 et electron-updater ^6.6.2.

Scripts : `pnpm desktop:dev`, `pnpm desktop:build`, `pnpm desktop:test`, `pnpm desktop:doctor`, `pnpm desktop:dist:win`. Le script dev construit le desktop, démarre Next sur 127.0.0.1:3000, attend sa disponibilité puis lance Electron. La distribution déclarée cible Windows NSIS x64.

La dépendance electron-updater ne prouve pas à elle seule que le parcours de mise à jour est configuré et validé. Vérifier main/preload, electron-builder.yml et les modules updater avant de garantir les mises à jour.