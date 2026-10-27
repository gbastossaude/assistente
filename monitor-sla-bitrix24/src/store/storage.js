// Armazenamento local da extensão.
// - Configuração e dados de monitoramento: chrome.storage.local (separados para modo real e demonstração).
// - Webhook (credencial): chrome.storage.session por padrão — fica só em memória e é apagado ao
//   fechar o Chrome. Opcionalmente o usuário pode lembrar no dispositivo (chrome.storage.local),
//   o que grava a URL sem criptografia no perfil do Chrome. Nunca vai para logs ou exportações.
// - Resumos leves (view_*, summary_*): derivados do conjunto de dados a cada gravação, para que o painel,
//   o popup e o ícone não precisem ler os dados completos (vários MB com muitos cards).
// - Aviso de mudança (uiRev): gravado em chrome.storage.session, que só as páginas da extensão leem.
//   As páginas reagem a ele em vez de receber os dados completos a cada gravação.
import { mergeConfig, defaultConfig } from '../core/config.js';
import { emptyDataset } from '../integration/sync.js';

const local = () => chrome.storage.local;
const session = () => chrome.storage.session;
const k = (prefix, mode) => `${prefix}_${mode === 'demo' ? 'demo' : 'real'}`;

// ---- aviso de mudança para as páginas abertas (agrupado: várias gravações seguidas = um aviso) ----
let pending = new Set();
let bumpTimer = null;
export function bump(...reasons) {
  for (const r of reasons) pending.add(r);
  clearTimeout(bumpTimer);
  bumpTimer = setTimeout(() => {
    const reasonsNow = [...pending];
    pending = new Set();
    session().set({ uiRev: { at: Date.now(), n: Math.random(), reasons: reasonsNow } }).catch(() => {});
  }, 40);
}

export async function getMode() {
  const { mode } = await local().get('mode');
  return mode || null; // 'real' | 'demo' | null
}
export async function setMode(mode) { await local().set({ mode }); bump('mode', 'analysis', 'view', 'config'); }

export async function getConfig(mode) {
  const key = k('config', mode);
  const r = await local().get(key);
  return mergeConfig(r[key] || (mode === 'demo' ? null : defaultConfig()));
}
export async function saveConfig(mode, config) {
  const clean = structuredClone(config);
  delete clean.webhook; // defesa: credencial nunca faz parte da configuração
  await local().set({ [k('config', mode)]: clean });
  bump('config');
}

/** Resumo leve do conjunto de dados: o que as telas usam além da análise. */
export function viewOf(ds) {
  const providers = {};
  for (const list of Object.values(ds.activities || {})) for (const a of list) providers[a.providerId] = (providers[a.providerId] || 0) + 1;
  const m = ds.meta || {};
  return {
    portalUrl: ds.portalUrl || null,
    meta: { entities: m.entities || {}, categories: m.categories || {}, stages: m.stages || {}, fields: m.fields || {}, users: m.users || {}, departments: m.departments || {} },
    sync: ds.sync || {},
    observedProviders: providers,
    monitoredUserIds: [...new Set(Object.values(ds.cards || {}).map(c => c.assignedById))],
    snoozed: ds.alertState?.snoozed || {}
  };
}

export async function getDataset(mode) {
  const key = k('ds', mode);
  const r = await local().get(key);
  return r[key] || emptyDataset(mode || 'real');
}
export async function saveDataset(mode, ds) {
  await local().set({ [k('ds', mode)]: ds, [k('view', mode)]: viewOf(ds) });
  bump('view');
}
/** Resumo leve; na primeira leitura após atualizar da 1.7 é derivado do conjunto completo uma única vez. */
export async function getView(mode) {
  const key = k('view', mode);
  const r = await local().get(key);
  if (r[key]) return r[key];
  const v = viewOf(await getDataset(mode));
  await local().set({ [key]: v });
  return v;
}

export async function getAnalysis(mode) {
  const key = k('an', mode);
  return (await local().get(key))[key] || null;
}
export async function saveAnalysis(mode, an) {
  await local().set({ [k('an', mode)]: an, [k('summary', mode)]: an ? summaryOf(an) : null });
  bump('analysis');
}

/** Resumo do popup: indicadores e os primeiros cards da fila, com só os campos exibidos. */
export function summaryOf(an, now = Date.now()) {
  const top = [];
  for (const c of an.cards || []) {
    const act = c.alerts.filter(a => !(a.snoozedUntil > now));
    if (!act.length) continue;
    const worst = act.reduce((m, a) => ((a.overdueMin || 0) > (m?.overdueMin || 0) ? a : m), act[0]);
    top.push({ key: c.key, title: c.title, link: c.link, level: c.priority.level, score: c.priority.score, stageName: c.stageName,
      responsibleName: c.responsibleName, commercialName: c.commercialField ? c.commercialName : null,
      worst: { title: worst.title, overdueText: worst.overdueText || null }, alerts: act.length });
    if (top.length >= 8) break;
  }
  return { generatedAt: an.generatedAt, kpis: an.kpis, top };
}
export async function getSummary(mode) {
  const key = k('summary', mode);
  const r = await local().get(key);
  if (r[key] !== undefined) return r[key];
  const an = await getAnalysis(mode);
  return an ? summaryOf(an) : null;
}

// ---- credencial ----
export async function getWebhook() {
  const s = await session().get('webhook');
  if (s.webhook) return s.webhook;
  const l = await local().get('webhook_persist');
  if (l.webhook_persist) {
    await session().set({ webhook: l.webhook_persist });
    return l.webhook_persist;
  }
  return null;
}
export async function setWebhook(url, persist) {
  await session().set({ webhook: url });
  if (persist) await local().set({ webhook_persist: url });
  else await local().remove('webhook_persist');
}
export async function clearWebhook() {
  await session().remove('webhook');
  await local().remove('webhook_persist');
}

export async function clearAllData({ keepConfig = true } = {}) {
  const keys = ['ds_real', 'ds_demo', 'an_real', 'an_demo', 'view_real', 'view_demo', 'summary_real', 'summary_demo',
    'config_demo', 'demoAnchor', 'syncLock', 'diag', 'me_real'];
  if (!keepConfig) keys.push('config_real', 'mode', 'inpage');
  await local().remove(keys);
  bump('mode', 'analysis', 'view', 'config');
}
