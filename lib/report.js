'use strict';
/**
 * Daily / weekly report from the event files: hours each agent worked, time
 * spent waiting for you, prompts, tool calls, failures, tests, most edited
 * files, failing commands, and token use (cost when prices are configured).
 *
 * Work time is the span between a prompt (or subagent start) and the end of
 * that turn; a silence longer than STALE_MS inside a turn is not counted.
 * Waiting time runs from a permission request until the agent moves again.
 */

const fs = require('fs');
const path = require('path');

const STALE_MS = 20 * 60 * 1000;
const TAIL_GRACE_MS = 60 * 1000;

const localDay = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const isWin = p => /^[A-Za-z]:[\\/]|\\/.test(String(p || ''));
const baseName = p => (isWin(p) ? path.win32 : path).basename(String(p || '')) || '?';
const group = c => (c === 'claude' || c === 'codex' ? c : 'other');

// "C:\code\app\src\x.ts" with cwd "C:\code\app" -> "src/x.ts"; relative paths stay as they are
function relativeTo(file, cwd) {
  const f = String(file || '').replace(/\\/g, '/');
  const c = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (c && f.toLowerCase().startsWith(c.toLowerCase() + '/')) return f.slice(c.length + 1);
  return f.replace(/^\.\//, '');
}

function readEvents(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) {}
  }
  return out.sort((a, b) => a.ts - b.ts);
}

// ------------------------------------------------------------ tokens per transcript

const tokenCache = new Map(); // file -> { size, result }

function transcriptTotals(file, client) {
  let size;
  try { size = fs.statSync(file).size; } catch (e) { return null; }
  const hit = tokenCache.get(file);
  if (hit && hit.size === size) return hit.result;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  const byModel = {};
  const add = (model, k, n) => {
    const m = byModel[model] || (byModel[model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    m[k] += n || 0;
  };
  if (client === 'claude') {
    const seen = new Set();
    for (const line of text.split('\n')) {
      if (line.indexOf('"usage"') < 0) continue;
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o && o.type === 'assistant' && o.message;
      if (!m || !m.usage) continue;
      if (m.id) { if (seen.has(m.id)) continue; seen.add(m.id); }
      const u = m.usage, model = m.model || '?';
      add(model, 'input', u.input_tokens); add(model, 'output', u.output_tokens);
      add(model, 'cacheRead', u.cache_read_input_tokens); add(model, 'cacheWrite', u.cache_creation_input_tokens);
    }
  } else {
    // Codex: the last cumulative token_count of the rollout
    let last = null, model = '?';
    for (const line of text.split('\n')) {
      if (line.indexOf('"turn_context"') >= 0) { try { const o = JSON.parse(line); if (o.payload && o.payload.model) model = o.payload.model; } catch (e) {} }
      if (line.indexOf('"token_count"') < 0) continue;
      try { const o = JSON.parse(line); if (o.payload && o.payload.info && o.payload.info.total_token_usage) last = o.payload.info.total_token_usage; } catch (e) {}
    }
    if (last) {
      const cached = last.cached_input_tokens || 0;
      add(model, 'input', Math.max(0, (last.input_tokens || 0) - cached));
      add(model, 'cacheRead', cached);
      add(model, 'output', last.output_tokens || 0);
    }
  }
  tokenCache.set(file, { size, result: byModel });
  return byModel;
}

// prices: { "<model id prefix>": { input, output, cacheRead, cacheWrite } } in USD per million tokens
function priceFor(prices, model) {
  let best = null;
  for (const prefix of Object.keys(prices || {})) {
    if (String(model).toLowerCase().startsWith(prefix.toLowerCase()) && (!best || prefix.length > best.length)) best = prefix;
  }
  return best ? prices[best] : null;
}

function costOf(byModel, prices) {
  let cost = 0, priced = 0, unpriced = 0;
  for (const [model, u] of Object.entries(byModel)) {
    const total = u.input + u.output + u.cacheRead + u.cacheWrite;
    const p = priceFor(prices, model);
    if (!p) { unpriced += total; continue; }
    priced += total;
    cost += (u.input * (p.input || 0) + u.output * (p.output || 0) + u.cacheRead * (p.cacheRead || 0) + u.cacheWrite * (p.cacheWrite || 0)) / 1e6;
  }
  return { cost, priced, unpriced };
}

// ------------------------------------------------------------ report

function build({ dataDir, days, prices, localFile, findCodexRollout, now }) {
  const nowTs = now || Date.now();
  const n = Math.max(1, Math.min(31, days || 7));
  const dayList = [];
  for (let i = n - 1; i >= 0; i--) dayList.push(localDay(new Date(nowTs - i * 86400000)));

  const perDay = Object.fromEntries(dayList.map(d => [d, { day: d, hours: { claude: 0, codex: 0, other: 0 }, waiting: 0, prompts: 0, tools: 0, failures: 0, testsPass: 0, testsFail: 0 }]));
  const projects = new Map();
  const files = new Map();
  const failing = new Map();
  const transcripts = new Map(); // file -> { client, project }

  const proj = name => {
    if (!projects.has(name)) projects.set(name, { project: name, hours: 0, waiting: 0, prompts: 0, tools: 0, failures: 0, sessions: new Set(), tokens: 0, cost: 0 });
    return projects.get(name);
  };

  for (const day of dayList) {
    const D = perDay[day];
    const open = new Map(); // worker key -> { start, last, waitStart, client, project }
    const close = (w, end) => {
      const span = Math.max(0, end - w.start);
      D.hours[group(w.client)] += span;
      proj(w.project).hours += span;
      if (w.waitStart != null) { const wt = Math.max(0, end - w.waitStart); D.waiting += wt; proj(w.project).waiting += wt; }
    };

    for (const ev of readEvents(path.join(dataDir, 'events-' + day + '.jsonl'))) {
      if (!ev || !ev.client || !ev.ts) continue;
      const project = baseName(ev.cwd);
      const key = ev.client + ':' + ev.session + (ev.agent ? '/' + ev.agent : '');
      const P = proj(project);
      P.sessions.add(ev.client + ':' + ev.session);
      if (ev.transcript && !ev.agent) transcripts.set(ev.transcript, { client: ev.client, project });
      if (ev.client === 'codex' && !ev.agent && findCodexRollout && !ev.transcript) {
        const f = findCodexRollout(ev.session);
        if (f) transcripts.set(f, { client: 'codex', project });
      }
      if (ev.usage && ev.event === 'Stop') {
        // agents reported through report.js: usage per call, no transcript
        const u = ev.usage, model = ev.model || ev.client;
        const t = { [model]: { input: u.input_tokens || u.prompt_tokens || 0, output: u.output_tokens || u.completion_tokens || 0, cacheRead: 0, cacheWrite: 0 } };
        transcripts.set('usage:' + key + ':' + ev.ts, { client: ev.client, project, inline: t });
      }

      let w = open.get(key);
      // a long silence inside a turn is not work: close it where the activity stopped.
      // While a tool is running (a build, a test suite) the silence is execution time.
      if (w && ev.ts - w.last > STALE_MS && w.waitStart == null && !w.inflight) { close(w, w.last); open.delete(key); w = null; }
      const starts = ev.event === 'UserPromptSubmit' || ev.event === 'SubagentStart';
      if (starts) {
        if (w) close(w, w.last);
        w = { start: ev.ts, last: ev.ts, waitStart: null, inflight: 0, client: ev.client, project };
        open.set(key, w);
        if (ev.event === 'UserPromptSubmit' && !ev.agent) { D.prompts++; P.prompts++; }
      } else if (!w && (ev.event === 'PreToolUse' || ev.event === 'PostToolUse')) {
        // activity without a seen start (hooks installed mid-turn, file rolled over at midnight)
        w = { start: ev.ts, last: ev.ts, waitStart: null, inflight: 0, client: ev.client, project };
        open.set(key, w);
      }
      if (w) {
        if (w.waitStart != null && ev.event !== 'PermissionRequest' && ev.event !== 'Notification') {
          const wt = Math.max(0, ev.ts - w.waitStart); D.waiting += wt; P.waiting += wt; w.waitStart = null;
        }
        if (ev.event === 'PermissionRequest' || (ev.event === 'Notification' && w)) { if (w.waitStart == null) w.waitStart = ev.ts; }
        if (ev.event === 'PreToolUse') w.inflight++;
        if ((ev.event === 'PostToolUse' || ev.event === 'PostToolUseFailure') && w.inflight > 0) w.inflight--;
        w.last = ev.ts;
      }

      if (ev.event === 'PostToolUse' || ev.event === 'PostToolUseFailure') {
        D.tools++; P.tools++;
        if (ev.failed || ev.event === 'PostToolUseFailure') {
          D.failures++; P.failures++;
          if (ev.kind === 'command' && ev.summary) failing.set(ev.summary, (failing.get(ev.summary) || 0) + 1);
        }
        if (ev.testResult === 'pass') D.testsPass++;
        if (ev.testResult === 'fail') D.testsFail++;
        if (ev.kind === 'edit') for (const f of ev.files || []) {
          const rel = relativeTo(f, ev.cwd);
          const k = project + '|' + rel.toLowerCase();
          const e = files.get(k) || { project, file: rel, edits: 0 };
          e.edits++; files.set(k, e);
        }
      }
      if (w && (ev.event === 'Stop' || ev.event === 'SubagentStop' || ev.event === 'SessionEnd')) {
        close(w, ev.ts); open.delete(key);
        if (ev.event === 'SessionEnd') for (const [k2, w2] of open) if (k2.startsWith(key + '/')) { close(w2, ev.ts); open.delete(k2); }
      }
    }
    // turns still open at the end of the file: count up to the last activity (or now, if live)
    for (const w of open.values()) {
      const end = day === localDay(new Date(nowTs)) && nowTs - w.last < STALE_MS ? nowTs : w.last + TAIL_GRACE_MS;
      close(w, end);
    }
  }

  // tokens and cost per project
  const byModel = {};
  for (const [file, info] of transcripts) {
    const t = info.inline || transcriptTotals(localFile ? localFile(file) : file, info.client);
    if (!t) continue;
    const c = costOf(t, prices);
    const P = proj(info.project);
    for (const [model, u] of Object.entries(t)) {
      const m = byModel[model] || (byModel[model] = { model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      m.input += u.input; m.output += u.output; m.cacheRead += u.cacheRead; m.cacheWrite += u.cacheWrite;
      P.tokens += u.input + u.output + u.cacheRead + u.cacheWrite;
    }
    P.cost += c.cost;
  }
  const models = Object.values(byModel).map(m => Object.assign(m, costOf({ [m.model]: m }, prices))).sort((a, b) => (b.input + b.output + b.cacheRead) - (a.input + a.output + a.cacheRead));

  const daysOut = dayList.map(d => perDay[d]);
  const sum = k => daysOut.reduce((a, d) => a + d[k], 0);
  const hours = daysOut.reduce((a, d) => a + d.hours.claude + d.hours.codex + d.hours.other, 0);

  return {
    from: dayList[0], to: dayList[dayList.length - 1], days: daysOut,
    totals: {
      hours, waiting: sum('waiting'), prompts: sum('prompts'), tools: sum('tools'), failures: sum('failures'),
      testsPass: sum('testsPass'), testsFail: sum('testsFail'),
      tokens: models.reduce((a, m) => a + m.input + m.output + m.cacheRead + m.cacheWrite, 0),
      cost: models.reduce((a, m) => a + m.cost, 0),
      pricedTokens: models.reduce((a, m) => a + m.priced, 0),
      unpricedTokens: models.reduce((a, m) => a + m.unpriced, 0),
    },
    projects: [...projects.values()].filter(p => p.hours || p.prompts || p.tools).map(p => Object.assign(p, { sessions: p.sessions.size })).sort((a, b) => b.hours - a.hours),
    files: [...files.values()].sort((a, b) => b.edits - a.edits).slice(0, 12),
    failing: [...failing.entries()].map(([command, count]) => ({ command, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    models,
  };
}

module.exports = { build, transcriptTotals, priceFor, costOf };
