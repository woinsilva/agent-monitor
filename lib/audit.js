'use strict';

const { read } = require('./intelligence');

const sensitive = new Set(['prompt', 'reply', 'summary', 'tool_input', 'tool_response', 'transcript']);

function replay({ dataDir, days = 7, client, project, incomplete = false, now }) {
  let events = read(dataDir, days, now);
  if (client) events = events.filter(e => e.client === client);
  if (project) events = events.filter(e => projectName(e.cwd) === project);
  const ended = new Set(events.filter(e => e.event === 'SessionEnd').map(key));
  if (incomplete) events = events.filter(e => !ended.has(key(e)));
  return {
    generatedAt: now || Date.now(), filters: { days, client: client || null, project: project || null, incomplete },
    events: events.slice(-5000).map(publicEvent), truncated: events.length > 5000,
  };
}

function aggregateExport(options) {
  const data = replay(options), sessions = new Map();
  for (const event of data.events) {
    const id = event.client + ':' + event.session;
    const item = sessions.get(id) || { client: event.client, session: event.session, project: event.project, first: event.ts, last: event.ts, events: 0, failures: 0, ended: false };
    item.first = Math.min(item.first, event.ts); item.last = Math.max(item.last, event.ts); item.events++;
    if (event.failed || event.event === 'PostToolUseFailure') item.failures++;
    if (event.event === 'SessionEnd') item.ended = true;
    sessions.set(id, item);
  }
  return { generatedAt: data.generatedAt, privacy: 'Aggregated metadata only; prompts, replies, summaries and tool payloads are excluded.', filters: data.filters, sessions: [...sessions.values()] };
}

function publicEvent(event) {
  const out = {};
  for (const [name, value] of Object.entries(event)) if (!sensitive.has(name)) out[name] = value;
  out.project = projectName(event.cwd); delete out.cwd;
  return out;
}
const key = e => e.client + ':' + e.session;
const projectName = cwd => String(cwd || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '?';

module.exports = { replay, aggregateExport, publicEvent };
