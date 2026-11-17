#!/usr/bin/env node
'use strict';
// Observability-only hook bridge for Cursor and Gemini CLI.
// Never grants/denies permissions and never sends any data to a remote service.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { EVENT_MAP, normalize } = require('./lib/adapters');

function main(argv = process.argv.slice(2)) {
  const [client, name] = argv;
  try {
    if (!EVENT_MAP[client] || !EVENT_MAP[client][name]) return;
    const input = fs.readFileSync(0, 'utf8');
    const value = JSON.parse(input.replace(/^\uFEFF/, '') || '{}');
    const normalized = normalize(client, name, value);
    if (!normalized) return;
    spawnSync(process.execPath, [path.join(__dirname, 'hook.js'), normalized.event, '--client', client], {
      input: JSON.stringify(normalized.payload),
      timeout: 7500,
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  } catch (_) {
    // Monitoring must never interrupt an AI coding session.
  } finally {
    // Gemini CLI requires valid JSON stdout. Cursor accepts an empty object.
    // Permission-sensitive Cursor hooks are NOT installed by default.
    // Never emit an affirmative permission decision from a monitoring hook.
    const response = client === 'cursor' && name === 'beforeSubmitPrompt' ? { continue: true } : {};
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

if (require.main === module) main();
module.exports = { EVENT_MAP, normalize, main };
