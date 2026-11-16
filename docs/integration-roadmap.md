# Agent Monitor: integration architecture and marketplace readiness

This document describes planned support, not a claim that every coding agent is already compatible.

## Existing behavior (as of v0.2.0)
- Native Claude Code and Codex event hooks via install.js / hook.js.
- Generic reporting from other agents via report.js with start, tool, wait, stop and end events.
- Data stays local; the dashboard listens on 127.0.0.1 by default.
- Token analytics read Claude Code and Codex session formats. Other agents must supply usage explicitly.
- Global Codex hooks are experimental.

## Compatibility dimensions
An adapter must document independently:
1. Session lifecycle (start, stop, end)
2. Tool execution (name, type, result)
3. Permission / user-input requests
4. Subagents and parent linkage
5. Model identifier and usage tokens
6. Source reliability (hooks, plugin, CLI wrapper, transcript, or custom SDK)
7. Supported product versions and operating systems

Do not label an adapter as supported until integration tests demonstrate delivery on a real installation. Missing dimensions should be displayed as unavailable, never inferred.

## Event normalization
Use the existing event records in report.js as the compatibility baseline:
- client: stable adapter identifier
- session: stable session identifier
- event: UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Stop, SessionEnd, SubagentStart, SubagentStop
- ts: milliseconds since Unix epoch
- cwd: project path (avoid collecting secrets)
- optional: model, tool, kind, summary, files, failed, usage, agent

Future work should introduce a versioned schema, independent adapter modules, validation and golden payload fixtures.

## Safe installation
- Detect tools and configuration locations without modifying anything.
- Explain changes and request explicit approval before writing settings or installing hooks.
- Back up touched configuration, preserve unrelated hooks and support uninstall.
- Avoid reading secrets; do not send event data outside the machine without opt-in.
- Verify delivery with a fresh agent session; configuration detection alone is insufficient.
- Never advertise full compatibility solely because a model name is recognized.

## Agensi distribution model
Agensi sells agent skills, not the standalone Agent Monitor application.
Keep marketplace instructions and any commercial guidance separate from public source code.
A skill can guide a buyer's connected agent through detection, approved setup, diagnostics, and verification of the local app.
Do not upload or sell an untested skill, claim universal compatibility, or change the MIT license on existing releases retroactively.

Next candidates: Cursor Agent, Gemini CLI, Copilot, and OpenCode adapters. Confirm each runtime's hook interfaces and test against supported versions before release.
