/*
 * Exportação CSV (somente por ação do usuário), protegida contra injeção de fórmulas.
 */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});
  const req = (n) => (typeof require === 'function' ? require(n) : null);
  const util = NS.util || req('./util.js');
  const time = NS.time || req('./time.js');

  /** Neutraliza conteúdo que planilhas executariam como fórmula (=, +, -, @, tab, CR). */
  function csvCell(value) {
    let s = value === null || value === undefined ? '' : String(value);
    s = s.replace(/\r\n|\r|\n/g, ' ');
    if (/^[\s]*[=+\-@\t\r|%]/.test(s) || /^[＝＋－＠]/.test(s)) s = "'" + s;
    if (/[";]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  const HEADER = ['Prioridade', 'ID', 'Entidade', 'Nome', 'Funil', 'Etapa', 'Responsável', 'Valor', 'Moeda',
    'Pendências', 'Prazo aplicado', 'Atraso', 'Origem da informação', 'Contagem parcial', 'Link'];

  function buildCsv(queueResults, tz) {
    const lines = [HEADER.map(csvCell).join(';')];
    queueResults.forEach((r, i) => {
      const c = r.card;
      const alerts = r.alerts;
      const deadlines = alerts.map((a) => (a.deadline ? time.formatDateTime(a.deadline, tz) : '')).filter(Boolean);
      const overdue = alerts.map((a) => (a.overdueMs ? util.formatDuration(a.overdueMs) : '')).filter(Boolean);
      const row = [
        i + 1, c.id, c.entity, c.title, c.funnel.name || '', c.stage.name || '', c.responsible || 'não exibido',
        c.amount ? String(c.amount.amount.toFixed(2)).replace('.', ',') : '', c.amount ? c.amount.currency || 'não identificada' : '',
        alerts.map((a) => a.label).join(' | ') || 'nenhuma pendência identificada',
        deadlines.join(' | '), overdue.join(' | '),
        [...new Set(alerts.map((a) => a.origin))].join(' | '),
        alerts.some((a) => a.partial) ? 'sim' : 'não',
        c.url || ''
      ];
      lines.push(row.map(csvCell).join(';'));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  const api = { csvCell, buildCsv, HEADER };
  NS.csv = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
