/*
 * Painel lateral e botão flutuante, isolados em Shadow DOM.
 * Todo texto vindo da página é inserido com textContent (nunca innerHTML).
 */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});
  const { util, time, analyze, settings: settingsMod } = NS;

  const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const TZ_SUGGESTIONS = ['America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Belem',
    'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista',
    'America/Rio_Branco', 'America/Noronha', 'UTC'];

  const STATUS_TEXT = {
    not_crm: ['info', 'Abra o CRM (Negócios, Leads ou processos inteligentes) em Kanban ou Lista para ver as pendências.'],
    login: ['warn', 'Sessão do Bitrix encerrada ou tela de login exibida. Entre normalmente no Bitrix: a extensão não lê nem armazena credenciais.'],
    details: ['info', 'Página de detalhes de um card. Abra o Kanban ou a Lista do CRM para analisar a fila.'],
    unknown: ['error', 'Layout não reconhecido nesta página do CRM: nenhum card foi lido. Na aba Cobertura, use "Copiar diagnóstico estrutural" para calibrar a leitura.'],
    empty: ['info', 'Kanban/Lista reconhecido, mas nenhum card está carregado nesta visualização (filtro sem resultados ou carregamento em andamento).'],
    partial: ['warn', 'Layout parcialmente reconhecido: cards identificados apenas pelos links. Etapa, valor e campos não foram lidos.'],
    invalidated: ['error', 'A extensão foi atualizada, recarregada ou desativada. Se o painel novo não aparecer em alguns segundos, recarregue a página (F5).'],
    hidden: ['info', 'Aba em segundo plano: a leitura será retomada quando a página voltar a ficar visível.']
  };

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }

  function sevClass(sev) {
    return sev ? 'sev' + sev : '';
  }

  function moneyLines(map) {
    const keys = Object.keys(map);
    if (!keys.length) return ['—'];
    return keys.sort().map((k) => util.formatMoney(map[k], k === '?' ? null : k));
  }

  function createPanel(handlers) {
    const old = document.getElementById(NS.extract.HOST_ID);
    if (old) old.remove();
    const host = document.createElement('div');
    host.id = NS.extract.HOST_ID;
    host.setAttribute('data-bnka-version', handlers.version || '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = NS.panelCss;
    shadow.appendChild(style);

    // Eventos do painel não chegam aos atalhos e handlers do Bitrix.
    ['keydown', 'keyup', 'keypress', 'input', 'change', 'click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown',
      'pointerup', 'wheel', 'contextmenu', 'focusin', 'focusout', 'paste', 'copy', 'cut', 'dragstart']
      .forEach((type) => host.addEventListener(type, (e) => e.stopPropagation()));

    const ui = { open: false, tab: 'fila', search: '', type: '', stage: '', resp: '', showAll: false, expanded: new Set(), configDirty: false, confirm: null };
    let state = null;

    const rootEl = h('div', { class: 'root' });
    const fab = h('button', { class: 'fab idle', type: 'button', 'aria-label': 'Abrir painel de pendências do CRM', title: 'Pendências do CRM (somente leitura)' },
      h('span', { text: 'Pendências' }), h('span', { class: 'dot', text: '–' }));
    const subTitle = h('span', { class: 'sub', text: 'Somente leitura · dados da página atual' });
    const btnRefresh = h('button', { class: 'icon-btn', type: 'button', title: 'Reanalisar agora', text: '↻ Reanalisar' });
    const btnClose = h('button', { class: 'icon-btn', type: 'button', title: 'Minimizar painel', 'aria-label': 'Minimizar painel', text: '—' });
    const statusEl = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
    const bodyEl = h('div', { class: 'body' });
    const panel = h('section', { class: 'panel', hidden: true, 'aria-label': 'Pendências do CRM' },
      h('div', { class: 'head' }, h('h1', null, 'Assistente de Pendências', subTitle), btnRefresh, btnClose),
      statusEl, tabsEl, bodyEl);
    const hl = h('div', { class: 'hl', hidden: true });
    rootEl.append(fab, panel, hl);
    shadow.appendChild(rootEl);
    (document.body || document.documentElement).appendChild(host);

    const TABS = [['fila', 'Fila'], ['resumo', 'Distribuição'], ['config', 'Configurar SLA'], ['cobertura', 'Cobertura']];
    const tabButtons = {};
    for (const [id, label] of TABS) {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(ui.tab === id), text: label, onclick: () => selectTab(id) });
      tabButtons[id] = b;
      tabsEl.appendChild(b);
    }

    function setOpen(open) {
      ui.open = open;
      panel.hidden = !open;
      fab.hidden = open;
      if (handlers.onOpenChange) handlers.onOpenChange(open, ui.tab);
      if (open) render();
    }
    fab.addEventListener('click', () => setOpen(true));
    btnClose.addEventListener('click', () => setOpen(false));
    btnRefresh.addEventListener('click', () => handlers.onRefresh && handlers.onRefresh('manual'));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); fab.focus(); } });

    function selectTab(id) {
      if (ui.tab === 'config' && id !== 'config') ui.configDirty = false;
      ui.tab = id;
      for (const [k, b] of Object.entries(tabButtons)) b.setAttribute('aria-selected', String(k === id));
      if (handlers.onOpenChange) handlers.onOpenChange(ui.open, ui.tab);
      render(true);
    }

    // ---------- Render ----------

    function updateFab() {
      const s = state && state.analysis ? state.analysis.summary : null;
      const dot = fab.querySelector('.dot');
      fab.classList.remove('alert', 'idle');
      if (!s || !['ok', 'partial'].includes(state.status)) {
        fab.classList.add('idle');
        dot.textContent = state && state.status === 'invalidated' ? '!' : '–';
      } else {
        dot.textContent = String(s.withAlerts);
        if (s.slaOverdue || s.late) fab.classList.add('alert');
      }
      fab.setAttribute('aria-label', 'Abrir painel de pendências do CRM' + (s ? ' (' + s.withAlerts + ' cards com pendência)' : ''));
    }

    function renderStatus() {
      if (!state) { statusEl.textContent = 'Aguardando primeira leitura…'; statusEl.className = 'status'; return; }
      const parts = [];
      const kind = STATUS_TEXT[state.status];
      statusEl.className = 'status' + (kind ? ' ' + kind[0] : '');
      if (kind) parts.push(kind[1]);
      if (state.lastRun) {
        parts.push('Última leitura: ' + time.formatDateTime(state.lastRun, state.settings.clock.tz) +
          ' · ' + (state.cards ? state.cards.length : 0) + ' cards reconhecidos' + (state.viewLabel ? ' · ' + state.viewLabel : '') +
          (state.coverageNote ? ' · ' + state.coverageNote : ''));
      }
      if (state.removedLegacy && state.removedLegacy.length) parts.push('Configuração antiga de webhook/token removida: não é mais usada.');
      statusEl.textContent = parts.join(' ');
      subTitle.textContent = 'Somente leitura · ' + (state.page && state.page.isCrm ? 'CRM reconhecido' : 'fora do CRM');
    }

    function render(force) {
      updateFab();
      if (!ui.open) return;
      renderStatus();
      // O formulário de configuração não é redesenhado a cada leitura, para não perder o que está sendo digitado.
      if (ui.tab === 'config' && !force && ui.configDirty) return;
      if (ui.tab === 'fila' && !force && bodyEl.querySelector('[data-view="fila"]')) { renderQueueList(); renderKpis(); return; }
      bodyEl.textContent = '';
      if (ui.tab === 'fila') bodyEl.appendChild(renderQueue());
      else if (ui.tab === 'resumo') bodyEl.appendChild(renderSummary());
      else if (ui.tab === 'config') bodyEl.appendChild(renderConfig());
      else bodyEl.appendChild(renderCoverage());
    }

    // ---------- Fila ----------

    let kpiEl = null; let listEl = null; let filterSelects = null;

    function kpi(cls, value, label) {
      return h('div', { class: 'kpi ' + cls }, h('b', { text: String(value) }), h('span', { text: label }));
    }

    function renderKpis() {
      if (!kpiEl) return;
      kpiEl.textContent = '';
      const s = state && state.analysis ? state.analysis.summary : null;
      if (!s) return;
      const tiles = [
        kpi('', s.open, 'cards abertos reconhecidos'),
        kpi('danger', s.late, 'atrasados (prazo/atividade)'),
        kpi('danger', s.slaOverdue, 'SLA vencido'),
        kpi('warn', s.warnings, 'SLA próximo'),
        kpi('high', s.stalled, 'parados além do limite'),
        kpi('', s.withAlerts, 'com alguma pendência'),
        h('div', { class: 'kpi wide' },
          h('b', { text: moneyLines(s.overdueValue).join(' · ') }),
          h('span', { text: 'valor informado das oportunidades em atraso (cada card contado uma vez; moedas não somadas entre si)' +
            (s.overdueWithoutValue ? ' · ' + s.overdueWithoutValue + ' em atraso sem valor exibido' : '') })),
        s.closed ? h('div', { class: 'kpi wide' }, h('span', { text: s.closed + ' card(s) em etapa finalizada fora da fila (ganho/perdido identificado).' })) : null
      ];
      kpiEl.append(...tiles.filter(Boolean));
    }

    function optionList(select, values, allLabel, current) {
      select.textContent = '';
      select.appendChild(h('option', { value: '', text: allLabel }));
      for (const [v, label] of values) select.appendChild(h('option', { value: v, text: label }));
      select.value = values.some(([v]) => v === current) ? current : '';
    }

    function renderQueue() {
      const wrap = h('div', { 'data-view': 'fila' });
      kpiEl = h('div', { class: 'kpis' });
      wrap.appendChild(kpiEl);
      const search = h('input', { class: 'input full', type: 'search', placeholder: 'Buscar por nome, ID, etapa ou responsável', value: ui.search, 'aria-label': 'Buscar' });
      search.addEventListener('input', () => { ui.search = search.value; renderQueueList(); });
      const typeSel = h('select', { class: 'input', 'aria-label': 'Tipo de pendência' });
      const stageSel = h('select', { class: 'input', 'aria-label': 'Etapa' });
      const respSel = h('select', { class: 'input', 'aria-label': 'Responsável' });
      const showAll = h('input', { type: 'checkbox', checked: ui.showAll });
      typeSel.addEventListener('change', () => { ui.type = typeSel.value; renderQueueList(); });
      stageSel.addEventListener('change', () => { ui.stage = stageSel.value; renderQueueList(); });
      respSel.addEventListener('change', () => { ui.resp = respSel.value; renderQueueList(); });
      showAll.addEventListener('change', () => { ui.showAll = showAll.checked; renderQueueList(); });
      filterSelects = { typeSel, stageSel, respSel };
      const exportBtn = h('button', { class: 'btn', type: 'button', text: 'Exportar CSV', title: 'Baixa a fila filtrada em CSV (arquivo gerado no seu computador)' });
      exportBtn.addEventListener('click', () => handlers.onExport && handlers.onExport(filteredQueue()));
      wrap.appendChild(h('div', { class: 'filters' }, search, typeSel, stageSel, respSel,
        h('label', { class: 'check' }, showAll, 'Mostrar cards sem pendência'), h('div', { class: 'full actions' }, exportBtn)));
      listEl = h('div', { class: 'list', role: 'list' });
      wrap.appendChild(listEl);
      renderKpis();
      renderQueueList();
      return wrap;
    }

    function filteredQueue() {
      if (!state || !state.analysis) return [];
      const term = util.normKey(ui.search);
      return state.analysis.queue.filter((r) => {
        if (!ui.showAll && !r.alerts.length) return false;
        if (ui.type && !r.alerts.some((a) => a.type === ui.type)) return false;
        if (ui.stage && r.card.funnel.key + '|' + r.card.stage.key !== ui.stage) return false;
        if (ui.resp && (r.card.responsible || '') !== ui.resp) return false;
        if (term) {
          const hay = util.normKey([r.card.title, r.card.id, r.card.stage.name, r.card.funnel.name, r.card.responsible].join(' '));
          if (hay.indexOf(term) < 0) return false;
        }
        return true;
      });
    }

    function renderQueueList() {
      if (!listEl) return;
      const queue = state && state.analysis ? state.analysis.queue : [];
      if (filterSelects) {
        const types = Object.entries(analyze.TYPES).map(([k, t]) => [k, t.label]);
        const stages = new Map(); const resps = new Map();
        for (const r of queue) {
          stages.set(r.card.funnel.key + '|' + r.card.stage.key, (r.card.funnel.name ? r.card.funnel.name + ' › ' : '') + r.card.stage.name);
          if (r.card.responsible) resps.set(r.card.responsible, r.card.responsible);
        }
        optionList(filterSelects.typeSel, types, 'Todos os tipos', ui.type);
        optionList(filterSelects.stageSel, [...stages.entries()], 'Todas as etapas', ui.stage);
        optionList(filterSelects.respSel, [...resps.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), 'Todos os responsáveis', ui.resp);
      }
      listEl.textContent = '';
      if (!state || !['ok', 'partial'].includes(state.status)) {
        listEl.appendChild(h('div', { class: 'empty', text: state && STATUS_TEXT[state.status] ? STATUS_TEXT[state.status][1] : 'Aguardando leitura da página…' }));
        return;
      }
      const items = filteredQueue();
      if (!items.length) {
        const s = state.analysis.summary;
        listEl.appendChild(h('div', { class: 'empty' },
          s.withAlerts ? 'Nenhum card corresponde aos filtros.' :
            'Nenhuma pendência identificada nos ' + s.open + ' cards abertos lidos nesta página.',
          s.noData ? h('div', { class: 'small', text: s.noData + ' card(s) sem regra ou dado aplicável: configure SLA, prazos ou o campo de prazo na aba "Configurar SLA".' }) : null));
        return;
      }
      const max = 300;
      items.slice(0, max).forEach((r, i) => listEl.appendChild(renderItem(r, i + 1)));
      if (items.length > max) listEl.appendChild(h('div', { class: 'empty small', text: 'Exibindo os ' + max + ' primeiros de ' + items.length + '. Use filtros ou exporte o CSV.' }));
    }

    function renderItem(r, rank) {
      const c = r.card;
      const tz = state.settings.clock.tz;
      const item = h('div', { class: 'item ' + sevClass(r.maxSev), role: 'listitem' });
      item.appendChild(h('div', { class: 'top' },
        h('span', { class: 'rank', text: '#' + rank }),
        h('span', { class: 'title', text: c.title }),
        h('span', { class: 'muted small', text: 'ID ' + c.id })));
      item.appendChild(h('div', { class: 'meta', text: [
        (c.funnel.name || 'Funil não identificado') + ' › ' + (c.stage.name || 'Etapa não identificada'),
        c.responsible ? 'Resp.: ' + c.responsible : 'Responsável não exibido',
        c.amount ? util.formatMoney(c.amount.amount, c.amount.currency) : 'Valor não exibido'
      ].join(' · ') }));
      const chips = h('div', { class: 'chips' });
      if (r.alerts.length) {
        for (const a of r.alerts) chips.appendChild(h('span', { class: 'chip ' + sevClass(a.sev), text: analyze.TYPES[a.type].short }));
      } else {
        chips.appendChild(h('span', { class: 'chip ' + (r.status === 'sem_pendencia' ? 'ok' : 'gray'),
          text: r.status === 'sem_pendencia' ? 'Nenhuma pendência identificada' : 'Sem regra ou dado aplicável' }));
      }
      if (!c.present) chips.appendChild(h('span', { class: 'chip gray', text: 'Não visível agora (lido há ' + util.formatDuration(state.lastRun - c.lastSeen) + ')' }));
      item.appendChild(chips);
      const main = r.alerts[0];
      if (main) {
        const parts = [];
        if (main.deadline) parts.push('Prazo aplicado: ' + time.formatDateTime(main.deadline, tz));
        else if (main.limitMs) parts.push('Prazo aplicado: ' + util.formatHours(main.limitMs / 3600000));
        else parts.push('Prazo: não exibido pelo Bitrix');
        if (main.overdueMs !== null && main.overdueMs !== undefined) parts.push('Atraso: ' + util.formatDuration(main.overdueMs));
        else if (main.remainingMs) parts.push('Restam: ' + util.formatDuration(main.remainingMs));
        else parts.push('Atraso: não exibido');
        parts.push('Origem: ' + main.origin);
        item.appendChild(h('div', { class: 'line', text: parts.join(' · ') }));
      }
      if (r.alerts.some((a) => a.partial)) item.appendChild(h('div', { class: 'partial', text: 'Contagem parcial desde a observação local.' }));

      const actions = h('div', { class: 'actions' });
      const safe = c.url ? util.safeCardUrl(c.url) : null;
      if (safe) actions.appendChild(h('a', { class: 'btn primary', href: safe, target: '_blank', rel: 'noopener noreferrer', text: 'Abrir card' }));
      else actions.appendChild(h('span', { class: 'btn', 'aria-disabled': 'true', text: 'Link não disponível' }));
      const locate = h('button', { class: 'btn', type: 'button', text: 'Localizar na página' });
      if (!c.present) { locate.disabled = true; locate.title = 'O card não está carregado na página neste momento.'; }
      locate.addEventListener('click', () => handlers.onLocate && handlers.onLocate(c.key));
      actions.appendChild(locate);
      const expanded = ui.expanded.has(c.key);
      const det = h('button', { class: 'btn', type: 'button', 'aria-expanded': String(expanded), text: expanded ? 'Ocultar evidências' : 'Evidências' });
      det.addEventListener('click', () => {
        if (ui.expanded.has(c.key)) ui.expanded.delete(c.key); else ui.expanded.add(c.key);
        item.replaceWith(renderItem(r, rank));
      });
      actions.appendChild(det);
      item.appendChild(actions);
      if (expanded) item.appendChild(renderEvidence(r));
      return item;
    }

    function renderEvidence(r) {
      const tz = state.settings.clock.tz;
      const box = h('div', { class: 'evidence' });
      for (const a of r.alerts) {
        box.appendChild(h('h3', { text: a.label }));
        const ul = h('ul');
        ul.appendChild(h('li', { text: 'Origem da informação: ' + a.origin }));
        ul.appendChild(h('li', { text: 'Prazo aplicado: ' + (a.deadline ? time.formatDateTime(a.deadline, tz) : a.limitMs ? util.formatHours(a.limitMs / 3600000) : 'não exibido') }));
        if (a.overdueMs !== null && a.overdueMs !== undefined) ul.appendChild(h('li', { text: 'Tempo de atraso: ' + util.formatDuration(a.overdueMs) + (state.settings.clock.mode === 'expediente' ? ' (expediente)' : ' (corrido)') }));
        if (a.remainingMs) ul.appendChild(h('li', { text: 'Tempo restante: ' + util.formatDuration(a.remainingMs) }));
        for (const d of a.details || []) ul.appendChild(h('li', { text: d }));
        box.appendChild(ul);
      }
      box.appendChild(h('h3', { text: 'Outras verificações' }));
      const ul = h('ul');
      ul.appendChild(h('li', { text: 'Etapa lida de: ' + r.card.stage.source + (r.card.stage.id ? ' (ID ' + r.card.stage.id + ')' : '') }));
      ul.appendChild(h('li', { text: r.card.signalsAvailable ? 'Indicadores de atividade exibidos pelo Bitrix: lidos.' : 'Indicadores de atividade: não exibidos neste card/visualização (não significa ausência de acompanhamento).' }));
      for (const n of r.notes) ul.appendChild(h('li', { text: n }));
      box.appendChild(ul);
      return box;
    }

    // ---------- Distribuição ----------

    function distTable(title, map, emptyText) {
      const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
      const max = entries.reduce((m, e) => Math.max(m, e[1]), 0) || 1;
      const sec = h('div', { class: 'section' }, h('h2', { text: title }));
      if (!entries.length) { sec.appendChild(h('div', { class: 'muted small', text: emptyText })); return sec; }
      const tbody = h('tbody');
      for (const [k, v] of entries) {
        tbody.appendChild(h('tr', null, h('td', { text: k }), h('td', { class: 'num', text: String(v) }),
          h('td', { style: 'width:35%' }, h('div', { class: 'bar', style: 'width:' + Math.round((v / max) * 100) + '%' }))));
      }
      sec.appendChild(h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', { text: 'Item' }), h('th', { text: 'Cards' }), h('th'))), tbody));
      return sec;
    }

    function renderSummary() {
      const wrap = h('div');
      if (!state || !state.analysis) { wrap.appendChild(h('div', { class: 'empty', text: 'Sem leitura disponível.' })); return wrap; }
      const s = state.analysis.summary;
      wrap.appendChild(h('div', { class: 'section muted small', text: 'Mostra onde estão os cards com pendência nos dados carregados. Não indica causa dos gargalos nem responsabilidade de nenhuma pessoa.' }));
      const typeMap = {};
      for (const [k, v] of Object.entries(s.byType)) typeMap[analyze.TYPES[k].label] = v;
      wrap.appendChild(distTable('Pendências por tipo', typeMap, 'Nenhuma pendência identificada.'));
      wrap.appendChild(distTable('Cards com pendência por etapa', s.byStage, 'Nenhuma pendência identificada.'));
      wrap.appendChild(distTable('Cards com pendência por responsável exibido', s.byResponsible, 'Nenhuma pendência identificada.'));
      const val = h('div', { class: 'section' }, h('h2', { text: 'Valor informado em atraso' }));
      for (const line of moneyLines(s.overdueValue)) val.appendChild(h('div', { text: line }));
      val.appendChild(h('div', { class: 'muted small', text: 'Inclui cards com SLA vencido, prazo vencido, atividade vencida ou parados além do limite. Cada card entra uma única vez. Moedas diferentes não são somadas (nenhuma conversão configurada).' }));
      wrap.appendChild(val);
      const crit = h('div', { class: 'section' }, h('h2', { text: 'Critérios de prioridade' }));
      const ol = h('ul', { class: 'small' });
      for (const c of analyze.PRIORITY_CRITERIA) ol.appendChild(h('li', { text: c }));
      crit.appendChild(ol);
      wrap.appendChild(crit);
      return wrap;
    }

    // ---------- Configuração ----------

    let draft = null;

    function renderConfig() {
      draft = JSON.parse(JSON.stringify(state ? state.settings : settingsMod.defaults()));
      ui.configDirty = false;
      const wrap = h('form', { novalidate: true });
      const markDirty = () => { ui.configDirty = true; };
      wrap.addEventListener('input', markDirty);
      wrap.addEventListener('change', markDirty);
      const msgEl = h('div');
      wrap.appendChild(msgEl);

      // Relógio
      const clock = draft.clock;
      const modeSel = h('select', { class: 'input', name: 'mode' },
        h('option', { value: 'corrido', text: 'Tempo corrido (24 h, todos os dias)' }),
        h('option', { value: 'expediente', text: 'Expediente (dias úteis, horário e feriados)' }));
      modeSel.value = clock.mode;
      const tzInput = h('input', { class: 'input', name: 'tz', value: clock.tz, list: 'bnka-tz', autocomplete: 'off' });
      const tzList = h('datalist', { id: 'bnka-tz' }, TZ_SUGGESTIONS.map((z) => h('option', { value: z })));
      const startInput = h('input', { class: 'input', name: 'start', type: 'time', value: clock.start });
      const endInput = h('input', { class: 'input', name: 'end', type: 'time', value: clock.end });
      const days = h('div', { class: 'days' }, WEEKDAYS.map((d, i) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', name: 'wd', value: String(i), checked: clock.workdays.includes(i) }), d)));
      const holidays = h('textarea', { class: 'input', name: 'holidays', rows: '3', placeholder: 'Uma data por linha: 25/12/2026 ou 2026-12-25' });
      holidays.value = clock.holidays.map((k) => k.split('-').reverse().join('/')).join('\n');
      const warn = h('input', { class: 'input', name: 'warnPct', inputmode: 'decimal', value: String(draft.warnPct).replace('.', ',') });
      const cont = h('input', { class: 'input', name: 'continuityMin', inputmode: 'decimal', value: String(draft.continuityMin).replace('.', ',') });
      const retention = h('input', { class: 'input', name: 'retentionDays', inputmode: 'numeric', value: String(draft.retentionDays) });
      const gaps = h('input', { type: 'checkbox', name: 'countGaps', checked: draft.countGaps });
      const curYear = h('input', { type: 'checkbox', name: 'assumeCurrentYear', checked: draft.assumeCurrentYear });

      wrap.appendChild(h('div', { class: 'section' }, h('h2', { text: 'Relógio do SLA' }),
        field('Contagem', modeSel),
        field('Fuso horário', tzInput, 'Padrão: America/Sao_Paulo (horário de Brasília).'), tzList,
        h('div', { class: 'grid2' }, field('Início do expediente', startInput), field('Fim do expediente', endInput)),
        field('Dias úteis', days),
        field('Feriados', holidays, 'Usados apenas no modo expediente.'),
        h('div', { class: 'grid2' }, field('Aviso antecipado (% do SLA)', warn, '0 desativa o aviso.'), field('Retenção local (dias)', retention, 'Observações mais antigas são apagadas.')),
        field('Continuidade da observação (min)', cont, 'Intervalo máximo entre leituras para considerar a observação contínua.'),
        h('label', { class: 'check' }, gaps, 'Contar períodos sem observação como tempo na etapa (presume continuidade)'),
        h('div', { class: 'small muted', text: 'Desmarcado (padrão): conta apenas o tempo em que a extensão viu o card na etapa.' }),
        h('label', { class: 'check' }, curYear, 'Datas exibidas sem ano: considerar o ano corrente')));

      // Campos exibidos
      const labelsSeen = state && state.labelsSeen ? state.labelsSeen : [];
      const dlArea = h('textarea', { class: 'input', name: 'deadlineLabels', rows: '2', placeholder: 'Ex.: o rótulo exato do campo de prazo exibido no card' });
      dlArea.value = draft.deadlineLabels.join('\n');
      const entryArea = h('textarea', { class: 'input', name: 'stageEntryLabels', rows: '2', placeholder: 'Rótulo do campo que mostra a entrada na etapa (opcional)' });
      entryArea.value = draft.stageEntryLabels.join('\n');
      wrap.appendChild(h('div', { class: 'section' }, h('h2', { text: 'Campos exibidos nos cards' }),
        field('Campo que representa o prazo do card', dlArea, 'Um rótulo por linha, igual ao exibido no card. Vazio = regra desativada.'), suggestions(labelsSeen, dlArea),
        field('Campo com a data de entrada na etapa (opcional)', entryArea, 'Se o Bitrix exibir essa data, ela substitui a observação local. Não use "Modificado em": alteração genérica não prova entrada na etapa.'), suggestions(labelsSeen, entryArea)));

      // Regras por funil/etapa
      wrap.appendChild(renderRules());

      // Frases
      const ph = draft.extraPhrases;
      const slaArea = h('textarea', { class: 'input', name: 'phSla', rows: '2' }); slaArea.value = ph.sla.join('\n');
      const actArea = h('textarea', { class: 'input', name: 'phAct', rows: '2' }); actArea.value = ph.overdueActivity.join('\n');
      const noArea = h('textarea', { class: 'input', name: 'phNo', rows: '2' }); noArea.value = ph.noActivity.join('\n');
      wrap.appendChild(h('div', { class: 'section' }, h('h2', { text: 'Frases de sinalização do Bitrix (opcional)' }),
        h('div', { class: 'small muted', text: 'Textos adicionais que o seu portal exibe nos cards. Já reconhecidos por padrão: "SLA vencido", "Atividade vencida", "Sem atividades" e variações.' }),
        field('SLA vencido', slaArea), field('Atividade vencida', actArea), field('Sem atividade / acompanhamento', noArea)));

      const save = h('button', { class: 'btn primary', type: 'submit', text: 'Salvar configuração' });
      const discard = h('button', { class: 'btn', type: 'button', text: 'Descartar alterações', onclick: () => render(true) });
      wrap.appendChild(h('div', { class: 'sticky' }, save, discard));

      wrap.addEventListener('submit', async (e) => {
        e.preventDefault();
        const result = collectConfig(wrap, { modeSel, tzInput, startInput, endInput, holidays, warn, cont, retention, gaps, curYear, dlArea, entryArea, slaArea, actArea, noArea });
        msgEl.textContent = '';
        if (result.errors.length) {
          msgEl.appendChild(h('div', { class: 'errors', role: 'alert' }, 'Corrija antes de salvar:', h('ul', null, result.errors.map((er) => h('li', { text: er })))));
          msgEl.scrollIntoView({ block: 'nearest' });
          return;
        }
        const ok = handlers.onSaveSettings ? await handlers.onSaveSettings(result.settings) : false;
        ui.configDirty = false;
        msgEl.appendChild(h('div', { class: ok ? 'okmsg' : 'errors', role: 'status', text: ok ? 'Configuração salva. A análise foi atualizada.' : 'Não foi possível salvar (extensão atualizada ou desativada? Recarregue a página).' }));
      });
      return wrap;
    }

    function field(label, input, hint) {
      return h('label', { class: 'field' }, h('span', { text: label }), input, hint ? h('small', { text: hint }) : null);
    }

    function suggestions(labels, area) {
      if (!labels.length) return h('div', { class: 'small muted', text: 'Nenhum campo rotulado foi detectado nos cards carregados.' });
      const box = h('div', { class: 'suggest' }, h('span', { class: 'small muted', text: 'Campos detectados:' }));
      for (const l of labels.slice(0, 30)) {
        box.appendChild(h('button', { type: 'button', text: '+ ' + l, onclick: () => {
          const lines = area.value.split('\n').map((x) => x.trim()).filter(Boolean);
          if (!lines.some((x) => util.normKey(x) === util.normKey(l))) lines.push(l);
          area.value = lines.join('\n');
          ui.configDirty = true;
        } }));
      }
      return box;
    }

    function renderRules() {
      const sec = h('div', { class: 'section' }, h('h2', { text: 'Prazos por funil e etapa' }));
      const reg = state && state.registry ? state.registry : { funnels: {} };
      const keys = Object.keys(reg.funnels).sort((a, b) => (reg.funnels[b].l || 0) - (reg.funnels[a].l || 0));
      if (!keys.length) {
        sec.appendChild(h('div', { class: 'small muted', text: 'Abra o Kanban ou a Lista de um funil para que as etapas apareçam aqui.' }));
        return sec;
      }
      const current = state && state.currentFunnelKey && reg.funnels[state.currentFunnelKey] ? state.currentFunnelKey : keys[0];
      const sel = h('select', { class: 'input', 'aria-label': 'Funil' }, keys.map((k) => h('option', { value: k, text: reg.funnels[k].n + (k === state.currentFunnelKey ? ' (atual)' : '') })));
      sel.value = current;
      const tableBox = h('div');
      const draw = () => {
        tableBox.textContent = '';
        const fk = sel.value;
        const f = reg.funnels[fk];
        const stages = Object.entries(f.st).sort((a, b) => a[1].o - b[1].o);
        const tbody = h('tbody');
        for (const [sk, st] of stages) {
          const rule = settingsMod.getRule(draft, fk, sk);
          const autoFinal = st.id && analyze.FINAL_STAGE_RE.test(st.id);
          const sla = h('input', { class: 'input', inputmode: 'decimal', 'data-rule': 'sla', 'data-f': fk, 'data-s': sk, value: rule.sla ? String(rule.sla).replace('.', ',') : '0', 'aria-label': 'SLA em horas para ' + st.n });
          const stall = h('input', { class: 'input', inputmode: 'decimal', 'data-rule': 'stall', 'data-f': fk, 'data-s': sk, value: rule.stall ? String(rule.stall).replace('.', ',') : '0', 'aria-label': 'Limite de permanência em horas para ' + st.n });
          const pause = h('input', { type: 'checkbox', 'data-rule': 'pause', 'data-f': fk, 'data-s': sk, checked: rule.pause, 'aria-label': 'Suspende SLA' });
          const fin = h('select', { class: 'input', 'data-rule': 'final', 'data-f': fk, 'data-s': sk, 'aria-label': 'Etapa finalizada' },
            h('option', { value: 'auto', text: autoFinal ? 'Auto (sim)' : 'Auto (não)' }), h('option', { value: 'sim', text: 'Sim' }), h('option', { value: 'nao', text: 'Não' }));
          fin.value = rule.final === true ? 'sim' : rule.final === false ? 'nao' : 'auto';
          const sync = () => {
            const p1 = util.parseDecimalInput(sla.value); const p2 = util.parseDecimalInput(stall.value);
            sla.classList.toggle('invalid', !p1.ok); stall.classList.toggle('invalid', !p2.ok);
            settingsMod.setRule(draft, fk, sk, { sla: p1.ok ? p1.value : 0, stall: p2.ok ? p2.value : 0, pause: pause.checked, final: fin.value === 'sim' ? true : fin.value === 'nao' ? false : null });
          };
          [sla, stall, pause, fin].forEach((el) => el.addEventListener(el.tagName === 'INPUT' && el.type !== 'checkbox' ? 'input' : 'change', sync));
          tbody.appendChild(h('tr', null, h('td', { text: st.n }), h('td', { class: 'w' }, sla), h('td', { class: 'w' }, stall), h('td', null, pause), h('td', { class: 'w' }, fin)));
        }
        tableBox.appendChild(h('table', { class: 't' },
          h('thead', null, h('tr', null, h('th', { text: 'Etapa' }), h('th', { text: 'SLA (h)' }), h('th', { text: 'Parado (h)' }), h('th', { text: 'Pausa' }), h('th', { text: 'Final' }))), tbody));
      };
      sel.addEventListener('change', draw);
      draw();
      sec.append(field('Funil', sel), tableBox,
        h('div', { class: 'small muted', text: 'Horas aceitam frações (ex.: 1,25 = 1 h 15 min). 0 desativa a regra. "Pausa" suspende o SLA enquanto o card estiver na etapa; ao voltar para a etapa anterior, a contagem é retomada. "Final" retira o card da fila (Auto reconhece IDs WON/LOSE exibidos pelo Bitrix).' }));
      return sec;
    }

    function linesOf(area) {
      return area.value.split('\n').map((x) => util.cleanText(x, 80)).filter(Boolean);
    }

    function collectConfig(form, f) {
      const errors = [];
      const s = JSON.parse(JSON.stringify(draft));
      s.clock.mode = f.modeSel.value === 'expediente' ? 'expediente' : 'corrido';
      const tz = f.tzInput.value.trim();
      f.tzInput.classList.toggle('invalid', !time.isValidTimeZone(tz));
      if (!time.isValidTimeZone(tz)) errors.push('Fuso horário inválido: use um nome IANA, como America/Sao_Paulo.');
      else s.clock.tz = tz;
      const st = time.parseHHMM(f.startInput.value); const en = time.parseHHMM(f.endInput.value);
      if (st === null || en === null || en <= st) errors.push('Expediente: o horário final deve ser posterior ao inicial (mesmo dia).');
      else { s.clock.start = f.startInput.value; s.clock.end = f.endInput.value; }
      s.clock.workdays = Array.from(form.querySelectorAll('input[name="wd"]')).filter((c) => c.checked).map((c) => Number(c.value));
      if (s.clock.mode === 'expediente' && !s.clock.workdays.length) errors.push('Selecione ao menos um dia útil.');
      const hol = time.parseHolidayLines(f.holidays.value);
      errors.push(...hol.errors.map((e) => 'Feriados — ' + e));
      s.clock.holidays = hol.dates;
      const nums = [[f.warn, 'warnPct', 0, 99, 'Aviso antecipado'], [f.cont, 'continuityMin', 1, 240, 'Continuidade'], [f.retention, 'retentionDays', 1, 365, 'Retenção']];
      for (const [el, key, min, max, label] of nums) {
        const p = util.parseDecimalInput(el.value, { min, max });
        el.classList.toggle('invalid', !p.ok || p.empty);
        if (!p.ok || p.empty) errors.push(label + ': ' + (p.error || 'informe um valor') + ' (entre ' + min + ' e ' + max + ').');
        else s[key] = key === 'retentionDays' ? Math.round(p.value) : p.value;
      }
      s.countGaps = f.gaps.checked;
      s.assumeCurrentYear = f.curYear.checked;
      s.deadlineLabels = linesOf(f.dlArea);
      s.stageEntryLabels = linesOf(f.entryArea);
      if (s.deadlineLabels.some((l) => /modific|alterad|atualizad/i.test(util.normKey(l))) || s.stageEntryLabels.some((l) => /modific|atualizad/i.test(util.normKey(l)))) {
        errors.push('Campos de "modificação/atualização" não representam prazo nem entrada na etapa. Remova-os.');
      }
      s.extraPhrases = { sla: linesOf(f.slaArea), overdueActivity: linesOf(f.actArea), noActivity: linesOf(f.noArea) };
      for (const input of form.querySelectorAll('input[data-rule="sla"], input[data-rule="stall"]')) {
        const p = util.parseDecimalInput(input.value);
        if (!p.ok) errors.push('Etapa: valor "' + input.value.slice(0, 20) + '" inválido — ' + p.error);
      }
      return { errors, settings: s };
    }

    // ---------- Cobertura ----------

    function renderCoverage() {
      const wrap = h('div');
      const tz = state ? state.settings.clock.tz : 'America/Sao_Paulo';
      const sec = h('div', { class: 'section' }, h('h2', { text: 'Última leitura e cobertura' }));
      if (state && state.lastRun) {
        const ul = h('ul', { class: 'small' });
        ul.appendChild(h('li', { text: 'Leitura: ' + time.formatDateTime(state.lastRun, tz) + ' (' + Math.round(state.runMs || 0) + ' ms) · motivo: ' + (state.reason || '—') }));
        ul.appendChild(h('li', { text: 'Visualização: ' + (state.viewLabel || 'não reconhecida') }));
        ul.appendChild(h('li', { text: 'Cards reconhecidos: ' + state.cards.length + (state.retained ? ' (' + state.retained + ' lidos há pouco e fora do DOM agora)' : '') }));
        const fr = state.frames || {};
        ul.appendChild(h('li', { text: 'Iframes: ' + (fr.total || 0) + ' encontrados · ' + (fr.accessible || 0) + ' lidos (mesmo domínio) · ' + (fr.inaccessible || 0) + ' inacessíveis · ' + (fr.hidden || 0) + ' ocultos' }));
        ul.appendChild(h('li', { text: 'Somente os cards já carregados na página são analisados. A extensão não percorre páginas, não rola o kanban e não abre cards.' }));
        sec.appendChild(ul);
        if (state.columns && state.columns.length) {
          const tbody = h('tbody');
          for (const c of state.columns) {
            const declared = c.declared === null ? 'não exibido' : String(c.declared);
            const missing = c.declared !== null && c.declared > c.loaded ? ' · ' + (c.declared - c.loaded) + ' não carregados' : '';
            tbody.appendChild(h('tr', null, h('td', { text: c.stage.name }), h('td', { class: 'num', text: String(c.loaded) }), h('td', { class: 'num', text: declared + missing })));
          }
          sec.appendChild(h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', { text: 'Etapa' }), h('th', { text: 'Carregados' }), h('th', { text: 'Total exibido pelo Bitrix' }))), tbody));
        }
      } else {
        sec.appendChild(h('div', { class: 'muted', text: 'Nenhuma leitura ainda.' }));
      }
      wrap.appendChild(sec);

      wrap.appendChild(h('div', { class: 'section' }, h('h2', { text: 'Como ler os estados' }), h('ul', { class: 'small' },
        h('li', { text: 'Nenhuma pendência identificada: o card foi avaliado por pelo menos uma regra ou indicador e nada foi encontrado.' }),
        h('li', { text: 'Sem regra ou dado aplicável: não há regra configurada nem dado exibido para avaliar o card.' }),
        h('li', { text: 'Não exibido: o campo existe na configuração, mas este card/visualização não o mostra.' }),
        h('li', { text: 'Não encontrado: nenhum card carregado na página exibe o campo configurado.' }),
        h('li', { text: 'Não carregado: o Bitrix informa mais cards na etapa do que os presentes na página (role o kanban ou mude de página para carregá-los).' }),
        h('li', { text: 'Ausência de agenda ou histórico na tela não é tratada como falta de acompanhamento; só o texto explícito do Bitrix gera esse alerta.' }))));

      const dataSec = h('div', { class: 'section' }, h('h2', { text: 'Privacidade e dados locais' }), h('ul', { class: 'small' },
        h('li', { text: 'Sem webhook, token, senha ou servidor. A extensão lê apenas a página aberta, com a sessão que você já usa.' }),
        h('li', { text: 'Nada é enviado para fora do navegador: sem IA, analytics ou servidores próprios.' }),
        h('li', { text: 'Gravado localmente: configurações, nomes de funis/etapas e, por card, apenas ID, etapa e horários de observação (retenção de ' + (state ? state.settings.retentionDays : 30) + ' dias). Títulos, valores, responsáveis e conteúdo dos cards não são gravados.' }),
        h('li', { text: 'Observações armazenadas: ' + (state && state.storedCards !== undefined ? state.storedCards : '—') + ' cards.' })));
      const clearBtn = confirmButton('Limpar observações locais', 'Clique novamente para apagar', () => handlers.onClearData && handlers.onClearData('obs'));
      const resetBtn = confirmButton('Restaurar configurações padrão', 'Clique novamente para restaurar', () => handlers.onClearData && handlers.onClearData('all'));
      dataSec.appendChild(h('div', { class: 'actions' }, clearBtn, resetBtn));
      wrap.appendChild(dataSec);

      const diagSec = h('div', { class: 'section' }, h('h2', { text: 'Diagnóstico estrutural (calibração)' }),
        h('div', { class: 'small muted', text: 'Gera um resumo com contagens e nomes de classes do layout — sem nomes, valores ou textos dos cards — para ajustar a leitura caso o portal use uma estrutura diferente.' }));
      const pre = h('pre', { class: 'diag', hidden: true });
      const copy = h('button', { class: 'btn', type: 'button', text: 'Copiar diagnóstico estrutural' });
      copy.addEventListener('click', async () => {
        const txt = handlers.onDiagnostics ? JSON.stringify(handlers.onDiagnostics(), null, 1) : '{}';
        pre.textContent = txt; pre.hidden = false;
        try { await navigator.clipboard.writeText(txt); copy.textContent = 'Copiado ✓'; } catch (e) { copy.textContent = 'Selecione e copie o texto abaixo'; }
      });
      diagSec.append(h('div', { class: 'actions' }, copy), pre);
      wrap.appendChild(diagSec);
      wrap.appendChild(h('div', { class: 'small muted', text: 'Versão ' + (handlers.version || '') + ' · funciona enquanto o Chrome e a página do Bitrix estiverem abertos.' }));
      return wrap;
    }

    function confirmButton(label, confirmLabel, action) {
      const b = h('button', { class: 'btn danger', type: 'button', text: label });
      let armed = false; let timer = null;
      b.addEventListener('click', () => {
        if (!armed) {
          armed = true; b.textContent = confirmLabel;
          timer = setTimeout(() => { armed = false; b.textContent = label; }, 4000);
          return;
        }
        clearTimeout(timer); armed = false; b.textContent = 'Feito ✓';
        action();
      });
      return b;
    }

    // ---------- Destaque do card na página ----------

    let hlTimer = null; let hlRaf = null;
    function highlight(getRect) {
      cancelAnimationFrame(hlRaf); clearTimeout(hlTimer);
      const step = () => {
        const r = getRect();
        if (!r) { hl.hidden = true; return; }
        hl.hidden = false;
        hl.style.left = (r.left - 4) + 'px'; hl.style.top = (r.top - 4) + 'px';
        hl.style.width = (r.width + 8) + 'px'; hl.style.height = (r.height + 8) + 'px';
        hlRaf = requestAnimationFrame(step);
      };
      step();
      hlTimer = setTimeout(() => { cancelAnimationFrame(hlRaf); hl.hidden = true; }, 2600);
    }

    return {
      host,
      update(next) { state = next; render(false); },
      setOpen,
      isOpen: () => ui.open,
      restoreUi(saved) {
        if (saved && typeof saved.tab === 'string' && TABS.some(([id]) => id === saved.tab)) {
          ui.tab = saved.tab;
          for (const [k, b] of Object.entries(tabButtons)) b.setAttribute('aria-selected', String(k === ui.tab));
        }
        if (saved && saved.open) setOpen(true);
      },
      highlight,
      destroy() { cancelAnimationFrame(hlRaf); clearTimeout(hlTimer); host.remove(); }
    };
  }

  NS.panel = { createPanel, h };
})(typeof globalThis !== 'undefined' ? globalThis : this);
