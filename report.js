#!/usr/bin/env node
/**
 * Report activity from any agent or script that has no hook system of its own
 * (e.g. a review script calling another model's API). It shows up in the
 * dashboard like Claude Code and Codex do; in the office it sits in the
 * "other agents" room.
 *
 *   node report.js start --client <name> [--prompt "what it is doing"] [--model <id>]
 *   node report.js tool  --client <name> --summary "<action>" [--kind command|edit|read|search|web] [--file <path>]...
 *   node report.js wait  --client <name> [--message "what it needs from you"]
 *   node report.js stop  --client <name> [--reply "result"] [--failed] [--input-tokens N] [--output-tokens N]
 *   node report.js end   --client <name>
 *
 * Common options:
 *   --session <id>   groups calls into one session. Default: $AGENT_MONITOR_SESSION,
 *                    otherwise "<client>-<parent pid>", so every call from the same
 *                    script run lands in the same session.
 *   --cwd <dir>      project directory shown on the dashboard (default: current dir)
 *
 * Writing the event line yourself works too; see README ("Other agents").
 * Never fails the caller: errors are ignored and the exit code is always 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.AGENT_MONITOR_DATA || path.join(__dirname, 'data');
const EVENTS = { start: 'UserPromptSubmit', tool: 'PostToolUse', wait: 'PermissionRequest', stop: 'Stop', end: 'SessionEnd' };

function parse(argv) {
  const out = { _: [], file: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    const value = next == null || next.startsWith('--') ? true : (i++, next);
    if (key === 'file') out.file.push(value); else out[key] = value;
  }
  return out;
}

const clip = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const localDay = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const int = v => (v == null || v === true ? undefined : (Number.isFinite(Number(v)) ? Number(v) : undefined));

function main() {
  const args = parse(process.argv.slice(2));
  const cmd = args._[0];
  if (!EVENTS[cmd] || !args.client || args.client === true) {
    process.stderr.write('usage: node report.js start|tool|wait|stop|end --client <name> [options]  (see the header of report.js)\n');
    return;
  }
  const client = String(args.client).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
  const rec = {
    ts: Date.now(),
    client,
    event: EVENTS[cmd],
    session: String(args.session || process.env.AGENT_MONITOR_SESSION || client + '-' + process.ppid),
    cwd: path.resolve(args.cwd && args.cwd !== true ? String(args.cwd) : process.cwd()),
  };
  if (args.model && args.model !== true) rec.model = String(args.model);
  if (cmd === 'start' && args.prompt) rec.prompt = clip(args.prompt, 300);
  if (cmd === 'tool') {
    rec.tool = String(args.tool || args.kind || 'action');
    rec.kind = String(args.kind || 'other');
    rec.summary = clip(args.summary || '', 300);
    if (args.file.length) rec.files = args.file.map(String).slice(0, 20);
  }
  if (cmd === 'wait') {
    rec.tool = 'input';
    if (args.message) rec.summary = clip(args.message, 300);
  }
  if (cmd === 'stop') {
    if (args.reply) rec.reply = clip(args.reply, 300);
    if (args.failed) rec.failed = true;
    const input = int(args['input-tokens']), output = int(args['output-tokens']);
    if (input != null || output != null) {
      rec.usage = { input_tokens: input || 0, output_tokens: output || 0, total_tokens: (input || 0) + (output || 0) };
    }
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(path.join(DATA_DIR, 'events-' + localDay(new Date()) + '.jsonl'), JSON.stringify(rec) + '\n');
}

try { main(); } catch (e) { /* never break the caller */ }
process.exit(0);
