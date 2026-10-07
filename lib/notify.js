'use strict';
/**
 * Phone / desktop push notifications through ntfy (https://ntfy.sh, or a server
 * of your own) and/or a Telegram bot, configured in config/config.json.
 *
 * By default a message names only the agent and the project; with
 * notify.details = true it also carries the command or text it is waiting on.
 * Remember that on the public ntfy.sh server anyone who knows the topic name can
 * read it: pick a long random topic, or set notify.ntfy.token / your own server.
 *
 *   node lib/notify.js --test     send a test message with the current config
 */

const config = require('./config');

const TEXT = {
  en: {
    waiting: '{who} is waiting for you', waitingBody: 'Needs your approval or answer.',
    finished: '{who} finished', finishedBody: 'The turn is done.',
    longRunning: '{who} has been working for {min} min', longRunningBody: 'Still on the same prompt.',
    stale: '{who} went silent', staleBody: 'No signal for {min} min while working.',
    limit: '{who} limit at {pct}%', limitBody: 'Resets {when}.',
    test: 'Agent Monitor', testBody: 'Notifications are working.',
  },
  pt: {
    waiting: '{who} está esperando você', waitingBody: 'Precisa da sua aprovação ou resposta.',
    finished: '{who} terminou', finishedBody: 'O turno acabou.',
    longRunning: '{who} está há {min} min trabalhando', longRunningBody: 'Ainda no mesmo pedido.',
    stale: '{who} ficou sem sinal', staleBody: 'Sem sinal há {min} min enquanto trabalhava.',
    limit: 'Limite {who} em {pct}%', limitBody: 'Renova {when}.',
    test: 'Agent Monitor', testBody: 'As notificações estão funcionando.',
  },
};

const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

const PRIORITY = { waiting: 4, stale: 4, longRunning: 3, finished: 3, limit: 4, test: 3 };
const TAGS = { waiting: ['hand'], stale: ['zzz'], longRunning: ['hourglass'], finished: ['white_check_mark'], limit: ['warning'], test: ['robot'] };

function channels(cfg) {
  const n = cfg.notify || {};
  return {
    ntfy: !!(n.ntfy && n.ntfy.topic),
    telegram: !!(n.telegram && n.telegram.botToken && n.telegram.chatId),
  };
}

let lastErrorAt = 0;
function logError(where, e) {
  if (Date.now() - lastErrorAt < 60000) return; // don't flood the log when offline
  lastErrorAt = Date.now();
  console.error('notify (' + where + '): ' + (e && e.message ? e.message : e));
}

async function post(url, body, headers) {
  const res = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

/**
 * kind: waiting | finished | longRunning | stale | test
 * info: { who, detail, min }
 */
async function send(kind, info) {
  const cfg = config.load();
  const ch = channels(cfg);
  if (!ch.ntfy && !ch.telegram) return false;
  const lang = TEXT[cfg.language] ? cfg.language : 'en';
  const T = TEXT[lang];
  const vars = { who: info.who || 'Agent', min: info.min || '', pct: info.pct || '', when: info.when || '' };
  const title = fill(T[kind], vars);
  const body = cfg.notify.details && info.detail ? clip(info.detail, 300) : fill(T[kind + 'Body'], vars);
  const jobs = [];
  if (ch.ntfy) {
    const n = cfg.notify.ntfy;
    const server = String(n.server || 'https://ntfy.sh').replace(/\/+$/, '');
    jobs.push(post(server, { topic: n.topic, title, message: body, priority: PRIORITY[kind] || 3, tags: TAGS[kind] || [] },
      n.token ? { Authorization: 'Bearer ' + n.token } : {}).catch(e => logError('ntfy', e)));
  }
  if (ch.telegram) {
    const t = cfg.notify.telegram;
    jobs.push(post('https://api.telegram.org/bot' + t.botToken + '/sendMessage', { chat_id: t.chatId, text: title + '\n' + body })
      .catch(e => logError('telegram', e)));
  }
  await Promise.all(jobs);
  return true;
}

module.exports = { send, channels };

if (require.main === module && process.argv.includes('--test')) {
  const ch = channels(config.load());
  if (!ch.ntfy && !ch.telegram) {
    console.log('No channel configured. Set notify.ntfy.topic or notify.telegram in ' + config.FILE);
    process.exit(1);
  }
  send('test', {}).then(() => console.log('Sent to: ' + Object.keys(ch).filter(k => ch[k]).join(', ')));
}
