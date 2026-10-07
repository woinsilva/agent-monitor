'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const report = require('../lib/report.js');

const MIN = 60000;
const day = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function dataDir(events) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-report-'));
  const byDay = {};
  for (const e of events) (byDay[day(new Date(e.ts))] = byDay[day(new Date(e.ts))] || []).push(JSON.stringify(e));
  for (const [d, lines] of Object.entries(byDay)) fs.writeFileSync(path.join(dir, 'events-' + d + '.jsonl'), lines.join('\n') + '\n');
  return dir;
}

// fixed noon today so nothing crosses midnight
const noon = new Date(); noon.setHours(12, 0, 0, 0);
const T = m => noon.getTime() + m * MIN;
const base = { cwd: '/code/app' };

test('counts work, waiting, prompts, tools, failures and tests', () => {
  const dir = dataDir([
    Object.assign({ ts: T(0), client: 'claude', session: 'a', event: 'UserPromptSubmit', prompt: 'x' }, base),
    Object.assign({ ts: T(5), client: 'claude', session: 'a', event: 'PermissionRequest', tool: 'Bash' }, base),
    Object.assign({ ts: T(8), client: 'claude', session: 'a', event: 'PostToolUse', tool: 'Bash', kind: 'command', summary: 'npm test', test: true, testResult: 'pass' }, base),
    Object.assign({ ts: T(9), client: 'claude', session: 'a', event: 'PostToolUseFailure', tool: 'Bash', kind: 'command', summary: 'npm run lint', failed: true }, base),
    Object.assign({ ts: T(10), client: 'claude', session: 'a', event: 'PostToolUse', tool: 'Edit', kind: 'edit', files: ['/code/app/src/x.ts'] }, base),
    Object.assign({ ts: T(12), client: 'claude', session: 'a', event: 'Stop' }, base),
    Object.assign({ ts: T(0), client: 'codex', session: 'b', event: 'UserPromptSubmit' }, base),
    Object.assign({ ts: T(6), client: 'codex', session: 'b', event: 'Stop' }, base),
  ]);
  const r = report.build({ dataDir: dir, days: 1, prices: {}, now: T(60) });
  assert.equal(Math.round(r.days[0].hours.claude / MIN), 12);
  assert.equal(Math.round(r.days[0].hours.codex / MIN), 6);
  assert.equal(Math.round(r.totals.waiting / MIN), 3);
  assert.equal(r.totals.prompts, 2);
  assert.equal(r.totals.tools, 3);
  assert.equal(r.totals.failures, 1);
  assert.equal(r.totals.testsPass, 1);
  assert.deepEqual(r.failing, [{ command: 'npm run lint', count: 1 }]);
  assert.equal(r.files[0].file, 'src/x.ts');
  assert.equal(r.projects[0].project, 'app');
});

test('a long silence is not counted as work, but a long-running tool is', () => {
  const dir = dataDir([
    Object.assign({ ts: T(0), client: 'claude', session: 'idle', event: 'UserPromptSubmit' }, base),
    Object.assign({ ts: T(1), client: 'claude', session: 'idle', event: 'PostToolUse', tool: 'Read', kind: 'read' }, base),
    Object.assign({ ts: T(90), client: 'claude', session: 'idle', event: 'Stop' }, base),
    Object.assign({ ts: T(0), client: 'codex', session: 'build', event: 'UserPromptSubmit' }, base),
    Object.assign({ ts: T(1), client: 'codex', session: 'build', event: 'PreToolUse', tool: 'shell', kind: 'command' }, base),
    Object.assign({ ts: T(45), client: 'codex', session: 'build', event: 'PostToolUse', tool: 'shell', kind: 'command' }, base),
    Object.assign({ ts: T(46), client: 'codex', session: 'build', event: 'Stop' }, base),
  ]);
  const r = report.build({ dataDir: dir, days: 1, prices: {}, now: T(120) });
  assert.equal(Math.round(r.days[0].hours.claude / MIN), 1);   // cut where activity stopped
  assert.equal(Math.round(r.days[0].hours.codex / MIN), 46);   // the 44-minute build counts
});

test('prices by longest model prefix', () => {
  const prices = { 'model-a': { input: 1, output: 10 }, 'model-a-large': { input: 2, output: 20 } };
  assert.equal(report.priceFor(prices, 'model-a-large-2026').input, 2);
  assert.equal(report.priceFor(prices, 'model-a-small').input, 1);
  assert.equal(report.priceFor(prices, 'other'), null);
  const c = report.costOf({ 'model-a-small': { input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 } }, prices);
  assert.equal(c.cost, 11);
});

test('report.js CLI writes events any script can use', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-cli-'));
  const run = args => execFileSync(process.execPath, [path.join(__dirname, '..', 'report.js'), ...args], { env: Object.assign({}, process.env, { AGENT_MONITOR_DATA: dir }) });
  run(['start', '--client', 'Reviewer', '--session', 'r1', '--prompt', 'review']);
  run(['stop', '--client', 'reviewer', '--session', 'r1', '--reply', '3 findings', '--input-tokens', '100', '--output-tokens', '20']);
  const lines = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines[0].client, 'reviewer');
  assert.equal(lines[0].event, 'UserPromptSubmit');
  assert.deepEqual(lines[1].usage, { input_tokens: 100, output_tokens: 20, total_tokens: 120 });
});
