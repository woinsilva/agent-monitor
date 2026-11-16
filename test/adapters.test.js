'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { normalize } = require('../agent-bridge');
const { updateSettings } = require('../configure-agent');

test('Cursor preToolUse maps to normalized tool event and excludes identity', () => {
  const event = normalize('cursor', 'preToolUse', {
    conversation_id: 'conversation-1', workspace_roots: ['/repo'],
    model_id: 'gpt-6', tool_name: 'Shell', tool_input: { command: 'npm test' },
    user_email: 'private@example.com',
  });
  assert.equal(event.event, 'PreToolUse');
  assert.equal(event.payload.session_id, 'conversation-1');
  assert.equal(event.payload.tool_name, 'Shell');
  assert.equal(JSON.stringify(event).includes('private@example.com'), false);
});

test('Gemini uses BeforeAgent and AfterAgent rather than invented hook events', () => {
  assert.equal(normalize('gemini', 'BeforeAgent', { session_id: 's1', prompt: 'hello' }).event, 'UserPromptSubmit');
  assert.equal(normalize('gemini', 'AfterAgent', { session_id: 's1' }).event, 'Stop');
  assert.equal(normalize('gemini', 'Unknown', {}).event, undefined);
});

test('normalizer excludes raw tool output and transcript', () => {
  const event = normalize('gemini', 'AfterTool', {
    session_id: 's2', tool_name: 'read_file', tool_input: { path: 'test.js' },
    tool_response: { llmContent: 'SECRET', exit_code: 1 }, transcript_path: '/secret/location',
  });
  assert.equal(event.payload.tool_response.exit_code, 1);
  assert.equal(JSON.stringify(event).includes('SECRET'), false);
  assert.equal(JSON.stringify(event).includes('/secret/location'), false);
});

test('installer preserves non-Agent Monitor hooks and supports removal', () => {
  const settings = { hooks: { BeforeTool: [{ matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] }] } };
  const configured = updateSettings(settings, 'gemini', false);
  assert.equal(configured.hooks.BeforeTool.length, 2);
  const removed = updateSettings(configured, 'gemini', true);
  assert.deepEqual(removed, settings);
});

test('Cursor installs same events only once on repeated application', () => {
  const once = updateSettings({ hooks: {} }, 'cursor', false);
  const twice = updateSettings(once, 'cursor', false);
  assert.deepEqual(once, twice);
});

test('bridge writes no secrets and sends a single normalized event', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-bridge-'));
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'agent-bridge.js'), 'gemini', 'BeforeAgent'], {
    input: JSON.stringify({ session_id: 's1', cwd: dir, prompt: 'test prompt', user_email: 'private@example.com' }),
    env: { ...process.env, AGENT_MONITOR_DATA: dir }, encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '{}');
  const events = fs.readdirSync(dir).filter(f => f.startsWith('events-'));
  assert.equal(events.length, 1);
  const line = fs.readFileSync(path.join(dir, events[0]), 'utf8');
  assert.equal(JSON.parse(line).client, 'gemini');
  assert.equal(line.includes('private@example.com'), false);
});

test('dry-run installer changes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-config-'));
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'configure-agent.js'),
    '--agent', 'cursor', '--project', dir], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /DRY RUN/);
  assert.equal(fs.existsSync(path.join(dir, '.cursor')), false);
});
