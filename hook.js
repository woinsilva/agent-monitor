#!/usr/bin/env node
/**
 * Agent Monitor hook handler (Claude Code + Codex). Installed by install.js.
 *
 *   node hook.js <EventName> --client claude|codex      (event JSON on stdin)
 *
 * Appends one compact line per event to data/events-YYYY-MM-DD.jsonl, which
 * the dashboard server tails. It prints NOTHING to stdout, so it never adds
 * anything to the model's context (zero tokens), and it always exits 0 so a
 * monitoring bug can never block or break an agent session.
 *
 * Only metadata is kept: tool name, a one-line summary (command / file path /
 * search pattern), touched file paths, and the first 300 characters of the
 * prompt. File contents and tool output are never stored.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.AGENT_MONITOR_DATA || path.join(__dirname, 'data');
const CLIP = 300;

function clip(s, n) {
  const max = n || CLIP;
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function localDay(d) {
  const pad = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function asCommand(v) {
  if (Array.isArray(v)) {
    // Codex often wraps commands as ["powershell", "-Command", "..."] or ["bash", "-lc", "..."]
    const last = v[v.length - 1];
    return v.length >= 3 && /^-(c|lc|Command)$/i.test(String(v[v.length - 2])) ? String(last) : v.join(' ');
  }
  return v == null ? '' : String(v);
}

// File paths named in an apply_patch body ("*** Update File: src/x.ts").
function patchFiles(text) {
  const out = [];
  const re = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm;
  let m;
  while ((m = re.exec(String(text || '')))) out.push(m[1].trim());
  return out;
}

// Turn a tool call into { summary, files, kind } for the dashboard.
function describeTool(name, input) {
  const n = String(name || '');
  const i = input && typeof input === 'object' ? input : {};
  const file = i.file_path || i.notebook_path || i.path || null;
  const lower = n.toLowerCase();

  if (/^(bash|powershell|shell|exec_command|local_shell|shell_command|container\.exec)$/.test(lower)) {
    const cmd = asCommand(i.command != null ? i.command : (i.cmd != null ? i.cmd : i.script));
    return { kind: 'command', summary: clip(i.description ? i.description + ' — ' + cmd : cmd), files: [] };
  }
  if (lower === 'apply_patch') {
    // Codex sends the patch text in tool_input.command; other shapes kept for safety
    const raw = typeof input === 'string' ? input : (i.command != null ? i.command : (i.input || i.patch || ''));
    const body = Array.isArray(raw) ? raw.join('\n') : String(raw);
    const files = patchFiles(body);
    return { kind: 'edit', summary: files.length ? 'patch: ' + files.join(', ') : 'apply_patch', files: files };
  }
  if (/^(edit|multiedit|write|notebookedit)$/.test(lower)) {
    return { kind: 'edit', summary: file || n, files: file ? [file] : [] };
  }
  if (lower === 'read') return { kind: 'read', summary: file || n, files: [] };
  if (lower === 'grep') return { kind: 'search', summary: clip('"' + (i.pattern || '') + '"' + (i.path ? ' · ' + i.path : '')), files: [] };
  if (lower === 'glob') return { kind: 'search', summary: clip(i.pattern || ''), files: [] };
  if (lower === 'webfetch') return { kind: 'web', summary: clip(i.url || ''), files: [] };
  if (lower === 'websearch' || lower === 'web_search') return { kind: 'web', summary: clip(i.query || ''), files: [] };
  if (lower === 'agent' || lower === 'task' || lower === 'spawn_agent') {
    return { kind: 'agent', summary: clip((i.subagent_type ? '[' + i.subagent_type + '] ' : '') + (i.description || i.prompt || i.message || '')), files: [] };
  }
  if (lower === 'skill') return { kind: 'other', summary: clip(i.skill || ''), files: [] };
  if (lower === 'todowrite' || lower === 'update_plan') return { kind: 'plan', summary: '', files: [] };

  // MCP and anything else: show the most telling field we can find.
  const hint = i.description || i.query || i.url || i.command || file || '';
  return { kind: n.startsWith('mcp__') ? 'mcp' : 'other', summary: clip(hint ? asCommand(hint) : ''), files: file ? [file] : [] };
}

// Keep one example per (client, event) of which fields arrive, so the
// dashboard's parsing can be checked against what each tool really sends.
function rememberShape(client, event, data) {
  try {
    const f = path.join(DATA_DIR, 'payload-shapes.json');
    let shapes = {};
    try { shapes = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
    const key = client + ':' + event;
    if (shapes[key]) return;
    const shape = {};
    for (const k of Object.keys(data)) {
      const v = data[k];
      shape[k] = v && typeof v === 'object' ? (Array.isArray(v) ? 'array' : 'object{' + Object.keys(v).slice(0, 12).join(',') + '}') : typeof v;
    }
    shapes[key] = shape;
    fs.writeFileSync(f, JSON.stringify(shapes, null, 2));
  } catch (e) { /* best effort */ }
}

function main() {
  const event = process.argv[2] || '';
  const ci = process.argv.indexOf('--client');
  const client = ci > -1 ? String(process.argv[ci + 1] || 'unknown') : 'claude';

  let data = {};
  try { data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') || {}; } catch (e) {}

  fs.mkdirSync(DATA_DIR, { recursive: true });
  rememberShape(client, event || data.hook_event_name || '?', data);

  const rec = {
    ts: Date.now(),
    client: client,
    event: event || data.hook_event_name || 'unknown',
    session: data.session_id || data.conversation_id || data.thread_id || 'unknown',
    cwd: data.cwd || process.cwd(),
  };
  const agentId = data.agent_id || data.subagent_id || null;
  if (agentId) {
    rec.agent = String(agentId);
    rec.agentType = data.agent_type || data.subagent_type || null;
  }
  if (typeof data.model === 'string') rec.model = data.model;
  else if (data.model && data.model.id) rec.model = data.model.id;
  if (data.transcript_path) rec.transcript = data.transcript_path;
  if (data.agent_transcript_path) rec.agentTranscript = data.agent_transcript_path;
  if (data.permission_mode) rec.mode = data.permission_mode;
  if (data.turn_id) rec.turn = data.turn_id;

  if (data.tool_name) {
    const input = data.tool_input != null ? data.tool_input : data.input;
    const d = describeTool(data.tool_name, input);
    rec.tool = data.tool_name;
    rec.kind = d.kind;
    rec.summary = d.summary;
    if (d.files.length) rec.files = d.files.slice(0, 20);
    if (data.tool_use_id || data.call_id) rec.callId = data.tool_use_id || data.call_id;
    if (typeof data.duration_ms === 'number') rec.durationMs = data.duration_ms;
    if (rec.event === 'PostToolUseFailure' || (data.tool_response && data.tool_response.is_error)) rec.failed = true;
  }
  if (typeof data.prompt === 'string') rec.prompt = clip(data.prompt);
  if (typeof data.message === 'string') rec.message = clip(data.message);
  if (typeof data.last_assistant_message === 'string') rec.reply = clip(data.last_assistant_message);
  if (data.reason) rec.reason = clip(data.reason, 80);
  if (data.source) rec.source = clip(data.source, 40);

  fs.appendFileSync(path.join(DATA_DIR, 'events-' + localDay(new Date()) + '.jsonl'), JSON.stringify(rec) + '\n');
}

try { main(); } catch (e) { /* never break the agent session */ }
process.exit(0);
