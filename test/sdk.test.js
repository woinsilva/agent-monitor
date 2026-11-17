'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createReporter } = require('../lib/sdk');
const { validateEvent } = require('../lib/events');

test('SDK emits validated lifecycle events without manual JSONL handling', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-sdk-'));
  let now = new Date(2026, 10, 17, 12).getTime();
  const reporter = createReporter({ client: 'My Agent', session: 'sdk-1', cwd: '.', dataDir, clock: () => now++ });
  reporter.start('inspect the project');
  reporter.beforeTool('Read', { kind: 'read' });
  reporter.afterTool('Read', { kind: 'read', files: ['README.md'] });
  reporter.stop('done');
  reporter.end();
  const file = fs.readdirSync(dataDir)[0];
  const events = fs.readFileSync(path.join(dataDir, file), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.event), ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd']);
  assert.equal(events.every(e => validateEvent(e).ok), true);
  assert.equal(events[0].client, 'my-agent');
});

test('SDK rejects unsupported events before writing', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-sdk-invalid-'));
  const reporter = createReporter({ client: 'external', dataDir });
  assert.throws(() => reporter.emit('MadeUpEvent'), /invalid event/);
  assert.deepEqual(fs.readdirSync(dataDir), []);
});
