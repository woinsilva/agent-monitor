# Integration compatibility matrix

Support is determined by the coding-agent runtime and its telemetry, not by the
model name. `Preview` means that real events were observed but one or more
capabilities or test scenarios are still missing.

| Runtime | Tested version / OS | Status | Lifecycle | Tools | Permission wait | Subagents | Tokens / limits | Known limitations |
|---|---|---|---|---|---|---|---|---|
| Claude Code terminal | 2.1.293 / Windows | supported baseline | yes | start/result/failure | yes | yes | transcript + status line | status line plan limits require Pro/Max/Ultra and terminal UI |
| Claude Desktop coding sessions | app 5.11492.5 / Windows | partial | yes | start/result/failure | yes when hook emits it | yes | transcript only | Desktop does not run Claude Code `statusLine`; plan limits unavailable |
| Codex CLI | 0.154.0 / Windows | supported baseline | yes | start/result | yes | yes | rollout tokens + 5h/7d limits | global hooks remain experimental |
| Cursor | 3.30.14 / Windows x64 | preview | yes; real UI run verified 2026-11-17 | result/failure; real `Read` result verified | unavailable | stop only | unavailable | permission-sensitive hooks are deliberately not installed; Claude-compatible duplicates are suppressed; Stop does not include the assistant reply |
| Gemini CLI | 0.68.0 / Windows x64 | preview | real SessionStart/prompt verified; server correlation covers headless ID variant | start/result | documented `ToolPermission` mapping; real allow/deny pending | unavailable | unavailable | 2026-11-17 permission run was blocked by upstream 503; cancelling during API retry emitted no SessionEnd and remains working until stale timeout |
| GitHub Copilot CLI | 1.0.112 / Windows x64 | preview | real prompt-mode lifecycle verified | documented start/result/failure hooks | observed only, never decided | documented hooks | unavailable | project hooks live in `.github/hooks`; real no-tool run returned `OK` and delivery was verified |
| OpenCode | 2.3.0 / Windows x64 | preview | real prompt lifecycle verified | SDK before/after hooks | unavailable | unavailable | unavailable | local V2 plugin loaded and delivered; Nvidia model provider did not finish before the controlled timeout |
| Aider | 0.86.2 / Windows x64 | wrapper | wrapper start/stop/end verified | unavailable through stable public hooks | unavailable | unavailable | model-dependent | official scripting has no stable lifecycle hooks; use `integrations/aider.js` |
| Other agents | any runtime using `report.js` | manual | caller supplied | caller supplied | caller supplied | caller supplied | caller supplied | reliability depends on the reporter |

## Opt-in setup for ecosystem previews

- Copilot: preview with `node agent-monitor.js install --agent copilot --project
  C:\path\to\project`, then apply with `--apply`, restart Copilot, and run
  `verify --agent copilot --project C:\path\to\project`.
- OpenCode: install dependencies with `npm install` in `integrations/opencode`,
  then create `.opencode/plugins/agent-monitor.ts` in the target project that
  re-exports the absolute `integrations/opencode/index.ts` file. Restart OpenCode
  and verify with `--agent opencode`.
- Aider: invoke Aider through `node integrations/aider.js -- <aider arguments>`.
  Set `AIDER_BINARY` when `aider` is not on PATH, then verify with `--agent aider`.

All three are opt-in. Installation/configuration is not evidence of delivery;
use the matching `verify` command after a fresh session.

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

## Real-run evidence (2026-11-17, Windows)

- Cursor produced `SessionStart -> UserPromptSubmit -> PostToolUse(Read) -> Stop`,
  returned `CURSOR-MONITOR-OK`, and appeared idle in both API and dashboard.
- Gemini produced `SessionStart -> UserPromptSubmit`; Google then returned repeated
  `503 UNAVAILABLE` responses before any tool permission prompt. The process was
  cancelled, exposing the missing `SessionEnd` behavior above. This is not counted
  as a successful permission test.
- Browser smoke coverage verified Office/Panel, client filters, historical-session
  toggle, timeline, and live Cursor/Gemini visibility. Codex limit cards were not
  expected in that run because `/api/state` reported `codexLimits: null`.
- Copilot returned `OK` in a real no-tool prompt and `verify` found fresh delivery.
- OpenCode loaded the local V2 plugin and delivered `UserPromptSubmit`; two Nvidia
  model calls were cancelled after controlled timeouts, so response completion is
  not claimed.
- Aider 0.86.2 was installed with `aider-install`; its wrapper completed a real
  `--version` process and delivered lifecycle events.

