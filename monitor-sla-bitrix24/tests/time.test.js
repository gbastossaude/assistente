import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessMinutesBetween, addBusinessMinutes, normalizeCalendar, durationToMinutes, zonedToUtc, inDailyWindow, isSentinelDeadline, parseBitrixDate } from '../src/core/time.js';
import { brazilHolidays } from '../src/core/config.js';

const TZ = 'America/Sao_Paulo';
// Horário de Brasília (UTC-3, sem horário de verão desde 2019)
const at = (s) => Date.parse(s + '-03:00');
const cal = normalizeCalendar({ timezone: TZ, workdays: [1, 2, 3, 4, 5], intervals: [{ start: '09:00', end: '18:00' }], holidays: [] });
const calLunch = normalizeCalendar({ timezone: TZ, workdays: [1, 2, 3, 4, 5], intervals: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '18:00' }], holidays: [] });

test('expediente: dentro do mesmo dia', () => {
  assert.equal(businessMinutesBetween(at('2026-10-26T10:00:00'), at('2026-10-26T12:30:00'), cal), 150);
});

test('expediente: início antes e fim depois do horário contam só o expediente', () => {
  assert.equal(businessMinutesBetween(at('2026-10-26T07:00:00'), at('2026-10-26T20:00:00'), cal), 540);
});

test('expediente: intervalo de almoço não conta', () => {
  assert.equal(businessMinutesBetween(at('2026-10-26T11:00:00'), at('2026-10-26T14:00:00'), calLunch), 120);
  assert.equal(calLunch.dayMinutes, 510);
});

test('fim de semana: sexta 17:00 até segunda 10:00 = 2h úteis', () => {
  assert.equal(businessMinutesBetween(at('2026-10-23T17:00:00'), at('2026-10-26T10:00:00'), cal), 120);
});

test('fim de semana: sábado inteiro não conta', () => {
  assert.equal(businessMinutesBetween(at('2026-10-24T00:00:00'), at('2026-10-25T23:59:00'), cal), 0);
});

test('feriado: 2/11 (Finados) não conta', () => {
  const c = normalizeCalendar({ ...cal, timezone: TZ, workdays: [1, 2, 3, 4, 5], intervals: [{ start: '09:00', end: '18:00' }], holidays: ['2026-11-02'] });
  // sexta 30/10 17:00 → terça 03/11 10:00: 1h (sexta) + 0 (sáb, dom, feriado) + 1h (terça)
  assert.equal(businessMinutesBetween(at('2026-10-30T17:00:00'), at('2026-11-03T10:00:00'), c), 120);
  assert.equal(businessMinutesBetween(at('2026-10-30T17:00:00'), at('2026-11-03T10:00:00'), cal), 120 + 540);
});

test('vencimento: 2 dias úteis a partir de segunda 15:00 vencem quarta 15:00', () => {
  const due = addBusinessMinutes(at('2026-10-26T15:00:00'), durationToMinutes({ value: 2, unit: 'd' }, 'util', { intervals: [{ start: '09:00', end: '18:00' }] }), cal);
  assert.equal(due, at('2026-10-28T15:00:00'));
});

test('vencimento: entrada fora do expediente começa a contar na abertura', () => {
  // sábado 10:00 + 4h úteis → segunda 13:00
  assert.equal(addBusinessMinutes(at('2026-10-24T10:00:00'), 240, cal), at('2026-10-26T13:00:00'));
});

test('vencimento: 8h úteis a partir de sexta 16:00 com feriado na segunda', () => {
  const c = normalizeCalendar({ timezone: TZ, intervals: [{ start: '09:00', end: '18:00' }], holidays: ['2026-11-02'] });
  // sexta 30/10 16:00: 2h; segunda 2/11 feriado; terça 03/11 09:00 + 6h = 15:00
  assert.equal(addBusinessMinutes(at('2026-10-30T16:00:00'), 480, c), at('2026-11-03T15:00:00'));
});

test('fuso horário: cálculo em outro fuso (Manaus, UTC-4)', () => {
  const c = normalizeCalendar({ timezone: 'America/Manaus', intervals: [{ start: '09:00', end: '18:00' }] });
  // 10:00 em São Paulo = 09:00 em Manaus; até 18:00 Manaus = 19:00 SP → 9h
  assert.equal(businessMinutesBetween(at('2026-10-26T10:00:00'), at('2026-10-26T19:00:00'), c), 540);
});

test('zonedToUtc e janela de notificação', () => {
  assert.equal(zonedToUtc(2026, 10, 26, 9, 0, TZ), at('2026-10-26T09:00:00'));
  const w = { enabled: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '19:00' };
  assert.equal(inDailyWindow(at('2026-10-26T10:00:00'), w, TZ), true);
  assert.equal(inDailyWindow(at('2026-10-26T22:00:00'), w, TZ), false);
  assert.equal(inDailyWindow(at('2026-10-25T10:00:00'), w, TZ), false); // domingo
});

test('prazo sentinela do Bitrix (atividade sem prazo)', () => {
  assert.equal(isSentinelDeadline(parseBitrixDate('9999-12-31T21:00:00+00:00')), true);
  assert.equal(isSentinelDeadline(parseBitrixDate('2026-10-27T10:00:00+03:00')), false);
  assert.equal(isSentinelDeadline(null), true);
});

test('feriados nacionais 2026 incluem Sexta-feira Santa e Consciência Negra', () => {
  const h = brazilHolidays(2026);
  assert.ok(h.includes('2026-04-03')); // Páscoa 2026 = 5/4
  assert.ok(h.includes('2026-11-20'));
  assert.ok(!h.includes('2026-02-17'));
  assert.ok(brazilHolidays(2026, { carnaval: true }).includes('2026-02-17'));
  assert.ok(brazilHolidays(2026, { corpusChristi: true }).includes('2026-06-04'));
});
