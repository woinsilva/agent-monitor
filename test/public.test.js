'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const office = fs.readFileSync(path.join(__dirname, '..', 'public', 'office.js'), 'utf8');

test('browser smoke contract exposes views, clients and accessibility controls', () => {
  for (const value of ['office', 'panel', 'report']) assert.match(html, new RegExp('data-v="' + value + '"'));
  for (const client of ['all', 'claude', 'codex']) assert.match(html, new RegExp("'" + client + "'"));
  assert.match(html, /new Set\(all\.map\(s => s\.client\)\)/);
  assert.match(html, /id="showOld"/);
  assert.match(html, /id="projectSel"/);
  assert.match(html, /aria-label=/);
  assert.match(html, /query\.get\('view'\)/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /role="button" tabindex="0"/);
  assert.match(html, /\/api\/intelligence/);
  assert.match(html, /\/api\/export/);
});

test('office renderer keeps dedicated runtime rooms and conflict affordances', () => {
  for (const room of ['claude', 'codex', 'gemini', 'cursor']) assert.match(office, new RegExp(room));
  assert.match(office, /class="oconf"/);
  assert.match(office, /setAttribute\('aria-label'/);
  assert.match(office, /e\.key === 'Enter'/);
  assert.doesNotMatch(html, /stroke-dasharray="[^"]+"[^>]*class="conflict/);
});

test('limit UI is scoped by selected client and distinguishes windows', () => {
  assert.match(html, /codexLimits/);
  assert.match(html, /fiveHour/);
  assert.match(html, /weekly/);
  assert.match(html, /sevenDay/);
});

test('audit card counts distinct incomplete sessions and excludes live sessions', () => {
  assert.match(html, /incomplete\.sessionCount/);
  assert.doesNotMatch(html, /\$\{incomplete\.events\.length\}.*r_incomplete/);
});
