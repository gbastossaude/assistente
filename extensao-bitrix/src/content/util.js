/*
 * Utilitários sem dependência de DOM: normalização de texto, links seguros,
 * números/valores em formato brasileiro e formatação.
 * Carregado como content script (namespace global BNKA) e via require() nos testes.
 */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});

  const ALLOWED_ORIGIN = 'https://crm.hub-bnk.com';

  function cleanText(value, max) {
    if (value === null || value === undefined) return '';
    let s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    const limit = max || 300;
    return s.length > limit ? s.slice(0, limit - 1) + '…' : s;
  }

  /** Chave estável para comparar rótulos e nomes: minúsculas, sem acentos, espaços normalizados. */
  function normKey(value) {
    return cleanText(value, 500)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[:：]\s*$/, '')
      .trim();
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Aceita somente links https do próprio portal, dentro de /crm/.
   * Qualquer outro esquema (javascript:, data:, http:) ou domínio é descartado.
   */
  function safeCardUrl(href, base) {
    if (!href || typeof href !== 'string') return null;
    let url;
    try {
      url = new URL(href.trim(), base || ALLOWED_ORIGIN + '/');
    } catch (e) {
      return null;
    }
    if (url.protocol !== 'https:' || url.origin !== ALLOWED_ORIGIN) return null;
    if (url.username || url.password) return null;
    if (!/^\/crm\//.test(url.pathname)) return null;
    url.hash = '';
    return url.href;
  }

  /** Monta o link do card a partir da entidade e do ID numérico (padrão de URL do Bitrix24). */
  function buildCardUrl(entity, id) {
    if (!/^\d{1,12}$/.test(String(id || ''))) return null;
    let path = null;
    if (entity === 'deal') path = '/crm/deal/details/' + id + '/';
    else if (entity === 'lead') path = '/crm/lead/details/' + id + '/';
    else if (/^dyn\d{1,6}$/.test(entity || '')) path = '/crm/type/' + entity.slice(3) + '/details/' + id + '/';
    return path ? ALLOWED_ORIGIN + path : null;
  }

  /** Entidade e ID a partir de um link de card do Bitrix. */
  function parseCardHref(href) {
    const url = safeCardUrl(href);
    if (!url) return null;
    const path = new URL(url).pathname;
    let m = path.match(/^\/crm\/(deal|lead|quote|contact|company)\/(?:details|show)\/(\d+)\//);
    if (m) return { entity: m[1], id: m[2], url };
    m = path.match(/^\/crm\/type\/(\d+)\/details\/(\d+)\//);
    if (m) return { entity: 'dyn' + m[1], id: m[2], url };
    return null;
  }

  /**
   * Número decimal digitado no formulário: aceita "1,25", "1.25", "2", " 0 ".
   * Rejeita negativos, texto, separadores misturados e valores acima do limite.
   */
  function parseDecimalInput(value, opts) {
    const o = Object.assign({ min: 0, max: 100000 }, opts || {});
    const raw = String(value === null || value === undefined ? '' : value).trim();
    if (raw === '') return { ok: true, value: 0, empty: true };
    if (!/^\d+(?:[.,]\d+)?$/.test(raw)) {
      return { ok: false, error: 'Use apenas números, com vírgula ou ponto para decimais (ex.: 1,25).' };
    }
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n)) return { ok: false, error: 'Número inválido.' };
    if (n < o.min) return { ok: false, error: 'O valor mínimo é ' + o.min + '.' };
    if (n > o.max) return { ok: false, error: 'O valor máximo é ' + o.max + '.' };
    return { ok: true, value: n };
  }

  const CURRENCY_TOKENS = [
    [/^r\$$/i, 'BRL'], [/^brl$/i, 'BRL'], [/^reais?$/i, 'BRL'],
    [/^us\$$/i, 'USD'], [/^u\$$/i, 'USD'], [/^usd$/i, 'USD'],
    [/^€$/, 'EUR'], [/^eur$/i, 'EUR'], [/^£$/, 'GBP'], [/^gbp$/i, 'GBP']
  ];

  function currencyFromToken(token) {
    if (!token) return null;
    const t = token.trim();
    for (const [re, code] of CURRENCY_TOKENS) if (re.test(t)) return code;
    return null;
  }

  /** Converte "1.234,56" / "1,234.56" / "1234" em número. Retorna null se ambíguo ou inválido. */
  function parseLocaleNumber(str) {
    let s = String(str || '').replace(/[\s  ]/g, '');
    if (!/^\d[\d.,]*$/.test(s)) return null;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length !== 3) s = parts[0] + '.' + parts[1];
      else if (parts.slice(1).every((p) => p.length === 3)) s = parts.join('');
      else return null;
    } else if (lastDot >= 0) {
      const parts = s.split('.');
      // Padrão brasileiro: ponto separa milhares ("1.234" = mil duzentos e trinta e quatro)
      if (parts.slice(1).every((p) => p.length === 3)) s = parts.join('');
      else if (parts.length === 2) s = parts[0] + '.' + parts[1];
      else return null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Lê um valor monetário exibido ("R$ 12.500,00", "US$ 1,000.00", "12 500 BRL").
   * Moeda não identificada fica como null — nunca é presumida.
   */
  function parseMoney(text) {
    const s = cleanText(text, 120);
    if (!s) return null;
    const m = s.match(/(R\$|US\$|U\$|BRL|USD|EUR|GBP|€|£|\$)?\s*(\d[\d.,\s  ]*\d|\d)\s*(R\$|BRL|USD|EUR|GBP|reais|€|£)?/i);
    if (!m) return null;
    const amount = parseLocaleNumber(m[2]);
    if (amount === null) return null;
    const currency = currencyFromToken(m[1]) || currencyFromToken(m[3]);
    return { amount, currency: currency || null, raw: s };
  }

  function formatMoney(amount, currency) {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—';
    if (currency) {
      try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount);
      } catch (e) { /* código desconhecido: cai no formato numérico */ }
    }
    const n = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    return currency ? n + ' ' + currency : n + ' (moeda não identificada)';
  }

  function formatDuration(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
    const neg = ms < 0;
    let min = Math.round(Math.abs(ms) / 60000);
    const d = Math.floor(min / 1440); min -= d * 1440;
    const h = Math.floor(min / 60); min -= h * 60;
    const parts = [];
    if (d) parts.push(d + ' d');
    if (h) parts.push(h + ' h');
    if (min && d === 0) parts.push(min + ' min');
    const out = parts.length ? parts.join(' ') : '0 min';
    return neg ? '-' + out : out;
  }

  function formatHours(hours) {
    if (!hours) return '0 h';
    return String(Math.round(hours * 100) / 100).replace('.', ',') + ' h';
  }

  /** Hash FNV-1a de 32 bits (assinaturas de leitura em memória, não criptográfico). */
  function hashString(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  /**
   * Funções nativas guardadas em variáveis precisam manter o "this" original
   * (ex.: window.setTimeout, window.requestIdleCallback), senão o Chrome lança
   * "Illegal invocation".
   */
  function bindNative(owner, name) {
    if (!owner) return null;
    const fn = owner[name];
    return typeof fn === 'function' ? fn.bind(owner) : null;
  }

  const api = {
    ALLOWED_ORIGIN, cleanText, normKey, escapeHtml, safeCardUrl, buildCardUrl, parseCardHref,
    parseDecimalInput, parseLocaleNumber, parseMoney, currencyFromToken, formatMoney,
    formatDuration, formatHours, hashString, bindNative
  };
  NS.util = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
