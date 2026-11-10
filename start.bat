@echo off
setlocal
cd /d "%~dp0"

echo Lancement du site (http://localhost:3000) et du worker...

start "Notebook - Web" cmd /k "pnpm --dir apps/web dev"
start "Notebook - Worker" cmd /k "pnpm --dir apps/worker start"

endlocal
