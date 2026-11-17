'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../lib/adapters');
const configure = require('../configure-agent');
const aider = require('../integrations/aider');

test('Copilot documented camelCase lifecycle and tool payloads normalize safely', () => {
  const start = normalize('copilot', 'sessionStart', { sessionId: 'copilot-1', cwd: 'C:/repo', source: 'startup' });
  const prompt = normalize('copilot', 'userPromptSubmitted', { sessionId: 'copilot-1', cwd: 'C:/repo', prompt: 'inspect' });
  const tool = normalize('copilot', 'postToolUse', { sessionId: 'copilot-1', cwd: 'C:/repo', toolName: 'bash', toolArgs: { command: 'npm test' } });
  const fail = normalize('copilot', 'postToolUseFailure', { sessionId: 'copilot-1', cwd: 'C:/repo', toolName: 'bash', error: 'failed' });
  assert.equal(start.event, 'SessionStart');
  assert.equal(prompt.event, 'UserPromptSubmit');
  assert.equal(tool.payload.tool_name, 'bash');
  assert.deepEqual(tool.payload.tool_input, { command: 'npm test' });
  assert.equal(fail.payload.is_error, true);
  const resultTypeFailure = normalize('copilot', 'postToolUse', { sessionId: 'copilot-1', toolName: 'bash', resultType: 'failure' });
  assert.equal(resultTypeFailure.payload.is_error, true);
  const stringArgs = normalize('copilot', 'postToolUse', { sessionId: 'copilot-1', toolName: 'bash', toolArgs: '{"command":"npm test"}' });
  assert.deepEqual(stringArgs.payload.tool_input, { command: 'npm test' });
});

test('Copilot installer preserves existing hooks and uses official project location', () => {
  const existing = { hooks: { sessionStart: [{ type: 'command', command: 'keep-me' }] } };
  const next = configure.updateSettings(existing, 'copilot', false, 'C:/agent-monitor');
  assert.equal(next.hooks.sessionStart[0].command, 'keep-me');
  assert.match(next.hooks.sessionStart[1].command, /agent-bridge\.js" copilot sessionStart/);
  assert.equal(next.hooks.sessionStart[1].command.includes(process.execPath.replace(/\\/g, '/')), true);
  assert.match(configure.targetPath('copilot', 'C:/repo', false).replace(/\\/g, '/'), /\.github\/hooks\/agent-monitor\.json$/);
});

test('Aider wrapper reports lifecycle and preserves child exit status', () => {
  const calls = [];
  const reporter = { start: p => calls.push(['start', p]), stop: (r, f) => calls.push(['stop', r, f]), end: r => calls.push(['end', r]) };
  const status = aider.main(['--message', 'review this', '--dry-run'], {
    createReporter: options => { assert.equal(options.client, 'aider'); return reporter; },
    spawnSync: (binary, args) => { assert.equal(binary, 'aider'); assert.deepEqual(args, ['--message', 'review this', '--dry-run']); return { status: 0 }; },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls, [['start', 'Aider prompt'], ['stop', 'Aider completed', { failed: false }], ['end', 'complete']]);
});

test('Aider still runs and preserves status when telemetry fails', () => {
  let spawned = false;
  const status = aider.main(['--version'], {
    createReporter: () => { throw new Error('read-only data directory'); },
    spawnSync: () => { spawned = true; return { status: 7 }; },
  });
  assert.equal(spawned, true);
  assert.equal(status, 7);
});
