'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hookStatus, binaryStatus, recentDelivery, inspect } = require('../doctor.js');

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

test('project-scoped Cursor configuration appears in diagnostics', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-project-'));
  const configDir = path.join(project, '.cursor');
  fs.mkdirSync(configDir);
  fs.writeFileSync(path.join(configDir, 'hooks.json'), JSON.stringify({
    version: 1, hooks: { postToolUse: [{ command: 'node "/tmp/agent-monitor/agent-bridge.js" cursor postToolUse' }] },
  }));
  const results = inspect({ home, project });
  assert.equal(results.projectIntegrations.cursor.agentMonitorHooks, true);
  assert.equal(results.integrations.cursor.agentMonitorHooks, false);
});

test('detects binary versions with fixed arguments', () => {
  const status = binaryStatus('gemini', { spawnSync(command, args, options) {
    assert.equal(command, 'gemini');
    assert.deepEqual(args, ['--version']);
    assert.equal(options.windowsHide, true);
    return { status: 0, stdout: '0.68.0\n' };
  } });
  assert.deepEqual(status, { installed: true, version: '0.68.0' });
});

test('recent delivery reports client timestamps but not event contents', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-data-'));
  const now = Date.now();
  const name = 'events-2026-11-17.jsonl';
  fs.writeFileSync(path.join(data, name), JSON.stringify({ client: 'gemini', ts: now, prompt: 'secret' }) + '\n');
  assert.deepEqual(recentDelivery([name], data, now), { gemini: now });
});

test('recent delivery can be scoped to a project and its subdirectories', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-scope-'));
  const now = Date.now();
  const name = 'events-2026-11-17.jsonl';
  fs.writeFileSync(path.join(data, name), [
    { client: 'cursor', ts: now - 1, cwd: 'C:\\repo\\app' },
    { client: 'gemini', ts: now, cwd: 'C:\\other' },
  ].map(JSON.stringify).join('\n') + '\n');
  assert.deepEqual(recentDelivery([name], data, now, 'c:/repo'), { cursor: now - 1 });
});

test('POSIX project matching preserves case while Windows drive paths do not', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-case-'));
  const now = Date.now();
  const name = 'events-2026-11-17.jsonl';
  fs.writeFileSync(path.join(data, name), [
    { client: 'cursor', ts: now - 1, cwd: '/work/App' },
    { client: 'gemini', ts: now, cwd: 'C:\\Work\\App' },
  ].map(JSON.stringify).join('\n') + '\n');
  assert.deepEqual(recentDelivery([name], data, now, '/work/app'), {});
  assert.deepEqual(recentDelivery([name], data, now, 'c:/work/app'), { gemini: now });
});
