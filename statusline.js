#!/usr/bin/env node
/**
 * Claude Code status line for Agent Monitor.
 *
 * Claude Code hands its status line the subscription usage (rate_limits: the
 * 5-hour and weekly windows, Pro/Max plans only) which it writes nowhere else.
 * This script saves that to data/claude-limits.json for the dashboard and
 * prints a short line for Claude Code's footer:
 *
 *   5h 23% · week 41% · ctx 38%
 *
 * Installed with `node install.js --statusline`. Runs locally and costs no
 * tokens. Never fails: on any error it still prints a line and exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.AGENT_MONITOR_DATA || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'claude-limits.json');

function language() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'config.json'), 'utf8')).language === 'pt' ? 'pt' : 'en'; } catch (e) { return 'en'; }
}

const round = n => Math.round(Number(n) || 0);

function windowOf(w) {
  if (!w || typeof w.used_percentage !== 'number') return null;
  return { usedPercent: w.used_percentage, resetsAt: typeof w.resets_at === 'number' ? w.resets_at * 1000 : null };
}

// Keep the newest reading. Several sessions run this at once; a write goes to
// a temp file first and is renamed, so the server never reads half a file.
function save(limits) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(limits));
  fs.renameSync(tmp, FILE);
}

function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') || {}; } catch (e) {}

  // heartbeat: tells the dashboard (and you) that Claude Code runs the status line at all,
  // which separates "not supported here" from "supported, but no plan limits sent"
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'statusline-seen.json'), JSON.stringify({ at: Date.now(), limits: !!input.rate_limits, version: input.version || null }));
  } catch (e) {}

  const rl = input.rate_limits || {};
  const limits = {
    at: Date.now(),
    fiveHour: windowOf(rl.five_hour),
    sevenDay: windowOf(rl.seven_day),
    spend: windowOf(rl.spend_limit),
  };
  if (limits.fiveHour || limits.sevenDay || limits.spend) {
    if (rl.spend_limit && typeof rl.spend_limit.used_usd === 'number') {
      limits.spend.usedUsd = rl.spend_limit.used_usd;
      limits.spend.limitUsd = rl.spend_limit.limit_usd;
    }
    try { save(limits); } catch (e) { /* the footer still works */ }
  }

  const pt = language() === 'pt';
  const parts = [];
  if (limits.fiveHour) parts.push('5h ' + round(limits.fiveHour.usedPercent) + '%');
  if (limits.sevenDay) parts.push((pt ? 'semana ' : 'week ') + round(limits.sevenDay.usedPercent) + '%');
  if (limits.spend) parts.push((pt ? 'gasto ' : 'spend ') + round(limits.spend.usedPercent) + '%');
  const ctx = input.context_window && input.context_window.used_percentage;
  if (typeof ctx === 'number') parts.push((pt ? 'contexto ' : 'ctx ') + round(ctx) + '%');
  process.stdout.write(parts.join(' · ') || (input.model && input.model.display_name) || 'Agent Monitor');
}

try { main(); } catch (e) { process.stdout.write('Agent Monitor'); }
