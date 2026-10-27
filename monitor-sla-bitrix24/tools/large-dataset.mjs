// Gera um volume grande de cards FICTÍCIOS (sem rede) para medir desempenho: cards abertos com histórico,
// atividades e comentários, reuniões e cards encerrados. Usado por tools/bench.mjs e tools/bench-ui.mjs.
import { defaultConfig } from '../src/core/config.js';
import { emptyDataset } from '../src/integration/sync.js';

const DAY = 86400000;
export const LARGE_STAGES = ['DT1056_9:NEW', 'DT1056_9:PREPARATION', 'DT1056_9:CLIENT', 'DT1056_9:UC_A', 'DT1056_9:UC_B'];

export function buildLargeDataset(N = 1500, now = Date.UTC(2026, 9, 26, 15, 0), { closed = Math.round(N / 5), meetings = true } = {}) {
  const stages = LARGE_STAGES;
  const ds = emptyDataset('real');
  ds.meta.entities = { 1056: { entityTypeId: 1056, name: 'be.smart Saúde', categories: [9] } };
  ds.meta.categories = { '1056:9': { name: 'Vendas', id: 9, entityTypeId: 1056 } };
  stages.forEach((s, i) => { ds.meta.stages[`1056:${s}`] = { statusId: s, name: `Etapa ${i + 1}`, sort: (i + 1) * 10, semantic: 'P', categoryId: 9, entityTypeId: 1056 }; });
  ds.meta.stages['1056:DT1056_9:SUCCESS'] = { statusId: 'DT1056_9:SUCCESS', name: 'Fechado', sort: 900, semantic: 'S', categoryId: 9, entityTypeId: 1056 };
  ds.meta.stages['1056:DT1056_9:FAIL'] = { statusId: 'DT1056_9:FAIL', name: 'Perdido', sort: 910, semantic: 'F', categoryId: 9, entityTypeId: 1056 };
  for (let u = 1; u <= 12; u++) ds.meta.users[String(u)] = { id: String(u), name: `Pessoa Fictícia ${u}`, departments: [] };
  let rnd = 7;
  const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  for (let i = 1; i <= N; i++) {
    const created = now - Math.floor(r() * 400 * DAY);
    const steps = 1 + Math.floor(r() * stages.length);
    const hist = [];
    let t = created;
    for (let k = 0; k < steps; k++) {
      hist.push({ id: i * 10 + k, typeId: k ? 2 : 1, ownerId: i, time: t, stageId: stages[k], categoryId: 9, semantic: 'P' });
      t += Math.floor(r() * (now - t) * 0.5);
    }
    const key = `1056:${i}`;
    ds.cards[key] = { key, entityTypeId: 1056, id: i, title: `Card fictício ${i}`, stageId: stages[steps - 1], categoryId: 9, assignedById: String(1 + (i % 9)),
      createdById: String(1 + (i % 7)), opportunity: Math.round(r() * 90000), currencyId: 'BRL', createdTime: created, updatedTime: t, movedTime: hist[hist.length - 1].time,
      lastActivityTime: t, semantic: 'P', closed: false, fields: {} };
    ds.history[key] = hist;
    ds.activities[key] = [
      { id: i * 3, ownerTypeId: 1056, ownerId: i, providerId: 'CRM_TODO', typeId: 6, subject: 'Retornar contato', completed: false, deadline: now + (r() - 0.5) * 10 * DAY, created: t, lastUpdated: t, responsibleId: '2', authorId: '2', direction: 0 },
      { id: i * 3 + 1, ownerTypeId: 1056, ownerId: i, providerId: 'CRM_MEETING', typeId: 1, subject: 'Reunião', completed: true, deadline: t, endTime: t, created: t, lastUpdated: t, responsibleId: '3', authorId: '3', direction: 0 }
    ];
    ds.comments[key] = [{ id: i, created: t, authorId: '4' }];
    if (meetings) ds.meetings[`1056:${i * 3 + 1}`] = { id: i * 3 + 1, ownerTypeId: 1056, ownerId: i, providerId: 'CRM_MEETING', completed: true, start: now - Math.floor(r() * 60 * DAY), deadline: null, created: t, responsibleId: String(1 + (i % 9)), authorId: '3' };
  }
  for (let j = 1; j <= closed; j++) {
    const id = 100000 + j, key = `1056:${id}`;
    const createdTime = now - Math.floor((30 + r() * 200) * DAY);
    const closedTime = Math.min(now - DAY, createdTime + Math.floor(r() * 120 * DAY));
    const ok = r() < 0.45;
    ds.closed[key] = { key, entityTypeId: 1056, id, title: `Encerrado fictício ${j}`, categoryId: 9, stageId: ok ? 'DT1056_9:SUCCESS' : 'DT1056_9:FAIL', semantic: ok ? 'S' : 'F',
      assignedById: String(1 + (j % 9)), createdById: String(1 + (j % 7)), opportunity: Math.round(r() * 90000), currencyId: 'BRL', createdTime,
      closedTime, closedTimeSource: 'historico', prevStageId: stages[Math.floor(r() * stages.length)], fields: {} };
  }
  ds.sync.status = 'ok';
  ds.sync.lastSuccess = now;
  ds.sync.lastFull = now;
  ds.sync.closedWindowStart = now - 180 * DAY;
  ds.sync.meetingsWindowStart = now - 70 * DAY;
  ds.sync.coverage = { entities: [{ name: 'be.smart Saúde', cards: N, categories: ['Vendas'] }], closed: 'ok', meetings: 'ok' };

  const config = defaultConfig();
  config.focusPage = null;
  config.monitored = [{ entityTypeId: 1056, categoryIds: [9] }];
  config.slaRules = stages.map((s, i) => ({ id: 'r' + i, entityTypeId: 1056, categoryId: 9, stageId: s, duration: { value: 3, unit: 'd' }, mode: 'corrido',
    warnPercent: 80, onReturn: 'acumular', pause: [], exceptions: [], enabled: true }));
  config.processRules = [{ id: 'p', entityTypeId: 1056, categoryId: 9, duration: { value: 30, unit: 'd' }, mode: 'corrido', warnPercent: 80, startMode: 'criacao', pauseStages: [], enabled: true }];
  config.stagnationRules = [{ id: 's', entityTypeId: 1056, categoryId: 9, stageId: '*', limit: { value: 10, unit: 'd' }, mode: 'corrido', enabled: true }];
  config.noInteractionRules = [{ id: 'n', entityTypeId: 1056, categoryId: 9, limit: { value: 5, unit: 'd' }, mode: 'corrido', excludeStages: [], enabled: true }];
  config.noFutureActivityRules = [{ id: 'f', entityTypeId: 1056, categoryId: 9, excludeStages: [], enabled: true }];
  return { ds, config, now };
}
