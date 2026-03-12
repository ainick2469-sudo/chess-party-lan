@echo off
setlocal
cd /d "%~dp0"
set "NODE_ENV=production"
set "PORT=3000"
set "AUTO_INCREMENT_PORT=1"
".\.tools\node\node-v22.22.1-win-x64\node.exe" ".\dist\server\index.cjs"
pause
