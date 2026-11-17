'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { normalize } = require('../agent-bridge');
const { updateSettings, commandFor, atomicWrite } = require('../configure-agent');

for (const fixtureName of ['cursor-3.30.14.json', 'gemini-0.68.0.json']) {
  test('golden adapter fixture: ' + fixtureName, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', fixtureName), 'utf8'));
    const client = fixture.runtime === 'Cursor' ? 'cursor' : 'gemini';
    for (const item of fixture.cases) {
      const normalized = normalize(client, item.hook, item.input);
      assert.ok(normalized, item.hook + ' should normalize');
      assert.equal(normalized.event, item.event, item.hook);
      if (item.failed) assert.equal(normalized.payload.tool_response?.is_error || normalized.payload.is_error, true, item.hook);
      assert.equal(JSON.stringify(normalized).includes('redacted'), false, item.hook + ' must omit raw output');
    }
  });
}

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
  assert.equal(event.payload.tool_response.is_error, true);
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-cursor-prompt-'));
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'agent-bridge.js'), 'cursor', 'beforeSubmitPrompt'], {
    input: JSON.stringify({ conversation_id: 'c-1', prompt: 'hello' }),
    env: { ...process.env, AGENT_MONITOR_DATA: dir }, encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { continue: true });
  assert.equal(fs.readdirSync(dir).filter(name => /^events-.*\.jsonl$/.test(name)).length, 1);
});

test('Claude compatibility hooks ignore Cursor transcripts to avoid duplicate sessions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-cursor-duplicate-'));
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'hook.js'), 'UserPromptSubmit', '--client', 'claude'], {
    input: JSON.stringify({
      session_id: 'cursor-session',
      transcript_path: 'C:\\Users\\me\\.cursor\\projects\\repo\\agent-transcripts\\cursor-session.jsonl',
      cwd: 'C:\\repo',
      prompt: 'hello',
    }),
    env: { ...process.env, AGENT_MONITOR_DATA: dir }, encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.deepEqual(fs.readdirSync(dir), []);
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

test('hook coerces numeric runtime session ids to schema-safe strings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-numeric-session-'));
  const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'hook.js'), 'SessionStart', '--client', 'claude'], {
    input: JSON.stringify({ session_id: 12345, cwd: dir }),
    env: { ...process.env, AGENT_MONITOR_DATA: dir }, encoding: 'utf8',
  });
  assert.equal(out.status, 0);
  const file = fs.readdirSync(dir).find(name => /^events-.*\.jsonl$/.test(name));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).session, '12345');
});

test('removal without prior settings does not create files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-remove-'));
  const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'configure-agent.js'),
    '--agent', 'cursor', '--project', dir, '--remove'], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.equal(fs.existsSync(path.join(dir, '.cursor')), false);
});

test('installer writes atomically, refreshes backup and removes files it created', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-install-cycle-'));
  const script = path.join(__dirname, '..', 'configure-agent.js');
  const args = ['--agent', 'cursor', '--project', dir];
  assert.equal(spawnSync(process.execPath, [script, ...args, '--apply'], { encoding: 'utf8' }).status, 0);
  const dest = path.join(dir, '.cursor', 'hooks.json');
  assert.equal(fs.existsSync(dest), true);
  assert.equal(fs.readdirSync(path.dirname(dest)).some(name => name.includes('.tmp-')), false);
  assert.equal(spawnSync(process.execPath, [script, ...args, '--remove'], { encoding: 'utf8' }).status, 0);
  assert.equal(fs.existsSync(dest), false);
  assert.equal(fs.existsSync(dest + '.bak-agent-monitor'), false);
  assert.equal(fs.existsSync(path.dirname(dest)), false);
});

test('installed command executes in native Windows command shells', { skip: process.platform !== 'win32' }, () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'am command path '));
  const linkedRepo = path.join(parent, 'repo with spaces');
  fs.symlinkSync(path.join(__dirname, '..'), linkedRepo, 'junction');
  const command = commandFor('gemini', 'Notification', linkedRepo);
  const cmd = spawnSync(command, { shell: true, input: '{}', encoding: 'utf8' });
  assert.equal(cmd.status, 0, cmd.stderr);
  const powershell = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { input: '{}', encoding: 'utf8' });
  assert.equal(powershell.status, 0, powershell.stderr);
});

test('installer refreshes backup before each update', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-backup-'));
  const folder = path.join(dir, '.cursor');
  const dest = path.join(folder, 'hooks.json');
  fs.mkdirSync(folder);
  fs.writeFileSync(dest, JSON.stringify({ theme: 'one' }));
  const script = path.join(__dirname, '..', 'configure-agent.js');
  const args = ['--agent', 'cursor', '--project', dir, '--apply'];
  assert.equal(spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(dest + '.bak-agent-monitor', 'utf8')).theme, 'one');
  const edited = JSON.parse(fs.readFileSync(dest, 'utf8'));
  edited.theme = 'two';
  fs.writeFileSync(dest, JSON.stringify(edited));
  assert.equal(spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(dest + '.bak-agent-monitor', 'utf8')).theme, 'two');
});

test('atomic write removes its temporary file after rename failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-atomic-fail-'));
  const target = path.join(dir, 'target');
  fs.mkdirSync(target);
  assert.throws(() => atomicWrite(target, '{}'));
  assert.equal(fs.existsSync(target + '.tmp-' + process.pid), false);
});

test('uninstall preserves user settings added after Agent Monitor created the file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-install-user-edit-'));
  const script = path.join(__dirname, '..', 'configure-agent.js');
  const args = ['--agent', 'gemini', '--project', dir];
  assert.equal(spawnSync(process.execPath, [script, ...args, '--apply'], { encoding: 'utf8' }).status, 0);
  const dest = path.join(dir, '.gemini', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(dest, 'utf8'));
  settings.theme = 'dark';
  fs.writeFileSync(dest, JSON.stringify(settings));
  assert.equal(spawnSync(process.execPath, [script, ...args, '--remove'], { encoding: 'utf8' }).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(dest, 'utf8')).theme, 'dark');
  assert.equal(fs.existsSync(dest + '.bak-agent-monitor'), true);
});

test('Gemini ToolPermission reaches hook.js as PermissionRequest and not informational Notification', () => {
  const wait = normalize('gemini', 'Notification', {
    session_id: 'gemini-test', notification_type: 'ToolPermission', message: 'Action required'
  });
  assert.equal(wait.event, 'PermissionRequest');
  assert.equal(wait.payload.message, 'Action required');
  const info = normalize('gemini', 'Notification', {
    session_id: 'gemini-test', notification_type: 'SessionEnd', message: 'Action required'
  });
  assert.equal(info.event, 'Notification');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-gemini-wait-'));
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'agent-bridge.js'), 'gemini', 'Notification'], {
    input: JSON.stringify({ session_id: 'gemini-test', cwd: dir,
      notification_type: 'ToolPermission', message: 'Action required' }),
    env: { ...process.env, AGENT_MONITOR_DATA: dir }, encoding: 'utf8'
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
  const eventFile = fs.readdirSync(dir).find(name => /^events-.*\.jsonl$/.test(name));
  assert.ok(eventFile);
  const record = JSON.parse(fs.readFileSync(path.join(dir, eventFile), 'utf8'));
  assert.equal(record.event, 'PermissionRequest');
  assert.equal(record.message, 'Action required');
});
