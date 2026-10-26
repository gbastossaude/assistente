import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisits, evalStageSla, evalProcessSla, evalStagnation, updateObservation, subtractIntervals } from '../src/core/sla.js';
import { analyzeCard } from '../src/core/detect.js';
import { analyze } from '../src/core/analyze.js';

const TZ = 'America/Sao_Paulo';
const at = s => Date.parse(s + '-03:00');
const H = 3600000;
const cal = { timezone: TZ, workdays: [1, 2, 3, 4, 5], intervals: [{ start: '09:00', end: '18:00' }], holidays: [] };
const NOW = at('2026-10-28T15:00:00'); // quarta-feira

function card(over = {}) {
  return { key: '2:100', entityTypeId: 2, id: 100, title: 'Teste', stageId: 'B', categoryId: 0, assignedById: '5',
    opportunity: 1000, createdTime: at('2026-10-20T09:00:00'), updatedTime: at('2026-10-27T10:00:00'),
    movedTime: at('2026-10-26T15:00:00'), lastActivityTime: null, closed: false, semantic: 'P', fields: {}, ...over };
}
const hist = (...rows) => rows.map(([stageId, t, typeId = 2, categoryId = 0], i) => ({ id: i + 1, typeId: i === 0 ? 1 : typeId, ownerId: 100, time: at(t), stageId, categoryId }));
const rule = (over = {}) => ({ id: 'r1', entityTypeId: 2, categoryId: 0, stageId: 'B', duration: { value: 2, unit: 'd' }, mode: 'util', warnPercent: 80, onReturn: 'reiniciar', pause: [], exceptions: [], ...over });

test('SLA da etapa vencido no limite exato: 2 dias úteis desde segunda 15:00 vencem quarta 15:00', () => {
  const v = buildVisits(card(), hist(['A', '2026-10-20T09:00:00'], ['B', '2026-10-26T15:00:00']), null, {}, NOW);
  assert.equal(v.source, 'historico');
  const r = evalStageSla(card(), v, [rule()], null, NOW, cal);
  assert.equal(r.status, 'vencido');
  assert.equal(r.deadline, at('2026-10-28T15:00:00'));
  assert.equal(Math.round(r.overdue), 0);
  const r2 = evalStageSla(card(), v, [rule()], null, NOW - 60000, cal);
  assert.equal(r2.status, 'aviso'); // 99.9% consumido, acima de 80%
});

test('SLA em tempo corrido conta o fim de semana', () => {
  const c = card({ stageId: 'B' });
  const v = buildVisits(c, hist(['A', '2026-10-20T09:00:00'], ['B', '2026-10-23T18:00:00']), null, {}, at('2026-10-26T09:00:00'));
  const corrido = evalStageSla(c, v, [rule({ duration: { value: 2, unit: 'd' }, mode: 'corrido' })], null, at('2026-10-26T09:00:00'), cal);
  const util = evalStageSla(c, v, [rule({ duration: { value: 2, unit: 'd' }, mode: 'util' })], null, at('2026-10-26T09:00:00'), cal);
  assert.equal(corrido.status, 'vencido'); // 63h corridas
  assert.equal(util.status, 'ok');         // 0h úteis
});

test('Retorno à etapa: reiniciar × acumular × manter original', () => {
  const h = hist(['B', '2026-10-19T09:00:00'], ['C', '2026-10-20T09:00:00'], ['B', '2026-10-28T09:00:00']);
  const c = card({ movedTime: at('2026-10-28T09:00:00') });
  const v = buildVisits(c, h, null, { stageSort: { A: 10, B: 20, C: 30 } }, NOW);
  assert.ok(v.returned, 'deve identificar retorno de etapa');
  assert.equal(v.returned.fromStageId, 'C');
  const reiniciar = evalStageSla(c, v, [rule({ onReturn: 'reiniciar' })], null, NOW, cal);
  const acumular = evalStageSla(c, v, [rule({ onReturn: 'acumular' })], null, NOW, cal);
  const primeira = evalStageSla(c, v, [rule({ onReturn: 'primeira' })], null, NOW, cal);
  assert.equal(reiniciar.elapsed, 6 * 60);            // quarta 09:00 → 15:00
  assert.equal(acumular.elapsed, 9 * 60 + 6 * 60);    // 1 dia útil da 1ª passagem + 6h
  assert.equal(reiniciar.status, 'ok');
  assert.equal(acumular.status, 'aviso');             // 15h de 18h = 83%
  assert.equal(primeira.status, 'vencido');           // desde 19/10
});

test('Pausa por campo: intervalo pausado não conta e card pausado não vence', () => {
  const c = card({ fields: { UF_AGUARDA: 'Y' } });
  const r = rule({ pause: [{ field: 'UF_AGUARDA', op: 'eq', value: 'Y' }] });
  const v = buildVisits(c, hist(['A', '2026-10-20T09:00:00'], ['B', '2026-10-26T15:00:00']), null, {}, NOW);
  const obs = { stage: { stageId: 'B', since: at('2026-10-26T15:00:00') }, pauses: [{ ruleKey: 'r1', start: at('2026-10-27T09:00:00'), end: null }] };
  const res = evalStageSla(c, v, [r], obs, NOW, cal);
  assert.equal(res.elapsed, 3 * 60); // só segunda 15:00–18:00
  assert.equal(res.status, 'pausado');
  assert.equal(res.pausedNow, true);
  // retomada: pausa encerrada terça 12:00 → conta seg 3h + terça 12–18 (6h) + quarta 9–15 (6h) = 15h
  const obs2 = { ...obs, pauses: [{ ruleKey: 'r1', start: at('2026-10-27T09:00:00'), end: at('2026-10-27T12:00:00') }] };
  const res2 = evalStageSla(card(), v, [r], obs2, NOW, cal);
  assert.equal(res2.elapsed, 15 * 60);
  assert.equal(res2.status, 'aviso');
});

test('"Aguardando documentos" NÃO é pausa automática', () => {
  const c = card({ stageId: 'DOCS', movedTime: at('2026-10-26T09:00:00') });
  const v = buildVisits(c, hist(['A', '2026-10-20T09:00:00'], ['DOCS', '2026-10-26T09:00:00']), null, {}, NOW);
  const res = evalStageSla(c, v, [rule({ stageId: 'DOCS', duration: { value: 1, unit: 'd' } })], null, NOW, cal);
  assert.equal(res.status, 'vencido');
  assert.equal(res.pausedNow, false);
});

test('updateObservation registra início e fim de pausa', () => {
  const r = rule({ pause: [{ field: 'UF_AGUARDA', op: 'eq', value: 'Y' }] });
  let o = updateObservation(card({ fields: { UF_AGUARDA: 'N' } }), null, [r], at('2026-10-27T09:00:00'));
  assert.equal(o.pauses.length, 0);
  o = updateObservation(card({ fields: { UF_AGUARDA: 'Y' } }), o, [r], at('2026-10-27T10:00:00'));
  assert.equal(o.pauses.length, 1); assert.equal(o.pauses[0].end, null);
  o = updateObservation(card({ fields: { UF_AGUARDA: 'N' } }), o, [r], at('2026-10-27T12:00:00'));
  assert.equal(o.pauses[0].end, at('2026-10-27T12:00:00'));
});

test('Exceção por campo: tipo urgente usa outro prazo; tipo X sem SLA', () => {
  const c = card({ fields: { UF_TIPO: '103' }, movedTime: at('2026-10-28T09:00:00') });
  const v = buildVisits(c, hist(['A', '2026-10-20T09:00:00'], ['B', '2026-10-28T09:00:00']), null, {}, NOW);
  const r = rule({ exceptions: [{ field: 'UF_TIPO', op: 'eq', value: '103', action: 'prazo', duration: { value: 4, unit: 'h' } }] });
  assert.equal(evalStageSla(c, v, [r], null, NOW, cal).status, 'vencido');
  assert.equal(evalStageSla(card({ movedTime: at('2026-10-28T09:00:00') }), v, [r], null, NOW, cal).status, 'ok');
  const r2 = rule({ exceptions: [{ field: 'UF_TIPO', op: 'eq', value: '103', action: 'ignorar' }] });
  assert.equal(evalStageSla(c, v, [r2], null, NOW, cal).status, 'ignorado');
});

test('Sem histórico: usa movedTime (não a última alteração genérica)', () => {
  const c = card({ movedTime: at('2026-10-27T09:00:00'), updatedTime: at('2026-10-28T14:00:00') });
  const v = buildVisits(c, [], null, {}, NOW);
  assert.equal(v.source, 'movedTime');
  assert.equal(v.current.start, at('2026-10-27T09:00:00'));
  assert.notEqual(v.current.start, c.updatedTime);
  assert.equal(v.partial, false);
});

test('Sem histórico e sem movedTime: início do acompanhamento e cálculo parcial', () => {
  const c = card({ movedTime: null });
  const obs = { stage: { stageId: 'B', since: at('2026-10-28T10:00:00') }, pauses: [] };
  const v = buildVisits(c, [], obs, {}, NOW);
  assert.equal(v.source, 'acompanhamento');
  assert.equal(v.partial, true);
  assert.equal(v.current.start, at('2026-10-28T10:00:00'));
  const r = evalStageSla(c, v, [rule()], obs, NOW, cal);
  assert.equal(r.partial, true);
  assert.ok(r.notes.some(n => n.includes('parcial')));
  // com useMovedTime desativado também cai no acompanhamento
  const v2 = buildVisits(card(), [], obs, { useMovedTime: false }, NOW);
  assert.equal(v2.source, 'acompanhamento');
});

test('SLA total do processo com etapa de pausa', () => {
  const c = card({ stageId: 'C', categoryId: 3, movedTime: at('2026-10-28T09:00:00') });
  const h = [
    { id: 1, typeId: 1, ownerId: 100, time: at('2026-10-19T09:00:00'), stageId: 'X', categoryId: 0 },
    { id: 2, typeId: 5, ownerId: 100, time: at('2026-10-20T09:00:00'), stageId: 'A', categoryId: 3 },
    { id: 3, typeId: 2, ownerId: 100, time: at('2026-10-21T09:00:00'), stageId: 'P', categoryId: 3 },
    { id: 4, typeId: 2, ownerId: 100, time: at('2026-10-28T09:00:00'), stageId: 'C', categoryId: 3 }
  ];
  const v = buildVisits(c, h, null, {}, NOW);
  const r = { id: 'p', entityTypeId: 2, categoryId: 3, duration: { value: 2, unit: 'd' }, mode: 'util', startMode: 'entrada_funil', pauseStages: ['P'], warnPercent: 80 };
  const res = evalProcessSla(c, v, [r], NOW, cal);
  assert.equal(res.start, at('2026-10-20T09:00:00'));
  assert.equal(res.elapsed, 9 * 60 + 6 * 60); // 20/10 inteiro + quarta 09–15
  assert.equal(res.status, 'aviso');
  const semPausa = evalProcessSla(c, v, [{ ...r, pauseStages: [] }], NOW, cal);
  assert.equal(semPausa.status, 'vencido');
});

test('Parado na etapa (independente do SLA)', () => {
  const c = card({ movedTime: at('2026-10-20T09:00:00') });
  const v = buildVisits(c, [], null, {}, NOW);
  const st = evalStagnation(c, v, [{ entityTypeId: 2, categoryId: 0, stageId: '*', limit: { value: 7, unit: 'd' }, mode: 'corrido' }], NOW, cal);
  assert.equal(st.exceeded, true);
  assert.equal(Math.round(st.overdue / 60), 30); // 8d06h − 7d = 30h
});

test('subtractIntervals', () => {
  assert.deepEqual(subtractIntervals([[0, 100]], [[20, 30], [50, 60]]), [[0, 20], [30, 50], [60, 100]]);
  assert.deepEqual(subtractIntervals([[0, 100]], [[-10, 200]]), []);
});

// ------------------------------------------------ detecção e múltiplos alertas
const baseConfig = {
  calendar: cal,
  slaRules: [rule()],
  processRules: [], stagnationRules: [{ entityTypeId: 2, categoryId: 0, stageId: '*', limit: { value: 1, unit: 'd' }, mode: 'corrido' }],
  noFutureActivityRules: [{ entityTypeId: 2, categoryId: 0, excludeStages: [] }],
  noInteractionRules: [{ entityTypeId: 2, categoryId: 0, limit: { value: 1, unit: 'd' }, mode: 'util', excludeStages: [] }],
  deadlineFields: { 2: { field: 'UF_PRAZO', label: 'Prazo', type: 'date', warnHours: 24 } },
  interaction: { automationUserIds: ['1'] }
};

test('Múltiplos alertas no mesmo card, cada um com evidência própria', () => {
  const c = card({ fields: { UF_PRAZO: '2026-10-27' } });
  const acts = [
    { id: 1, providerId: 'CRM_TODO', subject: 'Ligar', completed: false, deadline: at('2026-10-27T10:00:00'), created: at('2026-10-26T15:00:00'), authorId: '5', responsibleId: '5' },
    { id: 2, providerId: 'CRM_BIZPROC_WORKFLOW', subject: 'Robô', completed: true, endTime: at('2026-10-28T14:00:00'), lastUpdated: at('2026-10-28T14:00:00'), created: at('2026-10-28T14:00:00'), authorId: '1' }
  ];
  const r = analyzeCard({ card: c, hist: hist(['A', '2026-10-20T09:00:00'], ['B', '2026-10-26T15:00:00']), obs: null, activities: acts, comments: [],
    meta: { stages: {} }, config: baseConfig, now: NOW });
  const types = r.alerts.map(a => a.type).sort();
  assert.deepEqual(types, ['atividade_vencida', 'parado_etapa', 'prazo_vencido', 'sem_atividade_futura', 'sem_interacao', 'sla_etapa_vencido'].sort());
  const pv = r.alerts.find(a => a.type === 'prazo_vencido');
  assert.equal(pv.deadline, at('2026-10-27T23:59:59')); // campo só-data vence no fim do dia
  const si = r.alerts.find(a => a.type === 'sem_interacao');
  // a atividade aberta criada pelo responsável (seg 15:00) é a última interação relevante; o robô é ignorado
  assert.equal(si.evidence.used.time, at('2026-10-26T15:00:00'));
  assert.ok(si.evidence.ignored.some(i => i.reason.includes('não classificado') || i.reason.includes('automação')));
  // chaves únicas (deduplicação)
  assert.equal(new Set(r.alerts.map(a => a.key)).size, r.alerts.length);
});

test('Atividade sem prazo não conta como atividade futura', () => {
  const c = card();
  const acts = [{ id: 1, providerId: 'CRM_TODO', completed: false, deadline: Date.parse('9999-12-31T21:00:00Z'), created: at('2026-10-28T14:00:00'), authorId: '5' }];
  const r = analyzeCard({ card: c, hist: [], obs: null, activities: acts, comments: [], meta: { stages: {} },
    config: { ...baseConfig, slaRules: [], stagnationRules: [], noInteractionRules: [], deadlineFields: {} }, now: NOW });
  assert.deepEqual(r.alerts.map(a => a.type), ['sem_atividade_futura']);
  assert.ok(r.alerts[0].reason.includes('sem prazo'));
});

test('Atividade com prazo futuro evita "sem atividade futura"; atividade vencida não', () => {
  const c = card();
  const cfg = { ...baseConfig, slaRules: [], stagnationRules: [], noInteractionRules: [], deadlineFields: {} };
  const fut = [{ id: 1, providerId: 'CRM_TODO', completed: false, deadline: NOW + 3600000, created: NOW - H, authorId: '5' }];
  assert.equal(analyzeCard({ card: c, activities: fut, comments: [], meta: {}, config: cfg, now: NOW }).alerts.length, 0);
  const past = [{ id: 1, providerId: 'CRM_TODO', completed: false, deadline: NOW - 3600000, created: NOW - 2 * H, authorId: '5' }];
  const types = analyzeCard({ card: c, activities: past, comments: [], meta: {}, config: cfg, now: NOW }).alerts.map(a => a.type).sort();
  assert.deepEqual(types, ['atividade_vencida', 'sem_atividade_futura']);
});

test('Cards concluídos ou perdidos saem da fila atual', () => {
  const won = card({ key: '2:1', id: 1, stageId: 'WON', semantic: 'S', closed: true });
  const lost = card({ key: '2:2', id: 2, stageId: 'LOSE', semantic: 'F', closed: true });
  const open = card({ key: '2:3', id: 3 });
  const ds = { cards: { [won.key]: won, [lost.key]: lost, [open.key]: open }, history: {}, activities: {}, comments: {}, observations: {}, meta: {}, sync: {} };
  const a = analyze(ds, { ...baseConfig, priority: {} }, NOW);
  assert.equal(a.kpis.monitorados, 1);
  assert.deepEqual(a.cards.map(c => c.key), ['2:3']);
});

test('Atraso atual × vencimento histórico: passagens antigas não entram na fila', () => {
  const c = card({ stageId: 'C', movedTime: at('2026-10-28T14:00:00') });
  const h = hist(['A', '2026-10-01T09:00:00'], ['B', '2026-10-02T09:00:00'], ['C', '2026-10-28T14:00:00']);
  const ds = { cards: { [c.key]: c }, history: { [c.key]: h }, activities: {}, comments: {}, observations: {}, meta: {}, sync: {} };
  const cfg = { ...baseConfig, stagnationRules: [], noFutureActivityRules: [], noInteractionRules: [], deadlineFields: {}, priority: {}, analytics: { minSample: 1 } };
  const a = analyze(ds, cfg, NOW);
  assert.equal(a.cards[0].alerts.length, 0, 'a etapa B venceu no passado, mas o card não está mais nela');
  assert.equal(a.historical.breaches.find(b => b.stageKey === '2:B')?.vencidas, 1);
});

test('Valor em atraso não duplica card com vários alertas', () => {
  const c = card({ fields: { UF_PRAZO: '2026-10-27' }, opportunity: 5000 });
  const ds = { cards: { [c.key]: c }, history: { [c.key]: hist(['A', '2026-10-20T09:00:00'], ['B', '2026-10-26T15:00:00']) }, activities: {}, comments: {}, observations: {}, meta: {}, sync: {} };
  const a = analyze(ds, { ...baseConfig, priority: {} }, NOW);
  assert.ok(a.cards[0].alerts.length >= 3);
  assert.deepEqual(a.kpis.valorEmAtraso, { BRL: 5000 });
});

test('Prioridade: explicação soma a pontuação e respeita faixas configuradas', () => {
  const c = card({ fields: { UF_PRAZO: '2026-10-27' } });
  const ds = { cards: { [c.key]: c }, history: { [c.key]: hist(['A', '2026-10-20T09:00:00'], ['B', '2026-10-26T15:00:00']) }, activities: {}, comments: {}, observations: {}, meta: {}, sync: {} };
  const a = analyze(ds, { ...baseConfig, priority: { levels: { critica: 1000, alta: 500, media: 10 } } }, NOW);
  const p = a.cards[0].priority;
  assert.equal(p.reasons.reduce((s, r) => s + r.pts, 0), p.score);
  assert.equal(p.level, 'media');
});

test('Resumo operacional usa apenas números calculados', () => {
  const c = card({ fields: { UF_PRAZO: '2026-10-27' } });
  const ds = { cards: { [c.key]: c }, history: {}, activities: {}, comments: {}, observations: {}, meta: {}, sync: {} };
  const a = analyze(ds, { ...baseConfig, priority: {} }, NOW);
  assert.ok(a.summary[0].startsWith('1 card monitorado'));
  assert.ok(a.summary.some(s => s.includes('SLA vencido')));
});
