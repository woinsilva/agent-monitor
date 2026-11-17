'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEvent, withSchema, EVENT_SCHEMA_VERSION } = require('../lib/events');

const base = { ts: 1, client: 'custom', event: 'UserPromptSubmit', session: 's1', cwd: '/repo' };

test('v1 events validate and legacy events remain readable', () => {
  const current = withSchema(base);
  assert.equal(current.schema, EVENT_SCHEMA_VERSION);
  assert.deepEqual(validateEvent(current), { ok: true, legacy: false, errors: [] });
  assert.deepEqual(validateEvent(base), { ok: true, legacy: true, errors: [] });
});

test('invalid and future events are rejected safely', () => {
  assert.equal(validateEvent({ ...base, session: '' }).ok, false);
  assert.equal(validateEvent({ ...base, event: 'InventedEvent' }).ok, false);
  assert.equal(validateEvent({ ...base, schema: 99 }).ok, false);
  assert.equal(validateEvent('not an object').ok, false);
});
