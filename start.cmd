@echo off
rem Makes sure the Agent Monitor container is running and opens it in the browser.
cd /d "%~dp0"
if not exist .env node setup.js
docker start agent-monitor >nul 2>&1 || docker compose up -d --build
start "" http://localhost:4400
