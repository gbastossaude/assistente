// Armazenamento local da extensão.
// - Configuração e dados de monitoramento: chrome.storage.local (separados para modo real e demonstração).
// - Webhook (credencial): chrome.storage.session por padrão — fica só em memória e é apagado ao
//   fechar o Chrome. Opcionalmente o usuário pode lembrar no dispositivo (chrome.storage.local),
//   o que grava a URL sem criptografia no perfil do Chrome. Nunca vai para logs ou exportações.
import { mergeConfig, defaultConfig } from '../core/config.js';
import { emptyDataset } from '../integration/sync.js';

const local = () => chrome.storage.local;
const session = () => chrome.storage.session;

export async function getMode() {
  const { mode } = await local().get('mode');
  return mode || null; // 'real' | 'demo' | null
}
export async function setMode(mode) { await local().set({ mode }); }

export async function getConfig(mode) {
  const key = mode === 'demo' ? 'config_demo' : 'config_real';
  const r = await local().get(key);
  return mergeConfig(r[key] || (mode === 'demo' ? null : defaultConfig()));
}
export async function saveConfig(mode, config) {
  const key = mode === 'demo' ? 'config_demo' : 'config_real';
  const clean = structuredClone(config);
  delete clean.webhook; // defesa: credencial nunca faz parte da configuração
  await local().set({ [key]: clean });
}

export async function getDataset(mode) {
  const key = mode === 'demo' ? 'ds_demo' : 'ds_real';
  const r = await local().get(key);
  return r[key] || emptyDataset(mode || 'real');
}
export async function saveDataset(mode, ds) {
  await local().set({ [mode === 'demo' ? 'ds_demo' : 'ds_real']: ds });
}
export async function getAnalysis(mode) {
  const key = mode === 'demo' ? 'an_demo' : 'an_real';
  return (await local().get(key))[key] || null;
}
export async function saveAnalysis(mode, an) {
  await local().set({ [mode === 'demo' ? 'an_demo' : 'an_real']: an });
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
  const keys = ['ds_real', 'ds_demo', 'an_real', 'an_demo', 'config_demo', 'demoAnchor', 'syncLock'];
  if (!keepConfig) keys.push('config_real', 'mode');
  await local().remove(keys);
}
