#!/usr/bin/env node
/**
 * Adds (or removes) the Agent Monitor hooks for Claude Code and Codex, next to
 * any hooks already configured (those are never touched).
 *
 *   node install.js <project-dir>             hooks for one project
 *   node install.js --global                  hooks for every project of this user
 *   add --remove to either form to uninstall
 *
 * Project:  <project>/.claude/settings.local.json   (Claude Code, not committed)
 *           <project>/.codex/hooks.json             (Codex)
 * Global:   ~/.claude/settings.json                 (Claude Code)
 *           ~/.codex/hooks.json                     (Codex; experimental, depends on your Codex version)
 *
 * Use one form or the other for a given project: installing both makes every
 * event arrive twice. A backup (*.bak-agent-monitor) is written next to each
 * file before its first change.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'hook.js').replace(/\\/g, '/');
const MARK = '/hook.js" ';

const EVENTS = {
  claude: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest',
    'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd'],
  codex: ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd'],
};

const command = (event, client) => 'node "' + HOOK + '" ' + event + ' --client ' + client;

function isOurs(group) {
  return group && Array.isArray(group.hooks) && group.hooks.some(h =>
    typeof h.command === 'string' && h.command.replace(/\\/g, '/').includes(MARK) && /agent-monitor|--client (claude|codex)$/.test(h.command));
}

function patch(file, client, remove) {
  let json = {};
  const exists = fs.existsSync(file);
  if (exists) {
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    json = raw.trim() ? JSON.parse(raw) : {};
  } else if (remove) {
    return 'nothing to remove';
  }
  json.hooks = json.hooks || {};

  let removed = 0;
  for (const ev of Object.keys(json.hooks)) {
    const before = json.hooks[ev].length;
    json.hooks[ev] = json.hooks[ev].filter(g => !isOurs(g));
    removed += before - json.hooks[ev].length;
    if (!json.hooks[ev].length) delete json.hooks[ev];
  }
  if (!Object.keys(json.hooks).length) delete json.hooks;
  if (!remove) {
    json.hooks = json.hooks || {};
    for (const ev of EVENTS[client]) {
      json.hooks[ev] = json.hooks[ev] || [];
      json.hooks[ev].push({ matcher: '', hooks: [{ type: 'command', command: command(ev, client) }] });
    }
  }

  if (exists) {
    const bak = file + '.bak-agent-monitor';
    if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  return remove ? removed + ' hook(s) removed' : EVENTS[client].length + ' events' + (removed ? ' (replaced ' + removed + ' older)' : '');
}

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const global = args.includes('--global');

// --statusline: Claude Code's status line is the only place it exposes plan usage
// (5-hour / weekly limits). User-level, since the limits belong to the account.
if (args.includes('--statusline')) {
  const file = path.join(os.homedir(), '.claude', 'settings.json');
  const script = path.join(__dirname, 'statusline.js').replace(/\\/g, '/');
  let json = {};
  if (fs.existsSync(file)) json = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '') || '{}');
  const current = json.statusLine && json.statusLine.command;
  const ours = typeof current === 'string' && current.replace(/\\/g, '/').includes('/statusline.js');
  if (remove) {
    if (!ours) { console.log('Status line: nothing to remove (not installed by Agent Monitor)'); process.exit(0); }
    delete json.statusLine;
  } else {
    if (current && !ours) {
      console.log('Status line: you already have one (' + current + '). Not replacing it.\n' +
        'To feed the dashboard, have your script also pipe its input to: node "' + script + '"');
      process.exit(0);
    }
    json.statusLine = { type: 'command', command: 'node "' + script + '"', padding: 0 };
  }
  if (fs.existsSync(file) && !fs.existsSync(file + '.bak-agent-monitor')) fs.copyFileSync(file, file + '.bak-agent-monitor');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log('Status line ' + (remove ? 'removed from ' : 'installed in ') + file + (remove ? '' : '\nIt shows up in new Claude Code sessions; limits appear after the first reply (Pro/Max plans).'));
  process.exit(0);
}
const project = args.find(a => !a.startsWith('--'));
if (!global && (!project || !fs.existsSync(project))) {
  console.error('usage: node install.js <project-dir> [--remove]\n       node install.js --global [--remove]');
  process.exit(1);
}

const home = os.homedir();
const targets = global
  ? [['Claude Code', path.join(home, '.claude', 'settings.json'), 'claude'],
     ['Codex', path.join(home, '.codex', 'hooks.json'), 'codex']]
  : [['Claude Code', path.join(project, '.claude', 'settings.local.json'), 'claude'],
     ['Codex', path.join(project, '.codex', 'hooks.json'), 'codex']];

for (const [name, file, client] of targets) {
  try {
    console.log(name.padEnd(12) + patch(file, client, remove) + '  ->  ' + file);
  } catch (e) {
    console.error(name.padEnd(12) + 'ERROR: ' + e.message + '  (' + file + ')');
    process.exitCode = 1;
  }
}
if (!remove) {
  console.log('\nCodex asks you to review/trust new hooks the next time it starts in this location.');
  if (global) console.log('Global Codex hooks are experimental: if no Codex events show up, install per project instead.');
}
