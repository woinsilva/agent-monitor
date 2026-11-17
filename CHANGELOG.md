# Changelog

## 1.0.0-rc.1 — 2026-11-17

- Added fixed, expandable office rooms for Claude Code, Codex, Gemini CLI and Cursor.
- Added Cursor 3.30.14 and Gemini CLI 0.68.0 preview adapters with sanitized fixtures.
- Added versioned event schema v1 and tolerant legacy-event reading.
- Split Codex 5-hour and 7-day limits and added Claude limit cards when status-line data exists.
- Replaced conflict lines with per-agent conflict badges and detail cards.
- Added read-only diagnostics, unified safe setup entry point, HTTP/SSE and retention tests.
- Documented Docker backup, upgrade, restore and rollback.

Gemini permission allow/deny/cancel validation remains deferred because the live
service returned 503 during the release-candidate test. The integration remains preview.
