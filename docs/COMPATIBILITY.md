# Integration compatibility matrix

Support is determined by the coding-agent runtime and its telemetry, not by the
model name. `Preview` means that real events were observed but one or more
capabilities or test scenarios are still missing.

| Runtime | Tested version / OS | Status | Lifecycle | Tools | Permission wait | Subagents | Tokens / limits | Known limitations |
|---|---|---|---|---|---|---|---|---|
| Claude Code terminal | 2.1.293 / Windows | supported baseline | yes | start/result/failure | yes | yes | transcript + status line | status line plan limits require Pro/Max/Ultra and terminal UI |
| Claude Desktop coding sessions | app 5.11492.5 / Windows | partial | yes | start/result/failure | yes when hook emits it | yes | transcript only | Desktop does not run Claude Code `statusLine`; plan limits unavailable |
| Codex CLI | 0.154.0 / Windows | supported baseline | yes | start/result | yes | yes | rollout tokens + 5h/7d limits | global hooks remain experimental |
| Cursor | 3.30.14 / Windows x64 | preview | yes | result/failure; no safe start hook installed | unavailable | stop only | unavailable | permission-sensitive hooks are deliberately not installed; Claude-compatible duplicates are suppressed |
| Gemini CLI | 0.68.0 / Windows x64 | preview | yes, with server correlation for headless ID variant | start/result | documented `ToolPermission` mapping; real allow/deny pending | unavailable | unavailable | duplicate SessionEnd is idempotent; real permission flow still needs validation |
| Other agents | any runtime using `report.js` | manual | caller supplied | caller supplied | caller supplied | caller supplied | caller supplied | reliability depends on the reporter |

## Golden fixtures

Sanitized fixtures live in `test/fixtures/` and cover the payload shapes used by
the adapters. They contain no credentials, raw tool output, transcripts or real
user prompts. Fixtures prove normalization behavior, not that a runtime still
emits the same payload in a future version.

## Promotion rule

An integration moves from preview to supported only after:

1. lifecycle, success, failure and permission scenarios are exercised on every
   advertised OS/version;
2. hooks are shown not to grant, deny or bypass user approval;
3. session completion leaves no orphan working state;
4. missing capabilities are displayed as unavailable rather than zero;
5. the matching golden fixtures and CI jobs pass.

