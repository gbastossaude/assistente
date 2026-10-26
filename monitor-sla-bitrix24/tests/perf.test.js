// Otimizações de desempenho: o cache de fuso e de dias não pode mudar nenhum resultado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zonedParts, zonedToUtc, businessMinutesBetween, addBusinessMinutes, normalizeCalendar } from '../src/core/time.js';
import { BitrixClient } from '../src/integration/bitrix-client.js';

function intlParts(ts, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ts))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second,
    weekday: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday] };
}

test('fuso com cache = Intl, inclusive em horário de verão e fusos de 30/45 min', () => {
  const zones = ['America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'America/Noronha'];
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const start = Date.UTC(2015, 0, 1), span = Date.UTC(2031, 0, 1) - start;
  for (const tz of zones) {
    for (let i = 0; i < 3000; i++) {
      const ts = start + Math.floor(rnd() * span);
      assert.deepEqual(zonedParts(ts, tz), intlParts(ts, tz), `${tz} ${new Date(ts).toISOString()}`);
    }
    // instantes exatos de mudança de horário (America/New_York 2026: 8/3 e 1/11, 07:00 e 06:00 UTC)
    for (const ts of [Date.UTC(2026, 2, 8, 6, 59, 59), Date.UTC(2026, 2, 8, 7, 0, 0), Date.UTC(2026, 10, 1, 5, 59, 59), Date.UTC(2026, 10, 1, 6, 0, 0)]) {
      assert.deepEqual(zonedParts(ts, tz), intlParts(ts, tz));
    }
  }
  // Brasília: meia-noite local = 03:00 UTC
  assert.equal(zonedToUtc(2026, 10, 26, 0, 0, 'America/Sao_Paulo'), Date.UTC(2026, 9, 26, 3, 0));
});

test('expediente com cache: mesmos minutos em consultas repetidas e cruzando feriados', () => {
  const cal = normalizeCalendar({ timezone: 'America/Sao_Paulo', workdays: [1, 2, 3, 4, 5],
    intervals: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '18:00' }], holidays: ['2026-11-02'] });
  const fri = zonedToUtc(2026, 10, 30, 17, 0, 'America/Sao_Paulo');
  const tue = zonedToUtc(2026, 11, 3, 9, 30, 'America/Sao_Paulo');
  for (let i = 0; i < 3; i++) assert.equal(businessMinutesBetween(fri, tue, cal), 60 + 60);
  assert.equal(addBusinessMinutes(fri, 120, cal), tue);
  // um ano inteiro: 8,5 h por dia útil
  const y0 = zonedToUtc(2027, 1, 1, 0, 0, 'America/Sao_Paulo'), y1 = zonedToUtc(2028, 1, 1, 0, 0, 'America/Sao_Paulo');
  const workdays = (() => { let n = 0; for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 864e5) { const w = new Date(t).getUTCDay(); if (w > 0 && w < 6) n++; } return n; })();
  assert.equal(businessMinutesBetween(y0, y1, cal), workdays * 510);
});

test('limite de requisições: rajada inicial sem espera e depois no ritmo do plano', async () => {
  const waits = [];
  let clock = 0;
  const realNow = Date.now;
  Date.now = () => clock;
  try {
    const client = new BitrixClient({ webhookUrl: 'https://p.example/rest/1/abc/', requestsPerSecond: 2, burst: 10,
      fetchImpl: async () => ({ status: 200, text: async () => '{"result":[]}' }), sleep: async ms => { waits.push(ms); clock += ms; } });
    for (let i = 0; i < 14; i++) await client.call('crm.status.list', {});
    assert.equal(waits.length, 4, 'as 10 primeiras saem sem espera');
    assert.ok(waits.every(w => Math.abs(w - 500) < 1), 'depois, 1 requisição a cada 500 ms (2 req/s)');
  } finally {
    Date.now = realNow;
  }
});
