# Docker operations

Agent Monitor keeps durable state in `data/` and local configuration in
`config/`. The container can be replaced without losing either directory.

## Backup

Stop writers briefly, then copy both directories to a dated folder:

```powershell
docker compose stop
$backup = Join-Path (Split-Path $PWD) ("agent-monitor-backup-" + (Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -Recurse -LiteralPath .\data -Destination $backup
Copy-Item -Recurse -LiteralPath .\config -Destination $backup
docker compose start
```

The hooks write to `data/` on the host. Keep the stopped interval short or do
the backup between agent sessions.

## Upgrade

1. Create and inspect a backup.
2. Update the source to the intended tag or commit.
3. Run `node setup.js`; it refreshes `.env` and does not overwrite
   `config/config.json`.
4. Run `docker compose up -d --build`.
5. Check `docker compose ps`, `docker compose logs --tail 100 agent-monitor`,
   and `http://localhost:4400/api/state`.

## Restore or rollback

```powershell
docker compose down
# Replace only .\data and .\config with the verified backup copies.
node setup.js
docker compose up -d --build
```

To roll back the application, check out the previous known-good tag/commit
before the final build. Never restore over a running container, and retain the
pre-restore directories until `/api/state` and the dashboard are verified.
