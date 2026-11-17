'use strict';

const events = {
  SessionStart: 'SessionStart',
  SessionEnd: 'SessionEnd',
  BeforeAgent: 'UserPromptSubmit',
  AfterAgent: 'Stop',
  BeforeTool: 'PreToolUse',
  AfterTool: 'PostToolUse',
  Notification: 'Notification',
};

function eventFor(name, raw) {
  const configured = events[name] || null;
  if (configured === 'Notification' && raw.notification_type === 'ToolPermission') return 'PermissionRequest';
  return configured;
}

const sessionId = raw => [raw.session_id, raw.conversation_id, raw.thread_id]
  .find(value => typeof value === 'string' && value) || 'unknown';

module.exports = { events, eventFor, sessionId };
