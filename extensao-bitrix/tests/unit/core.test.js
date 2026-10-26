'use strict';
// Testes simulados (Node, sem navegador) da lógica pura da extensão.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const src = (f) => path.join(__dirname, '..', '..', 'src', 'content', f);
const util = require(src('util.js'));
const time = require(src('time.js'));
const S = require(src('settings.js'));
const observe = require(src('observe.js'));
const analyze = require(src('analyze.js'));
const csv = require(src('csv.js'));

const SP = 'America/Sao_Paulo';
const H = 3600000;
const sp = (y, m, d, hh = 0, mm = 0) => time.zonedToUtc(y, m, d, hh, mm, 0, SP);

// ---------------- util ----------------

test('formulário aceita horas fracionárias com vírgula ou ponto', () => {
  assert.deepEqual(util.parseDecimalInput('1,25'), { ok: true, value: 1.25 });
  assert.deepEqual(util.parseDecimalInput('1.25'), { ok: true, value: 1.25 });
  assert.deepEqual(util.parseDecimalInput(' 0 '), { ok: true, value: 0 });
  assert.equal(util.parseDecimalInput('').empty, true);
  for (const bad of ['-1', 'abc', '1,2,3', '1.000,5', '1e3', '٣']) assert.equal(util.parseDecimalInput(bad).ok, false, bad);
  assert.equal(util.parseDecimalInput('100001').ok, false);
});

test('valores monetários em formato brasileiro e moeda não presumida', () => {
  assert.deepEqual(util.parseMoney('R$ 12.500,00'), { amount: 12500, currency: 'BRL', raw: 'R$ 12.500,00' });
  assert.equal(util.parseMoney('US$ 1,000.50').amount, 1000.5);
  assert.equal(util.parseMoney('US$ 1,000.50').currency, 'USD');
  assert.equal(util.parseMoney('€ 10').currency, 'EUR');
  assert.equal(util.parseMoney('1.234').amount, 1234);
  assert.equal(util.parseMoney('1.234').currency, null);
  assert.equal(util.parseMoney('2 500,75 BRL').amount, 2500.75);
  assert.equal(util.parseMoney('sem valor'), null);
});

test('links: somente https do portal dentro de /crm/', () => {
  assert.equal(util.safeCardUrl('/crm/deal/details/5/'), 'https://crm.hub-bnk.com/crm/deal/details/5/');
  assert.equal(util.safeCardUrl('javascript:alert(1)'), null);
  assert.equal(util.safeCardUrl('https://evil.example/crm/deal/details/5/'), null);
  assert.equal(util.safeCardUrl('http://crm.hub-bnk.com/crm/deal/details/5/'), null);
  assert.equal(util.safeCardUrl('https://crm.hub-bnk.com@evil.example/crm/'), null);
  assert.equal(util.safeCardUrl('https://user:x@crm.hub-bnk.com/crm/'), null);
  assert.equal(util.safeCardUrl('https://crm.hub-bnk.com/company/personal/'), null);
  assert.equal(util.safeCardUrl('data:text/html,<b>x</b>'), null);
  assert.equal(util.buildCardUrl('deal', '12'), 'https://crm.hub-bnk.com/crm/deal/details/12/');
  assert.equal(util.buildCardUrl('dyn128', '7'), 'https://crm.hub-bnk.com/crm/type/128/details/7/');
  assert.equal(util.buildCardUrl('deal', '12"><script>'), null);
  assert.deepEqual(util.parseCardHref('/crm/type/128/details/7/?x=1'), { entity: 'dyn128', id: '7', url: 'https://crm.hub-bnk.com/crm/type/128/details/7/?x=1' });
});

test('escape de HTML e limpeza de texto', () => {
  assert.equal(util.escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(util.cleanText('  a\n\t b \u0000 '), 'a b');
  assert.equal(util.normKey('Data de Conclusão: '), 'data de conclusao');
});

test('funções nativas mantêm o contexto (sem Illegal invocation)', () => {
  const owner = { secret: 42, read() { if (this !== owner) throw new TypeError('Illegal invocation'); return this.secret; } };
  const fn = util.bindNative(owner, 'read');
  assert.equal(fn(), 42);
  assert.equal(util.bindNative(owner, 'inexistente'), null);
  const st = util.bindNative(globalThis, 'setTimeout');
  return new Promise((resolve) => st(resolve, 1));
});

// ---------------- datas e fuso ----------------

test('datas brasileiras no fuso de São Paulo (UTC-3)', () => {
  const p = time.parseBrDate('26/10/2026 14:30', { tz: SP });
  assert.equal(p.ok, true);
  assert.equal(new Date(p.ms).toISOString(), '2026-10-26T17:30:00.000Z');
  assert.equal(p.dateOnly, false);
  const d = time.parseBrDate('Prazo: 26/10/2026', { tz: SP });
  assert.equal(d.dateOnly, true);
  assert.equal(new Date(d.ms).toISOString(), '2026-10-26T03:00:00.000Z');
  assert.equal(new Date(time.parseBrDate('26.10.2026 às 08:05', { tz: SP }).ms).toISOString(), '2026-10-26T11:05:00.000Z');
  assert.equal(new Date(time.parseBrDate('2026-10-26T08:00', { tz: SP }).ms).toISOString(), '2026-10-26T11:00:00.000Z');
  assert.equal(new Date(time.parseBrDate('26 de outubro de 2026, 09:00', { tz: SP }).ms).toISOString(), '2026-10-26T12:00:00.000Z');
  assert.equal(new Date(time.parseBrDate('5 mar. 2027', { tz: SP }).ms).toISOString(), '2027-03-05T03:00:00.000Z');
  assert.equal(time.parseBrDate('26/10/26', { tz: SP }).ok, true);
});

test('datas ausentes, inválidas ou ambíguas não são usadas', () => {
  assert.equal(time.parseBrDate('', { tz: SP }).ok, false);
  assert.equal(time.parseBrDate('—', { tz: SP }).reason, 'nenhuma data reconhecida');
  assert.equal(time.parseBrDate('31/02/2026', { tz: SP }).reason, 'data inválida');
  assert.equal(time.parseBrDate('10/25/2026', { tz: SP }).ok, false); // mm/dd não é aceito como dd/mm
  const noYear = time.parseBrDate('26 de outubro', { tz: SP, now: sp(2026, 10, 1) });
  assert.equal(noYear.ok, false);
  assert.equal(noYear.ambiguous, true);
  const two = time.parseBrDate('20/10/2026 a 26/10/2026', { tz: SP });
  assert.equal(two.ambiguous, true);
  const assumed = time.parseBrDate('26 de outubro', { tz: SP, now: sp(2026, 10, 1), assumeCurrentYear: true });
  assert.equal(assumed.ok, true);
  assert.equal(assumed.assumedYear, true);
  assert.equal(time.parseBrDate('26/10/2026 25:00', { tz: SP }).ok, false);
});

test('hoje / ontem / amanhã relativos ao fuso configurado', () => {
  const now = Date.parse('2026-10-27T01:30:00Z'); // 26/10 22:30 em São Paulo
  const hoje = time.parseBrDate('hoje, 09:00', { tz: SP, now });
  assert.equal(new Date(hoje.ms).toISOString(), '2026-10-26T12:00:00.000Z');
  const ontem = time.parseBrDate('Ontem', { tz: SP, now });
  assert.equal(new Date(ontem.ms).toISOString(), '2026-10-25T03:00:00.000Z');
  const amanha = time.parseBrDate('amanhã às 10:00', { tz: SP, now });
  assert.equal(new Date(amanha.ms).toISOString(), '2026-10-27T13:00:00.000Z');
});

test('conversão de fuso com horário de verão (America/New_York)', () => {
  const ny = 'America/New_York';
  assert.equal(new Date(time.zonedToUtc(2026, 3, 7, 12, 0, 0, ny)).toISOString(), '2026-03-07T17:00:00.000Z');
  assert.equal(new Date(time.zonedToUtc(2026, 3, 9, 12, 0, 0, ny)).toISOString(), '2026-03-09T16:00:00.000Z');
  assert.equal(time.isValidTimeZone('America/Sao_Paulo'), true);
  assert.equal(time.isValidTimeZone('Mars/Base'), false);
});

const expediente = { mode: 'expediente', tz: SP, workdays: [1, 2, 3, 4, 5], start: '08:00', end: '18:00', holidays: [] };

test('expediente: fim de semana não conta', () => {
  // sexta 23/10/2026 17:00 → segunda 26/10/2026 09:00 = 1 h + 1 h
  assert.equal(time.businessMs(sp(2026, 10, 23, 17), sp(2026, 10, 26, 9), expediente), 2 * H);
  assert.equal(time.businessMs(sp(2026, 10, 24, 0), sp(2026, 10, 25, 23, 59), expediente), 0);
  assert.equal(time.businessMs(sp(2026, 10, 26, 7), sp(2026, 10, 26, 19), expediente), 10 * H);
  assert.equal(new Date(time.addBusinessMs(sp(2026, 10, 23, 17), 2 * H, expediente)).toISOString(), new Date(sp(2026, 10, 26, 9)).toISOString());
});

test('expediente: feriados e horas fracionárias', () => {
  const cfg = Object.assign({}, expediente, { holidays: time.parseHolidayLines('02/11/2026 Finados\n2026-11-20').dates });
  assert.deepEqual(cfg.holidays, ['2026-11-02', '2026-11-20']);
  // sexta 30/10 17:00 + 1,25 h → pula sáb, dom e o feriado de segunda 02/11 → terça 03/11 08:15
  const end = time.addBusinessMs(sp(2026, 10, 30, 17), 1.25 * H, cfg);
  assert.equal(end, sp(2026, 11, 3, 8, 15));
  assert.equal(time.businessMs(sp(2026, 10, 30, 17), sp(2026, 11, 3, 8, 15), cfg), 1.25 * H);
  const bad = time.parseHolidayLines('32/01/2026\nfoo');
  assert.equal(bad.errors.length, 2);
});

test('tempo corrido e fim do dia local', () => {
  const corrido = Object.assign({}, expediente, { mode: 'corrido' });
  assert.equal(time.durationMs(sp(2026, 10, 24, 10), sp(2026, 10, 25, 10), corrido), 24 * H);
  assert.equal(time.endOfLocalDay(sp(2026, 10, 26, 15), SP), sp(2026, 10, 27, 0));
});

// ---------------- configurações ----------------

test('configuração antiga de webhook/token é removida', () => {
  const { settings, removedLegacy } = S.migrate({
    webhookUrl: 'https://x.bitrix24.com.br/rest/1/abc/', token: 'abc', clock: { tz: 'Mars/Base', mode: 'expediente', start: '18:00', end: '08:00' },
    rules: { 'deal:0': { novo: { sla: '1.25', stall: 0 }, vazio: { sla: 0, stall: 0 } } }, warnPct: 150
  });
  assert.deepEqual(removedLegacy.sort(), ['token', 'webhookUrl']);
  assert.equal(settings.webhookUrl, undefined);
  assert.equal(settings.clock.tz, 'America/Sao_Paulo');
  assert.equal(settings.clock.mode, 'expediente');
  assert.equal(settings.clock.start, '08:00');
  assert.equal(settings.warnPct, 80);
  assert.equal(settings.rules['deal:0'].novo.sla, 1.25);
  assert.equal(settings.rules['deal:0'].vazio, undefined);
  const def = S.defaults();
  assert.deepEqual(def.rules, {}); // nenhum prazo da empresa pré-definido
  assert.equal(def.deadlineLabels.length, 0);
});

// ---------------- observação local ----------------

const corridoCfg = { mode: 'corrido', tz: SP, workdays: [1, 2, 3, 4, 5], start: '08:00', end: '18:00', holidays: [] };

test('observação: continuidade, lacunas e mudança de etapa', () => {
  const store = observe.emptyStore();
  const t0 = sp(2026, 10, 26, 9);
  const opts = { continuityMs: 15 * 60000 };
  observe.recordObservation(store, 'deal:1', 'deal:0|novo', t0, opts);
  observe.recordObservation(store, 'deal:1', 'deal:0|novo', t0 + 10 * 60000, opts);
  observe.recordObservation(store, 'deal:1', 'deal:0|novo', t0 + 20 * 60000, opts);
  let seg = observe.currentSegment(store, 'deal:1');
  assert.equal(seg.iv.length, 1);
  assert.equal(observe.computeElapsed(seg, corridoCfg, false).ms, 20 * 60000);
  // página fechada por 3 h: nova observação, lacuna não contada por padrão
  observe.recordObservation(store, 'deal:1', 'deal:0|novo', t0 + 200 * 60000, opts);
  observe.recordObservation(store, 'deal:1', 'deal:0|novo', t0 + 210 * 60000, opts);
  seg = observe.currentSegment(store, 'deal:1');
  assert.equal(seg.g, 1);
  const semLacuna = observe.computeElapsed(seg, corridoCfg, false);
  assert.equal(semLacuna.ms, 30 * 60000);
  assert.equal(semLacuna.gapMs, 180 * 60000);
  assert.equal(observe.computeElapsed(seg, corridoCfg, true).ms, 210 * 60000);
  // mudança de etapa: contagem recomeça e registra a etapa anterior
  observe.recordObservation(store, 'deal:1', 'deal:0|proposta', t0 + 220 * 60000, opts);
  seg = observe.currentSegment(store, 'deal:1');
  assert.equal(seg.from, 'deal:0|novo');
  assert.equal(observe.computeElapsed(seg, corridoCfg, true).ms, 0);
  // voltar à etapa anterior SEM pausa: nova contagem (não presume continuidade)
  observe.recordObservation(store, 'deal:1', 'deal:0|novo', t0 + 230 * 60000, opts);
  assert.equal(observe.computeElapsed(observe.currentSegment(store, 'deal:1'), corridoCfg, true).ms, 0);
});

test('observação: pausa e retorno à etapa retomam a contagem', () => {
  const store = observe.emptyStore();
  const t0 = sp(2026, 10, 26, 9);
  const opts = { continuityMs: 15 * 60000, isPaused: (k) => k === 'deal:0|aguardando' };
  observe.recordObservation(store, 'deal:2', 'deal:0|analise', t0, opts);
  observe.recordObservation(store, 'deal:2', 'deal:0|analise', t0 + 10 * 60000, opts);
  observe.recordObservation(store, 'deal:2', 'deal:0|aguardando', t0 + 20 * 60000, opts);
  observe.recordObservation(store, 'deal:2', 'deal:0|aguardando', t0 + 25 * 60000, opts);
  observe.recordObservation(store, 'deal:2', 'deal:0|analise', t0 + 300 * 60000, opts);
  observe.recordObservation(store, 'deal:2', 'deal:0|analise', t0 + 305 * 60000, opts);
  const seg = observe.currentSegment(store, 'deal:2');
  assert.equal(seg.res, true);
  // countGaps=true também não preenche o período em pausa
  assert.equal(observe.computeElapsed(seg, corridoCfg, true).ms, 15 * 60000);
  assert.equal(observe.computeElapsed(seg, corridoCfg, false).ms, 15 * 60000);
  const at = observe.pointAtElapsed(observe.computeElapsed(seg, corridoCfg, false).intervals, 12 * 60000, corridoCfg);
  assert.equal(at, t0 + 300 * 60000 + 2 * 60000);
});

test('observação: retenção e saneamento do armazenamento', () => {
  const store = observe.emptyStore();
  const now = sp(2026, 10, 26, 9);
  observe.recordObservation(store, 'deal:1', 'f|a', now - 40 * 86400000, {});
  observe.recordObservation(store, 'deal:2', 'f|a', now, {});
  assert.equal(observe.pruneStore(store, now, 30), 1);
  assert.deepEqual(Object.keys(store.cards), ['deal:2']);
  const clean = observe.sanitizeStore({ cards: { 'deal:3': { s: [{ k: 'x', iv: [[5, 1]] }] }, '<script>': { s: [] }, 'deal:4': { s: [{ k: 'x', iv: [[1, 2]], f: 1 }], l: 2, titulo: 'segredo' } } });
  assert.deepEqual(Object.keys(clean.cards), ['deal:4']);
  assert.equal(clean.cards['deal:4'].titulo, undefined);
});

// ---------------- análise ----------------

function card(over) {
  return Object.assign({
    key: 'deal:10', entity: 'deal', id: '10', title: 'Empresa X', url: 'https://crm.hub-bnk.com/crm/deal/details/10/',
    funnel: { key: 'deal:0', name: 'Vendas' }, stage: { key: 'analise', id: 'PREPARATION', name: 'Análise', source: 'teste' },
    responsible: 'Ana', amount: { amount: 1000, currency: 'BRL' }, fields: [], signals: {}, signalsAvailable: false, present: true
  }, over || {});
}

function ctx(over) {
  const settings = S.defaults();
  return Object.assign({ now: sp(2026, 10, 26, 15), settings, obs: observe.emptyStore(), registry: observe.emptyRegistry(), labelsOnPage: new Set() }, over || {});
}

test('prazo do card vencido (campo configurado) e datas sem ano', () => {
  const c = ctx();
  c.settings.deadlineLabels = ['Prazo operacional'];
  const r = analyze.analyzeCard(card({ fields: [{ label: 'Prazo operacional', value: '26/10/2026 10:00' }] }), c);
  assert.equal(r.alerts[0].type, 'prazo_card');
  assert.equal(r.alerts[0].overdueMs, 5 * H);
  // somente data: vence ao fim do dia → ainda no prazo às 15:00
  const r2 = analyze.analyzeCard(card({ fields: [{ label: 'Prazo operacional', value: '26/10/2026' }] }), c);
  assert.equal(r2.alerts.length, 0);
  assert.equal(r2.status, 'sem_pendencia');
  const r3 = analyze.analyzeCard(card({ fields: [{ label: 'Prazo operacional', value: '20 de outubro' }] }), c);
  assert.equal(r3.alerts.length, 0);
  assert.ok(r3.notes.some((n) => /sem ano/.test(n)));
});

test('não exibido x não encontrado x sem regra', () => {
  const c = ctx();
  c.settings.deadlineLabels = ['Prazo operacional'];
  c.labelsOnPage = new Set(['prazo operacional']);
  assert.ok(analyze.analyzeCard(card(), c).notes.some((n) => /não exibido neste card/.test(n)));
  c.labelsOnPage = new Set();
  assert.ok(analyze.analyzeCard(card(), c).notes.some((n) => /não encontrado na página/.test(n)));
  const semRegra = analyze.analyzeCard(card(), ctx());
  assert.equal(semRegra.status, 'sem_dados');
});

test('SLA por observação local: parcial, aviso antecipado e vencido', () => {
  const c = ctx();
  c.settings.rules = { 'deal:0': { analise: { sla: 1.25, stall: 0, pause: false, final: null } } };
  const t0 = c.now - 70 * 60000;
  for (let t = t0; t <= c.now; t += 5 * 60000) observe.recordObservation(c.obs, 'deal:10', 'deal:0|analise', t, { continuityMs: 15 * 60000 });
  let r = analyze.analyzeCard(card(), c);
  assert.equal(r.alerts[0].type, 'sla_proximo'); // 70 min de 75 min (≥ 80%)
  assert.equal(r.alerts[0].partial, true);
  assert.ok(r.alerts[0].details.some((d) => /Contagem parcial desde a observação local/.test(d)));
  for (let i = 0; i < 2; i++) {
    c.now += 10 * 60000;
    observe.recordObservation(c.obs, 'deal:10', 'deal:0|analise', c.now, { continuityMs: 15 * 60000 });
  }
  r = analyze.analyzeCard(card(), c);
  assert.equal(r.alerts[0].type, 'sla_vencido');
  assert.equal(r.alerts[0].overdueMs, 15 * 60000);
  assert.equal(r.alerts[0].deadline, t0 + 75 * 60000);
});

test('SLA com data de entrada exibida pelo Bitrix (não parcial) e etapa em pausa', () => {
  const c = ctx();
  c.settings.rules = { 'deal:0': { analise: { sla: 2, stall: 4 }, espera: { pause: true, sla: 1 } } };
  c.settings.stageEntryLabels = ['Entrada na etapa'];
  const r = analyze.analyzeCard(card({ fields: [{ label: 'Entrada na etapa', value: '26/10/2026 08:00' }] }), c);
  const types = r.alerts.map((a) => a.type).sort();
  assert.deepEqual(types, ['parado', 'sla_vencido']);
  assert.equal(r.alerts.every((a) => a.partial === false), true);
  const p = analyze.analyzeCard(card({ stage: { key: 'espera', name: 'Espera', id: 'C', source: 't' }, fields: [{ label: 'Entrada na etapa', value: '20/10/2026 08:00' }] }), c);
  assert.equal(p.alerts.length, 0);
  assert.ok(p.notes.some((n) => /suspender o SLA/.test(n)));
});

test('cards finalizados saem da fila (WON/LOSE ou marcação manual)', () => {
  const c = ctx();
  assert.equal(analyze.analyzeCard(card({ stage: { key: 'ganho', id: 'C2:WON', name: 'Ganho' } }), c).closed, true);
  assert.equal(analyze.analyzeCard(card({ stage: { key: 'perdido', id: 'LOSE', name: 'Perdido' } }), c).closed, true);
  c.settings.rules = { 'deal:0': { implantado: { final: true }, ganho: { final: false } } };
  assert.equal(analyze.analyzeCard(card({ stage: { key: 'implantado', id: 'C2:UC_X', name: 'Implantado' } }), c).closed, true);
  assert.equal(analyze.analyzeCard(card({ stage: { key: 'ganho', id: 'C2:WON', name: 'Ganho' } }), c).closed, false);
  const all = analyze.analyzeAll([card({ stage: { key: 'g', id: 'WON', name: 'Ganho' } }), card({ key: 'deal:11', id: '11' })], ctx());
  assert.equal(all.queue.length, 1);
  assert.equal(all.summary.closed, 1);
});

test('sinais nativos, valor sem duplicidade e moedas separadas', () => {
  const cards = [
    card({ key: 'deal:1', id: '1', signals: { nativeSla: { text: 'SLA vencido' }, activityOverdue: { text: 'Atividade vencida' } }, amount: { amount: 500, currency: 'BRL' } }),
    card({ key: 'deal:2', id: '2', signals: { activityOverdue: { text: 'x' } }, amount: { amount: 100, currency: 'USD' }, responsible: null }),
    card({ key: 'deal:3', id: '3', signals: { noActivity: { text: 'Sem atividades' } }, amount: { amount: 999, currency: 'BRL' } }),
    card({ key: 'deal:4', id: '4', signals: { activityOverdue: { text: 'x' } }, amount: null })
  ];
  const res = analyze.analyzeAll(cards, ctx());
  assert.deepEqual(res.summary.overdueValue, { BRL: 500, USD: 100 });
  assert.equal(res.summary.overdueWithoutValue, 1);
  assert.equal(res.summary.slaOverdue, 1);
  assert.equal(res.summary.late, 3);
  assert.equal(res.summary.noActivity, 1);
  assert.equal(res.summary.byResponsible['Responsável não exibido'], 1);
  assert.equal(res.queue[0].card.id, '1'); // SLA vencido primeiro
  assert.equal(res.queue[res.queue.length - 1].card.id, '3');
});

test('prioridade: proporção do atraso desempata a mesma gravidade', () => {
  const c = ctx();
  c.settings.deadlineLabels = ['Prazo'];
  const a = card({ key: 'deal:1', id: '1', fields: [{ label: 'Prazo', value: '26/10/2026 14:00' }] });
  const b = card({ key: 'deal:2', id: '2', fields: [{ label: 'Prazo', value: '25/10/2026 14:00' }] });
  const res = analyze.analyzeAll([a, b], c);
  assert.equal(res.queue[0].card.id, '2');
});

// ---------------- CSV ----------------

test('CSV neutraliza fórmulas e escapa separadores', () => {
  assert.equal(csv.csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csv.csvCell('+55 11'), "'+55 11");
  assert.equal(csv.csvCell('-10'), "'-10");
  assert.equal(csv.csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csv.csvCell('\tcmd'), "'\tcmd");
  assert.equal(csv.csvCell('a;b'), '"a;b"');
  assert.equal(csv.csvCell('linha1\nlinha2'), 'linha1 linha2');
  const res = analyze.analyzeAll([card({ title: '=cmd|"/c calc"!A1', signals: { activityOverdue: { text: 'x' } } })], ctx());
  const out = csv.buildCsv(res.queue, SP);
  assert.ok(out.startsWith('﻿'));
  assert.ok(out.includes("\"'=cmd|\"\"/c calc\"\"!A1\""));
  assert.ok(!/;=/.test(out));
});
