# Agent Monitor

A live, local dashboard for AI coding agents. See at a glance how many agents
are working, what each one is doing right now, who is waiting for your approval,
which files they touched, and when two of them edit the same file.

Works with **Claude Code** and **Codex** out of the box (through their hooks),
and with **any other agent or script** through a one-line reporter. Everything
runs on your machine at http://localhost:4400; nothing is sent anywhere.

*[Português](README.pt-BR.md)*

## Views

- **Office:** a pixel-art office where every session is an employee. Claude Code
  on the left, Codex on the right, other agents in the meeting room, subagents as
  interns behind the chair of whoever started them.
  - typing: editing files or running a command (the monitor shows which)
  - reading a sheet: reading or searching code
  - standing with a raised hand and a yellow bubble: **waiting for you**
  - holding a coffee: idle
  - head on the desk: no signal for 20+ minutes
  
  Agents walk in through the door when they start and leave when they end. A red
  line links two agents that edited the same file. Click anyone for their history.
- **Panel:** one card per session with the current action, counters, context use
  and subagents, plus filters.
- **Timeline:** today's activity per session and how many agents ran at once.
- **Notifications:** desktop notifications (with a chime) when an agent starts
  waiting for you, optionally also when one finishes. The tab title shows how many
  are waiting. They work while the tab is open, even in the background.

English and Portuguese, following the browser (switch with the EN/PT button).

## Requirements

- Node.js 18+ (the hooks run on your machine)
- Optional: Docker, to keep the dashboard running and starting with the computer

## Quick start

```sh
git clone https://github.com/<you>/agent-monitor.git
cd agent-monitor

# 1. hooks: per project, or --global for every project of your user
node install.js /path/to/your/project
# node install.js --global

# 2a. run it with Node
node server.js

# 2b. or run it in Docker (comes back whenever Docker starts)
node setup.js
docker compose up -d --build
```

Open http://localhost:4400 and send a prompt to Claude Code or Codex in that project.
Codex asks you to trust the new hooks the first time; accept them.

`start.cmd` / `start.sh` start the container and open the browser; `stop.cmd` /
`stop.sh` stop it (it stays stopped until you start it again). After changing
`server.js` or `public/`, run `docker compose up -d --build` again.

## How it works

```
Claude Code / Codex --hook--> hook.js   --\
any other agent ------------> report.js ----> data/events-YYYY-MM-DD.jsonl --> server.js --> browser
                                              token use: read from the agents' own session files
```

- `hook.js` runs on every hook event (prompt, tool use, permission request, end of
  turn, subagents...). It appends one short line and **prints nothing**, so it never
  enters the model's context and **costs no tokens**. About 60 ms per event.
- Only metadata is stored: tool name, the command or file path, and the first
  300 characters of each prompt. File contents and command output are never stored.
- `server.js` rebuilds each session's state from those lines and streams it to the
  page. Context use is read from Claude Code's transcripts (`~/.claude/projects`)
  and Codex's rollouts (`~/.codex/sessions`), which also carry Codex's weekly limit.
- Event files older than 14 days are deleted automatically.

## Installing the hooks

```sh
node install.js <project-dir>            # this project only
node install.js --global                 # every project of this user
node install.js <project-dir> --remove   # remove only Agent Monitor's hooks
```

| | Claude Code | Codex |
|---|---|---|
| project | `<project>/.claude/settings.local.json` | `<project>/.codex/hooks.json` |
| global | `~/.claude/settings.json` | `~/.codex/hooks.json` (experimental) |

Existing hooks are kept, and each file is backed up as `*.bak-agent-monitor` before
its first change. Pick either per-project or global for a given project, not both,
or every event arrives twice.

## Other agents

Anything without hooks (a script calling another model's API, a CI job, your own
agent) can report itself; it appears in the office's meeting room:

```sh
node report.js start --client reviewer --prompt "Independent review of the diff" --model some-model
node report.js tool  --client reviewer --kind read --summary "reading the patch"
node report.js stop  --client reviewer --reply "3 findings" --input-tokens 41000 --output-tokens 2300
node report.js end   --client reviewer
```

Calls from the same script run share a session automatically (or pass `--session`).
`wait` marks it as waiting for you, `stop --failed` records a failure. See the
header of `report.js` for every option.

You can also append the line yourself from any language; one JSON object per line
in `data/events-YYYY-MM-DD.jsonl` (local date):

```json
{"ts": 1767225600000, "client": "reviewer", "event": "UserPromptSubmit", "session": "run-42", "cwd": "/path/to/project", "prompt": "Reviewing the diff"}
{"ts": 1767225660000, "client": "reviewer", "event": "Stop", "session": "run-42", "cwd": "/path/to/project", "reply": "3 findings", "usage": {"input_tokens": 41000, "output_tokens": 2300}}
```

Events: `UserPromptSubmit` (started), `PostToolUse` (an action, with `tool`, `kind`,
`summary`, `files`), `PermissionRequest` (waiting for you), `Stop` (finished, with
`reply`, `failed`, `usage`), `SessionEnd`.

## Statuses

| Status | Meaning |
|---|---|
| Working | between the prompt and the end of the turn |
| Waiting for you | asked for permission or for your answer |
| No signal | marked as working but silent for 20+ min (killed, hung) |
| Idle | turn finished; listed for 3 h, then only with "show idle and ended" |
| Ended / Done | session closed / subagent finished |

`data/payload-shapes.json` keeps one example of the fields each tool sends per
event, which helps adapt the parser when Claude Code or Codex change their format.
