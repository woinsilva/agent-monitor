'use strict';

const fs = require('node:fs');
const path = require('node:path');

const day = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const norm = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/\d+/g, '#').slice(0, 160);
const projectOf = cwd => String(cwd || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '?';

function read(dataDir, days = 14, now = Date.now()) {
  const out = [];
  for (let i = Math.max(1, Math.min(31, days)) - 1; i >= 0; i--) {
    const file = path.join(dataDir, 'events-' + day(new Date(now - i * 86400000)) + '.jsonl');
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const line of text.split(/\r?\n/)) try { if (line) out.push(JSON.parse(line)); } catch (_) {}
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function analyze({ dataDir, days = 14, now = Date.now() }) {
  const events = read(dataDir, days, now);
  const prompts = new Map(), failures = new Map(), failureStreaks = new Map(), tests = new Map();
  for (const event of events) {
    const scope = [event.client, event.session, event.agent || '', projectOf(event.cwd)].join(':');
    if (event.event === 'UserPromptSubmit' && norm(event.prompt)) {
      const key = scope + ':' + norm(event.prompt);
      const item = prompts.get(key) || { count: 0, first: event.ts, last: event.ts, client: event.client, project: projectOf(event.cwd), sample: String(event.prompt).slice(0, 120) };
      item.count++; item.last = event.ts; prompts.set(key, item);
    }
    const failed = event.failed || event.event === 'PostToolUseFailure' || event.testResult === 'fail';
    if (failed) {
      const signature = norm(event.tool || 'failure') + ':' + norm(event.summary || 'failure');
      const key = scope + ':' + signature;
      const previous = failureStreaks.get(scope);
      const item = previous && previous.key === key
        ? previous.item
        : { count: 0, first: event.ts, last: event.ts, client: event.client, project: projectOf(event.cwd), tool: event.tool || '?', sample: String(event.summary || '').slice(0, 120) };
      item.count++; item.last = event.ts; failureStreaks.set(scope, { key, item });
      const best = failures.get(key);
      if (!best || item.count > best.count) failures.set(key, Object.assign({}, item));
    } else if (event.event === 'PostToolUse' || event.testResult === 'pass') {
      failureStreaks.delete(scope);
    }
    if (event.testResult === 'fail') {
      const key = projectOf(event.cwd) + ':' + norm(event.summary || event.tool || 'test');
      const item = tests.get(key) || { count: 0, first: event.ts, last: event.ts, project: projectOf(event.cwd), sample: String(event.summary || event.tool || '').slice(0, 160) };
      item.count++; item.last = event.ts; tests.set(key, item);
    }
  }
  const findings = [];
  for (const item of prompts.values()) if (item.count >= 3) findings.push(finding('repeated_prompt', item, item.count >= 5 ? 'high' : 'medium', 'Review the repeated request and clarify its acceptance criterion before retrying.'));
  for (const item of failures.values()) if (item.count >= 2) findings.push(finding('consecutive_failure', item, item.count >= 3 ? 'high' : 'medium', 'Inspect the last failing command and retry only after a reversible configuration or code change.'));
  for (const item of tests.values()) if (item.count >= 2) findings.push(finding('recurring_test_failure', item, item.count >= 3 ? 'high' : 'medium', probableAction(item.sample)));
  return { generatedAt: now, windowDays: days, eventCount: events.length, findings: findings.sort((a, b) => b.evidence.count - a.evidence.count || b.evidence.last - a.evidence.last) };
}

function finding(type, item, confidence, recommendation) {
  return { type, confidence, client: item.client || null, project: item.project, sample: item.sample, probableCause: type === 'recurring_test_failure' ? probableCause(item.sample) : null, recommendation, autoFix: false, evidence: { count: item.count, first: item.first, last: item.last } };
}

function probableCause(sample) {
  const s = norm(sample);
  if (/timeout|timed out/.test(s)) return 'Timing or external dependency instability';
  if (/assert|expected|actual/.test(s)) return 'Behavior differs from the asserted contract';
  if (/module|not found|cannot find/.test(s)) return 'Dependency or module resolution problem';
  return 'Repeated failure signature; inspect the captured test output locally';
}

function probableAction(sample) {
  const cause = probableCause(sample);
  return cause + '. Re-run the single failing test before changing broader behavior.';
}

module.exports = { analyze, read, norm, probableCause };
