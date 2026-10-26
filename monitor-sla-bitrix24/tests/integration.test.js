// Testes da integração usando o cliente HTTP real contra o portal simulado
// (mesmo formato de resposta da API oficial). NÃO valida um portal Bitrix24 real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BitrixClient, parseWebhook, buildQuery, READ_ONLY_METHODS } from '../src/integration/bitrix-client.js';
import { syncData, emptyDataset } from '../src/integration/sync.js';
import { createMockPortal, buildDemoPortal, parseQuery, DEMO_WEBHOOK } from '../src/demo/mock-portal.js';
import { loadStructure, parseCardUrl } from '../src/integration/bitrix-api.js';
import { demoConfig } from '../src/demo/demo-config.js';
import { analyze } from '../src/core/analyze.js';
import { updateAlertState, selectNotifications, badgeCount } from '../src/alerts/alert-state.js';

const NOW = Date.parse('2026-10-26T13:35:00Z');
const fastClient = (mock, extra = {}) => new BitrixClient({ webhookUrl: DEMO_WEBHOOK, fetchImpl: mock.fetchImpl, requestsPerSecond: 1000, sleep: async () => {}, ...extra });

test('webhook: exige HTTPS e formato /rest/ID/CÓDIGO/', () => {
  assert.equal(parseWebhook('https://x.bitrix24.com.br/rest/12/abc123/').base, 'https://x.bitrix24.com.br/rest/12/abc123/');
  assert.throws(() => parseWebhook('http://x.bitrix24.com.br/rest/12/abc123/'), /HTTPS/);
  assert.throws(() => parseWebhook('https://x.bitrix24.com.br/crm/'), /Formato/);
});

test('batch: codificação http_build_query é lida corretamente pelo servidor', () => {
  const q = buildQuery({ entityTypeId: 2, filter: { '@OWNER_ID': [1, 2], '>ID': 0 }, select: ['ID', 'STAGE_ID'] });
  const p = parseQuery(q);
  assert.deepEqual(p, { entityTypeId: '2', filter: { '@OWNER_ID': ['1', '2'], '>ID': '0' }, select: ['ID', 'STAGE_ID'] });
});

test('somente leitura: métodos de escrita são bloqueados no cliente', async () => {
  const mock = createMockPortal({ now: NOW });
  const c = fastClient(mock);
  await assert.rejects(c.call('crm.deal.update', { id: 1 }), /leitura/);
  await assert.rejects(c.batch({ x: ['crm.item.update', { id: 1 }] }), /leitura/);
  assert.equal(mock.state.requests, 0);
  for (const m of READ_ONLY_METHODS) assert.ok(!/\.(add|update|delete|set)$/.test(m));
});

test('sincronização completa no portal simulado: estrutura, cards, histórico, atividades, sem escrita', async () => {
  const mock = createMockPortal({ now: NOW });
  const client = fastClient(mock);
  const cfg = demoConfig(NOW);
  const { ds, report, error } = await syncData({ client, config: cfg, ds: emptyDataset(), now: NOW });
  assert.equal(error, undefined);
  assert.equal(report.full, true);
  assert.equal(ds.sync.status, 'ok');
  assert.equal(mock.state.writeAttempts, 0);
  // fechados (WON/LOSE/SUCCESS) não entram
  const titles = Object.values(ds.cards).map(c => c.title);
  assert.ok(!titles.some(t => t.includes('Pedra Firme') || t.includes('Bar do Porto') || t.includes('Oficina Motor')));
  assert.equal(Object.keys(ds.cards).length, 24);
  // leads não monitorados não entram
  assert.ok(!Object.keys(ds.cards).some(k => k.startsWith('1:')));
  // histórico chega para quem tem
  const metal = Object.values(ds.cards).find(c => c.title.includes('Metal Forte'));
  assert.equal(ds.history[metal.key].length, 5);
  // comentários: só data e autor
  for (const list of Object.values(ds.comments)) for (const cm of list) assert.deepEqual(Object.keys(cm).sort(), ['authorId', 'created', 'id']);
  // estrutura: funis, etapas com semântica, processo inteligente
  assert.equal(ds.meta.stages['2:WON'].semantic, 'S');
  assert.equal(ds.meta.stages['1036:DT1036_7:FAIL'].semantic, 'F');
  assert.equal(ds.meta.categories['2:3'].name, 'Operacional – Implantação');
  assert.ok(report.requests < 40, `requisições: ${report.requests}`);
});

test('análise da demonstração: alertas esperados por cenário', async () => {
  const mock = createMockPortal({ now: NOW });
  const cfg = demoConfig(NOW);
  const { ds } = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  const a = analyze(ds, cfg, NOW);
  const by = t => a.cards.find(c => c.title.includes(t));
  const types = t => by(t).alerts.map(x => x.type).sort();
  // retorno de etapa reinicia a contagem e é identificado
  assert.ok(by('Metal Forte').returned);
  assert.ok(!types('Metal Forte').includes('sla_etapa_vencido'));
  // automação não conta como acompanhamento
  const acad = by('Academia Movimento').alerts.find(x => x.type === 'sem_interacao');
  assert.ok(acad, 'Academia deve estar sem interação apesar da automação recente');
  // pausa por campo
  assert.equal(by('Agência Digital Pixel').stageSlaStatus, 'pausado');
  // sem histórico + sem movedTime = parcial
  assert.equal(by('Odonto Sorriso').entrySource, 'acompanhamento');
  assert.equal(by('Odonto Sorriso').partial, true);
  // sem histórico com movedTime
  assert.equal(by('Casa & Cia').entrySource, 'movedTime');
  // atividade sem prazo não é atividade futura
  assert.ok(types('Casa & Cia').includes('sem_atividade_futura'));
  // SLA total do processo
  assert.ok(types('Idiomas Global').includes('sla_processo_vencido'));
  // prazo do card vencido
  assert.ok(types('Sol Nascente').includes('prazo_vencido'));
  // card saudável fica fora da fila
  assert.equal(by('Contábil Horizonte').alerts.length, 0);
  // fila ordenada por prioridade
  const order = { critica: 0, alta: 1, media: 2, baixa: 3 };
  const q = a.queue.map(k => a.cards.find(c => c.key === k).priority.level);
  for (let i = 1; i < q.length; i++) assert.ok(order[q[i - 1]] <= order[q[i]]);
  // links diretos
  assert.match(by('Sol Nascente').link, /\/crm\/deal\/details\/\d+\/$/);
  assert.match(by('Reembolso').link, /\/crm\/type\/1036\/details\/\d+\/$/);
});

test('sincronização incremental: só busca mudanças e detecta mudança de etapa', async () => {
  const portal = buildDemoPortal(NOW);
  const mock = createMockPortal({ portal });
  const cfg = demoConfig(NOW);
  const client = fastClient(mock);
  const r1 = await syncData({ client, config: cfg, ds: emptyDataset(), now: NOW });
  const later = NOW + 15 * 60000;
  // muda a etapa de um card e fecha outro
  const iso = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const deal = portal.items[2].find(i => i.title.includes('Contábil Horizonte'));
  deal.stageId = 'PREPARATION'; deal.movedTime = iso(later - 60000); deal.updatedTime = iso(later - 60000);
  portal.history[2].push({ ID: 9999, TYPE_ID: 2, OWNER_ID: deal.id, CREATED_TIME: iso(later - 60000), STAGE_ID: 'PREPARATION', CATEGORY_ID: 0, STAGE_SEMANTIC_ID: 'P' });
  const won = portal.items[2].find(i => i.title.includes('Rota Norte'));
  won.stageId = 'WON'; won.stageSemanticId = 'S'; won.updatedTime = iso(later - 30000);
  const req0 = mock.state.requests;
  const r2 = await syncData({ client, config: cfg, ds: r1.ds, now: later });
  assert.equal(r2.report.full, false);
  assert.ok(mock.state.requests - req0 < r1.report.requests, 'incremental deve usar menos requisições');
  const k = `2:${deal.id}`;
  assert.equal(r2.ds.cards[k].stageId, 'PREPARATION');
  assert.equal(r2.ds.history[k].at(-1).stageId, 'PREPARATION');
  assert.equal(r2.ds.cards[`2:${won.id}`], undefined, 'card ganho sai do monitoramento');
});

test('limites da API: QUERY_LIMIT_EXCEEDED é refeito com espera', async () => {
  const mock = createMockPortal({ now: NOW, rateLimitEvery: 4 });
  const waits = [];
  const client = fastClient(mock, { sleep: async ms => { waits.push(ms); } });
  const { ds, error } = await syncData({ client, config: demoConfig(NOW), ds: emptyDataset(), now: NOW });
  assert.equal(error, undefined);
  assert.equal(ds.sync.status, 'ok');
  assert.ok(client.stats.retries > 0);
  assert.ok(waits.some(w => w >= 1000));
});

test('perda de autenticação: mantém dados anteriores e informa erro (não "zero pendências")', async () => {
  const mock = createMockPortal({ now: NOW });
  const cfg = demoConfig(NOW);
  const ok = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  const bad = createMockPortal({ now: NOW, authFail: true });
  const r = await syncData({ client: fastClient(bad), config: cfg, ds: ok.ds, now: NOW + 60000 });
  assert.ok(r.error);
  assert.equal(r.ds.sync.status, 'auth_error');
  assert.equal(r.ds.sync.lastSuccess, NOW);
  assert.equal(Object.keys(r.ds.cards).length, 24);
  assert.match(r.ds.sync.errors[0].message, /autenticação/);
  assert.ok(!JSON.stringify(r.ds).includes('demonstracao/'), 'URL do webhook não pode vazar para o dataset');
});

test('histórico indisponível para um tipo: alerta de cobertura e cálculo por movedTime', async () => {
  const mock = createMockPortal({ now: NOW, historyUnsupported: [1036] });
  const cfg = demoConfig(NOW);
  const { ds } = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  assert.equal(ds.sync.status, 'parcial');
  assert.match(ds.sync.coverage.history[1036], /indisponível/);
  const a = analyze(ds, cfg, NOW);
  assert.ok(a.cards.filter(c => c.entityTypeId === 1036).every(c => c.entrySource === 'movedTime'));
});

test('departamentos sem escopo: segue funcionando com aviso', async () => {
  const mock = createMockPortal({ now: NOW, noDepartmentScope: true });
  const { ds, error } = await syncData({ client: fastClient(mock), config: demoConfig(NOW), ds: emptyDataset(), now: NOW });
  assert.equal(error, undefined);
  assert.match(ds.sync.coverage.departments, /indisponível/);
});

test('alertas: deduplicação, silenciamento, janela de horário e vencimento durante ausência', async () => {
  const mock = createMockPortal({ now: NOW });
  const cfg = demoConfig(NOW);
  const { ds } = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  const a = analyze(ds, cfg, NOW);
  const notif = { ...cfg.notifications, enabled: true, minLevel: 'baixa', maxPerSync: 100, window: { enabled: false } };
  let st = updateAlertState(null, a, { now: NOW, prevSuccess: null, intervalMin: 15 }).state;
  const s1 = selectNotifications(st, a, notif, NOW, 'America/Sao_Paulo');
  assert.ok(s1.send.length > 0);
  // mesma análise de novo: nada a notificar (deduplicado)
  st = updateAlertState(s1.state, a, { now: NOW + 60000, prevSuccess: NOW, intervalMin: 15 }).state;
  assert.equal(selectNotifications(st, a, notif, NOW + 60000, 'America/Sao_Paulo').send.length, 0);
  // silenciar um card reduz o contador
  const before = badgeCount(a, 'todos', NOW).n;
  const card = a.cards.find(c => c.alerts.length);
  for (const al of card.alerts) al.snoozedUntil = NOW + 3600000;
  assert.equal(badgeCount(a, 'todos', NOW).n, before - 1);
  // fora da janela: adia e acumula
  const night = Date.parse('2026-10-27T02:00:00Z'); // 23:00 em SP
  const fresh = updateAlertState(null, a, { now: night, prevSuccess: null, intervalMin: 15 }).state;
  const sel = selectNotifications(fresh, a, { ...notif, window: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '19:00' } }, night, 'America/Sao_Paulo');
  assert.equal(sel.send.length, 0);
  assert.ok(sel.deferred > 0);
  // vencimento durante intervalo sem sincronização (Chrome fechado)
  const later = NOW + 3 * 3600000;
  const g = updateAlertState({ known: {}, snoozed: {} }, a, { now: later, prevSuccess: NOW - 30 * 86400000, intervalMin: 15 });
  assert.ok(g.gap);
  assert.ok(Object.values(g.state.known).some(k => k.missedWhileOffline));
});

test('silenciamento expira e o alerta volta a poder notificar', () => {
  const an = { cards: [{ key: 'c', priority: { level: 'critica' }, alerts: [{ key: 'c|sla_etapa_vencido|x', type: 'sla_etapa_vencido', title: 't' }] }] };
  let st = updateAlertState(null, an, { now: 0, intervalMin: 15 }).state;
  st.known['c|sla_etapa_vencido|x'].notifiedAt = 0;
  st.snoozed['c|sla_etapa_vencido|x'] = 1000;
  st = updateAlertState(st, an, { now: 2000, prevSuccess: 1000, intervalMin: 15 }).state;
  assert.equal(st.snoozed['c|sla_etapa_vencido|x'], undefined);
  assert.equal(st.known['c|sla_etapa_vencido|x'].notifiedAt, null);
});

test('espaço digital: sem acesso de administrador, o processo é adicionado pelo link de um card', async () => {
  const mock = createMockPortal({ now: NOW, typeListDenied: true });
  const client = fastClient(mock);
  const r1 = await loadStructure(client);
  assert.equal(r1.meta.entities[1036], undefined, 'crm.type.list negado: processo não aparece sozinho');
  assert.ok(r1.warnings.some(w => w.includes('administradores do CRM')));
  const info = parseCardUrl('https://demo-ficticio.bitrix24.invalid/page/besmart/seguros/type/1036/details/901/');
  assert.equal(info.entityTypeId, 1036);
  assert.equal(info.linkPath, '/page/besmart/seguros/type/1036/details/{id}/');
  const r2 = await loadStructure(client, { manualTypes: { 1036: { linkPath: info.linkPath } } });
  assert.ok(r2.meta.entities[1036]);
  assert.equal(r2.meta.stages['1036:DT1036_7:CLIENT'].name, 'Aguardando operadora');
  // processo inexistente é recusado com mensagem clara
  const r3 = await loadStructure(client, { manualTypes: { 4444: {} } });
  assert.equal(r3.meta.entities[4444], undefined);
  assert.ok(r3.warnings.some(w => w.includes('4444')));
  // sincronização e links no formato do espaço digital
  const cfg = demoConfig(NOW);
  cfg.cardTypes = { 1036: { linkPath: info.linkPath } };
  const { ds } = await syncData({ client, config: cfg, ds: emptyDataset(), now: NOW });
  const a = analyze(ds, cfg, NOW);
  const spa = a.cards.find(c => c.entityTypeId === 1036);
  assert.match(spa.link, /\/page\/besmart\/seguros\/type\/1036\/details\/\d+\/$/);
  assert.ok(a.cards.filter(c => c.entityTypeId === 1036).length > 0);
});

test('link de card: formatos aceitos e recusados', () => {
  assert.equal(parseCardUrl('https://crm.hub-bnk.com/crm/type/1040/details/7/').entityTypeId, 1040);
  assert.throws(() => parseCardUrl('https://crm.hub-bnk.com/page/besmart/seguros/'), /details/);
  assert.throws(() => parseCardUrl('crm.hub-bnk.com/x'), /https/);
});

test('página de foco: aceita URL completa, caminho ou link de card', async () => {
  const { normalizeFocusPage, defaultConfig } = await import('../src/core/config.js');
  assert.equal(defaultConfig().focusPage, '/page/besmart/besmart_saude/');
  assert.equal(normalizeFocusPage('https://crm.hub-bnk.com/page/besmart/besmart_saude/'), '/page/besmart/besmart_saude/');
  assert.equal(normalizeFocusPage('/page/besmart/besmart_saude'), '/page/besmart/besmart_saude/');
  assert.equal(normalizeFocusPage('https://crm.hub-bnk.com/page/besmart/besmart_saude/type/1050/details/3/'), '/page/besmart/besmart_saude/');
  assert.equal(normalizeFocusPage('https://crm.hub-bnk.com/stream/'), null);
});

test('comercial: campo detectado automaticamente, mostrado por card e na distribuição', async () => {
  const { commercialFieldFor } = await import('../src/core/config.js');
  const mock = createMockPortal({ now: NOW });
  const cfg = demoConfig(NOW);
  const { ds } = await syncData({ client: fastClient(mock), config: cfg, ds: emptyDataset(), now: NOW });
  assert.deepEqual(commercialFieldFor(cfg, ds.meta, 1036), { field: 'ufCrm7_COMERCIAL', label: 'Comercial', auto: true });
  assert.equal(commercialFieldFor(cfg, ds.meta, 2), null, 'negócios do demo não têm campo de comercial');
  const a = analyze(ds, cfg, NOW);
  const spa = a.cards.filter(c => c.entityTypeId === 1036);
  assert.ok(spa.every(c => c.commercialField === 'Comercial'));
  assert.ok(spa.some(c => c.commercialName === 'Ana Ribeiro (fictícia)'));
  assert.ok(spa.some(c => c.commercialName === 'Sem comercial'));
  assert.ok(a.distributions.byCommercial.length > 0);
  // escolha manual e desativação
  assert.equal(commercialFieldFor({ ...cfg, commercialFields: { 1036: { field: 'createdBy', label: 'Criado por' } } }, ds.meta, 1036).field, 'createdBy');
  assert.equal(commercialFieldFor({ ...cfg, commercialFields: { 1036: { field: '' } } }, ds.meta, 1036), null);
  // detecção pelo código do campo quando o título é o próprio código
  const meta2 = { fields: { 1050: { ufCrm12_COMERCIAL: { type: 'user', title: 'ufCrm12_COMERCIAL' }, assignedById: { type: 'user', title: 'Responsável' } } } };
  assert.equal(commercialFieldFor({}, meta2, 1050).field, 'ufCrm12_COMERCIAL');
});
