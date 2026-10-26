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

function intlParts(ts, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ts))) p[type] = value;
  return {
    y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second,
    weekday: WD[p.weekday]
  };
}

// Deslocamento do fuso por faixa de 15 minutos: as mudanças de horário de verão acontecem sempre em
// múltiplos de 15 min, então dentro de uma faixa o deslocamento é constante. Evita uma chamada ao Intl
// (cara) para cada data convertida.
const offsetCache = new Map();
const BUCKET = 15 * MIN;

function offsetAt(ts, tz) {
  let m = offsetCache.get(tz);
  if (!m) { m = new Map(); offsetCache.set(tz, m); }
  const b = Math.floor(ts / BUCKET);
  let off = m.get(b);
  if (off === undefined) {
    if (m.size > 100000) m.clear();
    const t0 = b * BUCKET;
    const p = intlParts(t0, tz);
    off = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - t0;
    m.set(b, off);
  }
  return off;
}

/** Partes da data/hora locais no fuso `tz` para o instante `ts` (ms). */
export function zonedParts(ts, tz) {
  const dt = new Date(Math.floor(ts / 1000) * 1000 + offsetAt(ts, tz));
  return {
    y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), hh: dt.getUTCHours(), mm: dt.getUTCMinutes(),
    ss: dt.getUTCSeconds(), weekday: dt.getUTCDay()
  };
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

// Calendários já normalizados (mesmo objeto de configuração → mesmo resultado).
const normCache = new WeakMap();

/** Normaliza o calendário de expediente. */
export function normalizeCalendar(cal = {}) {
  if (cal && typeof cal === 'object' && cal.intervals instanceof Array && cal.workdays instanceof Set) return cal;
  const cached = cal && typeof cal === 'object' ? normCache.get(cal) : null;
  if (cached) return cached;
  const out = buildCalendar(cal || {});
  if (cal && typeof cal === 'object') normCache.set(cal, out);
  return out;
}

function buildCalendar(cal) {
  const intervals = (cal.intervals && cal.intervals.length ? cal.intervals : [{ start: '09:00', end: '18:00' }])
    .map(i => ({ s: parseHM(i.start), e: parseHM(i.end) }))
    .filter(i => (i.e.h * 60 + i.e.m) > (i.s.h * 60 + i.s.m))
    .sort((a, b) => (a.s.h * 60 + a.s.m) - (b.s.h * 60 + b.s.m));
  const dayMinutesAuto = intervals.reduce((acc, i) => acc + (i.e.h * 60 + i.e.m) - (i.s.h * 60 + i.s.m), 0);
  const timezone = cal.timezone || 'America/Sao_Paulo';
  const workdays = new Set(cal.workdays && cal.workdays.length ? cal.workdays : [1, 2, 3, 4, 5]);
  const holidays = new Set(cal.holidays || []);
  // Assinatura do calendário: identifica o cache de dias calculados.
  const key = JSON.stringify([timezone, [...workdays].sort(), intervals.map(i => [i.s.h, i.s.m, i.e.h, i.e.m]), [...holidays].sort()]);
  return {
    timezone, workdays, intervals, holidays, key,
    dayMinutes: cal.dayMinutes && cal.dayMinutes > 0 ? cal.dayMinutes : dayMinutesAuto
  };
}

// Cache de dias locais: início do dia e intervalos de expediente em UTC. Evita recalcular o fuso
// (Intl, operação cara) a cada dia percorrido — o mesmo dia é consultado milhares de vezes numa análise.
const dayCache = new Map();
const DAY_CACHE_MAX = 40000;

function daysOf(cal) {
  const key = cal.key || JSON.stringify([cal.timezone, [...cal.workdays], cal.intervals, [...cal.holidays]]);
  let days = dayCache.get(key);
  if (!days) {
    if (dayCache.size >= 8) dayCache.clear();
    days = new Map();
    dayCache.set(key, days);
  }
  if (days.size >= DAY_CACHE_MAX) days.clear();
  return days;
}

/** Dia local nº n (dias desde 1970-01-01): início do dia e intervalos de expediente em UTC. */
function dayInfo(n, cal, days) {
  let info = days.get(n);
  if (!info) {
    const dt = new Date(n * 86400000);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const work = cal.workdays.has(dt.getUTCDay()) && !cal.holidays.has(dateKey(y, m, d));
    info = {
      start: zonedToUtc(y, m, d, 0, 0, cal.timezone),
      ivs: work ? cal.intervals.map(i => [
        zonedToUtc(y, m, d, i.s.h, i.s.m, cal.timezone),
        zonedToUtc(y, m, d, i.e.h, i.e.m, cal.timezone)
      ]) : []
    };
    days.set(n, info);
  }
  return info;
}

/** Número do dia local (no fuso) do instante ts. */
function localDayNum(ts, tz) {
  const p = zonedParts(ts, tz);
  return Date.UTC(p.y, p.m - 1, p.d) / 86400000;
}

const MAX_DAYS = 4000;

/** Dias de calendário entre duas datas, no fuso (criado hoje = 0, ontem = 1), independentemente da hora. */
export function calendarDaysBetween(a, b, tz) {
  if (a == null || b == null) return null;
  return localDayNum(b, tz) - localDayNum(a, tz);
}

/** Minutos de expediente entre a e b. */
export function businessMinutesBetween(a, b, calIn) {
  if (!(b > a)) return 0;
  const cal = normalizeCalendar(calIn);
  const days = daysOf(cal);
  let total = 0;
  const n0 = localDayNum(a, cal.timezone);
  for (let n = n0; n < n0 + MAX_DAYS; n++) {
    const info = dayInfo(n, cal, days);
    if (info.start >= b) break;
    for (const iv of info.ivs) {
      const lo = iv[0] > a ? iv[0] : a, hi = iv[1] < b ? iv[1] : b;
      if (hi > lo) total += hi - lo;
    }
  }
  return total / MIN;
}

/** Instante em que se completam `minutes` minutos de expediente a partir de `start`. */
export function addBusinessMinutes(start, minutes, calIn) {
  const cal = normalizeCalendar(calIn);
  let remaining = minutes * MIN;
  if (remaining <= 0) return start;
  if (cal.intervals.length === 0 || cal.workdays.size === 0) return null;
  const days = daysOf(cal);
  const n0 = localDayNum(start, cal.timezone);
  for (let n = n0; n < n0 + MAX_DAYS; n++) {
    for (const [s, e] of dayInfo(n, cal, days).ivs) {
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
    case 'd': return mode === 'util' ? v * normalizeCalendar(cal || {}).dayMinutes : v * 1440;
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
