'use strict';

const events = {
  sessionStart: 'SessionStart',
  sessionEnd: 'SessionEnd',
  beforeSubmitPrompt: 'UserPromptSubmit',
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  postToolUseFailure: 'PostToolUseFailure',
  subagentStart: 'SubagentStart',
  subagentStop: 'SubagentStop',
  stop: 'Stop',
};

const eventFor = name => events[name] || null;
const sessionId = raw => [raw.conversation_id, raw.session_id, raw.thread_id]
  .find(value => typeof value === 'string' && value) || 'unknown';

module.exports = { events, eventFor, sessionId };
