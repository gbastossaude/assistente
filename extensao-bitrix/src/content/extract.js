/*
 * Leitura dos cards já exibidos na página do Bitrix24 (somente leitura do DOM).
 *
 * Seletores usados: estrutura padrão dos componentes main.kanban / crm.kanban e
 * main.ui.grid do Bitrix24. Eles NÃO foram confirmados no portal crm.hub-bnk.com
 * durante o desenvolvimento (sem acesso ao portal); por isso a leitura combina
 * várias estratégias e o painel oferece um diagnóstico estrutural (somente nomes
 * de classes, sem conteúdo) para calibração.
 *
 * Nada aqui clica, digita, rola, abre cards ou faz requisições de rede.
 */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});
  const util = NS.util;

  const HOST_ID = 'bnka-assistente-host';

  const SEL = {
    kanbanColumn: '.main-kanban-column',
    kanbanColumnTitle: '.main-kanban-column-title-text-inner, .main-kanban-column-title-text, [class*="kanban-column-title-text"]',
    kanbanColumnTotal: '.main-kanban-column-total-item, [class*="kanban-column-total-item"]',
    kanbanItem: '.main-kanban-item',
    kanbanItemAlt: '.crm-kanban-item',
    itemTitle: '.crm-kanban-item-title',
    itemPrice: '.crm-kanban-item-total-price, [class*="kanban-item-total-price"], [class*="kanban-item-price"]',
    itemField: '.crm-kanban-item-fields-item, [class*="kanban-item-fields-item"]:not([class*="-title"]):not([class*="-value"])',
    itemFieldLabel: '.crm-kanban-item-fields-item-title-text, .crm-kanban-item-fields-item-title, [class*="fields-item-title"]',
    itemFieldValue: '.crm-kanban-item-fields-item-value, [class*="fields-item-value"]',
    responsible: '[class*="responsible"], [class*="assigned"]',
    gridTable: 'table.main-grid-table',
    gridHead: 'th.main-grid-cell-head',
    gridRow: 'tr.main-grid-row-body[data-id], tr.main-grid-row[data-id]',
    login: 'form[name="form_auth"], input[name="USER_PASSWORD"], .bx-authform, .b24-network-auth-form, form[action*="/auth/"] input[type="password"]'
  };

  function q(el, sel) {
    try { return el.querySelector(sel); } catch (e) { return null; }
  }
  function qa(el, sel) {
    try { return Array.from(el.querySelectorAll(sel)); } catch (e) { return []; }
  }
  function text(el, max) {
    return el ? util.cleanText(el.textContent, max || 200) : '';
  }
  function classOf(el) {
    const c = el && el.getAttribute ? el.getAttribute('class') : '';
    return typeof c === 'string' ? c : '';
  }
  function insideOwnUi(el) {
    return !!(el && el.closest && el.closest('#' + HOST_ID));
  }

  // ---------- Contexto da página ----------

  function pageContext(loc) {
    const path = loc.pathname || '/';
    const ctx = { path, isCrm: /^\/crm\//.test(path), entity: null, categoryId: null, viewHint: null, details: false };
    let m = path.match(/^\/crm\/(deal|lead|quote|invoice|contact|company)\b/);
    if (m) ctx.entity = m[1];
    m = path.match(/^\/crm\/type\/(\d+)\//);
    if (m) ctx.entity = 'dyn' + m[1];
    m = path.match(/\/category\/(\d+)\//);
    if (m) ctx.categoryId = m[1];
    else {
      try {
        const c = new URLSearchParams(loc.search || '').get('category_id');
        if (c && /^\d+$/.test(c)) ctx.categoryId = c;
      } catch (e) { /* sem parâmetro */ }
    }
    if (/\/kanban\//.test(path)) ctx.viewHint = 'kanban';
    else if (/\/(list|category)\//.test(path)) ctx.viewHint = 'lista';
    ctx.details = /\/(details|show)\/\d+\//.test(path);
    return ctx;
  }

  function isLoginPage(doc) {
    return !!q(doc, SEL.login);
  }

  /** Categoria (funil) a partir do ID da etapa: "C2:NEW" → 2, "DT128_5:NEW" → 5, "NEW" → 0. */
  function categoryFromStageId(stageId) {
    if (!stageId) return null;
    let m = stageId.match(/^C(\d+):/);
    if (m) return m[1];
    m = stageId.match(/^DT\d+_(\d+):/);
    if (m) return m[1];
    if (/^[A-Z_]+$/.test(stageId)) return '0';
    return null;
  }

  function funnelNameFromPage(doc) {
    const sels = ['[data-role="category-selector"]', '[class*="category-selector"]', '[class*="categories-selector"]', '.crm-kanban-categories'];
    for (const s of sels) {
      const el = q(doc, s);
      const t = text(el, 80);
      if (t && t.length <= 60) return t;
    }
    return null;
  }

  function resolveFunnel(entity, categoryId, name, registry) {
    if (categoryId !== null && categoryId !== undefined) {
      const key = entity + ':' + categoryId;
      const known = registry && registry.funnels[key];
      return { key, name: name || (known && known.n) || (categoryId === '0' ? 'Funil geral' : 'Funil ' + categoryId), source: 'id' };
    }
    if (name && registry) {
      const nk = util.normKey(name);
      for (const fk of Object.keys(registry.funnels)) {
        if (fk.indexOf(entity + ':') === 0 && util.normKey(registry.funnels[fk].n) === nk) return { key: fk, name, source: 'nome' };
      }
    }
    if (name) return { key: entity + ':n:' + util.normKey(name).slice(0, 60), name, source: 'nome' };
    return { key: entity + ':?', name: 'Funil não identificado', source: 'desconhecido' };
  }

  /** Lista sem funil exibido: usa o funil já conhecido somente se a etapa existir em UM único funil. */
  function funnelByStage(entity, stageKey, registry) {
    if (!registry) return null;
    const hits = Object.keys(registry.funnels).filter((fk) => fk.indexOf(entity + ':') === 0 && registry.funnels[fk].st[stageKey]);
    if (hits.length !== 1) return null;
    return { key: hits[0], name: registry.funnels[hits[0]].n, source: 'inferido pela etapa (correspondência única)' };
  }

  // ---------- Sinais exibidos pelo Bitrix ----------

  const RE = {
    overdueWords: /(vencid|atrasad|expirad|overdue|expired|past due)/i,
    dangerClass: /(danger|overdue|expired|deadline-over|--red\b|-red\b|_red\b|alert)/i,
    activityClass: /(activity|counter|todo|planner|deadline)/i,
    activityText: /\b(?<!sem\s)(?<!nenhuma\s)(atividades?|tarefas?|compromissos?)\s+(vencid[ao]s?|atrasad[ao]s?)\b/i,
    nativeSla: /\bSLA\b[^.;\n]{0,25}?(vencid|expirad|estourad|atrasad|excedid|violad|overdue|expired|breach)/i,
    slaClass: /(^|[\s_-])sla([\s_-]|$)/i,
    noActivity: /\b(sem|nenhuma|n[aã]o h[aá])\s+(atividades?|tarefas?|acompanhamentos?|to-?dos?|compromissos?)\b(?!\s+(vencid|atrasad))/i
  };

  /** Texto "visível" do card, ignorando valores de campos e o título (podem conter qualquer coisa). */
  function indicatorText(el) {
    const doc = el.ownerDocument;
    const out = [];
    const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    let n; let len = 0;
    while ((n = walker.nextNode()) && len < 4000) {
      const p = n.parentElement;
      if (!p || p.closest('[class*="fields-item-value"], .crm-kanban-item-title, script, style')) continue;
      const t = n.nodeValue.trim();
      if (t) { out.push(t); len += t.length; }
    }
    return util.cleanText(out.join(' '), 4000);
  }

  function phraseMatch(str, phrases) {
    const s = util.normKey(str);
    for (const p of phrases || []) {
      const k = util.normKey(p);
      if (k && s.indexOf(k) >= 0) return p;
    }
    return null;
  }

  function computeSignals(el, extra) {
    const ex = extra || {};
    const signals = { activityOverdue: null, noActivity: null, nativeSla: null };
    let activityUi = false;
    for (const c of qa(el, '[class*="activity"], [class*="counter"], [class*="todo"], [class*="planner"], [class*="deadline"], [class*="sla"]')) {
      const cls = classOf(c);
      const hint = util.cleanText(c.getAttribute('title') || c.getAttribute('aria-label') || c.getAttribute('data-hint') || '', 120);
      if (RE.activityClass.test(cls)) activityUi = true;
      if (!signals.nativeSla && RE.slaClass.test(cls) && (RE.dangerClass.test(cls) || RE.overdueWords.test(hint))) {
        signals.nativeSla = { text: hint || 'indicador de SLA em destaque (classe ' + util.cleanText(cls, 60) + ')' };
      }
      if (!signals.activityOverdue && RE.activityClass.test(cls)) {
        const num = parseInt(text(c, 10), 10);
        if (RE.overdueWords.test(hint)) {
          signals.activityOverdue = { text: hint, firm: true };
        } else if (RE.dangerClass.test(cls) && !(num === 0)) {
          signals.activityOverdue = {
            text: 'contador de atividades em destaque de alerta' + (num > 0 ? ' (' + num + ')' : '') +
              '. Observação: o Bitrix também destaca em vermelho pouco antes do vencimento (padrão: 15 min).',
            firm: false
          };
        }
      }
    }
    const t = indicatorText(el);
    let m;
    if (!signals.nativeSla && (m = t.match(RE.nativeSla))) signals.nativeSla = { text: util.cleanText(m[0], 60) };
    if (!signals.nativeSla) { const p = phraseMatch(t, ex.sla); if (p) signals.nativeSla = { text: 'frase configurada: ' + p }; }
    if (!signals.activityOverdue && (m = t.match(RE.activityText))) signals.activityOverdue = { text: util.cleanText(m[0], 60), firm: true };
    if (!signals.activityOverdue) { const p = phraseMatch(t, ex.overdueActivity); if (p) signals.activityOverdue = { text: 'frase configurada: ' + p, firm: true }; }
    if ((m = t.match(RE.noActivity))) signals.noActivity = { text: util.cleanText(m[0], 60) };
    if (!signals.noActivity) { const p = phraseMatch(t, ex.noActivity); if (p) signals.noActivity = { text: 'frase configurada: ' + p }; }
    if (signals.noActivity && signals.activityOverdue) signals.noActivity = null; // contraditório: prevalece o indicador de vencida
    return { signals, available: activityUi || !!(signals.activityOverdue || signals.noActivity || signals.nativeSla) };
  }

  // ---------- Kanban ----------

  function kanbanColumns(doc) {
    return qa(doc, SEL.kanbanColumn).filter((c) => !insideOwnUi(c));
  }

  function stripCount(name) {
    return util.cleanText(name, 120).replace(/\s*\(\d+\)\s*$/, '').trim();
  }

  function extractKanban(doc, page, opts) {
    const cols = kanbanColumns(doc);
    if (!cols.length) return null;
    const columns = [];
    const cards = [];
    const seen = new Set();
    let catFromStages = null;
    cols.forEach((col) => {
      const sid = col.getAttribute('data-id');
      const c = categoryFromStageId(sid);
      if (c !== null && catFromStages === null) catFromStages = c;
    });
    const category = catFromStages !== null ? catFromStages : page.categoryId;
    const entity = page.entity || 'crm';
    const funnel = resolveFunnel(entity, category, funnelNameFromPage(doc), opts.registry);

    cols.forEach((col, order) => {
      const stageId = util.cleanText(col.getAttribute('data-id') || '', 80) || null;
      const stageName = stripCount(text(q(col, SEL.kanbanColumnTitle), 120)) || stageId || 'Etapa ' + (order + 1);
      const totalText = text(q(col, SEL.kanbanColumnTotal), 20).replace(/[\s.]/g, '');
      const declared = /^\d+$/.test(totalText) ? Number(totalText) : null;
      let items = qa(col, SEL.kanbanItem);
      if (!items.length) items = qa(col, SEL.kanbanItemAlt);
      const stage = { key: util.normKey(stageName), id: stageId, name: stageName, order, source: 'coluna do kanban' };
      let loaded = 0;
      for (const item of items) {
        const card = kanbanCard(item, page, funnel, stage, opts);
        if (!card || seen.has(card.key)) continue;
        seen.add(card.key);
        cards.push(card);
        loaded++;
      }
      columns.push({ stage, funnel, loaded, declared });
    });
    return { view: 'kanban', columns, cards, funnel };
  }

  function kanbanCard(item, page, funnel, stage, opts) {
    const titleEl = q(item, SEL.itemTitle);
    const linkEl = (titleEl && (titleEl.closest('a[href]') || q(titleEl, 'a[href]'))) || q(item, 'a[href*="/details/"]');
    const href = linkEl ? linkEl.getAttribute('href') : null;
    const parsed = href ? util.parseCardHref(new URL(href, util.ALLOWED_ORIGIN + '/').href) : null;
    let id = util.cleanText(item.getAttribute('data-id') || '', 20);
    if (!/^\d+$/.test(id)) id = parsed ? parsed.id : '';
    if (!/^\d+$/.test(id)) return null;
    const entity = (parsed && parsed.entity) || page.entity || 'crm';
    const title = text(titleEl || linkEl, 200) || 'Card ' + id;
    const fields = [];
    for (const f of qa(item, SEL.itemField)) {
      const label = util.cleanText(text(q(f, SEL.itemFieldLabel), 80).replace(/[:：]\s*$/, ''), 80);
      const valueEl = q(f, SEL.itemFieldValue);
      if (label && valueEl) fields.push({ label, value: text(valueEl, 200) });
    }
    let responsible = null;
    const rf = fields.find((f) => /^respons/.test(util.normKey(f.label)));
    if (rf && rf.value) responsible = rf.value;
    if (!responsible) {
      const r = q(item, SEL.responsible);
      if (r) responsible = util.cleanText(r.getAttribute('title') || r.getAttribute('data-hint') || r.textContent, 80) || null;
    }
    const priceEl = q(item, SEL.itemPrice);
    const sig = computeSignals(item, opts.settings && opts.settings.extraPhrases);
    return {
      key: entity + ':' + id, entity, id, title,
      url: (parsed && parsed.url) || util.buildCardUrl(entity, id),
      funnel, stage, responsible, amount: priceEl ? util.parseMoney(priceEl.textContent) : null,
      fields, signals: sig.signals, signalsAvailable: sig.available, view: 'kanban', present: true, el: item
    };
  }

  // ---------- Lista (main.ui.grid) ----------

  const ROLE_BY_CODE = [
    [/^TITLE$/, 'title'], [/^(STAGE_ID|STATUS_ID|STAGE)$/, 'stage'], [/^(ASSIGNED_BY|ASSIGNED_BY_ID|RESPONSIBLE_ID|ASSIGNED_BY_FORMATTED_NAME)$/, 'responsible'],
    [/^(OPPORTUNITY|OPPORTUNITY_WITH_CURRENCY|OPPORTUNITY_ACCOUNT|SUM|PRICE)$/, 'amount'], [/^CATEGORY_ID$/, 'funnel'], [/^ID$/, 'id']
  ];
  const ROLE_BY_LABEL = [
    [/^(nome|titulo|negocio|negociacao|oportunidade|lead)\b/, 'title'], [/^(etapa|fase|status)\b/, 'stage'],
    [/^respons/, 'responsible'], [/^(valor|receita|soma|montante)\b/, 'amount'], [/^(funil|pipeline)\b/, 'funnel']
  ];

  function gridHeaders(table) {
    let ths = qa(table, 'thead ' + SEL.gridHead);
    if (!ths.length) ths = qa(table, SEL.gridHead);
    return ths.map((th, idx) => {
      const code = util.cleanText(th.getAttribute('data-name') || '', 60).toUpperCase();
      const label = util.cleanText(text(q(th, '.main-grid-head-title') || th, 80), 80);
      let role = null;
      for (const [re, r] of ROLE_BY_CODE) if (code && re.test(code)) role = r;
      if (!role) for (const [re, r] of ROLE_BY_LABEL) if (re.test(util.normKey(label))) { role = r; break; }
      const activity = /ACTIVITY/.test(code) || /atividade/.test(util.normKey(label));
      return { idx, code, label, role, activity };
    });
  }

  function extractGrid(doc, page, opts) {
    const tables = qa(doc, SEL.gridTable).filter((t) => !insideOwnUi(t) && qa(t, SEL.gridRow).length);
    const anyGrid = qa(doc, SEL.gridTable).length;
    if (!tables.length) return anyGrid ? { view: 'lista', columns: [], cards: [], funnel: null, empty: true } : null;
    const cards = [];
    const seen = new Set();
    let funnelOfPage = null;
    for (const table of tables) {
      const headers = gridHeaders(table);
      const roleIdx = {};
      headers.forEach((h) => { if (h.role && roleIdx[h.role] === undefined) roleIdx[h.role] = h.idx; });
      for (const row of qa(table, SEL.gridRow)) {
        if (/main-grid-row-(head|empty)/.test(classOf(row))) continue;
        const cells = Array.from(row.children).filter((c) => c.tagName === 'TD');
        const cellOf = (role) => (roleIdx[role] !== undefined ? cells[roleIdx[role]] : null);
        const titleCell = cellOf('title');
        const link = (titleCell && q(titleCell, 'a[href]')) || q(row, 'a[href*="/details/"]');
        const parsed = link ? util.parseCardHref(new URL(link.getAttribute('href'), util.ALLOWED_ORIGIN + '/').href) : null;
        let id = util.cleanText(row.getAttribute('data-id') || '', 20);
        if (!/^\d+$/.test(id)) id = parsed ? parsed.id : '';
        if (!/^\d+$/.test(id)) continue;
        const entity = (parsed && parsed.entity) || page.entity || 'crm';
        const key = entity + ':' + id;
        if (seen.has(key)) continue;
        seen.add(key);
        const stageName = stripCount(text(cellOf('stage'), 120));
        const funnelName = text(cellOf('funnel'), 80) || null;
        let funnel = resolveFunnel(entity, page.categoryId, funnelName || (page.categoryId === null ? null : funnelNameFromPage(doc)), opts.registry);
        if (funnel.source === 'desconhecido' && stageName) funnel = funnelByStage(entity, util.normKey(stageName), opts.registry) || funnel;
        funnelOfPage = funnelOfPage || funnel;
        const fields = [];
        let activityText = [];
        headers.forEach((h) => {
          const cell = cells[h.idx];
          if (!cell || !h.label || h.role) return;
          fields.push({ label: h.label, value: text(cell, 200) });
          if (h.activity) activityText.push(cell);
        });
        // Sinais: só nas colunas de atividade (os demais campos podem conter qualquer texto).
        let signals = { activityOverdue: null, noActivity: null, nativeSla: null };
        let available = false;
        for (const cell of activityText) {
          const s = computeSignals(cell, opts.settings && opts.settings.extraPhrases);
          available = true;
          for (const k of Object.keys(signals)) signals[k] = signals[k] || s.signals[k];
        }
        const amountCell = cellOf('amount');
        cards.push({
          key, entity, id, title: text((link || titleCell), 200) || 'Card ' + id,
          url: (parsed && parsed.url) || util.buildCardUrl(entity, id), funnel,
          stage: stageName
            ? { key: util.normKey(stageName), id: null, name: stageName, order: null, source: 'coluna "' + (headers[roleIdx.stage] || {}).label + '" da lista' }
            : { key: '?', id: null, name: 'Etapa não exibida', order: null, source: 'não exibido' },
          responsible: text(cellOf('responsible'), 80) || null,
          amount: amountCell ? util.parseMoney(amountCell.textContent) : null,
          fields, signals, signalsAvailable: available, view: 'lista', present: true, el: row
        });
      }
    }
    return { view: 'lista', columns: [], cards, funnel: funnelOfPage };
  }

  // ---------- Último recurso: links de cards ----------

  function extractLinks(doc, page) {
    const cards = [];
    const seen = new Set();
    for (const a of qa(doc, 'a[href*="/crm/"][href*="/details/"]')) {
      if (insideOwnUi(a)) continue;
      const parsed = util.parseCardHref(new URL(a.getAttribute('href'), util.ALLOWED_ORIGIN + '/').href);
      if (!parsed || seen.has(parsed.entity + ':' + parsed.id)) continue;
      const title = text(a, 200);
      if (!title) continue;
      seen.add(parsed.entity + ':' + parsed.id);
      cards.push({
        key: parsed.entity + ':' + parsed.id, entity: parsed.entity, id: parsed.id, title, url: parsed.url,
        funnel: { key: parsed.entity + ':?', name: 'Funil não identificado', source: 'desconhecido' },
        stage: { key: '?', id: null, name: 'Etapa não identificada', order: null, source: 'não exibido' },
        responsible: null, amount: null, fields: [], signals: {}, signalsAvailable: false, view: 'links', present: true, el: a
      });
    }
    return cards.length ? { view: 'links', columns: [], cards, funnel: null } : null;
  }

  // ---------- Frames ----------

  function isRendered(el) {
    try {
      if (!el.getClientRects().length) return false;
      const st = el.ownerDocument.defaultView.getComputedStyle(el);
      return st.visibility !== 'hidden' && st.display !== 'none';
    } catch (e) {
      return false;
    }
  }

  /** Documentos legíveis: o principal e iframes visíveis do mesmo domínio autorizado. */
  function collectDocuments(win) {
    const docs = [{ doc: win.document, frame: 'principal', iframe: null }];
    const info = { total: 0, accessible: 0, inaccessible: 0, hidden: 0 };
    for (const iframe of qa(win.document, 'iframe').slice(0, 30)) {
      if (insideOwnUi(iframe)) continue;
      info.total++;
      if (!isRendered(iframe)) { info.hidden++; continue; }
      try {
        const w = iframe.contentWindow;
        if (!w || w.location.origin !== util.ALLOWED_ORIGIN) { info.inaccessible++; continue; }
        const d = iframe.contentDocument;
        if (!d || !d.documentElement) { info.inaccessible++; continue; }
        info.accessible++;
        docs.push({ doc: d, frame: 'iframe', iframe });
      } catch (e) {
        info.inaccessible++;
      }
    }
    return { docs, info };
  }

  // ---------- Leitura completa ----------

  function extractAll(win, opts) {
    const page = pageContext(win.location);
    const { docs, info } = collectDocuments(win);
    const cards = [];
    const columns = [];
    const views = [];
    const labelsOnPage = new Set();
    let login = isLoginPage(win.document);
    let structureFound = false;
    for (const d of docs) {
      let dpage = page;
      if (d.iframe) {
        try { dpage = pageContext(d.iframe.contentWindow.location); } catch (e) { continue; }
        if (isLoginPage(d.doc)) login = true;
      }
      const res = extractKanban(d.doc, dpage, opts) || extractGrid(d.doc, dpage, opts);
      if (res) {
        structureFound = true;
        views.push({ view: res.view, frame: d.frame, funnel: res.funnel });
        for (const c of res.cards) { c.frame = d.frame; cards.push(c); }
        columns.push(...res.columns);
      }
    }
    let partial = false;
    if (!cards.length && !structureFound && page.isCrm && !page.details) {
      const res = extractLinks(win.document, page);
      if (res) { partial = true; views.push({ view: 'links', frame: 'principal' }); cards.push(...res.cards); }
    }
    for (const c of cards) for (const f of c.fields) labelsOnPage.add(util.normKey(f.label));

    let status;
    if (cards.length) status = partial ? 'partial' : 'ok';
    else if (login) status = 'login';
    else if (structureFound) status = 'empty';
    else if (!page.isCrm) status = 'not_crm';
    else if (page.details) status = 'details';
    else status = 'unknown';

    return { status, page, cards, columns, views, frames: info, labelsOnPage };
  }

  /** Diagnóstico estrutural para calibração: apenas contagens e nomes de classes, sem texto da página. */
  function structuralDiagnostics(win) {
    const doc = win.document;
    const counts = {};
    const probes = Object.assign({}, SEL, {
      anyKanban: '[class*="kanban"]', anyGrid: '[class*="main-grid"]', iframes: 'iframe', detailLinks: 'a[href*="/details/"]'
    });
    for (const [k, s] of Object.entries(probes)) counts[k] = qa(doc, s).filter((e) => !insideOwnUi(e)).length;
    const classes = {};
    for (const el of qa(doc, '[class*="kanban"], [class*="main-grid"]').slice(0, 4000)) {
      if (insideOwnUi(el)) continue;
      for (const c of classOf(el).split(/\s+/)) {
        if (/kanban|grid/.test(c) && c.length < 80) classes[c] = (classes[c] || 0) + 1;
      }
    }
    const top = Object.entries(classes).sort((a, b) => b[1] - a[1]).slice(0, 60);
    const firstItem = q(doc, SEL.kanbanItem) || q(doc, SEL.kanbanItemAlt) || q(doc, SEL.gridRow);
    const itemTree = [];
    if (firstItem) {
      for (const el of qa(firstItem, '*').slice(0, 80)) {
        itemTree.push(el.tagName.toLowerCase() + (classOf(el) ? '.' + classOf(el).trim().split(/\s+/).slice(0, 3).join('.') : '') +
          (el.hasAttribute('data-id') ? '[data-id]' : '') + (el.hasAttribute('title') ? '[title]' : ''));
      }
    }
    return {
      gerado: new Date().toISOString(), caminho: pageContext(win.location).path.replace(/\d+/g, 'N'),
      contagens: counts, classes: top, estruturaDoPrimeiroCard: itemTree, frames: collectDocuments(win).info
    };
  }

  const api = { HOST_ID, SEL, pageContext, isLoginPage, categoryFromStageId, resolveFunnel, computeSignals, extractKanban, extractGrid, extractLinks, collectDocuments, extractAll, structuralDiagnostics };
  NS.extract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
