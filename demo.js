#!/usr/bin/env node
/**
 * Demo mode: fills a throwaway data folder with fictional agents and keeps them
 * busy, then serves the dashboard. Nothing is read from or written to your real
 * data, hooks or agent folders.
 *
 *   node demo.js            then open http://localhost:4401
 *
 * PORT changes the port (default 4401, so it can run next to the real one).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.tmpdir(), 'agent-monitor-demo');
fs.mkdirSync(DIR, { recursive: true });
for (const f of fs.readdirSync(DIR)) if (/^events-.*\.jsonl$/.test(f)) fs.unlinkSync(path.join(DIR, f));

const pad = n => String(n).padStart(2, '0');
const d = new Date();
const FILE = path.join(DIR, `events-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.jsonl`);
const ROOT = process.platform === 'win32' ? 'C:\\code\\' : '/home/dev/code/';
const P = name => ROOT + name;

let callN = 0;
function emit(o, agoSec) {
  const rec = Object.assign({ ts: Date.now() - (agoSec || 0) * 1000, cwd: P('shop-api') }, o);
  fs.appendFileSync(FILE, JSON.stringify(rec) + '\n');
}
const prompt = (client, session, text, agoSec, extra) => emit(Object.assign({ client, session, event: 'UserPromptSubmit', prompt: text }, extra), agoSec);
const pre = (client, session, tool, kind, summary, extra, agoSec) =>
  emit(Object.assign({ client, session, event: 'PreToolUse', tool, kind, summary, callId: 'c' + (++callN) }, extra), agoSec);
const post = (client, session, tool, kind, summary, extra, agoSec) =>
  emit(Object.assign({ client, session, event: 'PostToolUse', tool, kind, summary }, extra), agoSec);
const stop = (client, session, reply, agoSec, extra) => emit(Object.assign({ client, session, event: 'Stop', reply }, extra), agoSec);

// earlier today, so the timeline has some history
const history = [
  ['claude', 'a1f3c9d2', 'shop-api', 5.5, 4.2], ['codex', 'b7e21a44', 'web-app', 5.0, 3.1],
  ['claude', 'c9d04e17', 'web-app', 4.0, 2.6], ['codex', 'd2a8f310', 'shop-api', 3.2, 1.4],
  ['claude', 'e5b7c021', 'docs-site', 2.4, 1.9], ['claude', 'a1f3c9d2', 'shop-api', 2.0, 0.6],
];
for (const [c, s, proj, a, b] of history) {
  prompt(c, s, 'earlier task', a * 3600, { cwd: P(proj) });
  stop(c, s, 'done', b * 3600, { cwd: P(proj) });
}

// right now
const A = { cwd: P('shop-api') }, W = { cwd: P('web-app') }, DOC = { cwd: P('docs-site') }, M = { cwd: P('mobile-app') };
prompt('claude', 'a1f3c9d2', 'Add rate limiting to the checkout endpoint and cover it with tests', 420, Object.assign({ model: 'claude-opus-5-5' }, A));
post('claude', 'a1f3c9d2', 'Edit', 'edit', 'src/checkout/handler.ts', Object.assign({ files: ['src/checkout/handler.ts'] }, A), 200);
emit(Object.assign({ client: 'claude', session: 'a1f3c9d2', event: 'SubagentStart', agent: 'x1', agentType: 'Explore' }, A), 90);
pre('claude', 'a1f3c9d2', 'Grep', 'search', '"rateLimit" · src/', Object.assign({ agent: 'x1', agentType: 'Explore' }, A));
emit(Object.assign({ client: 'claude', session: 'a1f3c9d2', event: 'SubagentStart', agent: 'x2', agentType: 'test-runner' }, A), 60);
pre('claude', 'a1f3c9d2', 'Bash', 'command', 'npm test -- checkout', Object.assign({ agent: 'x2', agentType: 'test-runner' }, A));
pre('claude', 'a1f3c9d2', 'Edit', 'edit', 'src/middleware/rate-limit.ts', A);

prompt('claude', 'c9d04e17', 'Redesign the settings page header', 180, Object.assign({ model: 'claude-sonnet-5-5' }, W));
emit(Object.assign({ client: 'claude', session: 'c9d04e17', event: 'PermissionRequest', tool: 'Bash', kind: 'command', summary: 'npm run build' }, W), 40);

prompt('claude', 'e5b7c021', 'Update the deployment guide', 900, DOC);
stop('claude', 'e5b7c021', 'Updated the deployment guide with the new staging steps.', 640, DOC);

prompt('claude', 'f0c1a9e8', 'Investigate the slow report query', 2400, Object.assign({ model: 'claude-opus-5-5' }, A));
pre('claude', 'f0c1a9e8', 'Read', 'read', 'src/reports/monthly.sql', Object.assign({ ts: Date.now() - 1500e3 }, A));

prompt('codex', 'd2a8f310', 'Review the checkout rate-limit change', 300, Object.assign({ model: 'gpt-6-sol' }, A));
post('codex', 'd2a8f310', 'apply_patch', 'edit', 'patch: src/checkout/handler.ts', Object.assign({ files: ['src/checkout/handler.ts'] }, A), 120);
pre('codex', 'd2a8f310', 'Bash', 'command', 'npx tsc --noEmit', A);

prompt('codex', 'b7e21a44', 'Write e2e tests for the signup flow', 240, Object.assign({ model: 'gpt-6-sol' }, W));
pre('codex', 'b7e21a44', 'Read', 'read', 'tests/e2e/signup.spec.ts', W);

prompt('codex', '9e44b0c3', 'Migrate the push notification service', 150, Object.assign({ model: 'gpt-6-sol' }, M));
pre('codex', '9e44b0c3', 'Bash', 'command', 'npm run generate:migrations', M);

prompt('reviewer', 'reviewer-41', 'Independent review of the diff', 50, Object.assign({ model: 'review-model' }, A));

// keep the office moving
const loop = [
  () => pre('claude', 'a1f3c9d2', 'Bash', 'command', 'npm test -- rate-limit', A),
  () => pre('codex', 'b7e21a44', 'Edit', 'edit', 'tests/e2e/signup.spec.ts', W),
  () => emit(Object.assign({ client: 'claude', session: 'a1f3c9d2', event: 'SubagentStop', agent: 'x1', reply: 'found 7 call sites' }, A)),
  () => stop('reviewer', 'reviewer-41', '3 findings', 0, Object.assign({ usage: { input_tokens: 41000, output_tokens: 2300, total_tokens: 43300 } }, A)),
  () => pre('claude', 'a1f3c9d2', 'Read', 'read', 'src/middleware/rate-limit.test.ts', A),
  () => prompt('reviewer', 'reviewer-41', 'Checking the lead reviewer verdicts', 0, A),
  () => pre('codex', 'd2a8f310', 'Bash', 'command', 'npm run lint', A),
  () => emit(Object.assign({ client: 'claude', session: 'a1f3c9d2', event: 'SubagentStart', agent: 'x1', agentType: 'Explore' }, A)),
  () => pre('claude', 'a1f3c9d2', 'Grep', 'search', '"limiter" · src/', Object.assign({ agent: 'x1', agentType: 'Explore' }, A)),
];
let i = 0;
setInterval(() => loop[i++ % loop.length](), 7000);

process.env.AGENT_MONITOR_DATA = DIR;
process.env.PORT = process.env.PORT || '4401';
process.env.HOST_LABEL = 'demo';
process.env.CODEX_SESSIONS = DIR; // never look at the real Codex sessions
console.log('Demo data in ' + DIR);
require('./server.js');
