#!/usr/bin/env node
/**
 * Agent Monitor server: tails the events written by hook.js / report.js, keeps
 * a live picture of every agent session and subagent, and serves the dashboard
 * on http://127.0.0.1:4400 (localhost only, nothing leaves the machine).
 *
 *   node server.js            (PORT env var overrides the port)
 *
 * In Docker (see docker-compose.yml) the hooks still run on the host, so event
 * paths are host paths (possibly Windows paths); PATH_MAP rewrites the agents'
 * transcript folders to where they are mounted inside the container.
 *
 * Timeline entries carry raw values (prompt, command, reply...) plus the event
 * name; the browser turns them into localized sentences.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const config = require('./lib/config');
const notifier = require('./lib/notify');
const report = require('./lib/report');

let startedAt = Infinity; // set once the replay of past events is done

const PORT = Number(process.env.PORT) || 4400;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.AGENT_MONITOR_DATA || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const CODEX_SESSIONS = process.env.CODEX_SESSIONS || path.join(os.homedir(), '.codex', 'sessions');
const HOST_LABEL = process.env.HOST_LABEL || os.hostname();

// "<host dir>=<mount dir>;..." e.g. "C:\Users\me\.claude\projects=/host/claude-projects"
// or "/Users/me/.codex/sessions=/host/codex-sessions". Compared with forward
// slashes; case-insensitively for Windows drive paths.
const slashes = p => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
const PATH_MAP = String(process.env.PATH_MAP || '').split(';').filter(Boolean).map(pair => {
  const i = pair.lastIndexOf('=');
  const from = slashes(pair.slice(0, i));
  return { from, ci: /^[A-Za-z]:\//.test(from), mount: slashes(pair.slice(i + 1)) };
});

function localFile(p) {
  if (!p || !PATH_MAP.length) return p;
  const f = slashes(p);
  for (const m of PATH_MAP) {
    const head = f.slice(0, m.from.length);
    if ((m.ci ? head.toLowerCase() === m.from.toLowerCase() : head === m.from) && f[m.from.length] === '/') {
      return m.mount + f.slice(m.from.length);
    }
  }
  return p;
}

// Event paths come from Windows even when this server runs on Linux.
const isWinPath = p => /^[A-Za-z]:[\\/]|\\/.test(String(p || ''));
const pathFor = p => (isWinPath(p) ? path.win32 : path);
const baseName = p => pathFor(p).basename(String(p || ''));

const REPLAY_DAYS = 2;            // rebuild state from today + yesterday on start
const RETENTION_DAYS = 14;        // older event files are deleted
const STALE_MS = 20 * 60 * 1000;  // "working" with no signal this long -> stale
const TIMELINE_MAX = 80;
const CONFLICT_WINDOW_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------- state

const sessions = new Map();   // key -> session
const codexLimits = { usedPercent: null, windowMinutes: null, resetsAt: null, at: 0 };

// Claude plan usage, written by statusline.js (Claude Code only exposes it to the status line)
let claudeLimits = null, claudeLimitsStamp = '';
function readClaudeLimits() {
  const file = path.join(DATA_DIR, 'claude-limits.json');
  let st;
  try { st = fs.statSync(file); } catch (e) { return false; }
  const stamp = st.size + ':' + st.mtimeMs;
  if (stamp === claudeLimitsStamp) return false;
  claudeLimitsStamp = stamp;
  try { claudeLimits = JSON.parse(fs.readFileSync(file, 'utf8')); return true; } catch (e) { return false; }
}
// a window whose reset time has passed is no longer meaningful
function liveClaudeLimits(now) {
  if (!claudeLimits) return null;
  const out = { at: claudeLimits.at };
  for (const k of ['fiveHour', 'sevenDay', 'spend']) {
    const w = claudeLimits[k];
    if (w && (!w.resetsAt || w.resetsAt > now)) out[k] = w;
  }
  return out.fiveHour || out.sevenDay || out.spend ? out : null;
}

function localDay(d) {
  const pad = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function keyOf(ev, withAgent) {
  return ev.client + ':' + ev.session + (withAgent && ev.agent ? '/' + ev.agent : '');
}

function getSession(ev, key, parentKey) {
  let s = sessions.get(key);
  if (!s) {
    s = {
      key: key,
      client: ev.client,
      session: ev.session,
      agent: parentKey ? ev.agent : null,
      agentType: parentKey ? (ev.agentType || null) : null,
      parentKey: parentKey || null,
      cwd: ev.cwd,
      project: baseName(ev.cwd) || '?',
      model: null,
      status: 'idle',
      statusSince: ev.ts,
      firstSeen: ev.ts,
      lastSeen: ev.ts,
      turnStart: null,
      prompt: null,
      reply: null,
      waitingFor: null,
      current: null,
      inflight: new Map(),
      toolCount: 0,
      failCount: 0,
      turns: 0,
      files: new Map(),
      timeline: [],
      intervals: [],
      transcript: null,
      tokens: null,
      test: null,        // last test run: { ts, result: running|pass|fail|unknown, summary }
      git: null,         // { branch, dirty } at the last turn boundary
      finishedAt: null,  // last time a turn ended after real work
    };
    sessions.set(key, s);
  }
  return s;
}

function setStatus(s, status, ts) {
  if (s.status !== status) { s.status = status; s.statusSince = ts; }
}

function openInterval(s, ts) {
  const last = s.intervals[s.intervals.length - 1];
  if (!last || last.end != null) s.intervals.push({ start: ts, end: null });
}

function closeInterval(s, ts) {
  const last = s.intervals[s.intervals.length - 1];
  if (last && last.end == null) last.end = Math.max(ts, last.start);
}

function pushTimeline(s, ev, text) {
  s.timeline.push({ ts: ev.ts, event: ev.event, kind: ev.kind || null, tool: ev.tool || null, text: text || '', failed: !!ev.failed });
  if (s.timeline.length > TIMELINE_MAX) s.timeline.splice(0, s.timeline.length - TIMELINE_MAX);
}

function refreshCurrent(s) {
  const calls = [...s.inflight.values()];
  s.current = calls.length ? calls[calls.length - 1] : (s.status === 'working' ? { kind: 'thinking', summary: null, since: s.lastSeen } : null);
}

function applyEvent(ev) {
  if (!ev || !ev.client || !ev.event) return;
  const topKey = keyOf(ev, false);
  const isSubEvent = !!ev.agent && ev.event !== 'SubagentStart' && ev.event !== 'SubagentStop';
  const top = getSession(ev, topKey, null);
  top.lastSeen = Math.max(top.lastSeen, ev.ts);
  if (ev.cwd && !ev.agent) { top.cwd = ev.cwd; top.project = baseName(ev.cwd) || top.project; }
  if (ev.transcript && !ev.agent) top.transcript = ev.transcript;
  if (ev.model && !ev.agent) top.model = ev.model;
  if (ev.git && !ev.agent) top.git = ev.git;

  // Subagent lifecycle and events fired from inside a subagent go to the child.
  let s = top;
  if (ev.agent && (isSubEvent || ev.event === 'SubagentStart' || ev.event === 'SubagentStop')) {
    s = getSession(ev, keyOf(ev, true), topKey);
    s.lastSeen = Math.max(s.lastSeen, ev.ts);
    if (ev.agentType) s.agentType = ev.agentType;
    if (ev.agentTranscript) s.transcript = ev.agentTranscript;
    if (s.status === 'idle' && s.toolCount === 0 && ev.event !== 'SubagentStop') { setStatus(s, 'working', ev.ts); openInterval(s, ev.ts); }
  }

  switch (ev.event) {
    case 'SessionStart':
      if (s.status === 'ended') setStatus(s, 'idle', ev.ts);
      pushTimeline(s, ev, ev.source);
      break;

    case 'UserPromptSubmit':
      s.prompt = ev.prompt || s.prompt;
      s.reply = null;
      s.turns++;
      s.turnStart = ev.ts;
      s.waitingFor = null;
      s.inflight.clear();
      setStatus(s, 'working', ev.ts);
      openInterval(s, ev.ts);
      pushTimeline(s, ev, ev.prompt);
      break;

    case 'PreToolUse': {
      if (s.status !== 'working') { setStatus(s, 'working', ev.ts); openInterval(s, ev.ts); }
      s.waitingFor = null;
      const id = ev.callId || ('t' + ev.ts + Math.random());
      s.inflight.set(id, { tool: ev.tool, kind: ev.kind, summary: ev.summary, since: ev.ts });
      if (ev.test) s.test = { ts: ev.ts, result: 'running', summary: ev.summary };
      pushTimeline(s, ev, ev.summary);
      break;
    }

    case 'PostToolUse':
    case 'PostToolUseFailure': {
      if (ev.callId && s.inflight.has(ev.callId)) s.inflight.delete(ev.callId);
      else {
        // no call id: drop the oldest in-flight call of the same tool
        for (const [k, v] of s.inflight) { if (v.tool === ev.tool) { s.inflight.delete(k); break; } }
      }
      s.toolCount++;
      if (ev.failed || ev.event === 'PostToolUseFailure') {
        s.failCount++;
        pushTimeline(s, Object.assign({}, ev, { failed: true }), ev.summary || ev.tool);
      }
      for (const f of ev.files || []) s.files.set(f, ev.ts);
      if (ev.test) s.test = { ts: ev.ts, result: ev.testResult || 'unknown', summary: ev.summary };
      if (s.status === 'waiting' || s.status === 'idle') { setStatus(s, 'working', ev.ts); openInterval(s, ev.ts); }
      s.waitingFor = null;
      break;
    }

    case 'PermissionRequest':
      setStatus(s, 'waiting', ev.ts);
      s.waitingFor = ev.summary ? (ev.tool + ': ' + ev.summary) : (ev.tool || ev.message || null);
      pushTimeline(s, ev, s.waitingFor);
      break;

    case 'Notification': {
      const msg = ev.message || null;
      // "waiting for your input" arrives after the turn already ended: stays idle
      if (s.status === 'working') {
        setStatus(s, 'waiting', ev.ts);
        s.waitingFor = msg;
      }
      pushTimeline(s, ev, msg);
      break;
    }

    case 'Stop':
      s.inflight.clear();
      s.waitingFor = null;
      if (ev.reply) s.reply = ev.reply;
      if (ev.failed) s.failCount++;
      if (ev.usage) {
        // agents reported through report.js send usage per call (no transcript to read)
        const t = s.tokens || (s.tokens = { context: null, contextWindow: null, output: 0, total: 0 });
        t.context = ev.usage.prompt_tokens || ev.usage.input_tokens || t.context;
        t.output += ev.usage.completion_tokens || ev.usage.output_tokens || 0;
        t.total = (t.total || 0) + (ev.usage.total_tokens || 0);
      }
      if (s.status === 'working' || s.status === 'waiting') s.finishedAt = ev.ts;
      if (s.test && s.test.result === 'running') s.test.result = 'unknown';
      setStatus(s, 'idle', ev.ts);
      closeInterval(s, ev.ts);
      pushTimeline(s, ev, ev.reply);
      break;

    case 'SubagentStart':
      s.prompt = s.prompt || ev.prompt || null;
      setStatus(s, 'working', ev.ts);
      openInterval(s, ev.ts);
      pushTimeline(s, ev, s.agentType);
      if (s !== top) pushTimeline(top, Object.assign({}, ev, { event: 'SubagentSpawned' }), s.agentType || s.agent);
      break;

    case 'SubagentStop':
      s.inflight.clear();
      if (ev.reply) s.reply = ev.reply;
      setStatus(s, 'done', ev.ts);
      closeInterval(s, ev.ts);
      pushTimeline(s, ev, ev.reply);
      if (s !== top) pushTimeline(top, Object.assign({}, ev, { event: 'SubagentFinished' }), s.agentType || s.agent);
      break;

    case 'SessionEnd':
      for (const c of sessions.values()) {
        if (c === s || c.parentKey === s.key) {
          c.inflight.clear();
          setStatus(c, c === s ? 'ended' : (c.status === 'working' ? 'done' : c.status), ev.ts);
          closeInterval(c, ev.ts);
        }
      }
      pushTimeline(s, ev, ev.reason);
      break;

    default:
      pushTimeline(s, ev, ev.summary || ev.message);
  }
  refreshCurrent(s);
  if (s !== top) refreshCurrent(top);
}

// ---------------------------------------------------------------- tokens

const transcriptCursors = new Map(); // file -> { offset, partial, seen:Set }
const codexFileCache = new Map();    // session id -> file path | null

function findCodexRollout(id) {
  if (codexFileCache.has(id)) return codexFileCache.get(id);
  let found = null;
  try {
    const now = new Date();
    for (let d = 0; d < 4 && !found; d++) {
      const day = new Date(now.getTime() - d * 86400000);
      const dir = path.join(CODEX_SESSIONS, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
      let names = [];
      try { names = fs.readdirSync(dir); } catch (e) { continue; }
      const hit = names.find(n => n.endsWith(id + '.jsonl'));
      if (hit) found = path.join(dir, hit);
    }
  } catch (e) {}
  if (found) codexFileCache.set(id, found);
  return found;
}

function readNewLines(file) {
  let cur = transcriptCursors.get(file);
  if (!cur) { cur = { offset: 0, partial: '', seen: new Set() }; transcriptCursors.set(file, cur); }
  let size;
  try { size = fs.statSync(file).size; } catch (e) { return { cur, lines: [] }; }
  if (size < cur.offset) { cur.offset = 0; cur.partial = ''; cur.seen.clear(); }
  if (size === cur.offset) return { cur, lines: [] };
  const len = Math.min(size - cur.offset, 64 * 1024 * 1024);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buf, 0, len, cur.offset); } finally { fs.closeSync(fd); }
  cur.offset += len;
  const text = cur.partial + buf.toString('utf8');
  const parts = text.split('\n');
  cur.partial = parts.pop();
  return { cur, lines: parts };
}

function updateTokens(s) {
  let file = localFile(s.transcript);
  if (!file && s.client === 'codex' && !s.agent) file = findCodexRollout(s.session);
  if (!file) return;
  const { cur, lines } = readNewLines(file);
  const t = s.tokens || (s.tokens = { context: null, contextWindow: null, output: 0, total: null });

  for (const line of lines) {
    if (!line) continue;
    if (s.client === 'claude') {
      if (line.indexOf('"usage"') < 0) continue;
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o && o.type === 'assistant' && o.message;
      if (!m || !m.usage) continue;
      const u = m.usage;
      t.context = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      if (m.model) s.model = s.model || m.model;
      // one API message is split over several transcript lines: count it once
      if (m.id && cur.seen.has(m.id)) continue;
      if (m.id) cur.seen.add(m.id);
      t.output += u.output_tokens || 0;
    } else {
      if (line.indexOf('"token_count"') < 0) continue;
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const p = o && o.payload;
      if (!p || p.type !== 'token_count') continue;
      if (p.info) {
        if (p.info.last_token_usage) t.context = p.info.last_token_usage.input_tokens || 0;
        if (p.info.model_context_window) t.contextWindow = p.info.model_context_window;
        if (p.info.total_token_usage) {
          t.output = p.info.total_token_usage.output_tokens || 0;
          t.total = p.info.total_token_usage.total_tokens || null;
        }
      }
      const prim = p.rate_limits && p.rate_limits.primary;
      const ts = Date.parse(o.timestamp) || Date.now();
      if (prim && ts >= codexLimits.at) {
        codexLimits.usedPercent = prim.used_percent;
        codexLimits.windowMinutes = prim.window_minutes;
        codexLimits.resetsAt = prim.resets_at ? prim.resets_at * 1000 : null;
        codexLimits.at = ts;
      }
    }
  }
  if (s.client === 'claude' && !t.contextWindow) {
    t.contextWindow = /\[1m\]|1m/i.test(s.model || '') ? 1000000 : 200000;
  }
}

// ---------------------------------------------------------------- events tail

const fileCursors = new Map(); // file -> { offset, partial }

function readEventsFile(file) {
  let cur = fileCursors.get(file);
  if (!cur) { cur = { offset: 0, partial: '' }; fileCursors.set(file, cur); }
  let size;
  try { size = fs.statSync(file).size; } catch (e) { return 0; }
  if (size <= cur.offset) return 0;
  const buf = Buffer.alloc(size - cur.offset);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buf, 0, buf.length, cur.offset); } finally { fs.closeSync(fd); }
  cur.offset = size;
  const parts = (cur.partial + buf.toString('utf8')).split('\n');
  cur.partial = parts.pop();
  let n = 0;
  for (const line of parts) {
    if (!line.trim()) continue;
    try { applyEvent(JSON.parse(line)); n++; } catch (e) {}
  }
  return n;
}

function eventFilesForDays(days) {
  const out = [];
  for (let d = days - 1; d >= 0; d--) {
    out.push(path.join(DATA_DIR, 'events-' + localDay(new Date(Date.now() - d * 86400000)) + '.jsonl'));
  }
  return out;
}

function cleanupOld() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 86400000;
    for (const n of fs.readdirSync(DATA_DIR)) {
      if (!/^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)) continue;
      const f = path.join(DATA_DIR, n);
      if (fs.statSync(f).mtimeMs < cutoff) fs.unlinkSync(f);
    }
  } catch (e) {}
}

// ---------------------------------------------------------------- snapshot

function effectiveStatus(s, now) {
  if ((s.status === 'working' || s.status === 'waiting') && now - s.lastSeen > STALE_MS) return 'stale';
  return s.status;
}

function serialize(s, now) {
  return {
    key: s.key,
    client: s.client,
    session: s.session,
    agent: s.agent,
    agentType: s.agentType,
    parentKey: s.parentKey,
    project: s.project,
    cwd: s.cwd,
    model: s.model,
    status: effectiveStatus(s, now),
    statusSince: s.statusSince,
    firstSeen: s.firstSeen,
    lastSeen: s.lastSeen,
    turnStart: s.turnStart,
    turns: s.turns,
    prompt: s.prompt,
    reply: s.reply,
    waitingFor: s.waitingFor,
    current: s.current,
    inflight: s.inflight.size,
    toolCount: s.toolCount,
    failCount: s.failCount,
    files: [...s.files.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([f, ts]) => ({ path: f, ts })),
    timeline: s.timeline,
    intervals: s.intervals.slice(-200),
    tokens: s.tokens,
    test: s.test,
    git: s.git,
    finishedAt: s.finishedAt,
  };
}

function normPath(p, cwd) {
  const P = pathFor(cwd || p);
  let f = String(p || '');
  if (!P.isAbsolute(f) && cwd) f = P.join(cwd, f);
  return P.normalize(f).toLowerCase();
}

function conflicts(now) {
  // a file edited in the last hour by two or more sessions that are still alive
  const byFile = new Map();
  for (const s of sessions.values()) {
    const st = effectiveStatus(s, now);
    if (st === 'ended') continue;
    const owner = s.parentKey || s.key;
    for (const [f, ts] of s.files) {
      if (now - ts > CONFLICT_WINDOW_MS) continue;
      const k = normPath(f, s.cwd);
      if (!byFile.has(k)) byFile.set(k, { path: f, owners: new Map() });
      const e = byFile.get(k);
      e.owners.set(owner, Math.max(e.owners.get(owner) || 0, ts));
    }
  }
  const out = [];
  for (const e of byFile.values()) {
    if (e.owners.size < 2) continue;
    out.push({ path: e.path, sessions: [...e.owners.entries()].map(([key, ts]) => ({ key, ts })) });
  }
  return out;
}

function snapshot() {
  const now = Date.now();
  const cfg = config.load();
  return {
    now: now,
    host: HOST_LABEL,
    sessions: [...sessions.values()].map(s => serialize(s, now)),
    conflicts: conflicts(now),
    codexLimits: codexLimits.usedPercent == null ? null : codexLimits,
    claudeLimits: liveClaudeLimits(now),
    settings: { longRunningMinutes: cfg.longRunningMinutes, idleToBreakRoomMinutes: cfg.idleToBreakRoomMinutes },
    phone: notifier.channels(cfg),
  };
}

// ---------------------------------------------------------------- phone notifications

const sent = new Map(); // "<kind>:<key>" -> the moment it refers to (status start, turn start)

function notifyName(s) {
  const top = s.parentKey ? sessions.get(s.parentKey) : s;
  const name = { claude: 'Claude', codex: 'Codex' }[s.client] || (s.client.charAt(0).toUpperCase() + s.client.slice(1));
  return name + (s.agentType ? ' (' + s.agentType + ')' : '') + ' · ' + (top ? top.project : '');
}

function once(kind, s, moment, info) {
  const k = kind + ':' + s.key;
  if (sent.get(k) === moment) return;
  sent.set(k, moment);
  notifier.send(kind, Object.assign({ who: notifyName(s) }, info)).catch(() => {});
}

// Called every second. Only moments after the server started count, so replaying
// old events on start never fires a burst of stale notifications.
function checkNotifications() {
  const cfg = config.load();
  const ch = notifier.channels(cfg);
  if (!ch.ntfy && !ch.telegram) return;
  const on = cfg.notify.events || {};
  const now = Date.now();
  if (on.limit) checkLimits(cfg, now);
  for (const s of sessions.values()) {
    const st = effectiveStatus(s, now);
    if (on.waiting && st === 'waiting' && s.statusSince > startedAt && now - s.statusSince >= (cfg.notify.waitingDelaySeconds || 0) * 1000) {
      once('waiting', s, s.statusSince, { detail: s.waitingFor });
    }
    if (s.parentKey) continue;
    if (on.finished && s.finishedAt && s.finishedAt > startedAt) {
      once('finished', s, s.finishedAt, { detail: s.reply });
    }
    const longMs = (cfg.longRunningMinutes || 0) * 60000;
    if (on.longRunning && longMs && st === 'working' && s.turnStart && s.turnStart > startedAt - longMs && now - s.turnStart >= longMs) {
      once('longRunning', s, s.turnStart, { min: Math.round((now - s.turnStart) / 60000), detail: s.prompt });
    }
    if (on.stale && st === 'stale' && s.lastSeen > startedAt - STALE_MS) {
      once('stale', s, s.lastSeen, { min: Math.round((now - s.lastSeen) / 60000), detail: s.prompt });
    }
  }
}

// limit alerts already sent, kept on disk so a restart does not repeat them
let limitAlertsCache = null;
function limitAlerts() {
  if (!limitAlertsCache) { try { limitAlertsCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'limit-alerts.json'), 'utf8')); } catch (e) { limitAlertsCache = {}; } }
  return limitAlertsCache;
}

// once per limit window: the first time it passes notify.limitPercent
function checkLimits(cfg, now) {
  const threshold = cfg.notify.limitPercent || 80;
  const when = ts => (ts ? new Date(ts).toLocaleString(cfg.language === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '?');
  const windows = [];
  const cl = liveClaudeLimits(now);
  if (cl && cl.fiveHour) windows.push(['Claude 5h', cl.fiveHour]);
  if (cl && cl.sevenDay) windows.push(['Claude 7d', cl.sevenDay]);
  if (codexLimits.usedPercent != null) windows.push(['Codex', { usedPercent: codexLimits.usedPercent, resetsAt: codexLimits.resetsAt }]);
  for (const [who, w] of windows) {
    if (w.usedPercent < threshold) continue;
    const k = 'limit:' + who;
    const moment = w.resetsAt || 0;
    const done = limitAlerts();
    if (done[k] === moment) continue;
    done[k] = moment;
    try { fs.writeFileSync(path.join(DATA_DIR, 'limit-alerts.json'), JSON.stringify(done)); } catch (e) {}
    notifier.send('limit', { who, pct: Math.round(w.usedPercent), when: when(w.resetsAt) }).catch(() => {});
  }
}

// ---------------------------------------------------------------- report

let reportCache = { key: '', at: 0, data: null };

function reportFor(days) {
  const cfg = config.load();
  const key = days + ':' + JSON.stringify(cfg.prices || {});
  if (reportCache.key === key && Date.now() - reportCache.at < 15000) return reportCache.data;
  const data = report.build({ dataDir: DATA_DIR, days, prices: cfg.prices, localFile, findCodexRollout });
  data.models = data.models.filter(m => m.model !== '<synthetic>');
  data.pricesConfigured = Object.keys(cfg.prices || {}).some(k => !/^example/.test(k));
  reportCache = { key, at: Date.now(), data };
  return data;
}

// ---------------------------------------------------------------- http

const clients = new Set();
let pushTimer = null;

function schedulePush() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const payload = 'event: state\ndata: ' + JSON.stringify(snapshot()) + '\n\n';
    for (const res of clients) { try { res.write(payload); } catch (e) {} }
  }, 250);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(snapshot()));
  }
  if (url.pathname === '/api/report') {
    let body;
    try { body = JSON.stringify(reportFor(Number(url.searchParams.get('days')) || 7)); }
    catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    res.write('event: state\ndata: ' + JSON.stringify(snapshot()) + '\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
});

// ---------------------------------------------------------------- main

function tick() {
  let changed = readClaudeLimits() ? 1 : 0;
  for (const f of eventFilesForDays(2)) changed += readEventsFile(f);
  if (changed) {
    for (const s of sessions.values()) if (Date.now() - s.lastSeen < 5000) { try { updateTokens(s); } catch (e) {} }
    schedulePush();
  }
}

function tokenSweep() {
  const now = Date.now();
  let any = false;
  for (const s of sessions.values()) {
    const st = effectiveStatus(s, now);
    if (st === 'working' || st === 'waiting') { try { updateTokens(s); any = true; } catch (e) {} }
  }
  if (any) schedulePush();
}

function start() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  cleanupOld();
  for (const f of eventFilesForDays(REPLAY_DAYS)) readEventsFile(f);
  for (const s of sessions.values()) { try { updateTokens(s); } catch (e) {} }
  startedAt = Date.now();

  setInterval(tick, 1000);
  setInterval(checkNotifications, 1000);
  setInterval(tokenSweep, 10000);
  setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch (e) {} } }, 25000);
  // keep "X min ago", stale and long-running states moving even when no event arrives
  setInterval(schedulePush, 15000);

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.log('Agent Monitor is already running at http://localhost:' + PORT);
      process.exit(0);
    }
    throw err;
  });
  server.listen(PORT, HOST, () => {
    const ch = notifier.channels(config.load());
    const phone = Object.keys(ch).filter(k => ch[k]);
    console.log('Agent Monitor: http://localhost:' + PORT + '  (' + sessions.size + ' sessions loaded' + (phone.length ? ', notifications: ' + phone.join(' + ') : '') + ')');
  });
}

// for the tests: rebuild state from scratch
function reset() { sessions.clear(); fileCursors.clear(); }

if (require.main === module) start();

module.exports = { start, applyEvent, snapshot, reset, sessions, localFile, effectiveStatus };
