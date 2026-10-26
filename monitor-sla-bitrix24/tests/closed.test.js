// Estudo de concluídos e cancelados, com o portal SIMULADO (dados fictícios).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BitrixClient } from '../src/integration/bitrix-client.js';
import { syncData, emptyDataset } from '../src/integration/sync.js';
import { createMockPortal, buildDemoPortal, DEMO_WEBHOOK } from '../src/demo/mock-portal.js';
import { demoConfig } from '../src/demo/demo-config.js';
import { analyze } from '../src/core/analyze.js';
import { buildClosedStudy } from '../src/core/closed.js';

const NOW = Date.parse('2026-10-26T13:35:00Z');
const fastClient = mock => new BitrixClient({ webhookUrl: DEMO_WEBHOOK, fetchImpl: mock.fetchImpl, requestsPerSecond: 1000, sleep: async () => {} });
const byTitle = (items, t) => items.find(i => i.title.includes(t));

test('lê os encerrados da janela, com etapa anterior e data de encerramento pelo histórico', async () => {
  const mock = createMockPortal({ now: NOW });
  const cfg = demoConfig(NOW);
  const { ds } = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  assert.equal(ds.sync.coverage.closed, 'ok');
  const titles = Object.values(ds.closed).map(c => c.title);
  assert.equal(titles.length, 13);
  assert.ok(!titles.some(t => t.includes('fora da janela')), 'encerrado há 250 dias fica fora da janela de 180');
  assert.ok(!titles.some(t => t.includes('Pós-venda')), 'funil pós-venda excluído');
  assert.ok(Object.values(ds.closed).every(c => !('activities' in c)));
  const C = analyze(ds, cfg, NOW).closedStudy;
  const otica = byTitle(C.items, 'Ótica Visão');
  assert.equal(otica.type, 'cancelado');
  assert.equal(otica.prevStageName, 'Aguardando retorno da operadora');
  assert.equal(otica.finalStageName, 'Perdido');
  assert.equal(otica.reason, 'Rede credenciada', 'motivo lido do campo "Motivo da perda" (lista)');
  assert.equal(otica.closedTimeSource, 'historico');
  assert.equal(otica.cycleDays, 12);
  assert.equal(otica.commercialName, 'Maria da Silva', 'comercial pelo e-mail do especialista');
  assert.equal(byTitle(C.items, 'Bar do Porto').reason, null);
});

test('indicadores por período: totais, taxa, valores, ciclo, onde se cancela e motivos', async () => {
  const mock = createMockPortal({ now: NOW });
  const cfg = demoConfig(NOW);
  const { ds } = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  const C = buildClosedStudy(ds, cfg, NOW);
  const p180 = C.periods['180d'].totals;
  assert.equal(p180.concluidos, 6);
  assert.equal(p180.cancelados, 7);
  assert.equal(Math.round(p180.taxa * 1000), 462);
  assert.deepEqual(p180.valorConcluido, { BRL: 70000 + 13200 + 52000 + 33000 + 90000 });
  assert.equal(p180.cicloConcluido.n, 6);
  const p30 = C.periods['30d'].totals;
  assert.deepEqual([p30.concluidos, p30.cancelados], [5, 6], 'Escola (40 dias) e Alicerce (80 dias) ficam fora dos 30 dias');
  const stages = C.periods['180d'].lostByStage;
  assert.equal(stages.reduce((n, x) => n + x.n, 0), 7);
  assert.ok(stages.find(x => x.name === 'Aguardando retorno da operadora').n === 2);
  const reasons = C.periods['180d'].byReason.map(x => x.name);
  for (const r of ['Preço', 'Rede credenciada', 'Desistência do cliente', 'Fechou com concorrente']) assert.ok(reasons.includes(r), r);
  // por comercial: soma confere e taxa calculada
  const com = C.periods['180d'].byCommercial;
  assert.equal(com.reduce((n, x) => n + x.total, 0), 13);
  assert.ok(com.every(x => x.taxa === x.concluidos / x.total));
  assert.equal(C.periods['180d'].byFunnel.reduce((n, x) => n + x.total, 0), 13);
  assert.equal(C.monthly.length, 6);
  assert.equal(C.monthly.at(-1).label, '10/2026');
  assert.ok(C.periods['180d'].summary[0].startsWith('13 cards encerrados: 6 concluídos e 7 cancelados'));
});

test('card que se encerra entre sincronizações entra pela consulta incremental (sem requisição extra)', async () => {
  const portal = buildDemoPortal(NOW);
  const mock = createMockPortal({ portal });
  const cfg = demoConfig(NOW);
  const client = fastClient(mock);
  const r1 = await syncData({ client, config: cfg, ds: emptyDataset(), now: NOW });
  const later = NOW + 15 * 60000;
  const iso = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const deal = portal.items[2].find(i => i.title.includes('Contábil Horizonte'));
  deal.stageId = 'LOSE'; deal.stageSemanticId = 'F'; deal.movedTime = iso(later - 60000); deal.updatedTime = iso(later - 60000);
  const before = mock.state.methods['crm.item.list'];
  const r2 = await syncData({ client, config: cfg, ds: r1.ds, now: later });
  assert.equal(r2.report.full, false);
  const rec = r2.ds.closed[`2:${deal.id}`];
  assert.ok(rec, 'entrou no estudo');
  assert.equal(rec.prevStageId, 'NEW', 'etapa anterior = última etapa aberta vista');
  assert.equal(rec.closedTimeSource, 'movedTime');
  assert.equal(mock.state.methods['crm.item.list'] - before, cfg.monitored.length, 'só a consulta incremental de cards de sempre');
  assert.equal(r2.ds.cards[`2:${deal.id}`], undefined, 'saiu da fila de abertos');
  const C = analyze(r2.ds, cfg, later).closedStudy;
  assert.equal(C.periods['30d'].totals.cancelados, 7);
});

test('estudo desativado não lê nem guarda encerrados', async () => {
  const mock = createMockPortal({ now: NOW });
  const cfg = { ...demoConfig(NOW), closedStudy: { enabled: false, lookbackDays: 180, reasonFields: {} } };
  const { ds } = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  assert.deepEqual(ds.closed, {});
  assert.equal(ds.sync.coverage.closed, 'desativado');
});
