'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hookStatus, inspect } = require('../doctor.js');

test('reports absent configuration without claiming support', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-'));
  assert.deepEqual(hookStatus(path.join(dir, 'missing.json')), {
    configPresent: false, agentMonitorHooks: false,
  });
});

test('detects existing Agent Monitor hooks and never exposes settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({
    secret: 'DO_NOT_EXPOSE',
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node "/tmp/agent-monitor/hook.js" Stop --client claude' }] }] },
  }));
  const status = hookStatus(file);
  assert.equal(status.agentMonitorHooks, true);
  assert.equal(JSON.stringify(status).includes('DO_NOT_EXPOSE'), false);
});

test('configuration presence alone does not count as hook installation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-'));
  const file = path.join(dir, 'hooks.json');
  fs.writeFileSync(file, '{"hooks":{"Stop":[{"hooks":[{"command":"echo hello"}]}]}}');
  assert.equal(hookStatus(file).agentMonitorHooks, false);
});

test('inspects without creating files or claiming telemetry is verified', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-home-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-repo-'));
  const result = inspect({ home, repo });
  assert.equal(result.telemetry.deliveryVerified, false);
  assert.equal(result.integrations.claudeCode.agentMonitorHooks, false);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
});
