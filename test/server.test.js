'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

// must be set before the server module reads them
process.env.AGENT_MONITOR_DATA = path.join(os.tmpdir(), 'am-server-test');
process.env.PATH_MAP = 'C:\\Users\\me\\.claude\\projects=/host/claude-projects;/home/me/.codex/sessions=/host/codex';
const srv = require('../server.js');

let clock = Date.now() - 10 * 60 * 1000; // recent, so nothing looks stale
const ev = (o) => srv.applyEvent(Object.assign({ ts: (clock += 1000), cwd: '/code/app' }, o));
const get = key => srv.snapshot().sessions.find(s => s.key === key);

test.beforeEach(() => srv.reset());

test('a turn goes working -> waiting -> working -> idle', () => {
  ev({ client: 'claude', session: 'a', event: 'UserPromptSubmit', prompt: 'fix it' });
  assert.equal(get('claude:a').status, 'working');
  ev({ client: 'claude', session: 'a', event: 'PreToolUse', tool: 'Bash', kind: 'command', summary: 'npm run build', callId: '1' });
  assert.equal(get('claude:a').current.summary, 'npm run build');
  ev({ client: 'claude', session: 'a', event: 'PermissionRequest', tool: 'Bash', summary: 'npm run build' });
  assert.equal(get('claude:a').status, 'waiting');
  assert.equal(get('claude:a').waitingFor, 'Bash: npm run build');
  ev({ client: 'claude', session: 'a', event: 'PostToolUse', tool: 'Bash', kind: 'command', summary: 'npm run build', callId: '1' });
  assert.equal(get('claude:a').status, 'working');
  ev({ client: 'claude', session: 'a', event: 'Stop', reply: 'done' });
  const s = get('claude:a');
  assert.equal(s.status, 'idle');
  assert.equal(s.reply, 'done');
  assert.equal(s.toolCount, 1);
  assert.ok(s.finishedAt);
});

test('subagents become their own sessions under the parent', () => {
  ev({ client: 'claude', session: 'p', event: 'UserPromptSubmit', prompt: 'x' });
  ev({ client: 'claude', session: 'p', event: 'SubagentStart', agent: 'k1', agentType: 'Explore' });
  ev({ client: 'claude', session: 'p', event: 'PreToolUse', agent: 'k1', tool: 'Grep', kind: 'search', summary: '"a"', callId: '9' });
  const kid = get('claude:p/k1');
  assert.equal(kid.parentKey, 'claude:p');
  assert.equal(kid.status, 'working');
  ev({ client: 'claude', session: 'p', event: 'SubagentStop', agent: 'k1', reply: 'found' });
  assert.equal(get('claude:p/k1').status, 'done');
  ev({ client: 'claude', session: 'p', event: 'SessionEnd' });
  assert.equal(get('claude:p').status, 'ended');
});

test('records the last test run and git state', () => {
  ev({ client: 'codex', session: 'c', event: 'UserPromptSubmit', prompt: 'test', git: { branch: 'main', dirty: 3 } });
  ev({ client: 'codex', session: 'c', event: 'PreToolUse', tool: 'shell', kind: 'command', summary: 'npm test', test: true, callId: '1' });
  assert.equal(get('codex:c').test.result, 'running');
  ev({ client: 'codex', session: 'c', event: 'PostToolUse', tool: 'shell', kind: 'command', summary: 'npm test', test: true, testResult: 'fail', failed: true, callId: '1' });
  const s = get('codex:c');
  assert.equal(s.test.result, 'fail');
  assert.equal(s.failCount, 1);
  assert.deepEqual(s.git, { branch: 'main', dirty: 3 });
});

test('flags a file edited by two live sessions, across agents and path styles', () => {
  ev({ client: 'claude', session: 'a', event: 'UserPromptSubmit', cwd: 'C:\\code\\app' });
  ev({ client: 'claude', session: 'a', event: 'PostToolUse', cwd: 'C:\\code\\app', tool: 'Edit', kind: 'edit', files: ['C:\\code\\app\\src\\x.ts'] });
  ev({ client: 'codex', session: 'b', event: 'UserPromptSubmit', cwd: 'C:\\code\\app' });
  ev({ client: 'codex', session: 'b', event: 'PostToolUse', cwd: 'C:\\code\\app', tool: 'apply_patch', kind: 'edit', files: ['src/x.ts'] });
  // conflicts are judged against the real clock: compare at the events' time
  const realNow = Date.now;
  Date.now = () => clock;
  try {
    const c = srv.snapshot().conflicts;
    assert.equal(c.length, 1);
    assert.deepEqual(c[0].sessions.map(x => x.key).sort(), ['claude:a', 'codex:b']);
  } finally { Date.now = realNow; }
});

test('maps host transcript paths into the container mounts', () => {
  assert.equal(srv.localFile('C:\\Users\\me\\.claude\\projects\\p\\s.jsonl'), '/host/claude-projects/p/s.jsonl');
  assert.equal(srv.localFile('c:/users/ME/.claude/projects/p/s.jsonl'), '/host/claude-projects/p/s.jsonl');
  assert.equal(srv.localFile('/home/me/.codex/sessions/2026/01/x.jsonl'), '/host/codex/2026/01/x.jsonl');
  assert.equal(srv.localFile('/home/me/.codex/sessionsX/x.jsonl'), '/home/me/.codex/sessionsX/x.jsonl');
});

test('project name comes from Windows and POSIX folders alike', () => {
  ev({ client: 'claude', session: 'w', event: 'UserPromptSubmit', cwd: 'C:\\code\\shop-api' });
  ev({ client: 'claude', session: 'u', event: 'UserPromptSubmit', cwd: '/home/me/web-app' });
  assert.equal(get('claude:w').project, 'shop-api');
  assert.equal(get('claude:u').project, 'web-app');
});

test('native Cursor events replace and suppress Claude compatibility shadows', () => {
  ev({ client: 'claude', session: 'shared', event: 'SessionStart', cwd: 'C:\\Users\\me\\.claude' });
  assert.ok(get('claude:shared'));

  ev({ client: 'cursor', session: 'shared', event: 'SessionStart', cwd: 'C:\\repo' });
  assert.equal(get('claude:shared'), undefined);
  assert.ok(get('cursor:shared'));

  ev({ client: 'claude', session: 'shared', event: 'UserPromptSubmit', prompt: 'duplicate' });
  assert.equal(get('claude:shared'), undefined);
  assert.equal(get('cursor:shared').turns, 0);

  ev({ client: 'cursor', session: 'shared', event: 'UserPromptSubmit', prompt: 'real' });
  assert.equal(get('cursor:shared').turns, 1);
  assert.equal(get('cursor:shared').prompt, 'real');
});

test('duplicate session end events are idempotent', () => {
  ev({ client: 'gemini', session: 'g', event: 'UserPromptSubmit', prompt: 'hello' });
  ev({ client: 'gemini', session: 'g', event: 'Stop', reply: 'done' });
  ev({ client: 'gemini', session: 'g', event: 'SessionEnd', reason: 'exit' });
  ev({ client: 'gemini', session: 'g', event: 'SessionEnd', reason: 'exit' });

  const s = get('gemini:g');
  assert.equal(s.status, 'ended');
  assert.equal(s.timeline.filter(item => item.event === 'SessionEnd').length, 1);
});

test('Gemini headless events with a generated runtime id join the requested session', () => {
  ev({ client: 'gemini', session: 'requested', event: 'SessionStart', cwd: 'C:\\repo' });
  ev({ client: 'gemini', session: 'requested', event: 'UserPromptSubmit', cwd: 'C:\\repo', prompt: 'hello' });
  ev({ client: 'gemini', session: 'generated', event: 'Stop', cwd: 'c:/repo', prompt: 'hello', reply: 'done' });
  ev({ client: 'gemini', session: 'generated', event: 'SessionEnd', cwd: 'c:/repo', reason: 'exit' });

  const s = get('gemini:requested');
  assert.equal(s.status, 'ended');
  assert.equal(s.reply, 'done');
  assert.deepEqual(s.timeline.map(item => item.event), ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd']);
  assert.equal(get('gemini:generated'), undefined);
});

test('Gemini runtime aliases are released when the canonical session ends', () => {
  ev({ client: 'gemini', session: 'requested', event: 'UserPromptSubmit', cwd: '/repo', prompt: 'hello' });
  ev({ client: 'gemini', session: 'generated', event: 'Stop', cwd: '/repo', prompt: 'hello' });
  ev({ client: 'gemini', session: 'generated', event: 'SessionEnd', cwd: '/repo' });
  ev({ client: 'gemini', session: 'generated', event: 'SessionStart', cwd: '/other' });
  assert.ok(get('gemini:generated'));
  assert.equal(get('gemini:requested').status, 'ended');
});

test('duplicate Gemini runtime SessionEnd remains correlated until a new start', () => {
  ev({ client: 'gemini', session: 'requested', event: 'UserPromptSubmit', cwd: '/repo', prompt: 'hello' });
  ev({ client: 'gemini', session: 'generated', event: 'Stop', cwd: '/repo', prompt: 'hello' });
  ev({ client: 'gemini', session: 'generated', event: 'SessionEnd', cwd: '/repo' });
  ev({ client: 'gemini', session: 'generated', event: 'SessionEnd', cwd: '/repo' });
  assert.equal(get('gemini:generated'), undefined);
  assert.equal(get('gemini:requested').timeline.filter(item => item.event === 'SessionEnd').length, 1);
});

test('Gemini runtime aliases renew while events keep arriving', () => {
  ev({ client: 'gemini', session: 'requested', event: 'UserPromptSubmit', cwd: '/repo', prompt: 'hello' });
  ev({ client: 'gemini', session: 'generated', event: 'Stop', cwd: '/repo', prompt: 'hello' });
  clock += 10 * 60 * 1000;
  ev({ client: 'gemini', session: 'generated', event: 'Notification', cwd: '/repo' });
  clock += 11 * 60 * 1000;
  ev({ client: 'gemini', session: 'generated', event: 'SessionEnd', cwd: '/repo' });
  assert.equal(get('gemini:generated'), undefined);
  assert.equal(get('gemini:requested').status, 'ended');
});

test('inactive Gemini runtime aliases are pruned lazily on later events', () => {
  ev({ client: 'gemini', session: 'requested', event: 'UserPromptSubmit', cwd: '/repo', prompt: 'hello' });
  ev({ client: 'gemini', session: 'generated', event: 'Stop', cwd: '/repo', prompt: 'hello' });
  clock += 21 * 60 * 1000;
  ev({ client: 'gemini', session: 'generated', event: 'SessionEnd', cwd: '/repo' });
  assert.ok(get('gemini:generated'));
});

test('Gemini correlation does not guess between concurrent identical prompts', () => {
  ev({ client: 'gemini', session: 'one', event: 'UserPromptSubmit', cwd: '/repo', prompt: 'same' });
  ev({ client: 'gemini', session: 'two', event: 'UserPromptSubmit', cwd: '/repo', prompt: 'same' });
  ev({ client: 'gemini', session: 'generated', event: 'Stop', cwd: '/repo', prompt: 'same', reply: 'unknown owner' });

  assert.equal(get('gemini:one').status, 'working');
  assert.equal(get('gemini:two').status, 'working');
  assert.equal(get('gemini:generated').reply, 'unknown owner');
});
