// Diagnóstico local: histórico das sincronizações e registro de erros, para a tela "Diagnóstico".
// Fica só neste navegador (chrome.storage.local, chave "diag"), com tamanho limitado, e nunca guarda
// credenciais: endereços de webhook, sessid e e-mails são mascarados antes de gravar.
const KEY = 'diag';
const MAX_SYNCS = 30;
const MAX_ERRORS = 40;

/** Remove do texto o que poderia ser credencial ou dado pessoal. Função pura (testada). */
export function sanitizeMessage(msg, max = 300) {
  return String(msg ?? '')
    .replace(/\/rest\/\d+\/[^/\s?#"']+/gi, '/rest/<id>/***')
    .replace(/(sessid|auth|access_token|refresh_token|password|senha)=([^&\s"']+)/gi, '$1=***')
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

let chain = Promise.resolve();
/** Gravações em fila: duas atualizações quase simultâneas não se sobrescrevem. */
function update(fn) {
  chain = chain.then(async () => {
    const cur = (await chrome.storage.local.get(KEY))[KEY] || { syncs: [], errors: [] };
    fn(cur);
    await chrome.storage.local.set({ [KEY]: cur });
  }).catch(() => {});
  return chain;
}

export function logSync(entry) {
  const rec = { ...entry, error: entry.error ? sanitizeMessage(entry.error) : null };
  return update(d => {
    const last = d.syncs?.[0];
    // a mesma falha repetida a cada ciclo (ex.: Bitrix fechado a noite toda) vira uma linha com contagem,
    // para não empurrar para fora do histórico as sincronizações que funcionaram
    if (last && !['ok', 'parcial'].includes(rec.status) && last.status === rec.status && last.error === rec.error) {
      last.count = (last.count || 1) + 1; last.lastAt = rec.at; return;
    }
    d.syncs = [rec, ...(d.syncs || [])].slice(0, MAX_SYNCS);
  });
}

export function logError(where, err, extra = {}) {
  const message = sanitizeMessage(err?.message ?? err);
  if (!message) return chain;
  return update(d => {
    const last = d.errors?.[0];
    // erro repetido em sequência: só conta, não ocupa outra linha
    if (last && last.where === where && last.message === message && Date.now() - last.at < 3600000) { last.count = (last.count || 1) + 1; last.at = Date.now(); return; }
    d.errors = [{ at: Date.now(), where: String(where).slice(0, 40), code: extra.code ? String(extra.code).slice(0, 40) : null, message, count: 1 },
      ...(d.errors || [])].slice(0, MAX_ERRORS);
  });
}

export async function getDiag() {
  return (await chrome.storage.local.get(KEY))[KEY] || { syncs: [], errors: [] };
}

export async function clearDiag() {
  await chrome.storage.local.remove(KEY);
}
