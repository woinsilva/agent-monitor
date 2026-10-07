'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { describeTool, isTestCommand, exitCode } = require('../hook.js');

test('describes shell commands, keeping the command for test detection', () => {
  const d = describeTool('Bash', { command: 'npm test', description: 'Run tests' });
  assert.equal(d.kind, 'command');
  assert.equal(d.summary, 'Run tests — npm test');
  assert.equal(d.command, 'npm test');
  assert.equal(describeTool('shell', { command: ['bash', '-lc', 'ls -la'] }).summary, 'ls -la');
  assert.equal(describeTool('shell', { command: ['powershell', '-Command', 'Get-ChildItem'] }).summary, 'Get-ChildItem');
});

test('lists the files of a Codex apply_patch (patch text in tool_input.command)', () => {
  const d = describeTool('apply_patch', { command: '*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** Add File: src/b.ts\n*** End Patch' });
  assert.equal(d.kind, 'edit');
  assert.deepEqual(d.files, ['src/a.ts', 'src/b.ts']);
});

test('describes edits, reads, searches and subagents', () => {
  assert.deepEqual(describeTool('Edit', { file_path: '/p/x.ts' }).files, ['/p/x.ts']);
  assert.equal(describeTool('Read', { file_path: '/p/x.ts' }).kind, 'read');
  assert.equal(describeTool('Grep', { pattern: 'foo', path: 'src' }).summary, '"foo" · src');
  assert.equal(describeTool('Agent', { subagent_type: 'Explore', description: 'find callers' }).summary, '[Explore] find callers');
  assert.equal(describeTool('mcp__x__y', { query: 'q' }).kind, 'mcp');
});

test('recognises test runners and nothing else', () => {
  for (const c of ['npm test', 'pnpm.cmd test -- auth', 'yarn test:unit', 'npm run e2e', 'npx vitest run', 'pytest -q', 'python -m pytest',
    'go test ./...', 'cargo test', 'pnpm exec playwright test mfa', 'node --test', 'dotnet test']) {
    assert.ok(isTestCommand(c), c);
  }
  for (const c of ['npm run build', 'git status', 'npm install', 'echo test-data', 'cat tests/a.ts']) assert.ok(!isTestCommand(c), c);
});

test('reads exit codes from objects and text', () => {
  assert.equal(exitCode({ exit_code: 2 }), 2);
  assert.equal(exitCode('Exit code: 1\nWall time 2s'), 1);
  assert.equal(exitCode('Process exited with code 0'), 0);
  assert.equal(exitCode('all good'), null);
  assert.equal(exitCode({ stdout: '' }), null);
});

test('as a hook: prints nothing, exits 0 and appends one event', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-hook-'));
  const input = JSON.stringify({ session_id: 's1', cwd: dir, tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'npm test' }, tool_response: { stdout: 'ok' } });
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'hook.js'), 'PostToolUse', '--client', 'claude'], {
    input, env: Object.assign({}, process.env, { AGENT_MONITOR_DATA: dir }),
  });
  assert.equal(out.length, 0);
  const file = fs.readdirSync(dir).find(f => f.startsWith('events-'));
  const ev = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').trim());
  assert.equal(ev.event, 'PostToolUse');
  assert.equal(ev.session, 's1');
  assert.equal(ev.test, true);
  assert.equal(ev.testResult, 'pass');
});

test('as a hook: never fails, even on garbage input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-hook-'));
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'hook.js'), 'Stop', '--client', 'codex'], {
    input: 'not json', env: Object.assign({}, process.env, { AGENT_MONITOR_DATA: dir }),
  });
  assert.equal(out.length, 0);
});
