'use strict';

const adapters = {
  cursor: require('./cursor'),
  gemini: require('./gemini'),
  copilot: require('./copilot'),
};

const EVENT_MAP = Object.fromEntries(Object.entries(adapters).map(([name, adapter]) => [name, adapter.events]));

function normalize(client, name, raw) {
  const adapter = adapters[client];
  if (!adapter || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const event = adapter.eventFor(name, raw);
  if (!event) return null;
  const cwd = (typeof raw.cwd === 'string' && raw.cwd) ||
    (Array.isArray(raw.workspace_roots) && typeof raw.workspace_roots[0] === 'string' && raw.workspace_roots[0]) || process.cwd();
  const result = { session_id: adapter.sessionId(raw), cwd };
  if (typeof raw.sessionId === 'string' && result.session_id === 'unknown') result.session_id = raw.sessionId;
  if (typeof raw.prompt === 'string') result.prompt = raw.prompt;
  else if (typeof raw.user_prompt === 'string') result.prompt = raw.user_prompt;
  if (typeof raw.model_id === 'string') result.model = raw.model_id;
  else if (typeof raw.model === 'string') result.model = raw.model;
  if (typeof raw.tool_name === 'string') result.tool_name = raw.tool_name;
  else if (typeof raw.toolName === 'string') result.tool_name = raw.toolName;
  if (raw.tool_input && typeof raw.tool_input === 'object') result.tool_input = raw.tool_input;
  else if (raw.toolArgs && typeof raw.toolArgs === 'object') result.tool_input = raw.toolArgs;
  if (typeof raw.tool_use_id === 'string') result.tool_use_id = raw.tool_use_id;
  if (typeof raw.duration === 'number' && Number.isFinite(raw.duration)) result.duration_ms = raw.duration;
  if (typeof raw.source === 'string') result.source = raw.source;
  if (typeof raw.reason === 'string') result.reason = raw.reason;
  if (typeof raw.subagent_type === 'string') result.subagent_type = raw.subagent_type;
  if (typeof raw.task === 'string' && event === 'SubagentStart') result.prompt = raw.task;
  if (typeof raw.error_message === 'string') result.message = raw.error_message.slice(0, 300);
  else if (typeof raw.error === 'string') result.message = raw.error.slice(0, 300);
  if (raw.status === 'error' || name === 'postToolUseFailure' || name === 'errorOccurred') result.is_error = true;
  if (raw.tool_response && typeof raw.tool_response === 'object') {
    const response = raw.tool_response;
    result.tool_response = { is_error: response.is_error === true || response.isError === true || !!response.error };
    for (const key of ['exit_code', 'exitCode']) {
      if (Number.isInteger(response[key])) result.tool_response[key] = response[key];
    }
    const code = Number.isInteger(result.tool_response.exit_code)
      ? result.tool_response.exit_code : result.tool_response.exitCode;
    if (Number.isInteger(code) && code !== 0) result.tool_response.is_error = true;
  }
  if (raw.is_error === true || raw.isError === true || result.is_error === true) result.tool_response = { is_error: true };
  if (typeof raw.message === 'string' && (event === 'Notification' || event === 'PermissionRequest')) result.message = raw.message;
  if (typeof raw.notification_type === 'string' && (event === 'Notification' || event === 'PermissionRequest') && !result.message) {
    result.message = raw.notification_type;
  }
  if (typeof raw.agent_id === 'string') result.agent_id = raw.agent_id;
  if (typeof raw.subagent_id === 'string') result.subagent_id = raw.subagent_id;
  if (typeof raw.agent_type === 'string') result.agent_type = raw.agent_type;
  if (event === 'Stop' && typeof raw.prompt_response === 'string') result.last_assistant_message = raw.prompt_response;
  else if (event === 'Stop' && typeof raw.response === 'string') result.last_assistant_message = raw.response;
  return { event, payload: result };
}

module.exports = { adapters, EVENT_MAP, normalize };
