# Codex / ChatGPT Work plugin evaluation

The safe deliverable is a local, read-only skill package under `plugins/agent-monitor`.
It can inspect installation readiness, recent delivery, Agent Health, replay, and
aggregate exports. It does not install lifecycle hooks and it does not send event
data to a remote MCP server.

## Decision

- Use only the documented plugin manifest and skill surfaces.
- Require the user to install and trust the local plugin explicitly.
- Keep lifecycle capture in Agent Monitor's existing local runtime hooks. Public
  directory plugins cannot silently deploy or trust local hook scripts.
- Do not add a hosted MCP dependency: that would weaken the product's local-only
  privacy boundary without being necessary for diagnostics.
- Do not publish this package automatically. It is prepared for local review.

The package is intentionally read-only. Any hook installation, service control,
configuration change, upload, or marketplace publication remains a separately
authorized action.
