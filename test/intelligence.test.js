'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const intelligence = require('../lib/intelligence');
const audit = require('../lib/audit');

const NOW = new Date(2026, 10, 17, 12).getTime();
const fileName = 'events-2026-11-17.jsonl';
function fixture(events) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-intel-'));
  fs.writeFileSync(path.join(dir, fileName), events.map(JSON.stringify).join('\n') + '\n');
  return dir;
}
const base = (event, extra = {}) => Object.assign({ schema: 1, ts: NOW, client: 'codex', session: 's1', cwd: '/code/app', event }, extra);

test('health analysis reports repeated prompts, consecutive failures and recurring tests with evidence', () => {
  const events = [
    base('UserPromptSubmit', { ts: NOW - 9, prompt: 'fix login 1' }),
    base('UserPromptSubmit', { ts: NOW - 8, prompt: 'fix login 2' }),
    base('UserPromptSubmit', { ts: NOW - 7, prompt: 'fix login 3' }),
    base('PostToolUseFailure', { ts: NOW - 6, tool: 'npm test', kind: 'command', summary: 'Assertion expected true', testResult: 'fail', failed: true }),
    base('PostToolUseFailure', { ts: NOW - 5, tool: 'npm test', kind: 'command', summary: 'Assertion expected true', testResult: 'fail', failed: true }),
  ];
  const result = intelligence.analyze({ dataDir: fixture(events), now: NOW, days: 1 });
  assert.deepEqual(new Set(result.findings.map(f => f.type)), new Set(['repeated_prompt', 'consecutive_failure', 'recurring_test_failure']));
  assert.equal(result.findings.every(f => f.autoFix === false && f.evidence.count >= 2), true);
  assert.match(result.findings.find(f => f.type === 'recurring_test_failure').probableCause, /asserted contract/);
});

test('audit replay filters incomplete sessions and aggregate export removes private text', () => {
  const events = [
    base('UserPromptSubmit', { session: 'open', prompt: 'private request' }),
    base('PostToolUseFailure', { session: 'open', summary: 'private failure', failed: true }),
    base('UserPromptSubmit', { session: 'closed', prompt: 'other private request' }),
    base('SessionEnd', { session: 'closed' }),
  ];
  const dataDir = fixture(events);
  const replay = audit.replay({ dataDir, days: 1, incomplete: true, now: NOW });
  assert.equal(replay.events.every(e => e.session === 'open'), true);
  assert.equal(JSON.stringify(replay).includes('private'), false);
  const exported = audit.aggregateExport({ dataDir, days: 1, now: NOW });
  assert.equal(exported.sessions.length, 2);
  assert.equal(JSON.stringify(exported).includes('request'), false);
  assert.match(exported.privacy, /Aggregated metadata/);
});

test('unrelated or interrupted tool failures are not called consecutive', () => {
  const events = [
    base('PostToolUseFailure', { ts: NOW - 6, tool: 'Bash', summary: 'grep found nothing', failed: true }),
    base('PostToolUseFailure', { ts: NOW - 5, tool: 'Bash', summary: 'npm test failed', failed: true }),
    base('PostToolUse', { ts: NOW - 4, tool: 'Bash', summary: 'command succeeded' }),
    base('PostToolUseFailure', { ts: NOW - 3, tool: 'Bash', summary: 'npm test failed', failed: true }),
  ];
  const result = intelligence.analyze({ dataDir: fixture(events), now: NOW, days: 1 });
  assert.equal(result.findings.some(f => f.type === 'consecutive_failure'), false);
});

test('incomplete session count ignores live parents and never lets children hide stale parents', () => {
  const events = [{ client: 'codex', session: 'stale-parent' }, { client: 'codex', session: 'live-parent' }];
  const live = [
    { client: 'codex', session: 'stale-parent', status: 'stale', parentKey: null },
    { client: 'codex', session: 'stale-parent', status: 'done', parentKey: 'codex:stale-parent' },
    { client: 'codex', session: 'live-parent', status: 'working', parentKey: null },
  ];
  assert.equal(audit.countIncompleteSessions(events, live), 1);
});
