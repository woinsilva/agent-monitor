'use strict';
/**
 * Settings from config/config.json (copy config/config.example.json to start).
 * Missing keys fall back to DEFAULTS; the file is re-read when it changes, so
 * edits apply without a restart.
 */

const fs = require('fs');
const path = require('path');

const FILE = process.env.AGENT_MONITOR_CONFIG || path.join(__dirname, '..', 'config', 'config.json');

const DEFAULTS = {
  language: 'en',
  longRunningMinutes: 30,
  idleToBreakRoomMinutes: 15,
  notify: {
    ntfy: { server: 'https://ntfy.sh', topic: '', token: '' },
    telegram: { botToken: '', chatId: '' },
    events: { waiting: true, finished: false, longRunning: true, stale: false },
    waitingDelaySeconds: 30,
    details: false,
  },
  prices: {},
};

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = Array.isArray(base) ? [] : Object.assign({}, base);
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

let cached = DEFAULTS, stamp = '', error = null;

function load() {
  let st = null;
  try { st = fs.statSync(FILE); } catch (e) { cached = DEFAULTS; stamp = ''; error = null; return cached; }
  const key = st.size + ':' + st.mtimeMs;
  if (key === stamp) return cached;
  stamp = key;
  try {
    const raw = fs.readFileSync(FILE, 'utf8').replace(/^﻿/, '');
    cached = merge(DEFAULTS, JSON.parse(raw));
    error = null;
  } catch (e) {
    error = 'config/config.json: ' + e.message;
    console.error(error);
  }
  return cached;
}

module.exports = { load, FILE, DEFAULTS, lastError: () => error };
