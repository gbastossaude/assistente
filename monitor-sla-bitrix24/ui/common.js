// Utilidades compartilhadas pelas páginas da extensão.
import { zonedParts } from '../src/core/time.js';

export function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, res => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message)); else resolve(res);
    });
  });
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
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur || 'BRL', maximumFractionDigits: 0 }).format(v || 0); }
  catch { return `${cur} ${Math.round(v || 0)}`; }
}

export const LEVELS = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export const STATUS_TEXT = {
  ok: 'Sincronizado', parcial: 'Sincronizado com ressalvas', erro: 'Falha na última consulta', auth_error: 'Credencial inválida',
  sem_credencial: 'Credencial ausente', sem_permissao: 'Sem permissão de domínio', nunca: 'Ainda não sincronizado',
  sem_configuracao: 'Nenhum funil selecionado', sem_sessao: 'Sem login no Bitrix24', sem_aba: 'Bitrix24 fechado', aguardando_pagina: 'Aguardando a página be.smart Saúde'
};
