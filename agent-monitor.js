#!/usr/bin/env node
'use strict';

// One safe entry point for readiness, preview, installation and removal.
// Changes always require --apply; without it installation is a dry run.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function usage() {
  return [
    'Usage:',
    '  node agent-monitor.js doctor [--project DIR] [--json]',
    '  node agent-monitor.js install --agent core|cursor|gemini (--global|--project DIR) [--apply]',
    '  node agent-monitor.js uninstall --agent core|cursor|gemini (--global|--project DIR) --apply',
    '  node agent-monitor.js verify --agent claude|codex|cursor|gemini [--project DIR]',
    '',
    'core configures Claude Code and Codex together. Existing files are backed up once.',
  ].join('\n');
}

function run(script, args, options = {}) {
  const result = (options.spawnSync || spawnSync)(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: options.stdio || 'inherit', encoding: options.encoding, windowsHide: true,
  });
  return result.status == null ? 1 : result.status;
}

function main(argv = process.argv.slice(2), options = {}) {
  const [action, ...args] = argv;
  if (action === 'doctor') return run('doctor.js', args, options);
  const at = args.indexOf('--agent');
  const agent = at >= 0 ? args[at + 1] : null;
  if (action === 'verify') {
    if (!['claude', 'codex', 'cursor', 'gemini'].includes(agent)) { console.error(usage()); return 1; }
    const projectArg = valueAfter(args, '--project');
    const inspect = options.inspect || require('./doctor').inspect;
    const result = inspect({ project: projectArg ? path.resolve(projectArg) : null });
    const delivered = result.telemetry.recentByClient[agent];
    console.log(delivered ? agent + ': delivery seen at ' + new Date(delivered).toISOString() : agent + ': no delivery in the last 7 days');
    return delivered ? 0 : 2;
  }
  if (!['install', 'uninstall'].includes(action) || !['core', 'cursor', 'gemini'].includes(agent)) {
    console.error(usage()); return 1;
  }
  if (args.includes('--remove')) {
    console.error('--remove is internal. Use uninstall with --apply. No files changed.'); return 1;
  }
  const apply = args.includes('--apply');
  if (action === 'uninstall' && !apply) {
    console.error('Uninstall requires --apply. No files changed.'); return 1;
  }
  const forwarded = args.filter((v, i) => i !== at && i !== at + 1);
  if (action === 'uninstall') forwarded.push('--remove');
  if (agent === 'core') {
    const scope = forwarded.includes('--global') ? ['--global'] : [valueAfter(forwarded, '--project')].filter(Boolean);
    if (!scope.length) { console.error(usage()); return 1; }
    if (!apply && action === 'install') {
      console.log('DRY RUN - would configure Claude Code and Codex at ' + (scope[0] === '--global' ? 'global scope' : scope[0]));
      console.log('Re-run with --apply after reviewing this scope.'); return 0;
    }
    return run('install.js', [...scope, ...(action === 'uninstall' ? ['--remove'] : [])], options);
  }
  return run('configure-agent.js', ['--agent', agent, ...forwarded], options);
}

function valueAfter(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, run, usage, valueAfter };
