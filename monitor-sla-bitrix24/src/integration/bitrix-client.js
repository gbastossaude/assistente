// Cliente REST do Bitrix24 (somente leitura).
// - Webhook de entrada: https://<portal>/rest/<userId>/<código>/
// - Limite de intensidade (leaky bucket: 2 req/s nos planos padrão, 5 req/s no Enterprise)
// - Tratamento de QUERY_LIMIT_EXCEEDED (503), OPERATION_TIME_LIMIT (429), falhas temporárias
//   e perda de autenticação (NO_AUTH_FOUND, INVALID_CREDENTIALS, expired_token, insufficient_scope).
// - batch com até 50 comandos e paginação rápida por ID (start=-1).
// O código do webhook nunca é incluído em mensagens de erro ou logs.

/** Métodos permitidos. Qualquer outro é recusado — garante operação somente leitura. */
export const READ_ONLY_METHODS = new Set([
  'crm.type.list', 'crm.category.list', 'crm.status.list', 'crm.item.fields', 'crm.item.list',
  'crm.stagehistory.list', 'crm.activity.list', 'crm.automatedsolution.list', 'crm.timeline.comment.list', 'crm.settings.mode.get',
  'user.get', 'user.current', 'department.get', 'profile', 'scope', 'batch'
]);

/** Erros que impedem continuar a sincronização (credencial/sessão). */
export const isFatal = e => ['auth', 'session', 'no_tab'].includes(e?.kind);

export class BitrixError extends Error {
  constructor({ code, message, status, method, kind, retryAt }) {
    super(message || code || 'Erro na API do Bitrix24');
    this.code = code; this.status = status; this.method = method; this.kind = kind || 'other';
    this.retryAt = retryAt || null;
  }
}

const AUTH_CODES = new Set(['NO_AUTH_FOUND', 'INVALID_CREDENTIALS', 'expired_token', 'invalid_token', 'WRONG_AUTH_TYPE',
  'user_access_error', 'ACCESS_DENIED', 'PORTAL_DELETED', 'OVERLOAD_LIMIT', 'INVALID_REQUEST']);

export function classifyError(status, code) {
  if (code === 'NO_SESSION') return 'session';
  if (code === 'NO_BITRIX_TAB') return 'no_tab';
  if (code === 'WRONG_AUTH_TYPE') return 'auth_type';
  if (code === 'QUERY_LIMIT_EXCEEDED' || status === 503) return 'rate';
  if (code === 'OPERATION_TIME_LIMIT' || status === 429) return 'operation';
  if (code === 'insufficient_scope') return 'scope';
  if (code === 'ERROR_METHOD_NOT_FOUND') return 'not_found';
  if (code === 'ACCESS_DENIED' && status !== 401) return 'permission';
  if (AUTH_CODES.has(code)) return 'auth';
  if (status === 401) return 'auth';
  if (status >= 500 || code === 'INTERNAL_SERVER_ERROR' || code === 'ERROR_UNEXPECTED_ANSWER') return 'temporary';
  if (status === 403) return 'permission';
  return 'other';
}

export const ERROR_TEXT = {
  auth: 'A autenticação com o Bitrix24 falhou. O webhook pode ter sido excluído, alterado ou o REST pode estar indisponível no plano. Gere um novo webhook e reconecte.',
  scope: 'O webhook não tem a permissão (escopo) necessária para este método.',
  rate: 'Limite de requisições do Bitrix24 atingido (QUERY_LIMIT_EXCEEDED).',
  operation: 'O Bitrix24 bloqueou temporariamente um método por tempo de execução acumulado (OPERATION_TIME_LIMIT).',
  temporary: 'Falha temporária no servidor do Bitrix24 ou na rede.',
  permission: 'O usuário do webhook não tem acesso a estes dados.',
  not_found: 'Método não encontrado no portal (pode exigir escopo ou não existir nesta versão).',
  other: 'Erro retornado pelo Bitrix24.',
  session: 'Você não está logado no Bitrix24 (ou a sessão expirou). Entre no portal para a extensão atualizar.',
  no_tab: 'Nenhuma aba do Bitrix24 aberta. Abra o portal e faça login para a extensão atualizar.',
  auth_type: 'O portal não permite este tipo de consulta com o login do navegador. Use a conexão por webhook (Configurações › Conexão).'
};

/** Textos para o modo "login do Bitrix" (sem webhook). */
export const ERROR_TEXT_LOGIN = {
  auth: 'O Bitrix24 recusou a consulta com o seu login. Saia e entre de novo no portal; se continuar, use a conexão por webhook.',
  permission: 'O seu usuário não tem acesso a estes dados no Bitrix24.',
  scope: 'O portal não liberou este método para consultas com o login do navegador. Use a conexão por webhook.'
};

/** Normaliza o endereço do portal (aceita com ou sem https://, com caminho como /stream/). */
export function normalizePortal(input, { allowLocalHttp = false } = {}) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('Informe o endereço do portal.');
  if (!/^[a-z]+:\/\//i.test(raw)) raw = 'https://' + raw;
  let u;
  try { u = new URL(raw); } catch { throw new Error('Endereço do portal inválido.'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(allowLocalHttp && local && u.protocol === 'http:')) throw new Error('O portal precisa usar HTTPS.');
  return u.origin;
}

/** Valida e decompõe a URL do webhook. */
export function parseWebhook(url, { allowLocalHttp = false } = {}) {
  let u;
  try { u = new URL(String(url).trim()); } catch { throw new Error('URL do webhook inválida.'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(allowLocalHttp && local && u.protocol === 'http:')) {
    throw new Error('O webhook precisa usar HTTPS.');
  }
  const m = u.pathname.match(/^\/rest\/(\d+)\/([A-Za-z0-9]+)\/?/);
  if (!m) throw new Error('Formato esperado: https://SEU-PORTAL/rest/ID_DO_USUARIO/CODIGO/');
  return { origin: u.origin, base: `${u.origin}/rest/${m[1]}/${m[2]}/`, userId: m[1] };
}

/** Codificação no formato http_build_query (PHP), usada dentro de comandos do batch. */
export function buildQuery(obj, prefix) {
  const parts = [];
  const add = (k, v) => {
    if (v === undefined) return;
    if (v === null) v = '';
    if (Array.isArray(v)) {
      if (!v.length) parts.push(`${encodeURIComponent(k)}=`);
      v.forEach((x, i) => add(`${k}[${i}]`, x));
    } else if (typeof v === 'object') {
      for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'boolean' ? (v ? 'Y' : 'N') : v)}`);
    }
  };
  for (const [k, v] of Object.entries(obj || {})) add(prefix ? `${prefix}[${k}]` : k, v);
  return parts.join('&');
}

const sleepDefault = ms => new Promise(r => setTimeout(r, ms));

export class BitrixClient {
  /**
   * Webhook: { webhookUrl }. Login do Bitrix: { origin, transport } — `transport(method, params)` devolve
   * { status, text } e é executado dentro de uma aba do portal (mesma origem, com a sessão do usuário).
   */
  constructor({ webhookUrl, origin, transport, fetchImpl, requestsPerSecond = 2, maxRetries = 5, maxWaitMs = 20000,
    sleep = sleepDefault, allowLocalHttp = false, onRequest } = {}) {
    this.transport = transport || null;
    this.mode = transport ? 'login' : 'webhook';
    this.wh = transport ? { origin, base: null } : parseWebhook(webhookUrl, { allowLocalHttp });
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.minInterval = 1000 / Math.max(0.5, requestsPerSecond);
    this.maxRetries = maxRetries;
    this.maxWaitMs = maxWaitMs;
    this.sleep = sleep;
    this.onRequest = onRequest;
    this.queue = Promise.resolve();
    this.lastAt = 0;
    this.stats = { requests: 0, retries: 0, rateLimited: 0, operating: {} };
    this.operatingResetAt = {};
  }

  get origin() { return this.wh.origin; }

  /** Serializa requisições respeitando o intervalo mínimo (sem chamadas paralelas). */
  _slot() {
    const p = this.queue.then(async () => {
      const wait = this.lastAt + this.minInterval - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastAt = Date.now();
    });
    this.queue = p.catch(() => {});
    return p;
  }

  async call(method, params = {}) {
    if (!READ_ONLY_METHODS.has(method)) {
      throw new BitrixError({ code: 'METHOD_NOT_ALLOWED', kind: 'other', method,
        message: `Método ${method} bloqueado: a extensão opera somente em leitura.` });
    }
    let attempt = 0;
    for (;;) {
      await this._slot();
      this.stats.requests++;
      this.onRequest && this.onRequest(method);
      let res, body, status = 0;
      try {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const t = ctrl ? setTimeout(() => ctrl.abort(), 65000) : null;
        let text;
        if (this.transport) {
          const r = await this.transport(method, params);
          status = r?.status ?? 0;
          text = r?.text ?? '';
        } else {
          res = await this.fetch(`${this.wh.base}${method}.json`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(params), signal: ctrl?.signal, credentials: 'omit', cache: 'no-store'
          });
          status = res.status;
          text = await res.text();
        }
        if (t) clearTimeout(t);
        try { body = text ? JSON.parse(text) : {}; } catch { body = { error: 'ERROR_UNEXPECTED_ANSWER', error_description: 'Resposta não-JSON' }; }
      } catch (e) {
        body = { error: 'NETWORK_ERROR', error_description: 'Falha de rede ou tempo esgotado' };
        status = 0;
      }
      if (body && body.time && body.time.operating_reset_at) this.operatingResetAt[method] = body.time.operating_reset_at * 1000;
      if (status >= 200 && status < 300 && !body.error) return body;

      const code = body?.error || `HTTP_${status}`;
      const kind = code === 'NO_BITRIX_TAB' || code === 'NO_SESSION' ? classifyError(status, code) : status === 0 ? 'temporary' : classifyError(status, code);
      const txt = (this.mode === 'login' && ERROR_TEXT_LOGIN[kind]) || ERROR_TEXT[kind];
      const err = new BitrixError({ code, status, method, kind, message: `${txt} [${method}: ${code}]` });
      if (kind === 'rate') this.stats.rateLimited++;
      if ((kind === 'rate' || kind === 'temporary') && attempt < this.maxRetries) {
        attempt++; this.stats.retries++;
        await this.sleep(Math.min(16000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250));
        continue;
      }
      if (kind === 'operation') {
        const resetAt = this.operatingResetAt[method] || Date.now() + 5 * 60000;
        const wait = resetAt - Date.now();
        if (wait > 0 && wait <= this.maxWaitMs && attempt < this.maxRetries) {
          attempt++; this.stats.retries++;
          await this.sleep(wait + 500);
          continue;
        }
        err.retryAt = resetAt;
      }
      if (kind === 'rate') err.retryAt = Date.now() + 60000;
      throw err;
    }
  }

  /**
   * Executa até 50 comandos por requisição. cmds: { chave: [método, params] }.
   * Retorna { result, errors, total, next } por chave. Erros por comando não interrompem os demais.
   */
  async batch(cmds) {
    const keys = Object.keys(cmds);
    const out = { result: {}, errors: {}, total: {}, next: {} };
    for (let i = 0; i < keys.length; i += 50) {
      const chunk = keys.slice(i, i + 50);
      const cmd = {};
      for (const k of chunk) {
        const [m, p] = cmds[k];
        if (!READ_ONLY_METHODS.has(m) || m === 'batch') {
          throw new BitrixError({ code: 'METHOD_NOT_ALLOWED', kind: 'other', method: m, message: `Método ${m} bloqueado (somente leitura).` });
        }
        cmd[k] = `${m}?${buildQuery(p)}`;
      }
      const body = await this.call('batch', { halt: 0, cmd });
      const r = body.result || {};
      Object.assign(out.result, r.result || {});
      for (const [k, e] of Object.entries(r.result_error || {})) {
        const code = e?.error || 'ERROR';
        const kind = classifyError(0, code);
        const txt = (this.mode === 'login' && ERROR_TEXT_LOGIN[kind]) || ERROR_TEXT[kind];
        out.errors[k] = new BitrixError({ code, kind, method: cmds[k][0], message: `${txt} [${cmds[k][0]}: ${code}${e?.error_description ? ' — ' + String(e.error_description).slice(0, 120) : ''}]` });
      }
      Object.assign(out.total, r.result_total || {});
      Object.assign(out.next, r.result_next || {});
    }
    return out;
  }

  /**
   * Paginação rápida por ID (start=-1, sem contagem total), recomendada pela documentação
   * para grandes volumes. `idField` é 'id' (crm.item.list) ou 'ID' (métodos legados).
   */
  async listById(method, params, { idField = 'ID', extract = r => r, onPage, max = 100000, startAfter = 0 } = {}) {
    const all = [];
    let lastId = Number(startAfter) || 0;
    for (;;) {
      const p = { ...params, order: { [idField]: 'ASC' }, filter: { ...(params.filter || {}), [`>${idField}`]: lastId }, start: -1 };
      const body = await this.call(method, p);
      const page = extract(body.result) || [];
      all.push(...page);
      onPage && (await onPage(page, all.length));
      if (page.length < 50 || all.length >= max) break;
      const ids = page.map(x => Number(x[idField])).filter(n => !isNaN(n));
      const next = Math.max(...ids);
      if (!(next > lastId)) break;
      lastId = next;
    }
    return all;
  }

  /** Paginação tradicional por `start`/`next`, aplicada em lote para várias consultas. */
  async batchListAll(cmds, { extract = r => r, maxPagesPerKey = 40 } = {}) {
    const results = {};
    const errors = {};
    let pending = Object.fromEntries(Object.entries(cmds).map(([k, v]) => [k, { m: v[0], p: { ...v[1], start: 0 }, pages: 0 }]));
    while (Object.keys(pending).length) {
      const req = Object.fromEntries(Object.entries(pending).map(([k, v]) => [k, [v.m, v.p]]));
      const r = await this.batch(req);
      const nextPending = {};
      for (const [k, v] of Object.entries(pending)) {
        if (r.errors[k]) { errors[k] = r.errors[k]; continue; }
        const page = extract(r.result[k]) || [];
        (results[k] = results[k] || []).push(...page);
        v.pages++;
        const nx = r.next[k];
        if (nx != null && nx !== '' && v.pages < maxPagesPerKey) nextPending[k] = { ...v, p: { ...v.p, start: Number(nx) } };
      }
      pending = nextPending;
    }
    return { results, errors };
  }
}
