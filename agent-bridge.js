#!/usr/bin/env node
'use strict';
// Observability-only hook bridge for Cursor and Gemini CLI.
// Never grants/denies permissions and never sends any data to a remote service.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EVENT_MAP = {
  cursor: {
    sessionStart: 'SessionStart',
    sessionEnd: 'SessionEnd',
    beforeSubmitPrompt: 'UserPromptSubmit',
    preToolUse: 'PreToolUse',
    postToolUse: 'PostToolUse',
    postToolUseFailure: 'PostToolUseFailure',
    subagentStart: 'SubagentStart',
    subagentStop: 'SubagentStop',
    stop: 'Stop',
  },
  gemini: {
    SessionStart: 'SessionStart',
    SessionEnd: 'SessionEnd',
    BeforeAgent: 'UserPromptSubmit',
    AfterAgent: 'Stop',
    BeforeTool: 'PreToolUse',
    AfterTool: 'PostToolUse',
    Notification: 'Notification',
  },
};

function normalize(client, name, raw) {
  const configuredEvent = EVENT_MAP[client] && EVENT_MAP[client][name];
  if (!configuredEvent || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  // Only the documented ToolPermission notification signals a permission wait.
  // Do not infer approval requests from free-form notification messages.
  const event = client === 'gemini' && name === 'Notification' &&
    raw.notification_type === 'ToolPermission' ? 'PermissionRequest' : configuredEvent;
  const cwd = (typeof raw.cwd === 'string' && raw.cwd) || (Array.isArray(raw.workspace_roots) && typeof raw.workspace_roots[0] === 'string' && raw.workspace_roots[0]) || process.cwd();
  const result = {
    session_id: [raw.session_id, raw.conversation_id, raw.thread_id].find(v => typeof v === 'string' && v) || 'unknown',
    cwd,
  };
  if (typeof raw.prompt === 'string') result.prompt = raw.prompt;
  else if (typeof raw.user_prompt === 'string') result.prompt = raw.user_prompt;
  if (typeof raw.model_id === 'string') result.model = raw.model_id;
  else if (typeof raw.model === 'string') result.model = raw.model;
  if (typeof raw.tool_name === 'string') result.tool_name = raw.tool_name;
  if (raw.tool_input && typeof raw.tool_input === 'object') result.tool_input = raw.tool_input;
  if (typeof raw.tool_use_id === 'string') result.tool_use_id = raw.tool_use_id;
  if (typeof raw.duration === 'number' && Number.isFinite(raw.duration)) result.duration_ms = raw.duration;
  if (typeof raw.source === 'string') result.source = raw.source;
  if (typeof raw.reason === 'string') result.reason = raw.reason;
  if (typeof raw.subagent_type === 'string') result.subagent_type = raw.subagent_type;
  if (typeof raw.task === 'string' && event === 'SubagentStart') result.prompt = raw.task;
  if (typeof raw.error_message === 'string') result.message = raw.error_message.slice(0,300);
  if (raw.status === 'error' || name === 'postToolUseFailure') result.is_error = true;
  // Only the minimal error/exit fields are forwarded, never a raw tool result.
  if (raw.tool_response && typeof raw.tool_response === 'object') {
    const response = raw.tool_response;
    result.tool_response = {
      is_error: response.is_error === true || response.isError === true || !!response.error,
    };
    for (const key of ['exit_code', 'exitCode']) {
      if (Number.isInteger(response[key])) result.tool_response[key] = response[key];
    }
  }
  if (raw.is_error === true || raw.isError === true || result.is_error === true) {
    result.tool_response = { is_error: true };
  }
  if (typeof raw.message === 'string' && (event === 'Notification' || event === 'PermissionRequest')) result.message = raw.message;
  if (typeof raw.notification_type === 'string' && (event === 'Notification' || event === 'PermissionRequest') && !result.message) result.message = raw.notification_type;
  if (typeof raw.agent_id === 'string') result.agent_id = raw.agent_id;
  if (typeof raw.subagent_id === 'string') result.subagent_id = raw.subagent_id;
  if (typeof raw.agent_type === 'string') result.agent_type = raw.agent_type;
  // Do not forward transcript_path: other agents' transcript formats are not supported yet.
  if (event === 'Stop' && typeof raw.prompt_response === 'string') result.last_assistant_message = raw.prompt_response;
  else if (event === 'Stop' && typeof raw.response === 'string') result.last_assistant_message = raw.response;
  return { event, payload: result };
}

function main(argv = process.argv.slice(2)) {
  const [client, name] = argv;
  try {
    if (!EVENT_MAP[client] || !EVENT_MAP[client][name]) return;
    const input = fs.readFileSync(0, 'utf8');
    const value = JSON.parse(input.replace(/^\uFEFF/, '') || '{}');
    const normalized = normalize(client, name, value);
    if (!normalized) return;
    spawnSync(process.execPath, [path.join(__dirname, 'hook.js'), normalized.event, '--client', client], {
      input: JSON.stringify(normalized.payload),
      timeout: 7500,
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  } catch (_) {
    // Monitoring must never interrupt an AI coding session.
  } finally {
    // Gemini CLI requires valid JSON stdout. Cursor accepts an empty object.
    // Permission-sensitive Cursor hooks are NOT installed by default.
    // Never emit an affirmative permission decision from a monitoring hook.
    const response = client === 'cursor' && name === 'beforeSubmitPrompt' ? { continue: true } : {};
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

if (require.main === module) main();
module.exports = { EVENT_MAP, normalize, main };
