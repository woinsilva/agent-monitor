'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
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
