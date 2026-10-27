// Service worker (Manifest V3). Agenda sincronizações com chrome.alarms, executa a leitura
// do Bitrix24, recalcula alertas, atualiza o ícone e envia notificações opcionais.
// Limitação do navegador: nada roda com o Chrome fechado. Ao reabrir, a extensão sincroniza
// e marca os vencimentos que ocorreram no intervalo sem monitoramento.
import { BitrixClient, parseWebhook, normalizePortal } from './src/integration/bitrix-client.js';
import { syncData, emptyDataset } from './src/integration/sync.js';
import { loadStructure, loadFields, parseCardUrl } from './src/integration/bitrix-api.js';
import { analyze, historical } from './src/core/analyze.js';
import { zonedParts } from './src/core/time.js';
import { createMockPortal, DEMO_WEBHOOK, DEMO_ORIGIN } from './src/demo/mock-portal.js';
import { demoConfig } from './src/demo/demo-config.js';
import { updateAlertState, selectNotifications } from './src/alerts/alert-state.js';
import { updateBadge, sendNotifications } from './src/alerts/notifier.js';
import * as store from './src/store/storage.js';
import { logSync, logError, getDiag, clearDiag, sanitizeMessage } from './src/store/diag.js';
import { newId, effectiveMonitored } from './src/core/config.js';

const ALARM = 'sync';
let running = null;
let runningSince = null;

// Um service worker novo nunca herda uma sincronização em andamento (o anterior foi encerrado pelo Chrome):
// apaga o progresso que tenha ficado gravado, para o painel não mostrar "Sincronizando…" para sempre.
chrome.storage.session.remove('syncProgress').catch(() => {});

// Erros inesperados ficam no diagnóstico local (mascarados), em vez de sumirem no console.
self.addEventListener('unhandledrejection', ev => { logError('service-worker', ev.reason); });
self.addEventListener('error', ev => { logError('service-worker', ev.error || ev.message); });

function dayKey(ts, tz) {
  const p = zonedParts(ts, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

async function demoClient() {
  let { demoAnchor } = await chrome.storage.local.get('demoAnchor');
  if (!demoAnchor) { demoAnchor = Date.now(); await chrome.storage.local.set({ demoAnchor }); }
  const mock = createMockPortal({ now: demoAnchor });
  return new BitrixClient({ webhookUrl: DEMO_WEBHOOK, fetchImpl: mock.fetchImpl, requestsPerSecond: 1000 });
}

/** Abas abertas do portal (mais recente primeiro). Requer permissão de acesso ao domínio. */
async function bitrixTabs(origin) {
  try {
    const tabs = await chrome.tabs.query({ url: `${origin}/*` });
    return tabs.sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  } catch { return []; }
}

/**
 * "Meus cards": guarda só o número do usuário logado no portal (nenhum outro dado pessoal).
 * O painel só usa quando o portal é o conectado.
 */
async function rememberMe(origin, userId) {
  const uid = /^\d{1,10}$/.test(String(userId ?? '')) ? String(userId) : null;
  if (!uid || !origin) return;
  const cur = (await chrome.storage.local.get('me_real')).me_real;
  if (cur?.id !== uid || cur?.origin !== origin) { await chrome.storage.local.set({ me_real: { id: uid, origin } }); store.bump('view'); }
}

let preferredTab = null;
/**
 * Transporte "login do Bitrix": a consulta é executada pelo script da extensão dentro de uma aba do portal,
 * na mesma origem e com a sessão de quem está logado. Sem aba aberta, devolve NO_BITRIX_TAB.
 */
function loginTransport(origin) {
  return async (method, params) => {
    const tabs = await bitrixTabs(origin);
    const ordered = preferredTab ? [...tabs.filter(t => t.id === preferredTab), ...tabs.filter(t => t.id !== preferredTab)] : tabs;
    for (const t of ordered) {
      try {
        const r = await chrome.tabs.sendMessage(t.id, { type: 'slaRest', method, params });
        if (r && typeof r.text === 'string') { preferredTab = t.id; return r; }
      } catch { /* aba sem o script (carregando, descartada): tenta a próxima */ }
    }
    return { status: 0, text: JSON.stringify({ error: 'NO_BITRIX_TAB', error_description: 'Nenhuma aba do portal aberta' }) };
  };
}

async function realClient(config) {
  if (config.authMode === 'login') {
    if (!config.portalOrigin) return { error: 'sem_credencial' };
    if (!(await chrome.permissions.contains({ origins: [`${config.portalOrigin}/*`] }))) return { error: 'sem_permissao' };
    return { client: new BitrixClient({ origin: config.portalOrigin, transport: loginTransport(config.portalOrigin),
      requestsPerSecond: config.requestsPerSecond || 2 }) };
  }
  const webhook = await store.getWebhook();
  if (!webhook) return { error: 'sem_credencial' };
  let origin;
  try { ({ origin } = parseWebhook(webhook, { allowLocalHttp: true })); } catch { return { error: 'sem_credencial' }; }
  const ok = await chrome.permissions.contains({ origins: [`${origin}/*`] });
  if (!ok) return { error: 'sem_permissao' };
  return { client: new BitrixClient({ webhookUrl: webhook, requestsPerSecond: config.requestsPerSecond || 2,
    allowLocalHttp: ['127.0.0.1', 'localhost'].includes(new URL(origin).hostname) }) };
}

/**
 * Restringe o monitoramento ao processo da página de foco (ex.: /page/besmart/besmart_saude/),
 * identificado pelos links dos cards. Só altera a seleção quando o processo muda ou ainda não foi aplicado.
 */
async function applyFocus(detected, { force = false } = {}) {
  const mode = await store.getMode();
  if (mode !== 'real') return { applied: false, reason: 'nao_conectado' };
  const config = await store.getConfig('real');
  if (!config.focusPage || detected.pagePath !== config.focusPage) return { applied: false, reason: 'outra_pagina' };
  if (config.portalOrigin && detected.origin !== config.portalOrigin) return { applied: false, reason: 'outro_portal' };
  const top = detected.types[0];
  if (!top) return { applied: false, reason: 'sem_tipo' };
  const etid = Number(top.entityTypeId);
  const already = config.focusEntityTypeId === etid && (config.monitored || []).some(m => Number(m.entityTypeId) === etid);
  if (already && !force) {
    // Mantém a seleção de funis do usuário; só atualiza o formato do link se a página revelar um melhor.
    if (config.cardTypes?.[etid]?.linkPath !== top.linkPath && top.links > 0) {
      config.cardTypes = { ...(config.cardTypes || {}), [etid]: { linkPath: top.linkPath, fromPage: config.focusPage } };
      await store.saveConfig('real', config);
    }
    return { applied: false, reason: 'ja_aplicado' };
  }
  const r = await realClient(config);
  if (r.error) return { applied: false, reason: r.error };
  config.cardTypes = { ...(config.cardTypes || {}), [etid]: { linkPath: top.linkPath, fromPage: config.focusPage } };
  const { meta, warnings } = await loadStructure(r.client, { manualTypes: config.cardTypes });
  const ent = meta.entities[etid];
  if (!ent) return { applied: false, reason: 'sem_acesso', warning: warnings.find(w => w.includes(String(etid))) };
  config.focusEntityTypeId = etid;
  config.monitored = [{ entityTypeId: etid, categoryIds: [...ent.categories] }];
  for (const cid of ent.categories) {
    if (!config.noFutureActivityRules.some(x => Number(x.entityTypeId) === etid && Number(x.categoryId) === Number(cid))) {
      config.noFutureActivityRules.push({ id: newId(), entityTypeId: etid, categoryId: Number(cid), excludeStages: [], enabled: true });
    }
  }
  await store.saveConfig('real', config);
  const ds = await store.getDataset('real');
  ds.meta = { ...ds.meta, ...meta };
  await store.saveDataset('real', ds);
  await chrome.storage.session.remove('pendingFocus');
  return { applied: true, entityTypeId: etid, name: ent.name, categories: ent.categories.length };
}

async function setupAlarm(config) {
  const period = Math.max(1, Number(config?.sync?.intervalMinutes) || 15);
  const cur = await chrome.alarms.get(ALARM);
  if (!cur || cur.periodInMinutes !== period) await chrome.alarms.create(ALARM, { periodInMinutes: period, delayInMinutes: 0.1 });
}

/** Recalcula análise, estado de alertas, ícone e notificações (sem rede). */
async function postProcess(mode, ds, config, { prevSuccess, notify = true } = {}) {
  const now = Date.now();
  const tz = config.calendar?.timezone || 'America/Sao_Paulo';
  ds.portalUrl = mode === 'demo' ? DEMO_ORIGIN : (ds.portalUrl || config.portalOrigin);
  let analysis = analyze(ds, config, now);
  const upd = updateAlertState(ds.alertState, analysis, { now, prevSuccess, intervalMin: config.sync.intervalMinutes });
  ds.alertState = upd.state;
  // marca nos alertas o que veio do estado (primeira detecção, vencimento durante ausência)
  for (const c of analysis.cards) for (const a of c.alerts) {
    const k = ds.alertState.known[a.key];
    if (k) { a.firstSeen = k.firstSeen; a.missedWhileOffline = k.missedWhileOffline; a.gap = k.gap; }
  }
  analysis.gap = upd.gap;
  analysis.sync = { ...ds.sync };
  analysis.portalUrl = ds.portalUrl;
  // snapshot diário para evolução histórica (somente contagens)
  if (ds.sync.lastSuccess) {
    const day = dayKey(now, tz);
    ds.snapshots = (ds.snapshots || []).filter(s => s.day !== day);
    ds.snapshots.push({ day, at: now, comAtraso: analysis.kpis.comAtraso, slaVencido: analysis.kpis.slaVencido,
      semAcompanhamento: analysis.kpis.semAcompanhamento, monitorados: analysis.kpis.monitorados });
    ds.snapshots = ds.snapshots.slice(-90);
    analysis.historical = historical(ds, config, analysis.cards, now);
  }
  if (notify && config.notifications.enabled) {
    const sel = selectNotifications(ds.alertState, analysis, config.notifications, now, tz);
    ds.alertState = sel.state;
    await sendNotifications({ send: sel.send, digest: sel.digest, mode });
  }
  await store.saveDataset(mode, ds);
  await store.saveAnalysis(mode, analysis);
  await updateBadge({ analysis, mode, syncStatus: ds.sync.status, badgeMode: config.badge.count, now });
  return analysis;
}

async function runSync({ forceFull = false } = {}) {
  if (running) return running;
  runningSince = Date.now();
  running = (async () => {
   try {
    const mode = await store.getMode();
    if (!mode) { await updateBadge({ analysis: null }); return { status: 'nao_configurado' }; }
    const config = mode === 'demo' ? (await store.getConfig('demo')) : await store.getConfig('real');
    await setupAlarm(config);
    let ds = await store.getDataset(mode);
    // Sem internet: não insiste (cada consulta tentaria 5 vezes); avisa e tenta de novo no próximo ciclo.
    if (mode === 'real' && self.navigator && self.navigator.onLine === false) {
      ds.sync.status = 'sem_conexao';
      ds.sync.errors = [{ at: Date.now(), code: 'OFFLINE', kind: 'temporary', message: 'Sem conexão com a internet. Os números são da última atualização; a extensão tenta de novo sozinha.' }];
      await store.saveDataset(mode, ds);
      const an = await store.getAnalysis(mode);
      if (an) { an.sync = { ...ds.sync }; await store.saveAnalysis(mode, an); }
      await updateBadge({ analysis: an, mode, syncStatus: 'erro', badgeMode: config.badge.count });
      logSync({ at: Date.now(), ms: 0, mode, full: forceFull, requests: 0, status: 'sem_conexao', cards: null, comAlerta: null, error: 'sem internet' });
      return { status: 'sem_conexao' };
    }
    let client;
    if (mode === 'demo') client = await demoClient();
    else {
      const r = await realClient(config);
      if (r.error) {
        ds.sync.status = r.error;
        ds.sync.errors = [{ at: Date.now(), code: r.error, kind: 'auth',
          message: r.error === 'sem_credencial'
            ? (config.authMode === 'login' ? 'Portal não configurado. Conecte em Configurações › Conexão.'
              : 'A credencial não está disponível (o Chrome foi reiniciado e ela estava guardada só nesta sessão). Informe o webhook novamente.')
            : 'Permissão de acesso ao domínio do portal não concedida. Reconecte em Configurações > Conexão.' }];
        await store.saveDataset(mode, ds);
        const an = await store.getAnalysis(mode);
        if (an) { an.sync = { ...ds.sync }; await store.saveAnalysis(mode, an); }
        await updateBadge({ analysis: an, mode, syncStatus: r.error });
        logSync({ at: Date.now(), ms: 0, mode, full: forceFull, requests: 0, status: r.error, cards: null, comAlerta: null, error: ds.sync.errors[0].message });
        return { status: r.error };
      }
      client = r.client;
    }
    const prevSuccess = ds.sync.lastSuccess;
    const t0 = Date.now();
    await chrome.storage.session.set({ syncProgress: { step: 'inicio', at: t0, since: t0 } });
    const res = await syncData({ client, config, ds, forceFull,
      onProgress: (step, detail) => chrome.storage.session.set({ syncProgress: { step, detail: detail || null, at: Date.now(), since: t0 } }) });
    ds = res.ds;
    if (res.error && res.error.retryAt) {
      // limite da API: tenta de novo no horário indicado, sem insistir antes
      chrome.alarms.create('retry', { when: Math.max(Date.now() + 60000, res.error.retryAt) });
    }
    const an = await postProcess(mode, ds, config, { prevSuccess, notify: !res.error });
    await chrome.storage.session.set({ syncProgress: null });
    const err = ds.sync.errors?.[0];
    logSync({ at: t0, ms: Date.now() - t0, mode, full: !!res.report?.full, requests: res.report?.requests ?? null, status: ds.sync.status,
      cards: an?.kpis?.monitorados ?? null, comAlerta: an?.kpis?.comAlerta ?? null, error: res.error ? (err?.message || res.error.message || String(res.error.code || 'erro')) : null });
    // Bitrix fechado ou sem login são situações esperadas (aparecem no histórico), não erros
    if (res.error && !['sem_aba', 'sem_sessao'].includes(ds.sync.status)) logError('sincronizacao', err?.message || res.error.message || res.error, { code: err?.code || res.error.code });
    return { status: ds.sync.status, report: res.report };
   } catch (e) {
    // Erro inesperado: registra para o painel não confundir com "nenhuma pendência".
    await chrome.storage.session.set({ syncProgress: null });
    const mode = (await store.getMode()) || 'real';
    const ds = await store.getDataset(mode);
    ds.sync.status = 'erro';
    ds.sync.errors = [{ at: Date.now(), code: 'ERRO_INTERNO', kind: 'other', message: sanitizeMessage(e?.message || e) }];
    await store.saveDataset(mode, ds);
    const an = await store.getAnalysis(mode);
    if (an) { an.sync = { ...ds.sync }; await store.saveAnalysis(mode, an); }
    logError('sincronizacao', e, { code: 'ERRO_INTERNO' });
    logSync({ at: runningSince, ms: Date.now() - runningSince, mode, full: forceFull, requests: null, status: 'erro', cards: null, comAlerta: null, error: e?.message || String(e) });
    return { status: 'erro', error: ds.sync.errors[0].message };
   }
  })();
  store.bump('sync');
  try { return await running; } finally { running = null; runningSince = null; store.bump('sync'); }
}

async function recompute(mode) {
  const config = await store.getConfig(mode);
  const ds = await store.getDataset(mode);
  return postProcess(mode, ds, config, { prevSuccess: ds.sync.lastSuccess, notify: false });
}

/**
 * Depois de instalar ou atualizar, as abas do Bitrix que já estavam abertas ficam com o script antigo, desligado
 * da extensão: a aba "SLA" para de responder e a análise pelo login não encontra a aba até a página ser recarregada.
 * Reinjeta os scripts nessas abas (o script novo remove a interface do antigo), sem recarregar a página.
 */
async function reinjectContentScripts() {
  const scripts = chrome.runtime.getManifest().content_scripts || [];
  const matches = [...new Set(scripts.flatMap(c => c.matches || []))];
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: matches }); } catch { return 0; }
  let n = 0;
  for (const t of tabs) {
    if (!t.id || t.discarded) continue; // aba descartada recarrega sozinha ao ser aberta
    let ok = true;
    for (const c of scripts) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: !!c.all_frames }, files: c.js, world: c.world === 'MAIN' ? 'MAIN' : 'ISOLATED' });
      } catch { ok = false; } // página de erro ou sem acesso: o script volta quando ela for recarregada
    }
    if (ok) n++;
  }
  return n;
}

// ---------- eventos ----------
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const mode = await store.getMode();
  if (mode) await setupAlarm(await store.getConfig(mode));
  await updateBadge({ analysis: mode ? await store.getAnalysis(mode) : null, mode });
  if (reason === 'install' || reason === 'update') {
    const n = await reinjectContentScripts();
    await chrome.storage.session.set({ reinjected: { at: Date.now(), tabs: n, reason } });
  }
});
chrome.runtime.onStartup.addListener(() => { runSync().catch(() => {}); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARM || a.name === 'retry') runSync().catch(() => {}); });

// Atalho de teclado (chrome://extensions/shortcuts): abre/fecha o painel dentro do Bitrix; fora dele, abre o painel numa aba.
chrome.commands?.onCommand?.addListener(async command => {
  if (command !== 'toggle-drawer') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const r = tab?.id ? await chrome.tabs.sendMessage(tab.id, { type: 'slaToggleDrawer' }).catch(() => null) : null;
  if (!r?.ok) await chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html') });
});

chrome.notifications?.onClicked?.addListener(async id => {
  const t = (await chrome.storage.session.get('notifTargets')).notifTargets || {};
  const target = t[id];
  if (target && target !== 'dashboard' && /^https?:\/\//.test(target)) chrome.tabs.create({ url: target });
  else chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html') });
  chrome.notifications.clear(id);
});

const handlers = {
  /**
   * Estado para as telas. Lê só o resumo leve dos dados (view_*), nunca o conjunto completo.
   * Com { lite: true } não inclui a análise: o painel a lê direto do armazenamento, uma vez por mudança.
   */
  async getState({ lite } = {}) {
    const mode = await store.getMode();
    const m = mode || 'real';
    const [config, analysis, view, webhook, sess, me] = await Promise.all([store.getConfig(m), lite ? null : store.getAnalysis(m), store.getView(m),
      store.getWebhook(), chrome.storage.session.get(['syncProgress', 'lastBitrixUrl', 'lastPageTypes', 'reinjected']), chrome.storage.local.get('me_real')]);
    let hasPermission = false;
    if (config.portalOrigin && m === 'real') {
      try { hasPermission = await chrome.permissions.contains({ origins: [`${config.portalOrigin}/*`] }); } catch { /* */ }
    }
    const meId = m === 'real' && me.me_real?.origin === config.portalOrigin ? me.me_real.id : null;
    return {
      mode, config, ...(lite ? {} : { analysis }), sync: view.sync, meta: view.meta,
      connection: { origin: config.portalOrigin, authMode: config.authMode || null, hasCredential: config.authMode === 'login' ? true : !!webhook,
        persisted: config.credentialMode === 'persist', hasPermission,
        bitrixTabs: config.portalOrigin ? (await bitrixTabs(config.portalOrigin)).length : 0 },
      lastBitrixUrl: sess.lastBitrixUrl || null,
      lastPageTypes: sess.lastPageTypes || null,
      observedProviders: view.observedProviders, monitoredUserIds: view.monitoredUserIds,
      // progresso só vale com uma sincronização de fato em andamento neste service worker
      syncing: !!running, progress: running ? (sess.syncProgress || { step: 'inicio', at: runningSince, since: runningSince }) : null,
      alertState: { snoozed: view.snoozed || {} },
      me: meId ? { id: meId, name: view.meta.users?.[meId]?.name || null } : null,
      version: chrome.runtime.getManifest().version,
      notificationsPermission: await chrome.permissions.contains({ permissions: ['notifications'] })
    };
  },

  /** Popup: só indicadores e os primeiros cards da fila (resumo gravado a cada análise). */
  async getSummary() {
    const mode = await store.getMode();
    const m = mode || 'real';
    const [config, view, summary] = await Promise.all([store.getConfig(m), store.getView(m), store.getSummary(m)]);
    return { mode, syncing: !!running, sync: view.sync, summary, portalOrigin: config.portalOrigin || null,
      timezone: config.calendar?.timezone || 'America/Sao_Paulo', version: chrome.runtime.getManifest().version };
  },

  async getDiagnostics() {
    const mode = await store.getMode();
    const [diag, sess] = await Promise.all([getDiag(), chrome.storage.session.get('reinjected')]);
    return { ok: true, ...diag, mode, version: chrome.runtime.getManifest().version, reinjected: sess.reinjected || null, syncing: !!running };
  },
  async clearDiagnostics() { await clearDiag(); return { ok: true }; },
  /** Erros das telas da extensão (mascarados antes de gravar). */
  async logError({ where, message }) { await logError(`tela:${String(where || '').slice(0, 30)}`, message); return { ok: true }; },

  /** Testa o webhook e carrega a estrutura. A permissão do domínio é pedida antes, pela página. */
  async connect({ webhookUrl, persist, requestsPerSecond }) {
    const wh = parseWebhook(webhookUrl, { allowLocalHttp: true });
    if (!(await chrome.permissions.contains({ origins: [`${wh.origin}/*`] }))) {
      return { ok: false, error: 'Permissão para acessar o domínio do portal não foi concedida.' };
    }
    const client = new BitrixClient({ webhookUrl, requestsPerSecond: requestsPerSecond || 2,
      allowLocalHttp: ['127.0.0.1', 'localhost'].includes(new URL(wh.origin).hostname) });
    try {
      const config = await store.getConfig('real');
      const { meta, warnings } = await loadStructure(client, { manualTypes: config.portalOrigin === wh.origin ? config.cardTypes : {} });
      if (config.portalOrigin && config.portalOrigin !== wh.origin) {
        await chrome.storage.local.remove(['ds_real', 'an_real', 'view_real', 'summary_real', 'me_real']); // outro portal: descarta cache anterior
        config.monitored = [];
      }
      config.portalOrigin = wh.origin;
      config.portalAddress = wh.origin;
      config.authMode = 'webhook';
      config.credentialMode = persist ? 'persist' : 'session';
      config.requestsPerSecond = requestsPerSecond || 2;
      await store.saveConfig('real', config);
      await store.setWebhook(webhookUrl, !!persist);
      const ds = await store.getDataset('real');
      ds.meta = { ...ds.meta, ...meta };
      ds.portalUrl = wh.origin;
      if (ds.sync.status === 'auth_error' || ds.sync.status === 'sem_credencial') ds.sync.status = 'nunca';
      await store.saveDataset('real', ds);
      await store.setMode('real');
      await setupAlarm(config);
      const pending = (await chrome.storage.session.get('pendingFocus')).pendingFocus
        || (await chrome.storage.session.get('lastPageTypes')).lastPageTypes;
      const focus = pending ? await applyFocus(pending) : { applied: false };
      if (focus.applied) runSync({ forceFull: true }).catch(() => {});
      return { ok: true, warnings, entities: Object.keys(meta.entities).length, stages: Object.keys(meta.stages).length, focus };
    } catch (e) {
      return { ok: false, error: e.message || String(e), code: e.code || null };
    }
  },

  /** Conecta usando o login de quem está no Bitrix (sem webhook). Exige uma aba do portal aberta e logada. */
  async connectLogin({ portal }) {
    let origin;
    try { origin = normalizePortal(portal, { allowLocalHttp: true }); } catch (e) { return { ok: false, error: e.message }; }
    if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) {
      return { ok: false, error: 'Permissão para acessar o domínio do portal não foi concedida.' };
    }
    if (!(await bitrixTabs(origin)).length) {
      return { ok: false, error: `Abra ${origin} numa aba do Chrome, faça login e tente de novo.` };
    }
    const config = await store.getConfig('real');
    const client = new BitrixClient({ origin, transport: loginTransport(origin), requestsPerSecond: config.requestsPerSecond || 2 });
    try {
      const { meta, warnings } = await loadStructure(client, { manualTypes: config.portalOrigin === origin ? config.cardTypes : {} });
      if (config.portalOrigin && config.portalOrigin !== origin) { await chrome.storage.local.remove(['ds_real', 'an_real', 'view_real', 'summary_real', 'me_real']); config.monitored = []; config.cardTypes = {}; }
      config.portalOrigin = origin;
      config.portalAddress = origin;
      config.authMode = 'login';
      await store.saveConfig('real', config);
      const ds = await store.getDataset('real');
      ds.meta = { ...ds.meta, ...meta };
      ds.portalUrl = origin;
      if (['auth_error', 'sem_credencial', 'sem_sessao', 'sem_aba'].includes(ds.sync.status)) ds.sync.status = 'nunca';
      await store.saveDataset('real', ds);
      await store.setMode('real');
      await setupAlarm(config);
      for (const t of (await bitrixTabs(origin)).slice(0, 1)) {
        const ping = await chrome.tabs.sendMessage(t.id, { type: 'slaPing' }).catch(() => null);
        if (ping?.loggedIn) await rememberMe(origin, ping.userId);
      }
      const pending = (await chrome.storage.session.get('pendingFocus')).pendingFocus
        || (await chrome.storage.session.get('lastPageTypes')).lastPageTypes;
      const focus = pending ? await applyFocus(pending) : { applied: false };
      if (focus.applied) runSync({ forceFull: true }).catch(() => {});
      return { ok: true, warnings, entities: Object.keys(meta.entities).length, stages: Object.keys(meta.stages).length, focus };
    } catch (e) {
      return { ok: false, error: e.message || String(e), code: e.code || null };
    }
  },

  /** O script do Bitrix avisa que o portal foi aberto: atualiza a análise se estiver desatualizada. */
  async bitrixOpened({ url, loggedIn, userId }, sender) {
    await chrome.storage.session.set({ lastBitrixUrl: url });
    let origin; try { origin = new URL(url).origin; } catch { return { ok: true }; }
    if (loggedIn) await rememberMe(origin, userId);
    const mode = await store.getMode();
    if (mode !== 'real' || !loggedIn) return { ok: true };
    const config = await store.getConfig('real');
    if (config.authMode !== 'login' || origin !== config.portalOrigin) return { ok: true };
    if (sender?.tab?.id) preferredTab = sender.tab.id;
    const ds = await store.getDataset('real');
    const stale = !ds.sync.lastSuccess || Date.now() - ds.sync.lastSuccess > 3 * 60000 || ['sem_aba', 'sem_sessao', 'erro'].includes(ds.sync.status);
    if (stale && effectiveMonitored(config).length) runSync().catch(() => {});
    return { ok: true };
  },
  /** O script da página encontrou o processo dos cards de uma página de espaço digital. */
  async bitrixPageTypes({ origin, pagePath, types }) {
    const detected = { origin, pagePath, types: (types || []).slice(0, 3), at: Date.now() };
    await chrome.storage.session.set({ lastPageTypes: detected });
    const config = await store.getConfig('real');
    if (config.focusPage !== pagePath) return { ok: true };
    const res = await applyFocus(detected);
    if (!res.applied && res.reason === 'nao_conectado') await chrome.storage.session.set({ pendingFocus: detected });
    if (res.applied) runSync({ forceFull: true }).catch(() => {});
    return { ok: true, ...res };
  },

  async setFocusPage({ focusPage }) {
    const config = await store.getConfig('real');
    if ((focusPage || null) !== config.focusPage) config.focusEntityTypeId = null; // página nova: identificar de novo
    config.focusPage = focusPage || null;
    await store.saveConfig('real', config);
    const last = (await chrome.storage.session.get('lastPageTypes')).lastPageTypes;
    if (focusPage && last && last.pagePath === focusPage) {
      const r = await applyFocus(last, { force: true });
      if (r.applied) runSync({ forceFull: true }).catch(() => {});
      return { ok: true, ...r };
    }
    return { ok: true, applied: false, reason: 'abrir_pagina' };
  },

  async bitrixUrl({ url }) { await chrome.storage.session.set({ lastBitrixUrl: url }); return { ok: true }; },
  async openDashboard() { await chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html') }); return { ok: true }; },

  async refreshStructure() {
    const mode = await store.getMode();
    const ds = await store.getDataset(mode);
    let client;
    if (mode === 'demo') client = await demoClient();
    else { const r = await realClient(await store.getConfig('real')); if (r.error) return { ok: false, error: r.error }; client = r.client; }
    try {
      const config = await store.getConfig(mode);
      const { meta, warnings } = await loadStructure(client, { manualTypes: config.cardTypes });
      ds.meta = { ...ds.meta, ...meta, fields: {} };
      await store.saveDataset(mode, ds);
      return { ok: true, warnings };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  /** Adiciona (ou atualiza) um tipo de card a partir do endereço de um card aberto no Bitrix24. */
  async addCardType({ url }) {
    const mode = (await store.getMode()) || 'real';
    let info;
    try { info = parseCardUrl(url); } catch (e) { return { ok: false, error: e.message }; }
    const config = await store.getConfig(mode);
    const ds = await store.getDataset(mode);
    const expected = mode === 'demo' ? DEMO_ORIGIN : config.portalOrigin;
    if (expected && info.origin !== expected) return { ok: false, error: `O card é de ${info.origin}, mas o portal conectado é ${expected}.` };
    config.cardTypes = { ...(config.cardTypes || {}), [info.entityTypeId]: { linkPath: info.linkPath } };
    let client;
    if (mode === 'demo') client = await demoClient();
    else { const r = await realClient(config); if (r.error) return { ok: false, error: r.error === 'sem_credencial' ? 'Conecte o webhook antes.' : r.error }; client = r.client; }
    try {
      const { meta, warnings } = await loadStructure(client, { manualTypes: config.cardTypes });
      if (!meta.entities[info.entityTypeId]) {
        return { ok: false, error: warnings.find(w => w.includes(String(info.entityTypeId))) || `O processo ${info.entityTypeId} não foi encontrado ou o usuário do webhook não tem acesso a ele.` };
      }
      await store.saveConfig(mode, config);
      ds.meta = { ...ds.meta, ...meta };
      await store.saveDataset(mode, ds);
      if (ds.sync.lastSuccess) await recompute(mode);
      const e = meta.entities[info.entityTypeId];
      return { ok: true, entityTypeId: info.entityTypeId, name: e.name, categories: e.categories.length, linkPath: info.linkPath };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async removeCardType({ entityTypeId }) {
    const mode = (await store.getMode()) || 'real';
    const config = await store.getConfig(mode);
    delete config.cardTypes?.[entityTypeId];
    await store.saveConfig(mode, config);
    if ((await store.getDataset(mode)).sync.lastSuccess) await recompute(mode);
    return { ok: true };
  },

  async loadFields({ entityTypeId }) {
    const mode = await store.getMode();
    const ds = await store.getDataset(mode);
    let client;
    if (mode === 'demo') client = await demoClient();
    else { const r = await realClient(await store.getConfig('real')); if (r.error) return { ok: false, error: r.error }; client = r.client; }
    try {
      const f = await loadFields(client, Number(entityTypeId));
      ds.meta.fields = { ...(ds.meta.fields || {}), [entityTypeId]: f };
      await store.saveDataset(mode, ds);
      return { ok: true, fields: f };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async saveConfig({ config }) {
    const mode = (await store.getMode()) || 'real';
    const prev = await store.getConfig(mode);
    await store.saveConfig(mode, config);
    await setupAlarm(config);
    const mk = c => { const m = c.meetings || {}; return [m.enabled, m.providers, m.todoKeywords, m.lookbackDays]; };
    const sig = c => JSON.stringify([c.monitored, c.deadlineFields, c.commercialFields, c.specialistFields, c.excludeNames, c.slaRules.map(r => [r.pause, r.exceptions]), mk(c),
      [c.closedStudy?.enabled, c.closedStudy?.lookbackDays, c.closedStudy?.reasonFields]]);
    const needsSync = sig(prev) !== sig(config);
    const ds = await store.getDataset(mode);
    if (ds.sync.lastSuccess) await recompute(mode);
    return { ok: true, needsSync };
  },

  async syncNow({ full }) { return runSync({ forceFull: !!full }); },

  async snooze({ keys, hours }) {
    const mode = await store.getMode();
    const ds = await store.getDataset(mode);
    ds.alertState = ds.alertState || { known: {}, snoozed: {} };
    const until = Date.now() + Number(hours) * 3600000;
    for (const k of keys) {
      if (hours > 0) ds.alertState.snoozed[k] = until; else delete ds.alertState.snoozed[k];
    }
    await store.saveDataset(mode, ds);
    await recompute(mode);
    return { ok: true };
  },

  async loadDemo() {
    await chrome.storage.local.set({ demoAnchor: Date.now() });
    await store.saveConfig('demo', demoConfig());
    await store.saveDataset('demo', emptyDataset('demo'));
    await store.setMode('demo');
    return runSync({ forceFull: true });
  },

  async exitDemo() {
    await chrome.storage.local.remove(['ds_demo', 'an_demo', 'view_demo', 'summary_demo', 'config_demo', 'demoAnchor']);
    const cfg = await store.getConfig('real');
    await store.setMode(cfg.portalOrigin ? 'real' : null);
    const an = cfg.portalOrigin ? await store.getAnalysis('real') : null;
    const ds = await store.getDataset('real');
    await updateBadge({ analysis: an, mode: 'real', syncStatus: ds.sync.status, badgeMode: cfg.badge.count });
    return { ok: true };
  },

  async disconnect({ wipe }) {
    const cfg = await store.getConfig('real');
    await store.clearWebhook();
    if (cfg.portalOrigin) { try { await chrome.permissions.remove({ origins: [`${cfg.portalOrigin}/*`] }); } catch { /* */ } }
    if (wipe) await chrome.storage.local.remove(['ds_real', 'an_real', 'view_real', 'summary_real', 'me_real']);
    cfg.portalOrigin = wipe ? null : cfg.portalOrigin;
    await store.saveConfig('real', cfg);
    const mode = await store.getMode();
    if (mode === 'real') {
      const ds = await store.getDataset('real');
      ds.sync.status = 'sem_credencial';
      await store.saveDataset('real', ds);
      await updateBadge({ analysis: wipe ? null : await store.getAnalysis('real'), mode, syncStatus: wipe ? null : 'sem_credencial' });
    }
    return { ok: true };
  },

  async clearData({ all }) {
    await store.clearWebhook();
    await store.clearAllData({ keepConfig: !all });
    await chrome.alarms.clearAll();
    if (all) await chrome.storage.session.clear();
    await chrome.action.setBadgeText({ text: '' });
    return { ok: true };
  }
};

// Mensagens vindas do script nas páginas do Bitrix só podem acionar estes comandos.
const FROM_PAGE = new Set(['bitrixOpened', 'bitrixUrl', 'bitrixPageTypes', 'openDashboard', 'syncNow']);
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg || !handlers[msg.type]) return false;
  const fromExtensionPage = (sender.url || '').startsWith(`chrome-extension://${chrome.runtime.id}/`);
  if (!fromExtensionPage && !FROM_PAGE.has(msg.type)) return false;
  handlers[msg.type](msg, sender).then(reply, e => {
    logError(`acao:${msg.type}`, e);
    reply({ ok: false, error: sanitizeMessage(e?.message || e) });
  });
  return true;
});
