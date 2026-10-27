// Versão 1.8: resumos leves para as telas, máscara do diagnóstico e formatação segura de moeda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMessage } from '../src/store/diag.js';
import { viewOf, summaryOf } from '../src/store/storage.js';
import { fmtMoney } from '../ui/common.js';
import { analyze } from '../src/core/analyze.js';
import { buildLargeDataset } from '../tools/large-dataset.mjs';

test('diagnóstico mascara webhook, sessid, tokens e e-mails', () => {
  const m = sanitizeMessage('Falha em https://crm.exemplo.com/rest/17/abc123SEGREDO/crm.item.list.json?sessid=f00ba7&auth=xyz — avise yago.barbosa@besmart.com.br');
  assert.ok(!m.includes('abc123SEGREDO'));
  assert.ok(!m.includes('f00ba7') && !m.includes('xyz'));
  assert.ok(!m.includes('yago.barbosa@'));
  assert.match(m, /\/rest\/<id>\/\*\*\*/);
  assert.match(m, /sessid=\*\*\*/);
  assert.match(m, /y\*\*\*@besmart\.com\.br/);
  assert.equal(sanitizeMessage('x'.repeat(1000)).length, 300);
  assert.equal(sanitizeMessage(null), '');
  assert.equal(sanitizeMessage(new Error('boom').message), 'boom');
});

test('resumo leve das telas: sem cards, atividades nem histórico, mas com o que as telas usam', () => {
  const { ds } = buildLargeDataset(300);
  ds.alertState.snoozed = { 'a|b|': 123 };
  const v = viewOf(ds);
  assert.deepEqual(Object.keys(v).sort(), ['meta', 'monitoredUserIds', 'observedProviders', 'portalUrl', 'snoozed', 'sync']);
  assert.deepEqual(Object.keys(v.meta).sort(), ['categories', 'departments', 'entities', 'fields', 'stages', 'users']);
  assert.equal(v.observedProviders.CRM_TODO, 300);
  assert.equal(v.observedProviders.CRM_MEETING, 300);
  assert.deepEqual(v.snoozed, { 'a|b|': 123 });
  assert.ok(v.monitoredUserIds.length > 0);
  const full = JSON.stringify(ds).length, light = JSON.stringify(v).length;
  assert.ok(light < full / 20, `resumo ${light} B x conjunto ${full} B`);
});

test('resumo do popup: indicadores e os primeiros cards da fila, sem os silenciados', () => {
  const { ds, config, now } = buildLargeDataset(400);
  const an = analyze(ds, config, now);
  const first = an.cards.find(c => c.alerts.length);
  for (const a of first.alerts) a.snoozedUntil = now + 3600000; // todos os alertas do 1º card silenciados
  const s = summaryOf(an, now);
  assert.deepEqual(s.kpis, an.kpis);
  assert.ok(s.top.length > 0 && s.top.length <= 8);
  assert.ok(!s.top.some(c => c.key === first.key), 'card silenciado fica fora');
  assert.ok(s.top.every(c => c.worst && c.title && c.level));
  assert.ok(JSON.stringify(s).length < 8000, 'resumo pequeno');
});

test('moeda: código inválido vindo do portal não vira texto na tela', () => {
  assert.match(fmtMoney(1500, 'BRL'), /R\$\s?1\.500/);
  assert.match(fmtMoney(10, 'usd'), /US\$\s?10/);
  const evil = fmtMoney(10, '<img src=x onerror=alert(1)>');
  assert.ok(!evil.includes('<') && !evil.includes('onerror'), evil);
  assert.match(fmtMoney('abc', 'BRL'), /R\$\s?0/);
});
