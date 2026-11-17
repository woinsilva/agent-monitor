'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cli = require('../agent-monitor.js');

test('unified CLI defaults installation to preview and requires apply for removal', () => {
  assert.equal(cli.main(['install', '--agent', 'core', '--project', '.']), 0);
  assert.equal(cli.main(['uninstall', '--agent', 'cursor', '--project', '.']), 1);
});

test('unified CLI routes agent configuration with explicit apply', () => {
  const calls = [];
  const status = cli.main(['install', '--agent', 'cursor', '--project', '.', '--apply'], {
    spawnSync(command, args) { calls.push({ command, args }); return { status: 0 }; },
  });
  assert.equal(status, 0);
  assert.match(calls[0].args[0], /configure-agent\.js$/);
  assert.deepEqual(calls[0].args.slice(1), ['--agent', 'cursor', '--project', '.', '--apply']);
});

test('install cannot bypass the write gate with the internal remove flag', () => {
  let spawned = false;
  const status = cli.main(['install', '--agent', 'gemini', '--project', '.', '--remove'], {
    spawnSync() { spawned = true; return { status: 0 }; },
  });
  assert.equal(status, 1);
  assert.equal(spawned, false);
});

test('project verification resolves relative paths before checking delivery', () => {
  let inspectedProject = null;
  const status = cli.main(['verify', '--agent', 'cursor', '--project', '.'], {
    inspect({ project }) {
      inspectedProject = project;
      return { telemetry: { recentByClient: { cursor: Date.now() } } };
    },
  });
  assert.equal(status, 0);
  assert.equal(inspectedProject, require('node:path').resolve('.'));
});
