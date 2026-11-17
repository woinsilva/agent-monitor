#!/usr/bin/env node
'use strict';

// Read-only installation diagnostics. Never prints settings values, tokens, or event contents.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function binaryStatus(command, options = {}) {
  const run = options.spawnSync || spawnSync;
  const result = run(command, ['--version'], {
    encoding: 'utf8', windowsHide: true, timeout: 5000, shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) return { installed: false };
  const line = String(result.stdout || result.stderr || '').trim().split(/\r?\n/)[0];
  return { installed: true, version: line.slice(0, 120) || 'unknown' };
}

function recentDelivery(files, data, now = Date.now()) {
  const clients = {};
  const cutoff = now - 7 * 86400000;
  for (const name of files) {
    let lines = [];
    try { lines = fs.readFileSync(path.join(data, name), 'utf8').split(/\r?\n/); } catch (_) { continue; }
    for (const line of lines) {
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        if (typeof event.client === 'string' && Number.isFinite(event.ts) && event.ts >= cutoff) {
          clients[event.client] = Math.max(clients[event.client] || 0, event.ts);
        }
      } catch (_) {}
    }
  }
  return clients;
}

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
  const delivered = recentDelivery(eventFiles, data, options.now);
  return {
    agentMonitor: 'installation-readiness',
    platform: process.platform,
    node: { version: process.version, meetsMinimum: major >= 18 },
    dashboard: { entryPointPresent: fs.existsSync(path.join(repo, 'server.js')) },
    binaries: {
      claudeCode: binaryStatus('claude', options),
      codexCli: binaryStatus('codex', options),
      cursor: binaryStatus('cursor', options),
      geminiCli: binaryStatus('gemini', options),
    },
    telemetry: {
      eventFileCount: eventFiles.length,
      recentByClient: delivered,
      deliveryVerified: Object.keys(delivered).length > 0,
    },
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
      const binary = results.binaries[name];
      process.stdout.write(name + ': ' + (binary.installed ? binary.version : 'binary not found') + '; ' +
        (status.agentMonitorHooks ? 'hooks configured' : 'hooks not detected') +
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
    const delivered = Object.keys(results.telemetry.recentByClient);
    process.stdout.write('Recent delivery (7d): ' + (delivered.length ? delivered.join(', ') : 'none') + '\n');
    process.stdout.write('Note: recent delivery is historical evidence; test a fresh session after changing hooks.\n');
  }
  if (!results.node.meetsMinimum) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { hookStatus, adapterStatus, binaryStatus, recentDelivery, inspect, main };
