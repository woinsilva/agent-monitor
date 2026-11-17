---
name: agent-monitor-audit
description: Inspect an existing local Agent Monitor installation, verify recent agent delivery, and summarize privacy-safe health or replay data. Use for Agent Monitor diagnostics and audits, not for installing hooks or publishing telemetry.
---

# Agent Monitor Audit

Work only with the Agent Monitor repository or local URL the user identifies. Keep all data local.

1. Run `node agent-monitor.js doctor --json` from the repository and report installed runtimes separately from configured hooks and verified delivery.
2. When a client or project is named, run `node agent-monitor.js verify --agent <client> --project <absolute-directory>`. A configured hook is not proof of delivery.
3. If the local server is already running, read only `http://127.0.0.1:4400/api/intelligence`, `/api/replay`, or `/api/export`. Do not start, stop, or reconfigure services unless the user asks.
4. Treat cost fields as estimates, never billing records. Do not expose prompts, replies, transcripts, credentials, or raw tool output.
5. Recommend reversible actions. Never install hooks, change configuration, upload data, or publish a package without explicit authorization.
