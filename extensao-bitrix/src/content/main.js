/*
 * Orquestração: leitura → observação local → análise → painel.
 * Reage a mudanças no DOM, navegação interna do Bitrix, iframes do mesmo domínio,
 * aba visível/oculta e atualização da extensão.
 */
(function (root) {
  'use strict';
  const NS = root.BNKA;
  if (!NS) return;
  if (window.top !== window) return; // painel somente no documento principal
  if (root.__bnkaRunning) return; // proteção contra injeção dupla no mesmo contexto
  root.__bnkaRunning = true;

  const { util, time, settings: S, observe, extract, analyze, csv, panel: panelMod } = NS;

  // Funções nativas sempre ligadas ao seu objeto original (evita "Illegal invocation").
  const nSetTimeout = util.bindNative(window, 'setTimeout');
  const nClearTimeout = util.bindNative(window, 'clearTimeout');
  const nSetInterval = util.bindNative(window, 'setInterval');
  const nClearInterval = util.bindNative(window, 'clearInterval');
  const nIdle = util.bindNative(window, 'requestIdleCallback');
  const nNow = util.bindNative(window.performance, 'now') || (() => Date.now());

  const DEBOUNCE_MS = 400;
  const MAX_WAIT_MS = 2000;
  const MIN_GAP_MS = 800;
  const PERIODIC_MS = 60000;
  const PERSIST_MS = 20000;
  const RETAIN_MS = 10 * 60000;
  const INSTANCE = Math.random().toString(36).slice(2) + Date.now().toString(36);

  let VERSION = '';
  try { VERSION = chrome.runtime.getManifest().version; } catch (e) { VERSION = '?'; }

  // Assume o lugar de uma instância anterior (ex.: após atualização da extensão).
  document.documentElement.setAttribute('data-bnka-instance', INSTANCE);
  document.dispatchEvent(new Event('bnka:takeover'));

  let settings = S.defaults();
  let removedLegacy = [];
  let obs = observe.emptyStore();
  let registry = observe.emptyRegistry();
  let ui = null;
  let state = null;
  let stopped = false;
  let dirtyStore = false;
  let pendingWhileHidden = false;
  let timer = null; let firstRequestAt = 0; let pendingReason = ''; let lastRunAt = 0;
  let lastHref = location.href;
  let viewSig = '';
  let retained = new Map();
  let lastCards = [];
  const removedKeys = new Set();
  const intervals = [];
  const observedDocs = new WeakSet();
  const watchedFrames = new WeakSet();
  let mo = null;

  // ---------- Agendamento ----------

  function schedule(reason) {
    if (stopped) return;
    pendingReason = pendingReason || reason;
    const now = Date.now();
    if (!firstRequestAt) firstRequestAt = now;
    if (timer) nClearTimeout(timer);
    const sinceFirst = now - firstRequestAt;
    const gap = Math.max(0, MIN_GAP_MS - (now - lastRunAt));
    const wait = sinceFirst >= MAX_WAIT_MS ? gap : Math.max(DEBOUNCE_MS, gap);
    timer = nSetTimeout(fire, wait);
  }

  function fire() {
    timer = null; firstRequestAt = 0;
    const reason = pendingReason; pendingReason = '';
    if (nIdle) nIdle(() => run(reason), { timeout: 1000 }); else run(reason);
  }

  // ---------- Leitura e análise ----------

  function filterSignature(doc) {
    try {
      const f = doc.querySelector('.main-ui-filter-search');
      if (!f) return '';
      const squares = Array.from(f.querySelectorAll('.main-ui-square-item')).map((e) => e.textContent).join('|');
      const input = f.querySelector('input');
      return util.hashString(squares + '|' + (input ? input.value : ''));
    } catch (e) {
      return '';
    }
  }

  function isPausedObsKey(obsKey) {
    const i = obsKey.lastIndexOf('|');
    return S.getRule(settings, obsKey.slice(0, i), obsKey.slice(i + 1)).pause;
  }

  function run(reason) {
    if (stopped) return;
    if (!S.extensionAlive()) { shutdown('invalidated'); return; }
    if (document.hidden && reason !== 'manual') { pendingWhileHidden = true; return; }
    const t0 = nNow();
    const now = Date.now();
    lastRunAt = now;
    try {
      const ext = extract.extractAll(window, { registry, settings });
      attachFrames();

      // Visualização mudou (rota, filtro ou substituição em massa dos cards): descarta a retenção.
      const sig = location.pathname + location.search + '|' + filterSignature(document);
      const presentKeys = new Set(ext.cards.map((c) => c.key));
      const prevPresent = lastCards.filter((c) => c.present).map((c) => c.key);
      const overlap = prevPresent.filter((k) => presentKeys.has(k)).length;
      if (sig !== viewSig || (prevPresent.length >= 5 && overlap / prevPresent.length < 0.4) || !['ok', 'partial'].includes(ext.status)) {
        retained = new Map();
        viewSig = sig;
      }

      for (const col of ext.columns) {
        if (col.funnel && !/[?]$/.test(col.funnel.key)) {
          observe.registerStage(registry, col.funnel.key, col.funnel.name, col.stage.key, col.stage.name, col.stage.id, col.stage.order, now);
        }
      }
      for (const c of ext.cards) {
        c.lastSeen = now;
        retained.set(c.key, c);
        if (c.stage.key === '?' || /[?]$/.test(c.funnel.key)) continue;
        if (!ext.columns.length) observe.registerStage(registry, c.funnel.key, c.funnel.name, c.stage.key, c.stage.name, c.stage.id, null, now);
        if (analyze.isClosedStage(c, settings)) { if (obs.cards[c.key]) { observe.removeCard(obs, c.key); removedKeys.add(c.key); dirtyStore = true; } continue; }
        observe.recordObservation(obs, c.key, analyze.obsStageKey(c), now, { continuityMs: settings.continuityMin * 60000, isPaused: isPausedObsKey });
        dirtyStore = true;
      }
      let retainedCount = 0;
      const cards = [];
      for (const [key, c] of retained) {
        if (presentKeys.has(key)) { cards.push(c); continue; }
        if (now - c.lastSeen > RETAIN_MS) { retained.delete(key); continue; }
        c.present = false;
        c.el = null;
        retainedCount++;
        cards.push(c);
      }
      lastCards = cards;

      const labelsSeen = [];
      for (const c of ext.cards) {
        for (const f of c.fields) {
          if (labelsSeen.length < 40 && !labelsSeen.some((l) => util.normKey(l) === util.normKey(f.label))) labelsSeen.push(f.label);
        }
      }

      const analysis = analyze.analyzeAll(cards, { now, settings, obs, registry, labelsOnPage: ext.labelsOnPage });
      state = {
        status: ext.status, page: ext.page, reason, lastRun: now, runMs: nNow() - t0, cards, columns: ext.columns,
        frames: ext.frames, retained: retainedCount, analysis, settings, registry, labelsSeen, removedLegacy,
        currentFunnelKey: (ext.views[0] && ext.views[0].funnel && ext.views[0].funnel.key) || (cards[0] && cards[0].funnel.key) || null,
        viewLabel: viewLabel(ext), coverageNote: coverageNote(ext), storedCards: Object.keys(obs.cards).length
      };
      ui.update(state);
      ui.host.setAttribute('data-bnka-status', ext.status);
      ui.host.setAttribute('data-bnka-cards', String(cards.length));
      ui.host.setAttribute('data-bnka-alerts', String(analysis.summary.withAlerts));
    } catch (err) {
      ui.host.setAttribute('data-bnka-error', util.cleanText(err && err.message, 200));
      // eslint-disable-next-line no-console
      console.warn('[Assistente de Pendências] falha na leitura:', err);
    }
  }

  function viewLabel(ext) {
    if (!ext.views.length) return '';
    const v = ext.views[0];
    const name = { kanban: 'Kanban', lista: 'Lista', links: 'Links de cards' }[v.view] || v.view;
    return name + (v.funnel ? ' · ' + v.funnel.name : '') + (v.frame === 'iframe' ? ' (iframe)' : '') + (ext.views.length > 1 ? ' + ' + (ext.views.length - 1) + ' área(s)' : '');
  }

  function coverageNote(ext) {
    if (!ext.cards.length) return '';
    const cols = ext.columns;
    if (cols.length) {
      const declared = cols.filter((c) => c.declared !== null);
      const missing = declared.reduce((s, c) => s + Math.max(0, c.declared - c.loaded), 0);
      if (missing) return 'cobertura parcial: ' + missing + ' card(s) informados pelo Bitrix ainda não carregados';
      if (declared.length === cols.length) return 'todas as etapas visíveis carregadas';
      return 'total por etapa não exibido: cobertura não confirmada';
    }
    if (ext.views.some((v) => v.view === 'lista')) return 'somente a página atual da lista';
    return 'cobertura não confirmada';
  }

  // ---------- Observadores ----------

  const RELEVANT_CLASS = /(kanban|grid|counter|activity|sla|deadline|todo)/i;

  function onMutations(list) {
    for (const m of list) {
      const target = m.target.nodeType === 1 ? m.target : m.target.parentNode;
      if (!target || (ui && (target === ui.host || ui.host.contains(target)))) continue;
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const cls = target.getAttribute && target.getAttribute('class');
        if (!cls || !RELEVANT_CLASS.test(cls)) continue;
      }
      schedule('alteração na página');
      return;
    }
  }

  function observeDoc(doc) {
    if (!doc || !doc.documentElement || observedDocs.has(doc)) return;
    observedDocs.add(doc);
    mo.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-id', 'class', 'href'] });
  }

  function attachFrames() {
    const { docs } = extract.collectDocuments(window);
    for (const d of docs) observeDoc(d.doc);
    for (const iframe of document.querySelectorAll('iframe')) {
      if (watchedFrames.has(iframe) || (ui && ui.host.contains(iframe))) continue;
      watchedFrames.add(iframe);
      iframe.addEventListener('load', () => schedule('iframe carregado'));
    }
  }

  function checkNavigation() {
    if (location.href !== lastHref) {
      lastHref = location.href;
      schedule('navegação interna');
    }
  }

  function onVisibility() {
    if (!document.hidden && pendingWhileHidden) { pendingWhileHidden = false; schedule('aba visível'); }
  }

  function onTakeover() {
    if (document.documentElement.getAttribute('data-bnka-instance') !== INSTANCE) shutdown('replaced');
  }

  function liveness() {
    if (document.documentElement.getAttribute('data-bnka-instance') !== INSTANCE) shutdown('replaced');
    else if (!S.extensionAlive()) shutdown('invalidated');
  }

  function shutdown(kind) {
    if (stopped) return;
    stopped = true;
    if (mo) mo.disconnect();
    if (timer) nClearTimeout(timer);
    intervals.forEach((id) => nClearInterval(id));
    window.removeEventListener('popstate', checkNavigation);
    window.removeEventListener('hashchange', checkNavigation);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('bnka:takeover', onTakeover);
    root.__bnkaRunning = false;
    if (kind === 'invalidated' && ui && ui.host.isConnected) {
      ui.update(Object.assign({}, state || { settings, cards: [] }, { status: 'invalidated' }));
      ui.host.setAttribute('data-bnka-status', 'invalidated');
    }
  }

  // ---------- Persistência ----------

  async function persist() {
    if (!dirtyStore || stopped) return;
    dirtyStore = false;
    // Outra aba do portal pode ter gravado observações: mescla em vez de sobrescrever.
    const res = await S.storageGet([S.KEYS.obs, S.KEYS.registry]);
    obs = observe.mergeStores(observe.sanitizeStore(res[S.KEYS.obs]), obs, removedKeys);
    registry = observe.mergeRegistry(observe.sanitizeRegistry(res[S.KEYS.registry]), registry);
    removedKeys.clear();
    observe.pruneStore(obs, Date.now(), settings.retentionDays);
    await S.storageSet({ [S.KEYS.obs]: obs, [S.KEYS.registry]: registry });
  }

  // ---------- Ações do painel ----------

  function locate(key) {
    const c = lastCards.find((x) => x.key === key);
    const el = c && c.el;
    if (!el || !el.isConnected) return;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    ui.highlight(() => {
      if (!el.isConnected) return null;
      const r = el.getBoundingClientRect();
      let dx = 0; let dy = 0;
      try {
        const fe = el.ownerDocument.defaultView.frameElement;
        if (fe) { const fr = fe.getBoundingClientRect(); dx = fr.left; dy = fr.top; }
      } catch (e) { /* frame inacessível */ }
      return { left: r.left + dx, top: r.top + dy, width: r.width, height: r.height };
    });
  }

  function exportCsv(list) {
    const data = csv.buildCsv(list, settings.clock.tz);
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const p = time.localParts(Date.now(), settings.clock.tz);
    const pad = (n) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pendencias-crm-' + p.y + pad(p.m) + pad(p.d) + '-' + pad(p.hh) + pad(p.mm) + '.csv';
    a.style.display = 'none';
    ui.host.shadowRoot.appendChild(a);
    a.click();
    a.remove();
    nSetTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function saveSettings(next) {
    const clean = S.migrate(next).settings;
    const ok = await S.saveSettings(clean);
    if (ok) { settings = clean; run('configuração salva'); }
    return ok;
  }

  async function clearData(kind) {
    obs = observe.emptyStore();
    retained = new Map();
    if (kind === 'all') {
      settings = S.defaults();
      registry = observe.emptyRegistry();
      await S.storageRemove([S.KEYS.obs, S.KEYS.registry, S.KEYS.settings, S.KEYS.ui]);
      await S.storageSet({ [S.KEYS.settings]: settings });
    } else {
      await S.storageRemove([S.KEYS.obs]);
    }
    run('dados locais limpos');
  }

  // ---------- Inicialização ----------

  async function init() {
    const loaded = await S.loadSettings();
    settings = loaded.settings;
    removedLegacy = loaded.removedLegacy;
    const res = await S.storageGet([S.KEYS.obs, S.KEYS.registry, S.KEYS.ui]);
    obs = observe.sanitizeStore(res[S.KEYS.obs]);
    registry = observe.sanitizeRegistry(res[S.KEYS.registry]);
    if (observe.pruneStore(obs, Date.now(), settings.retentionDays)) dirtyStore = true;
    if (stopped) return;

    ui = panelMod.createPanel({
      version: VERSION,
      onRefresh: () => run('manual'),
      onOpenChange: (open, tab) => { S.storageSet({ [S.KEYS.ui]: { open: !!open, tab: String(tab || 'fila') } }); },
      onSaveSettings: saveSettings,
      onClearData: clearData,
      onExport: exportCsv,
      onLocate: locate,
      onDiagnostics: () => extract.structuralDiagnostics(window)
    });
    ui.restoreUi(res[S.KEYS.ui]);

    mo = new MutationObserver(onMutations);
    observeDoc(document);
    window.addEventListener('popstate', checkNavigation);
    window.addEventListener('hashchange', checkNavigation);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('bnka:takeover', onTakeover);
    try {
      if (window.navigation && typeof window.navigation.addEventListener === 'function') {
        window.navigation.addEventListener('navigatesuccess', () => nSetTimeout(checkNavigation, 50));
      }
    } catch (e) { /* Navigation API indisponível */ }
    intervals.push(nSetInterval(checkNavigation, 1000));
    intervals.push(nSetInterval(liveness, 3000));
    intervals.push(nSetInterval(() => { if (!document.hidden) schedule('atualização periódica'); }, PERIODIC_MS));
    intervals.push(nSetInterval(persist, PERSIST_MS));
    window.addEventListener('pagehide', () => { persist(); });

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (stopped || area !== 'local') return;
        if (changes[S.KEYS.obs] && changes[S.KEYS.obs].newValue === undefined) { obs = observe.emptyStore(); retained = new Map(); }
        if (changes[S.KEYS.registry] && changes[S.KEYS.registry].newValue === undefined) registry = observe.emptyRegistry();
        if (!changes[S.KEYS.settings]) return;
        settings = S.migrate(changes[S.KEYS.settings].newValue).settings;
        schedule('configuração alterada');
      });
      chrome.runtime.onMessage.addListener((msg) => {
        if (!stopped && msg && msg.type === 'bnka:toggle' && ui) ui.setOpen(!ui.isOpen());
      });
    } catch (e) { /* contexto já invalidado */ }

    run('carregamento da página');
  }

  init().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[Assistente de Pendências] falha ao iniciar:', err);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
