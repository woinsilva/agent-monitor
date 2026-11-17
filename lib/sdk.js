'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { withSchema, validateEvent } = require('./events');

const localDay = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const clip = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, 300);

class AgentMonitorReporter {
  constructor(options = {}) {
    if (!options.client) throw new TypeError('client is required');
    this.client = String(options.client).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').slice(0, 64);
    this.session = String(options.session || this.client + '-' + crypto.randomUUID());
    this.cwd = path.resolve(options.cwd || process.cwd());
    this.model = options.model ? String(options.model) : undefined;
    this.dataDir = options.dataDir || process.env.AGENT_MONITOR_DATA || path.join(__dirname, '..', 'data');
    this.clock = options.clock || Date.now;
  }

  emit(event, fields = {}) {
    const record = withSchema(Object.assign({
      ts: this.clock(), client: this.client, session: this.session, cwd: this.cwd, event,
    }, this.model ? { model: this.model } : {}, fields));
    for (const key of ['prompt', 'reply', 'summary']) if (record[key] != null) record[key] = clip(record[key]);
    const checked = validateEvent(record);
    if (!checked.ok) throw new TypeError(checked.errors.join(', '));
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.appendFileSync(path.join(this.dataDir, 'events-' + localDay(new Date(record.ts)) + '.jsonl'), JSON.stringify(record) + '\n');
    return record;
  }

  start(prompt) { return this.emit('UserPromptSubmit', prompt == null ? {} : { prompt }); }
  beforeTool(tool, fields = {}) { return this.emit('PreToolUse', Object.assign({ tool: String(tool) }, fields)); }
  afterTool(tool, fields = {}) { return this.emit(fields.failed ? 'PostToolUseFailure' : 'PostToolUse', Object.assign({ tool: String(tool) }, fields)); }
  wait(summary) { return this.emit('PermissionRequest', summary == null ? {} : { summary }); }
  stop(reply, fields = {}) { return this.emit('Stop', Object.assign(reply == null ? {} : { reply }, fields)); }
  end(reason = 'exit') { return this.emit('SessionEnd', { reason: String(reason) }); }
}

function createReporter(options) { return new AgentMonitorReporter(options); }

module.exports = { AgentMonitorReporter, createReporter };
