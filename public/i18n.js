/* Agent Monitor: UI strings (English + Brazilian Portuguese).
 * The language follows the browser unless the viewer picked one with the EN/PT
 * switch. Add a language by adding a block to DICT; missing keys fall back to
 * English. A value is a string with {placeholders} or a function of the vars. */
(() => {
  'use strict';

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  const DICT = {
    en: {
      connecting: 'connecting…', live: 'live', disconnected: 'server disconnected, reconnecting…',
      view_office: 'Office', view_panel: 'Panel', all: 'All', all_projects: 'All projects',
      show_old: 'show idle and ended', lang: 'PT',
      notify_enable: '🔔 Enable notifications', notify_on: '🔔 Notifications on', notify_blocked: '🔕 Notifications blocked in the browser',
      notify_unavailable: 'Notifications unavailable', notify_done: 'also notify when an agent finishes',
      notify_test: 'Notifications on: you will be told when an agent is waiting for you.',
      h_agents: 'Agents', h_timeline: "Today's timeline",
      hint: 'Data stays on this machine (folder {dir}). Click an agent to see its history.',

      st_working: 'Working', st_waiting: 'Waiting for you', st_idle: 'Idle', st_stale: 'No signal', st_ended: 'Ended', st_done: 'Done',
      k_command: 'cmd', k_edit: 'edit', k_read: 'read', k_search: 'search', k_web: 'web', k_agent: 'agent', k_mcp: 'mcp',
      k_plan: 'plan', k_thinking: 'thinking', k_other: 'tool', k_wait: 'waiting',
      your_answer: 'your answer', thinking: 'thinking / writing', working: 'working', plan_update: 'updating the plan',

      context: 'context', ctx_title: '{used} of {window} tokens in context',
      no_prompt: 'no prompt recorded yet', subagent: 'subagent', ok: 'ok',
      n_tools: v => plural(v.n, 'tool call', 'tool calls'), n_fails: v => plural(v.n, 'failure', 'failures'),
      n_files: v => plural(v.n, 'file edited', 'files edited'), n_subagents: v => plural(v.n, 'subagent', 'subagents'),
      n_prompts: v => plural(v.n, 'prompt', 'prompts'),
      session_id: 'session {id}', started_at: 'started {t}', last_signal: 'last signal {ago} ago',

      s_working: 'agents working now', s_waiting: 'waiting for you', s_stale: 'no signal (> 20 min)',
      s_sessions_today: 'sessions today', s_tool_actions: 'tool actions today',
      s_codex_limit: 'Codex weekly limit', renews: 'resets {d}',

      a_waiting: 'Waiting for you', a_same_file: 'Same file', edited_by: '{file} edited by {who}', and: ' and ', ago: '{x} ago',
      empty_none: 'No active agents right now.', empty_hint_old: ' Tick "show idle and ended" to see earlier ones.',
      empty_hint: 'As soon as an agent gets a prompt, it shows up here.',

      title_waiting: '({n}) Waiting for you · Agent Monitor', title_working: '{n} working · Agent Monitor',
      n_waiting_title: '{who} is waiting for you', n_waiting_body: 'needs your answer', n_done_title: '{who} finished',

      tl_concurrent: 'concurrent agents', tl_peak: 'peak {n}', tl_none: 'No activity recorded today.', tl_now: 'now',

      d_details: 'Details', d_folder: 'Folder', d_model: 'Model', d_session: 'Session', d_start_last: 'Start / last signal',
      d_prompts_tools: 'Prompts / tool calls', d_tokens: 'Tokens', d_last_reply: 'Last reply', d_subagents: 'Subagents',
      d_files: 'Files edited', d_history: 'History', d_no_events: 'no events', close: 'Close',
      tokens_line: 'context {ctx}{win} · output {out}{total}', of: ' of ', total: ' · total ',

      ev_prompt_chip: 'prompt', ev_event_chip: 'event',
      ev_session_start: 'session started', ev_prompt: 'new prompt', ev_failed: 'failed', ev_permission: 'asked for permission',
      ev_notification: 'notification', ev_result: 'result', ev_turn_done: 'finished the turn',
      ev_sub_start: 'subagent started', ev_sub_stop: 'subagent finished', ev_sub_spawned: 'started subagent {name}',
      ev_sub_finished: 'subagent {name} finished', ev_session_end: 'session ended',

      o_empty: 'Nobody is working right now.', o_empty_sub: 'Agents walk in through the door as soon as they get a prompt.',
      o_claude: 'Claude Code', o_codex: 'Codex', o_other: 'Other agents', o_break: 'Break room',
      o_leaving: 'leaving…', o_needs_you: 'needs you', o_stale: 'zZz · no signal for {ago}', o_thinking: 'thinking…', o_working: 'working',
    },

    pt: {
      connecting: 'conectando…', live: 'ao vivo', disconnected: 'servidor desconectado, tentando reconectar…',
      view_office: 'Escritório', view_panel: 'Painel', all: 'Todos', all_projects: 'Todos os projetos',
      show_old: 'mostrar ociosas e encerradas', lang: 'EN',
      notify_enable: '🔔 Ativar notificações', notify_on: '🔔 Notificações ativas', notify_blocked: '🔕 Notificações bloqueadas no navegador',
      notify_unavailable: 'Notificações indisponíveis', notify_done: 'avisar também quando terminar',
      notify_test: 'Notificações ativas: você será avisado quando um agente esperar por você.',
      h_agents: 'Agentes', h_timeline: 'Linha do tempo de hoje',
      hint: 'Os dados ficam só neste computador (pasta {dir}). Clique num agente para ver o histórico.',

      st_working: 'Trabalhando', st_waiting: 'Esperando você', st_idle: 'Ocioso', st_stale: 'Sem sinal', st_ended: 'Encerrada', st_done: 'Concluído',
      k_command: 'cmd', k_edit: 'edição', k_read: 'leitura', k_search: 'busca', k_web: 'web', k_agent: 'agente', k_mcp: 'mcp',
      k_plan: 'plano', k_thinking: 'pensando', k_other: 'tool', k_wait: 'aguardando',
      your_answer: 'sua resposta', thinking: 'pensando / escrevendo', working: 'trabalhando', plan_update: 'atualizando o plano',

      context: 'contexto', ctx_title: '{used} de {window} tokens no contexto',
      no_prompt: 'sem pedido registrado ainda', subagent: 'subagente', ok: 'ok',
      n_tools: v => plural(v.n, 'ferramenta', 'ferramentas'), n_fails: v => plural(v.n, 'falha', 'falhas'),
      n_files: v => plural(v.n, 'arquivo editado', 'arquivos editados'), n_subagents: v => plural(v.n, 'subagente', 'subagentes'),
      n_prompts: v => plural(v.n, 'pedido', 'pedidos'),
      session_id: 'sessão {id}', started_at: 'início {t}', last_signal: 'último sinal há {ago}',

      s_working: 'agentes trabalhando agora', s_waiting: 'esperando você', s_stale: 'sem sinal (> 20 min)',
      s_sessions_today: 'sessões hoje', s_tool_actions: 'ações de ferramentas hoje',
      s_codex_limit: 'limite semanal do Codex', renews: 'renova {d}',

      a_waiting: 'Esperando você', a_same_file: 'Mesmo arquivo', edited_by: '{file}: editado por {who}', and: ' e ', ago: 'há {x}',
      empty_none: 'Nenhum agente ativo agora.', empty_hint_old: ' Marque "mostrar ociosas e encerradas" para ver as anteriores.',
      empty_hint: 'Assim que um agente receber um pedido, ele aparece aqui.',

      title_waiting: '({n}) Esperando você · Agent Monitor', title_working: '{n} trabalhando · Agent Monitor',
      n_waiting_title: '{who} está esperando você', n_waiting_body: 'precisa da sua resposta', n_done_title: '{who} terminou',

      tl_concurrent: 'agentes simultâneos', tl_peak: 'pico {n}', tl_none: 'Nenhuma atividade registrada hoje.', tl_now: 'agora',

      d_details: 'Detalhes', d_folder: 'Pasta', d_model: 'Modelo', d_session: 'Sessão', d_start_last: 'Início / último sinal',
      d_prompts_tools: 'Pedidos / ferramentas', d_tokens: 'Tokens', d_last_reply: 'Última resposta', d_subagents: 'Subagentes',
      d_files: 'Arquivos editados', d_history: 'Histórico', d_no_events: 'sem eventos', close: 'Fechar',
      tokens_line: 'contexto {ctx}{win} · saída {out}{total}', of: ' de ', total: ' · total ',

      ev_prompt_chip: 'pedido', ev_event_chip: 'evento',
      ev_session_start: 'sessão iniciada', ev_prompt: 'novo pedido', ev_failed: 'falhou', ev_permission: 'pediu permissão',
      ev_notification: 'notificação', ev_result: 'resultado', ev_turn_done: 'terminou o turno',
      ev_sub_start: 'subagente iniciado', ev_sub_stop: 'subagente terminou', ev_sub_spawned: 'abriu o subagente {name}',
      ev_sub_finished: 'subagente {name} terminou', ev_session_end: 'sessão encerrada',

      o_empty: 'Ninguém trabalhando agora.', o_empty_sub: 'Os agentes entram pela porta assim que recebem um pedido.',
      o_claude: 'Claude Code', o_codex: 'Codex', o_other: 'Outros agentes', o_break: 'Copa',
      o_leaving: 'saindo…', o_needs_you: 'precisa de você', o_stale: 'zZz · sem sinal há {ago}', o_thinking: 'pensando…', o_working: 'trabalhando',
    },
  };

  let saved = null;
  try { saved = localStorage.getItem('am.lang'); } catch (e) {}
  const lang = DICT[saved] ? saved : /^pt\b/i.test(navigator.language || '') ? 'pt' : 'en';

  function t(key, vars) {
    const v = vars || {};
    const s = DICT[lang][key] != null ? DICT[lang][key] : DICT.en[key] != null ? DICT.en[key] : key;
    return typeof s === 'function' ? s(v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  }

  function setLang(l) {
    try { localStorage.setItem('am.lang', l); } catch (e) {}
    location.reload();
  }

  const NAMES = { claude: 'Claude', codex: 'Codex' };
  const clientName = c => NAMES[c] || (String(c || '?').charAt(0).toUpperCase() + String(c || '?').slice(1));

  window.I18N = { t, lang, setLang, locale: lang === 'pt' ? 'pt-BR' : 'en-US', clientName };
})();
