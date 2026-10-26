// Cálculo de tempo corrido e de horário comercial, com fuso horário, dias úteis,
// expediente (vários intervalos por dia) e feriados. Módulo puro: roda no Chrome e no Node.

const MIN = 60000;
const fmtCache = new Map();

function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Partes da data/hora locais no fuso `tz` para o instante `ts` (ms). */
export function zonedParts(ts, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ts))) p[type] = value;
  return {
    y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second,
    weekday: WD[p.weekday]
  };
}

function offsetAt(ts, tz) {
  const p = zonedParts(ts, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Converte data/hora local (no fuso tz) para instante UTC (ms). */
export function zonedToUtc(y, m, d, hh = 0, mm = 0, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  let ts = guess - offsetAt(guess, tz);
  const o2 = offsetAt(ts, tz);
  ts = guess - o2;
  return ts;
}

export function dateKey(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseHM(s) {
  const [h, m] = String(s).split(':').map(Number);
  return { h, m: m || 0 };
}

/** Normaliza o calendário de expediente. */
export function normalizeCalendar(cal = {}) {
  const intervals = (cal.intervals && cal.intervals.length ? cal.intervals : [{ start: '09:00', end: '18:00' }])
    .map(i => ({ s: parseHM(i.start), e: parseHM(i.end) }))
    .filter(i => (i.e.h * 60 + i.e.m) > (i.s.h * 60 + i.s.m))
    .sort((a, b) => (a.s.h * 60 + a.s.m) - (b.s.h * 60 + b.s.m));
  const dayMinutesAuto = intervals.reduce((acc, i) => acc + (i.e.h * 60 + i.e.m) - (i.s.h * 60 + i.s.m), 0);
  return {
    timezone: cal.timezone || 'America/Sao_Paulo',
    workdays: new Set(cal.workdays && cal.workdays.length ? cal.workdays : [1, 2, 3, 4, 5]),
    intervals,
    holidays: new Set(cal.holidays || []),
    dayMinutes: cal.dayMinutes && cal.dayMinutes > 0 ? cal.dayMinutes : dayMinutesAuto
  };
}

// Itera dias locais começando na data local de `ts`.
function* localDays(ts, tz, maxDays = 4000) {
  const p = zonedParts(ts, tz);
  let base = Date.UTC(p.y, p.m - 1, p.d);
  for (let i = 0; i < maxDays; i++) {
    const dt = new Date(base + i * 86400000);
    yield { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), weekday: dt.getUTCDay() };
  }
}

/** Intervalos de expediente (UTC ms) de um dia local. Vazio em fim de semana/feriado. */
function workIntervalsOfDay(day, cal) {
  if (!cal.workdays.has(day.weekday)) return [];
  if (cal.holidays.has(dateKey(day.y, day.m, day.d))) return [];
  return cal.intervals.map(i => [
    zonedToUtc(day.y, day.m, day.d, i.s.h, i.s.m, cal.timezone),
    zonedToUtc(day.y, day.m, day.d, i.e.h, i.e.m, cal.timezone)
  ]);
}

/** Minutos de expediente entre a e b. */
export function businessMinutesBetween(a, b, calIn) {
  if (!(b > a)) return 0;
  const cal = calIn.intervals ? calIn : normalizeCalendar(calIn);
  let total = 0;
  for (const day of localDays(a, cal.timezone)) {
    const ivs = workIntervalsOfDay(day, cal);
    const dayStart = zonedToUtc(day.y, day.m, day.d, 0, 0, cal.timezone);
    if (dayStart >= b) break;
    for (const [s, e] of ivs) {
      const lo = Math.max(s, a), hi = Math.min(e, b);
      if (hi > lo) total += hi - lo;
    }
  }
  return total / MIN;
}

/** Instante em que se completam `minutes` minutos de expediente a partir de `start`. */
export function addBusinessMinutes(start, minutes, calIn) {
  const cal = calIn.intervals ? calIn : normalizeCalendar(calIn);
  let remaining = minutes * MIN;
  if (remaining <= 0) return start;
  if (cal.intervals.length === 0 || cal.workdays.size === 0) return null;
  for (const day of localDays(start, cal.timezone)) {
    for (const [s, e] of workIntervalsOfDay(day, cal)) {
      const lo = Math.max(s, start);
      if (e <= lo) continue;
      const avail = e - lo;
      if (avail >= remaining) return lo + remaining;
      remaining -= avail;
    }
  }
  return null; // além do horizonte de cálculo
}

/** Converte a duração de uma regra para minutos no modo indicado. */
export function durationToMinutes(duration, mode, cal) {
  const v = Number(duration?.value) || 0;
  switch (duration?.unit) {
    case 'min': return v;
    case 'h': return v * 60;
    case 'd': return mode === 'util' ? v * normalizeCalendar(cal).dayMinutes : v * 1440;
    default: return v;
  }
}

/** Mede o tempo entre a e b no modo da regra ('corrido' ou 'util'). */
export function measure(a, b, mode, cal) {
  if (!(b > a)) return 0;
  return mode === 'util' ? businessMinutesBetween(a, b, cal) : (b - a) / MIN;
}

/** Soma `minutes` ao instante `start` no modo da regra. */
export function addMeasure(start, minutes, mode, cal) {
  return mode === 'util' ? addBusinessMinutes(start, minutes, cal) : start + minutes * MIN;
}

/** Formata minutos como "2d 3h 15min" (corrido) ou "5h 20min úteis". */
export function fmtMinutes(min, mode) {
  if (min == null || isNaN(min)) return '—';
  const neg = min < 0; min = Math.abs(Math.round(min));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  let s;
  if (mode === 'util') {
    const hh = Math.floor(min / 60);
    s = hh ? `${hh}h${m ? ' ' + m + 'min' : ''}` : `${m}min`;
    s += ' úteis';
  } else {
    s = [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}min`].filter(Boolean).join(' ');
  }
  return (neg ? '-' : '') + s;
}

/** Lê datas do Bitrix (ISO com offset) para ms. Retorna null se vazio/inválido. */
export function parseBitrixDate(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

/** Bitrix devolve 9999-12-... para atividades sem prazo. */
export function isSentinelDeadline(ts) {
  return ts == null || new Date(ts).getUTCFullYear() >= 9000;
}

/** Dentro de uma janela diária (HH:MM–HH:MM) e dias da semana, no fuso. */
export function inDailyWindow(ts, win, tz) {
  if (!win || !win.enabled) return true;
  const p = zonedParts(ts, tz);
  if (win.days && win.days.length && !win.days.includes(p.weekday)) return false;
  const cur = p.hh * 60 + p.mm;
  const s = parseHM(win.start || '00:00'), e = parseHM(win.end || '23:59');
  const sm = s.h * 60 + s.m, em = e.h * 60 + e.m;
  return sm <= em ? cur >= sm && cur <= em : cur >= sm || cur <= em;
}
