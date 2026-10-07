#!/bin/sh
# Makes sure the Agent Monitor container is running and opens it in the browser.
cd "$(dirname "$0")" || exit 1
[ -f .env ] || node setup.js
docker start agent-monitor >/dev/null 2>&1 || docker compose up -d --build
url=http://localhost:4400
if command -v open >/dev/null 2>&1; then open "$url"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1
else echo "$url"; fi
