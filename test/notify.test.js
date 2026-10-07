'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cfgFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'am-cfg-')), 'config.json');
process.env.AGENT_MONITOR_CONFIG = cfgFile;
const config = require('../lib/config.js');
const notify = require('../lib/notify.js');

const write = obj => { fs.writeFileSync(cfgFile, JSON.stringify(obj)); const t = new Date(Date.now() + Math.random() * 1000); fs.utimesSync(cfgFile, t, t); };

test('defaults apply when there is no config file', () => {
  const c = config.load();
  assert.equal(c.notify.waitingDelaySeconds, 30);
  assert.deepEqual(notify.channels(c), { ntfy: false, telegram: false });
});

test('nothing is sent without a channel', async () => {
  write({});
  assert.equal(await notify.send('waiting', { who: 'Claude · app' }), false);
});

test('ntfy gets a short message without details by default', async () => {
  write({ language: 'pt', notify: { ntfy: { topic: 'my-topic' } } });
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true }; };
  try {
    await notify.send('waiting', { who: 'Claude · app', detail: 'rm -rf secrets' });
  } finally { global.fetch = realFetch; }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ntfy.sh');
  assert.equal(calls[0].body.topic, 'my-topic');
  assert.equal(calls[0].body.title, 'Claude · app está esperando você');
  assert.ok(!calls[0].body.message.includes('rm -rf'));
});

test('details are included only when enabled', async () => {
  write({ notify: { ntfy: { topic: 't' }, details: true } });
  let body;
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true }; };
  try { await notify.send('waiting', { who: 'Codex · app', detail: 'npm run build' }); } finally { global.fetch = realFetch; }
  assert.equal(body.message, 'npm run build');
});
