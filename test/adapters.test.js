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
  assert.equal(normalize('gemini', 'Unknown', {}), null);
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

test('Cursor preToolUse hook observes without blocking execution', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-cursor-'));
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'agent-bridge.js'), 'cursor', 'preToolUse'], {
    input: JSON.stringify({ conversation_id: 'c-1', tool_name: 'Shell', tool_input: { command: 'echo safe' } }),
    env: { ...process.env, AGENT_MONITOR_DATA: dir }, encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
  const events = fs.readdirSync(dir).filter(f => f.startsWith('events-'));
  assert.equal(events.length, 1);
});

test('Cursor prompt hook does not prevent sending the prompt', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'agent-bridge.js'), 'cursor', 'beforeSubmitPrompt'], {
    input: JSON.stringify({ conversation_id: 'c-1', prompt: 'hello' }), encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { continue: true });
});

test('default Cursor configuration never installs permission-decision hooks', () => {
  const { EVENT_SETS } = require('../configure-agent');
  assert.equal(EVENT_SETS.cursor.includes('preToolUse'), false);
  assert.equal(EVENT_SETS.cursor.includes('subagentStart'), false);
});

test('documented Cursor event properties are normalized', () => {
  const event = normalize('cursor', 'postToolUseFailure', {
    conversation_id: 'c1', tool_name: 'Shell', duration: 321,
    error_message: 'Command failed', failure_type: 'timeout',
  });
  assert.equal(event.payload.duration_ms, 321);
  assert.equal(event.payload.message, 'Command failed');
  assert.equal(event.payload.tool_response.is_error, true);
  const stop = normalize('cursor', 'stop', { conversation_id: 'c1', status: 'error', reason: 'failed' });
  assert.equal(stop.payload.is_error, true);
  assert.equal(stop.payload.reason, 'failed');
  const sub = normalize('cursor', 'subagentStart', { conversation_id: 'c1', subagent_type: 'review', task: 'review code' });
  assert.equal(sub.payload.subagent_type, 'review');
});

test('Gemini message takes precedence over notification_type', () => {
  const event = normalize('gemini', 'Notification', {
    session_id: 's1', notification_type: 'ToolPermission', message: 'Allow run_shell_command?',
  });
  assert.equal(event.payload.message, 'Allow run_shell_command?');
});

test('Gemini and Cursor tool classes are recognized', () => {
  const { describeTool } = require('../hook');
  assert.equal(describeTool('run_shell_command', { command: 'npm test' }).kind, 'command');
  assert.equal(describeTool('read_file', { path: 'src/app.ts' }).kind, 'read');
  assert.equal(describeTool('write_file', { path: 'src/app.ts' }).kind, 'edit');
  assert.equal(describeTool('replace', { path: 'src/app.ts' }).kind, 'edit');
  assert.equal(describeTool('Delete', { path: 'src/app.ts' }).kind, 'edit');
  assert.equal(describeTool('MCP:some_tool', {}).kind, 'mcp');
});

test('Cursor BOM input is processed and non-string ids are rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-bom-'));
  const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'agent-bridge.js'), 'cursor', 'postToolUse'], {
    input: '\uFEFF' + JSON.stringify({ conversation_id: 'ação', tool_name: 'Shell', tool_input: { command: 'echo ok' } }),
    env: { ...process.env, AGENT_MONITOR_DATA: dir }, encoding: 'utf8',
  });
  assert.equal(out.status, 0);
  const eventFile = fs.readdirSync(dir).find(f => f.startsWith('events-'));
  assert.ok(eventFile);
  const event = JSON.parse(fs.readFileSync(path.join(dir, eventFile), 'utf8'));
  assert.equal(event.session, 'ação');
  assert.equal(normalize('cursor','stop',{ conversation_id: { secret: 1 }, cwd: 42 }).payload.session_id,'unknown');
});

test('removal without prior settings does not create files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-remove-'));
  const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'configure-agent.js'),
    '--agent', 'cursor', '--project', dir, '--remove'], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.equal(fs.existsSync(path.join(dir, '.cursor')), false);
});
