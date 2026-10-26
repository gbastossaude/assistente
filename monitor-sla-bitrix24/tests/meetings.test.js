// Ranking automático de reuniões: classificação, períodos no fuso, empates, cards encerrados e
// atualização incremental. Usa o portal SIMULADO (dados fictícios).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BitrixClient } from '../src/integration/bitrix-client.js';
import { syncData, emptyDataset } from '../src/integration/sync.js';
import { createMockPortal, buildDemoPortal, DEMO_WEBHOOK } from '../src/demo/mock-portal.js';
import { demoConfig } from '../src/demo/demo-config.js';
import { analyze } from '../src/core/analyze.js';
import { isMeeting, periodRange, buildMeetingRankings, DEFAULT_MEETINGS } from '../src/core/meetings.js';
import { zonedToUtc } from '../src/core/time.js';

const NOW = Date.parse('2026-10-26T13:35:00Z');
const SP = 'America/Sao_Paulo';
const fastClient = mock => new BitrixClient({ webhookUrl: DEMO_WEBHOOK, fetchImpl: mock.fetchImpl, requestsPerSecond: 1000, sleep: async () => {} });

test('o que conta como reunião', () => {
  const cfg = DEFAULT_MEETINGS;
  assert.equal(isMeeting({ PROVIDER_ID: 'CRM_MEETING', SUBJECT: 'Qualquer' }, cfg), true);
  assert.equal(isMeeting({ PROVIDER_ID: 'CRM_TODO', SUBJECT: 'REUNIÃO com RH' }, cfg), true, 'sem diferenciar acento e maiúsculas');
  assert.equal(isMeeting({ PROVIDER_ID: 'CRM_TODO', SUBJECT: 'Reuniao de alinhamento' }, cfg), true);
  assert.equal(isMeeting({ PROVIDER_ID: 'CRM_TODO', SUBJECT: 'Ligar para o cliente' }, cfg), false);
  assert.equal(isMeeting({ PROVIDER_ID: 'VOXIMPLANT_CALL', SUBJECT: 'Reunião' }, cfg), false, 'palavra-chave vale só para "A fazer"');
  assert.equal(isMeeting({ providerId: 'CRM_TODO', subject: 'reunião' }, { ...cfg, todoKeywords: [] }), false);
});

test('períodos no fuso de Brasília (semana de segunda a domingo, viradas de mês)', () => {
  const wed = zonedToUtc(2026, 10, 28, 15, 0, SP);
  assert.deepEqual(periodRange('hoje', wed, SP), { from: zonedToUtc(2026, 10, 28, 0, 0, SP), to: zonedToUtc(2026, 10, 29, 0, 0, SP) });
  assert.deepEqual(periodRange('semana', wed, SP), { from: zonedToUtc(2026, 10, 26, 0, 0, SP), to: zonedToUtc(2026, 11, 2, 0, 0, SP) });
  const sun = zonedToUtc(2026, 11, 1, 10, 0, SP);
  assert.equal(periodRange('semana', sun, SP).from, zonedToUtc(2026, 10, 26, 0, 0, SP), 'domingo ainda é da semana iniciada na segunda');
  assert.deepEqual(periodRange('mes', wed, SP), { from: zonedToUtc(2026, 10, 1, 0, 0, SP), to: zonedToUtc(2026, 11, 1, 0, 0, SP) });
  assert.deepEqual(periodRange('mes_anterior', wed, SP), { from: zonedToUtc(2026, 9, 1, 0, 0, SP), to: zonedToUtc(2026, 10, 1, 0, 0, SP) });
  const jan = zonedToUtc(2027, 1, 10, 12, 0, SP);
  assert.deepEqual(periodRange('mes_anterior', jan, SP), { from: zonedToUtc(2026, 12, 1, 0, 0, SP), to: zonedToUtc(2027, 1, 1, 0, 0, SP) });
  // 23:30 do dia 31 em Brasília já é dia 1º em UTC: continua no mês local
  const late = zonedToUtc(2026, 10, 31, 23, 30, SP);
  assert.equal(periodRange('mes', late, SP).from, zonedToUtc(2026, 10, 1, 0, 0, SP));
});

test('ranking a partir da sincronização: inclui cards ganhos/perdidos, comercial pelo e-mail do especialista', async () => {
  const mock = createMockPortal({ now: NOW });
  const cfg = demoConfig(NOW);
  const { ds } = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  assert.equal(ds.sync.coverage.meetings, 'ok');
  // a atividade "Ligar para o cliente" (A fazer) não é reunião
  assert.ok(!Object.values(ds.meetings).some(m => m.ownerId === 510));
  // cards encerrados (514 ganho, 515 perdido) entram pelo cadastro mínimo dos cards
  assert.ok(ds.meetingOwners['2:514'] && ds.meetingOwners['2:515']);
  assert.equal(ds.meetingOwners['2:514'].createdById, '12');
  assert.equal(ds.meetingOwners['2:514'].fields.ufCrm_EMAIL_ESPECIALISTA, 'rafael.dias@exemplo-ficticio.com.br');
  // nada de assunto armazenado
  assert.ok(Object.values(ds.meetings).every(m => !('subject' in m)));

  const r = analyze(ds, cfg, NOW).meetings;
  const p30 = r.periods['30d'];
  // a reunião do funil "Pós-venda" (excluído) não entra
  assert.deepEqual(p30.totals, { realizadas: 10, agendadas: 0, pendentes: 1 });
  const com = p30.byGroup.comercial;
  assert.equal(com.reduce((n, x) => n + x.realizadas, 0), 10, 'cada reunião conta para um único comercial');
  // card ganho 514 tem "E-mail do especialista" rafael.dias@…: as 2 reuniões dele vão para Rafael Dias
  const rafael = com.find(x => x.name === 'Rafael Dias');
  assert.ok(rafael && rafael.realizadas >= 2 && rafael.key === 'email:rafael.dias@exemplo-ficticio.com.br');
  assert.equal(com[0].pos, 1);
  const resp = p30.byGroup.responsavel_reuniao;
  assert.equal(resp[0].key, '12');
  assert.equal(resp[0].realizadas, 4);
  assert.equal(resp.find(x => x.key === '13').pendentes, 1, 'reunião que passou do horário sem ser concluída');
  // agendadas aparecem nos períodos que incluem o futuro
  const semana = r.periods.semana;
  assert.ok(semana.totals.agendadas >= 1);

  // sem cards encerrados: as reuniões do 514 e 515 saem
  const r2 = buildMeetingRankings(ds, { ...cfg, meetings: { ...cfg.meetings, includeClosed: false } }, NOW);
  assert.equal(r2.periods['30d'].totals.realizadas, 7);
});

test('ranking atualizado na sincronização incremental (reunião concluída e reunião nova)', async () => {
  const portal = buildDemoPortal(NOW);
  const mock = createMockPortal({ portal });
  const cfg = demoConfig(NOW);
  const client = fastClient(mock);
  const r1 = await syncData({ client, config: cfg, ds: emptyDataset(), now: NOW });
  const later = NOW + 15 * 60000;
  const iso = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const pend = portal.activities.find(a => a.OWNER_ID === '512' && a.SUBJECT === 'Alinhamento com o sócio');
  pend.COMPLETED = 'Y'; pend.LAST_UPDATED = iso(later - 60000);
  portal.activities.push({ ID: '9001', OWNER_ID: '503', OWNER_TYPE_ID: '2', PROVIDER_ID: 'CRM_TODO', TYPE_ID: '6', SUBJECT: 'Reunião de follow-up',
    COMPLETED: 'Y', DEADLINE: iso(later - 120000), START_TIME: iso(later - 120000), CREATED: iso(later - 300000), LAST_UPDATED: iso(later - 60000),
    AUTHOR_ID: '13', RESPONSIBLE_ID: '13', DIRECTION: '0' });
  const before = mock.state.methods['crm.activity.list'] || 0;
  const r2 = await syncData({ client, config: cfg, ds: r1.ds, now: later });
  assert.equal(r2.report.full, false);
  assert.ok(r2.ds.meetings['2:9001'], 'reunião nova entrou');
  assert.equal(Object.values(r2.ds.meetings).find(m => m.id === Number(pend.ID)).completed, true);
  const p = analyze(r2.ds, cfg, later).meetings.periods['30d'];
  assert.deepEqual(p.totals, { realizadas: 12, agendadas: 0, pendentes: 0 });
  // a incremental não faz consultas extras de reuniões: reaproveita a lista de atividades alteradas
  assert.equal((mock.state.methods['crm.activity.list'] || 0) - before, cfg.monitored.length);
});

test('empates dividem a posição e cards fora do funil monitorado não contam', () => {
  const now = NOW;
  const mk = (id, owner, resp, done, daysAgo) => [`2:${id}`, { id, ownerTypeId: 2, ownerId: owner, providerId: 'CRM_MEETING', completed: done,
    start: now - daysAgo * 86400000, deadline: null, created: now - 40 * 86400000, responsibleId: resp }];
  const ds = {
    mode: 'real', meta: { users: { 1: { name: 'Ana' }, 2: { name: 'Bia' }, 3: { name: 'Caio' } } },
    cards: { '2:10': { categoryId: 0, createdById: '1', assignedById: '1' }, '2:11': { categoryId: 0, createdById: '2', assignedById: '2' },
      '2:12': { categoryId: 0, createdById: '3', assignedById: '3' }, '2:13': { categoryId: 9, createdById: '3', assignedById: '3' } },
    meetingOwners: {},
    meetings: Object.fromEntries([mk(1, 10, '1', true, 1), mk(2, 11, '2', true, 2), mk(3, 12, '3', true, 1), mk(4, 12, '3', true, 3), mk(5, 13, '3', true, 1)])
  };
  const cfg = { focusPage: null, monitored: [{ entityTypeId: 2, categoryIds: [0] }], calendar: { timezone: SP } };
  const r = buildMeetingRankings(ds, cfg, now);
  const rows = r.periods['30d'].byGroup.comercial;
  assert.deepEqual(rows.map(x => [x.name, x.realizadas, x.pos]), [['Caio', 2, 1], ['Ana', 1, 2], ['Bia', 1, 2]]);
  assert.equal(r.coverage.foraDoEscopo, 1, 'funil 9 não é monitorado');
});
