'use strict';

const EVENT_SCHEMA_VERSION = 1;
const EVENT_NAMES = new Set([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop',
  'SessionEnd', 'SubagentStart', 'SubagentStop', 'SubagentSpawned',
  'SubagentFinished',
]);

function validateEvent(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, legacy: false, errors: ['event must be an object'] };
  }
  const legacy = value.schema == null;
  if (!legacy && value.schema !== EVENT_SCHEMA_VERSION) errors.push('unsupported schema version');
  if (typeof value.client !== 'string' || !value.client || value.client.length > 64) errors.push('invalid client');
  if (typeof value.session !== 'string' || !value.session || value.session.length > 256) errors.push('invalid session');
  if (typeof value.event !== 'string' || !EVENT_NAMES.has(value.event)) errors.push('invalid event');
  if (!Number.isFinite(value.ts)) errors.push('invalid timestamp');
  return { ok: errors.length === 0, legacy, errors };
}

function withSchema(value) {
  return Object.assign({ schema: EVENT_SCHEMA_VERSION }, value);
}

module.exports = { EVENT_SCHEMA_VERSION, EVENT_NAMES, validateEvent, withSchema };
