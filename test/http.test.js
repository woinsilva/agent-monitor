'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testData = fs.mkdtempSync(path.join(os.tmpdir(), 'am-http-'));
process.env.AGENT_MONITOR_DATA = testData;
const monitor = require('../server.js');

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

test('HTTP API, static files and SSE expose the same current state', async t => {
  monitor.reset();
  monitor.applyEvent({ event: 'SessionStart', client: 'gemini', session: 'http-test', cwd: process.cwd(), ts: Date.now() });
  await new Promise(resolve => monitor.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => monitor.server.close(resolve)));
  const port = monitor.server.address().port;

  const state = await request(port, '/api/state');
  assert.equal(state.status, 200);
  assert.match(state.headers['content-type'], /application\/json/);
  assert.equal(JSON.parse(state.body).sessions.some(s => s.key === 'gemini:http-test'), true);

  const now = new Date();
  const day = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  fs.writeFileSync(path.join(testData, 'events-' + day + '.jsonl'), [
    { schema: 1, ts: Date.now() - 2, client: 'cursor', session: 'open', cwd: process.cwd(), event: 'UserPromptSubmit', prompt: 'private' },
    { schema: 1, ts: Date.now() - 1, client: 'cursor', session: 'open', cwd: process.cwd(), event: 'PostToolUseFailure', failed: true, summary: 'private failure' },
  ].map(JSON.stringify).join('\n') + '\n');
  const health = await request(port, '/api/intelligence?days=1');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).eventCount, 2);
  const replay = await request(port, '/api/replay?days=1&client=cursor&incomplete=1');
  assert.equal(JSON.parse(replay.body).events.length, 2);
  assert.equal(replay.body.includes('private'), false);
  const exported = await request(port, '/api/export?days=1');
  assert.match(exported.headers['content-disposition'], /attachment/);
  assert.match(JSON.parse(exported.body).privacy, /Aggregated metadata/);

  const home = await request(port, '/');
  assert.equal(home.status, 200);
  assert.match(home.body, /Agent Monitor/);
  assert.equal((await request(port, '/missing-file')).status, 404);
  assert.equal((await request(port, '/../server.js')).status, 404);

  const firstSse = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/stream' }, res => {
      res.setEncoding('utf8');
      res.once('data', chunk => { req.destroy(); resolve({ headers: res.headers, chunk }); });
    });
    req.on('error', err => { if (err.code !== 'ECONNRESET') reject(err); });
  });
  assert.match(firstSse.headers['content-type'], /text\/event-stream/);
  assert.match(firstSse.chunk, /retry: 2000/);
});

test('retention removes only expired event logs', () => {
  const old = path.join(testData, 'events-2020-01-01.jsonl');
  const keep = path.join(testData, 'events-2099-01-01.jsonl');
  const unrelated = path.join(testData, 'notes.txt');
  fs.writeFileSync(old, '{}\n');
  fs.writeFileSync(keep, '{}\n');
  fs.writeFileSync(unrelated, 'keep');
  fs.utimesSync(old, new Date(0), new Date(0));
  monitor.cleanupOld();
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(keep), true);
  assert.equal(fs.existsSync(unrelated), true);
});
