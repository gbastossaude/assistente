// Utilidades compartilhadas pelas páginas da extensão.
import { zonedParts } from '../src/core/time.js';

/** Mensagem ao service worker. Erros de ligação viram mensagem clara (ex.: extensão atualizada com a tela aberta). */
export function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    let id;
    try { id = chrome.runtime?.id; } catch { id = null; }
    if (!id) { reject(new Error('A extensão foi atualizada ou recarregada. Feche e abra o painel de novo.')); return; }
    chrome.runtime.sendMessage({ type, ...payload }, res => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(/Receiving end|message port closed/i.test(err.message)
        ? 'O serviço da extensão não respondeu. Tente de novo em instantes.' : err.message));
      else resolve(res);
    });
  });
}

/** Tema: "auto" (segue o sistema), "claro" ou "escuro". Guardado para todas as telas da extensão. */
export const THEMES = ['auto', 'claro', 'escuro'];
export function getTheme() { try { return THEMES.includes(localStorage.getItem('tema')) ? localStorage.getItem('tema') : 'auto'; } catch { return 'auto'; } }
export function applyTheme(t = getTheme()) {
  const el = document.documentElement;
  // troca instantânea: sem transições, nada aparece em cores intermediárias
  el.classList.add('no-anim');
  if (t === 'claro') el.dataset.theme = 'light'; else if (t === 'escuro') el.dataset.theme = 'dark'; else delete el.dataset.theme;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('no-anim')));
}
export function setTheme(t) {
  try { localStorage.setItem('tema', t); } catch { /* preferência só desta tela */ }
  applyTheme(t);
  chrome.storage.local.set({ uiTheme: t }).catch(() => {});
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

export function fmtDT(ts, tz = 'America/Sao_Paulo', withYear = false) {
  if (ts == null) return '—';
  const p = zonedParts(ts, tz);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(p.d)}/${pad(p.m)}${withYear ? '/' + p.y : ''} ${pad(p.hh)}:${pad(p.mm)}`;
}

export function fmtAgo(ts, now = Date.now()) {
  if (!ts) return 'nunca';
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'agora mesmo';
  const m = Math.round(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export function fmtMoney(v, cur = 'BRL') {
  // código de moeda vem do Bitrix: só letras (evita injetar texto na tela se o código for inválido)
  const code = /^[A-Za-z]{3}$/.test(String(cur || '')) ? String(cur).toUpperCase() : 'BRL';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(Number(v) || 0); }
  catch { return `${code} ${Math.round(Number(v) || 0)}`; }
}

/** Data sem hora (dd/mm/aaaa) no fuso. */
export function fmtDate(ts, tz = 'America/Sao_Paulo') {
  if (ts == null) return '—';
  const p = zonedParts(ts, tz);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

/** Idade do card em dias de calendário: "criado hoje", "há 1 dia", "há 12 dias". */
export function fmtAge(days) {
  if (days == null) return '—';
  if (days <= 0) return 'criado hoje';
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** Soma por moeda ({ BRL: 100, USD: 5 }) → "R$ 100 + US$ 5". Moedas nunca são somadas entre si. */
export function fmtMoneyMap(map) {
  const e = Object.entries(map || {}).filter(([, v]) => v > 0);
  return e.length ? e.map(([c, v]) => fmtMoney(v, c)).join(' + ') : '—';
}

export const LEVELS = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export const STATUS_TEXT = {
  ok: 'Sincronizado', parcial: 'Sincronizado com ressalvas', erro: 'Falha na última consulta', auth_error: 'Credencial inválida',
  sem_credencial: 'Credencial ausente', sem_permissao: 'Sem permissão de domínio', nunca: 'Ainda não sincronizado',
  sem_configuracao: 'Nenhum funil selecionado', sem_sessao: 'Sem login no Bitrix24', sem_aba: 'Bitrix24 fechado', aguardando_pagina: 'Aguardando a página be.smart Saúde',
  sem_conexao: 'Sem conexão com a internet'
};

/** Célula de CSV (separador ";") protegida contra fórmulas de planilha (=, +, -, @, tab). */
export function csvCell(v) {
  let s = String(v ?? '').replace(/\r?\n|\r/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Baixa um CSV gerado no próprio navegador (nada é enviado). */
export function downloadCsv(name, rows) {
  const text = '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
