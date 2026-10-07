'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const run = (input, dir) => execFileSync(process.execPath, [path.join(__dirname, '..', 'statusline.js')], {
  input: JSON.stringify(input), env: Object.assign({}, process.env, { AGENT_MONITOR_DATA: dir }),
}).toString();

test('saves the plan limits and prints them with the context use', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-sl-'));
  const out = run({
    model: { display_name: 'Opus' },
    context_window: { used_percentage: 37.6 },
    rate_limits: { five_hour: { used_percentage: 23.5, resets_at: 1900000000 }, seven_day: { used_percentage: 41.2, resets_at: 1900500000 } },
  }, dir);
  assert.match(out, /5h 24%/);
  assert.match(out, /(week|semana) 41%/);
  assert.match(out, /(ctx|contexto) 38%/);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'claude-limits.json'), 'utf8'));
  assert.equal(saved.fiveHour.usedPercent, 23.5);
  assert.equal(saved.sevenDay.resetsAt, 1900500000 * 1000);
});

test('without plan limits it writes nothing and still prints a line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-sl-'));
  assert.equal(run({ model: { display_name: 'Sonnet' } }, dir), 'Sonnet');
  assert.ok(!fs.existsSync(path.join(dir, 'claude-limits.json')));
});

test('never fails on garbage input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-sl-'));
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'statusline.js')], {
    input: 'not json', env: Object.assign({}, process.env, { AGENT_MONITOR_DATA: dir }),
  }).toString();
  assert.equal(out, 'Agent Monitor');
});
