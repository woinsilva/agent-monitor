'use strict';
const events = {
  sessionStart: 'SessionStart', sessionEnd: 'SessionEnd', userPromptSubmitted: 'UserPromptSubmit',
  preToolUse: 'PreToolUse', postToolUse: 'PostToolUse', postToolUseFailure: 'PostToolUseFailure',
  agentStop: 'Stop', subagentStart: 'SubagentStart', subagentStop: 'SubagentStop',
  permissionRequest: 'PermissionRequest', notification: 'Notification', errorOccurred: 'Notification',
};
const eventFor = name => events[name] || null;
const sessionId = raw => typeof raw.sessionId === 'string' ? raw.sessionId : typeof raw.session_id === 'string' ? raw.session_id : 'unknown';
module.exports = { events, eventFor, sessionId };
