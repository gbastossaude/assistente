// Mede o tempo da análise com um volume grande de cards FICTÍCIOS (sem rede).
// Uso: node tools/bench.mjs [cards=1500] [repetições=3]
import { analyze } from '../src/core/analyze.js';
import { defaultConfig, brazilHolidays } from '../src/core/config.js';
import { emptyDataset } from '../src/integration/sync.js';

const N = Number(process.argv[2]) || 1500;
const SNAP = process.argv[4] === 'snap';
const SIZES = process.argv[4] === 'sizes';
const REP = Number(process.argv[3]) || 3;
const DAY = 86400000;
const now = Date.UTC(2026, 9, 26, 15, 0);
const stages = ['DT1056_9:NEW', 'DT1056_9:PREPARATION', 'DT1056_9:CLIENT', 'DT1056_9:UC_A', 'DT1056_9:UC_B'];
const ds = emptyDataset('real');
ds.meta.entities = { 1056: { entityTypeId: 1056, name: 'be.smart Saúde', categories: [9] } };
ds.meta.categories = { '1056:9': { name: 'Vendas', id: 9, entityTypeId: 1056 } };
stages.forEach((s, i) => { ds.meta.stages[`1056:${s}`] = { statusId: s, name: `Etapa ${i + 1}`, sort: (i + 1) * 10, semantic: 'P', categoryId: 9, entityTypeId: 1056 }; });
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
  ds.cards[key] = { key, entityTypeId: 1056, id: i, title: `Card ${i}`, stageId: stages[steps - 1], categoryId: 9, assignedById: String(1 + (i % 9)),
    createdById: String(1 + (i % 7)), opportunity: Math.round(r() * 90000), currencyId: 'BRL', createdTime: created, updatedTime: t, movedTime: hist[hist.length - 1].time,
    lastActivityTime: t, semantic: 'P', closed: false, fields: {} };
  ds.history[key] = hist;
  ds.activities[key] = [
    { id: i * 3, ownerTypeId: 1056, ownerId: i, providerId: 'CRM_TODO', completed: false, deadline: now + (r() - 0.5) * 10 * DAY, created: t, lastUpdated: t, responsibleId: '2', authorId: '2' },
    { id: i * 3 + 1, ownerTypeId: 1056, ownerId: i, providerId: 'CRM_MEETING', completed: true, deadline: t, endTime: t, created: t, lastUpdated: t, responsibleId: '3', authorId: '3' }
  ];
  ds.comments[key] = [{ id: i, created: t, authorId: '4' }];
}
ds.sync.lastSuccess = now;
const config = defaultConfig();
config.focusPage = null;
config.monitored = [{ entityTypeId: 1056, categoryIds: [9] }];
config.calendar = { ...config.calendar, intervals: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '18:00' }],
  holidays: [...brazilHolidays(2025), ...brazilHolidays(2026)], confirmed: true };
config.slaRules = stages.map((s, i) => ({ id: 'r' + i, entityTypeId: 1056, categoryId: 9, stageId: s, duration: { value: 3, unit: 'd' }, mode: 'util',
  warnPercent: 80, onReturn: 'acumular', pause: [], exceptions: [], enabled: true }));
config.processRules = [{ id: 'p', entityTypeId: 1056, categoryId: 9, duration: { value: 30, unit: 'd' }, mode: 'util', warnPercent: 80, startMode: 'criacao', pauseStages: [], enabled: true }];
config.stagnationRules = [{ id: 's', entityTypeId: 1056, categoryId: 9, stageId: '*', limit: { value: 10, unit: 'd' }, mode: 'util', enabled: true }];
config.noInteractionRules = [{ id: 'n', entityTypeId: 1056, categoryId: 9, limit: { value: 5, unit: 'd' }, mode: 'util', excludeStages: [], enabled: true }];
config.noFutureActivityRules = [{ id: 'f', entityTypeId: 1056, categoryId: 9, excludeStages: [], enabled: true }];

const times = [];
let A;
for (let k = 0; k < REP; k++) {
  const t0 = performance.now();
  A = analyze(ds, config, now);
  times.push(performance.now() - t0);
}
if (SIZES) { const t = {}; for (const c of A.cards) for (const [k, v] of Object.entries(c)) t[k] = (t[k] || 0) + JSON.stringify(v ?? null).length; const at = {}; for (const c of A.cards) for (const a of c.alerts) for (const [k, v] of Object.entries(a)) at[k] = (at[k] || 0) + JSON.stringify(v ?? null).length; console.log(JSON.stringify({ card: Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 8)), alerta: Object.fromEntries(Object.entries(at).sort((a, b) => b[1] - a[1]).slice(0, 8)) })); process.exit(0); }
if (SNAP) { console.log(JSON.stringify(A.cards.map(c => [c.key, c.priority.score, c.stageSlaStatus, c.processSlaStatus, c.alerts.map(a => [a.type, Math.round(a.overdueMin || 0), a.deadline])]))); process.exit(0); }
const sorted = times.slice().sort((a, b) => a - b);
console.log(JSON.stringify({ cards: N, repeticoes: REP, msMediana: Math.round(sorted[Math.floor(REP / 2)]), msMin: Math.round(sorted[0]),
  comAlerta: A.kpis.comAlerta, slaVencido: A.kpis.slaVencido, tamanhoAnaliseKB: Math.round(JSON.stringify(A).length / 1024) }));
