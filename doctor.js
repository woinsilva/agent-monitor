#!/usr/bin/env node
'use strict';

// Read-only installation diagnostics. Never prints settings values, tokens, or event contents.
const fs = require('fs');
const os = require('os');
const path = require('path');

function hookStatus(file) {
  if (!fs.existsSync(file)) return { configPresent: false, agentMonitorHooks: false };
  try {
    const settings = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const groups = Object.values(settings.hooks || {});
    const found = groups.some(items => Array.isArray(items) && items.some(group =>
      Array.isArray(group.hooks) && group.hooks.some(h =>
        typeof h.command === 'string' &&
        h.command.replace(/\\/g, '/').includes('/hook.js') &&
        /--client\s+(claude|codex)\b/.test(h.command))));
    return { configPresent: true, agentMonitorHooks: found };
  } catch (_) {
    return { configPresent: true, agentMonitorHooks: false, warning: 'Cannot parse hooks configuration' };
  }
}

function commandIsOurs(command) {
  return typeof command === 'string' &&
    command.replace(/\\/g, '/').includes('/agent-bridge.js"') &&
    / (cursor|gemini) [A-Za-z]+$/.test(command);
}

function adapterStatus(file, agent) {
  if (!fs.existsSync(file)) return { configPresent: false, agentMonitorHooks: false };
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    let found = false;
    for (const entries of Object.values(config.hooks || {})) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (agent === 'cursor' && commandIsOurs(entry && entry.command)) found = true;
        if (agent === 'gemini' && entry && Array.isArray(entry.hooks) &&
          entry.hooks.some(h => commandIsOurs(h.command))) found = true;
      }
    }
    return { configPresent: true, agentMonitorHooks: found };
  } catch (_) {
    return { configPresent: true, agentMonitorHooks: false, warning: 'Cannot parse hooks configuration' };
  }
}

function inspect(options = {}) {
  const home = options.home || os.homedir();
  const repo = options.repo || __dirname;
  const project = options.project || null;
  const data = process.env.AGENT_MONITOR_DATA || path.join(repo, 'data');
  const major = Number(process.versions.node.split('.')[0]);
  const eventFiles = fs.existsSync(data)
    ? fs.readdirSync(data).filter(name => /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    : [];
  return {
    agentMonitor: 'installation-readiness',
    platform: process.platform,
    node: { version: process.version, meetsMinimum: major >= 18 },
    dashboard: { entryPointPresent: fs.existsSync(path.join(repo, 'server.js')) },
    telemetry: { eventFileCount: eventFiles.length, deliveryVerified: false },
    integrations: {
      claudeCode: hookStatus(path.join(home, '.claude', 'settings.json')),
      codexCli: hookStatus(path.join(home, '.codex', 'hooks.json')),
      cursor: adapterStatus(path.join(home, '.cursor', 'hooks.json'), 'cursor'),
      geminiCli: adapterStatus(path.join(home, '.gemini', 'settings.json'), 'gemini'),
    },
    projectIntegrations: project ? {
      claudeCode: hookStatus(path.join(project, '.claude', 'settings.local.json')),
      codexCli: hookStatus(path.join(project, '.codex', 'hooks.json')),
      cursor: adapterStatus(path.join(project, '.cursor', 'hooks.json'), 'cursor'),
      geminiCli: adapterStatus(path.join(project, '.gemini', 'settings.json'), 'gemini'),
    } : null,
    note: 'Configuration detection is not proof that the agent emits events. Test a fresh session before claiming support.',
  };
}

function main(argv = process.argv.slice(2)) {
  const projectFlag = argv.indexOf('--project');
  if (projectFlag >= 0 && (!argv[projectFlag + 1] || argv[projectFlag + 1].startsWith('--'))) {
    console.error('Usage: node doctor.js [--json] [--project DIR]'); process.exitCode = 1; return;
  }
  const project = projectFlag >= 0 ? path.resolve(argv[projectFlag + 1]) : null;
  const results = inspect({ project });
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    process.stdout.write('Agent Monitor installation diagnostics (read-only)\n');
    process.stdout.write('Node.js: ' + results.node.version + (results.node.meetsMinimum ? ' OK' : ' (requires 18+)') + '\n');
    for (const [name, status] of Object.entries(results.integrations)) {
      process.stdout.write(name + ': ' + (status.agentMonitorHooks ? 'hooks configured' : 'hooks not detected') +
        (status.warning ? ' (' + status.warning + ')' : '') + '\n');
    }
    if (results.projectIntegrations) {
      for (const [name, local] of Object.entries(results.projectIntegrations)) {
        const global = results.integrations[name];
        process.stdout.write(name + ' (project): ' + (local.agentMonitorHooks ? 'hooks configured' : 'hooks not detected') + '\n');
        if (local.agentMonitorHooks && global && global.agentMonitorHooks) {
          process.stdout.write('WARNING: ' + name + ' hooks exist at both project and global scope; duplicate events are possible.\n');
        }
      }
    }
    process.stdout.write('Event files: ' + results.telemetry.eventFileCount + '\n');
    process.stdout.write('Note: send a prompt in a new agent session to confirm real event delivery.\n');
  }
  if (!results.node.meetsMinimum) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { hookStatus, adapterStatus, inspect, main };
