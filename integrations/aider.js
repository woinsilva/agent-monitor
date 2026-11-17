#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const { createReporter } = require('../lib/sdk');

function promptFrom(args) {
  for (const flag of ['--message', '--msg', '-m']) {
    const i = args.indexOf(flag); if (i >= 0 && args[i + 1]) return args[i + 1];
  }
  return 'interactive Aider session';
}

function main(args = process.argv.slice(2), options = {}) {
  if (args[0] === '--') args = args.slice(1);
  let reporter = null;
  try { reporter = (options.createReporter || createReporter)({ client: 'aider', cwd: process.cwd(), model: value(args, '--model') }); } catch (_) {}
  emit(reporter, 'start', 'Aider prompt');
  const result = (options.spawnSync || spawnSync)(options.binary || process.env.AIDER_BINARY || 'aider', args, { stdio: 'inherit', windowsHide: true });
  const failed = result.error || result.status !== 0;
  emit(reporter, 'stop', failed ? 'Aider exited with an error' : 'Aider completed', { failed: !!failed });
  emit(reporter, 'end', failed ? 'error' : 'complete');
  return failed ? (result.status || 1) : 0;
}
function emit(reporter, method, ...args) { try { if (reporter) reporter[method](...args); } catch (_) {} }
function value(args, flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; }
if (require.main === module) process.exitCode = main();
module.exports = { main, promptFrom, emit };
