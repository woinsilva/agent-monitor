#!/usr/bin/env node
'use strict';
// Opt-in installation for Cursor / Gemini CLI. Default is DRY RUN.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const EVENT_SETS = {
  cursor: ['sessionStart', 'sessionEnd', 'beforeSubmitPrompt',
    'postToolUse', 'postToolUseFailure', 'subagentStop', 'stop'],
  gemini: ['SessionStart', 'SessionEnd', 'BeforeAgent', 'AfterAgent',
    'BeforeTool', 'AfterTool', 'Notification'],
};

function targetPath(agent, root, global) {
  const folder = agent === 'cursor' ? '.cursor' : '.gemini';
  return path.join(root, folder, agent === 'cursor' ? 'hooks.json' : 'settings.json');
}

function commandFor(agent, event, repo = __dirname) {
  const script = path.join(repo, 'agent-bridge.js').replace(/\\/g, '/');
  return 'node "' + script + '" ' + agent + ' ' + event;
}

function ours(value) {
  return !!value && typeof value.command === 'string' &&
    value.command.includes('/agent-bridge.js"') && / (cursor|gemini) \w+$/.test(value.command);
}

function updateSettings(settings, agent, remove, repo = __dirname) {
  const next = JSON.parse(JSON.stringify(settings || {}));
  if (!next.hooks || typeof next.hooks !== 'object' || Array.isArray(next.hooks)) next.hooks = {};
  for (const [event, entries] of Object.entries(next.hooks)) {
    if (!Array.isArray(entries)) continue;
    next.hooks[event] = entries.filter(entry => {
      if (agent === 'cursor') return !ours(entry);
      if (!entry || !Array.isArray(entry.hooks)) return true;
      entry.hooks = entry.hooks.filter(hook => !ours(hook));
      return entry.hooks.length > 0;
    });
    if (next.hooks[event].length === 0) delete next.hooks[event];
  }
  if (!remove) {
    if (agent === 'cursor') next.version = next.version || 1;
    for (const event of EVENT_SETS[agent]) {
      next.hooks[event] = next.hooks[event] || [];
      const command = commandFor(agent, event, repo);
      if (agent === 'cursor') next.hooks[event].push({ command });
      else next.hooks[event].push({ matcher: '', hooks: [{ name: 'agent-monitor-' + event, type: 'command', command }] });
    }
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}

function main(argv = process.argv.slice(2)) {
  const idx = argv.indexOf('--agent');
  const agent = idx < 0 ? null : argv[idx + 1];
  if (!EVENT_SETS[agent]) {
    console.error('Usage: node configure-agent.js --agent cursor|gemini [--global|--project DIR] [--apply|--remove]');
    process.exitCode = 1; return;
  }
  const projectIndex = argv.indexOf('--project');
  const project = projectIndex >= 0 ? argv[projectIndex + 1] : null;
  const global = argv.includes('--global');
  const apply = argv.includes('--apply') || argv.includes('--remove');
  const remove = argv.includes('--remove');
  if (global && project) { console.error('Choose --global or --project, not both.'); process.exitCode = 1; return; }
  if (!global && !project) { console.error('Specify --global or --project DIR.'); process.exitCode = 1; return; }
  if (project && !fs.existsSync(project)) { console.error('Project directory not found.'); process.exitCode = 1; return; }
  const dest = targetPath(agent, global ? os.homedir() : path.resolve(project), global);
  let existing = {};
  try {
    if (fs.existsSync(dest)) existing = JSON.parse(fs.readFileSync(dest, 'utf8').replace(/^\uFEFF/, ''));
    if (remove && !fs.existsSync(dest)) { console.log('Nothing to remove: ' + dest); return; }
    const updated = updateSettings(existing, agent, remove);
    if (!apply) {
      console.log('DRY RUN - no files changed. Destination: ' + dest);
      console.log('Would configure: ' + EVENT_SETS[agent].join(', '));
      console.log('Re-run with --apply to write, or --remove to uninstall.');
      return;
    }
    if (!remove && !fs.existsSync(path.join(__dirname, 'agent-bridge.js'))) throw new Error('Missing agent-bridge.js');
    if (fs.existsSync(dest)) {
      const backup = dest + '.bak-agent-monitor';
      if (!fs.existsSync(backup)) fs.copyFileSync(dest, backup);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(updated, null, 2) + '\n');
    console.log((remove ? 'Removed Agent Monitor hooks from ' : 'Installed Agent Monitor hooks in ') + dest);
    console.log('Restart the agent and verify that it delivers events; hooks present does not mean tested compatibility.');
  } catch (e) {
    console.error('Configuration unchanged or incomplete: ' + e.message);
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = { EVENT_SETS, targetPath, commandFor, ours, updateSettings, main };
