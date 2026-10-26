/*
 * Datas, fuso horário e expediente.
 * Toda conversão usa Intl com o fuso configurado (padrão America/Sao_Paulo),
 * independentemente do fuso do computador.
 */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});

  const DAY_MS = 86400000;
  const MAX_DAYS = 3700; // ~10 anos: limite de segurança dos laços de calendário
  const formatters = new Map();

  function isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
      return true;
    } catch (e) {
      return false;
    }
  }

  function partsFormatter(tz) {
    let f = formatters.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      formatters.set(tz, f);
    }
    return f;
  }

  /** Componentes de data/hora locais no fuso indicado. */
  function localParts(ms, tz) {
    const out = {};
    for (const p of partsFormatter(tz).formatToParts(new Date(ms))) {
      if (p.type !== 'literal') out[p.type] = Number(p.value);
    }
    if (out.hour === 24) out.hour = 0;
    const wd = new Date(Date.UTC(out.year, out.month - 1, out.day)).getUTCDay();
    return { y: out.year, m: out.month, d: out.day, hh: out.hour, mm: out.minute, ss: out.second, wd };
  }

  function tzOffsetMs(ms, tz) {
    const p = localParts(ms, tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    return asUtc - Math.floor(ms / 1000) * 1000;
  }

  /** Instante UTC correspondente a uma data/hora local no fuso (trata horário de verão). */
  function zonedToUtc(y, m, d, hh, mm, ss, tz) {
    const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0);
    let t = guess - tzOffsetMs(guess, tz);
    const off2 = tzOffsetMs(t, tz);
    const t2 = guess - off2;
    if (t2 !== t) t = t2;
    return t;
  }

  function addDays(y, m, d, n) {
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
  }

  function dateKey(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function isValidDate(y, m, d) {
    if (!(y >= 1970 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /** "08:00" -> 480 minutos. Retorna null se inválido. */
  function parseHHMM(value) {
    const m = String(value || '').trim().match(/^(\d{1,2})[:h](\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]); const mi = Number(m[2]);
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
    return h * 60 + mi;
  }

  /** Lista de feriados digitada (uma por linha, dd/mm/aaaa ou aaaa-mm-dd; texto após a data é ignorado). */
  function parseHolidayLines(text) {
    const dates = [];
    const errors = [];
    String(text || '').split(/\r?\n/).forEach((line, idx) => {
      const s = line.trim();
      if (!s) return;
      let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
      let y; let mo; let d;
      if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; } else {
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
        if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      }
      if (!m || !isValidDate(y, mo, d)) {
        errors.push('Linha ' + (idx + 1) + ': data inválida "' + s.slice(0, 40) + '"');
        return;
      }
      const k = dateKey(y, mo, d);
      if (!dates.includes(k)) dates.push(k);
    });
    dates.sort();
    return { dates, errors };
  }

  /** Janela de expediente [início, fim] (UTC ms) do dia local, ou null se não for dia útil. */
  function workWindow(y, m, d, wd, cfg, holidaySet) {
    if (!cfg.workdays.includes(wd)) return null;
    if (holidaySet.has(dateKey(y, m, d))) return null;
    const s = parseHHMM(cfg.start); const e = parseHHMM(cfg.end);
    if (s === null || e === null || e <= s) return null;
    const ws = zonedToUtc(y, m, d, Math.floor(s / 60), s % 60, 0, cfg.tz);
    const we = e === 1440
      ? zonedToUtc(addDays(y, m, d, 1).y, addDays(y, m, d, 1).m, addDays(y, m, d, 1).d, 0, 0, 0, cfg.tz)
      : zonedToUtc(y, m, d, Math.floor(e / 60), e % 60, 0, cfg.tz);
    return [ws, we];
  }

  function holidaySetOf(cfg) {
    return new Set(cfg.holidays || []);
  }

  /** Tempo de expediente entre dois instantes. */
  function businessMs(a, b, cfg) {
    if (!(b > a)) return 0;
    const hs = holidaySetOf(cfg);
    let p = localParts(a, cfg.tz);
    let day = { y: p.y, m: p.m, d: p.d, wd: p.wd };
    let total = 0;
    for (let i = 0; i < MAX_DAYS; i++) {
      const win = workWindow(day.y, day.m, day.d, day.wd, cfg, hs);
      if (win) {
        const s = Math.max(a, win[0]); const e = Math.min(b, win[1]);
        if (e > s) total += e - s;
        if (win[0] >= b) break;
      } else if (zonedToUtc(day.y, day.m, day.d, 0, 0, 0, cfg.tz) >= b) {
        break;
      }
      day = addDays(day.y, day.m, day.d, 1);
    }
    return total;
  }

  /** Instante após somar "ms" de expediente a partir de "a". null se ultrapassar o limite. */
  function addBusinessMs(a, ms, cfg) {
    if (!(ms > 0)) return a;
    const hs = holidaySetOf(cfg);
    const p = localParts(a, cfg.tz);
    let day = { y: p.y, m: p.m, d: p.d, wd: p.wd };
    let left = ms;
    for (let i = 0; i < MAX_DAYS; i++) {
      const win = workWindow(day.y, day.m, day.d, day.wd, cfg, hs);
      if (win) {
        const s = Math.max(a, win[0]);
        if (win[1] > s) {
          const avail = win[1] - s;
          if (left <= avail) return s + left;
          left -= avail;
        }
      }
      day = addDays(day.y, day.m, day.d, 1);
    }
    return null;
  }

  function durationMs(a, b, cfg) {
    if (!(b > a)) return 0;
    return cfg.mode === 'expediente' ? businessMs(a, b, cfg) : b - a;
  }

  function addDuration(a, ms, cfg) {
    return cfg.mode === 'expediente' ? addBusinessMs(a, ms, cfg) : a + ms;
  }

  /** Início do dia local seguinte (prazo "somente data" vence ao fim do dia). */
  function endOfLocalDay(ms, tz) {
    const p = localParts(ms, tz);
    const n = addDays(p.y, p.m, p.d, 1);
    return zonedToUtc(n.y, n.m, n.d, 0, 0, 0, tz);
  }

  const MONTHS = {
    janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5,
    junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10,
    novembro: 11, nov: 11, dezembro: 12, dez: 12,
    january: 1, february: 2, feb: 2, march: 3, april: 4, apr: 4, may: 5, june: 6, july: 7,
    august: 8, aug: 8, september: 9, sep: 9, october: 10, oct: 10, november: 11, december: 12, dec: 12
  };

  function normalizeDateText(text) {
    return String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function readTime(str) {
    const m = String(str || '').match(/(\d{1,2})[:h](\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const hh = +m[1]; const mm = +m[2]; const ss = m[3] ? +m[3] : 0;
    if (hh > 23 || mm > 59 || ss > 59) return { invalid: true };
    return { hh, mm, ss };
  }

  /**
   * Interpreta datas exibidas no padrão brasileiro.
   * Retorna { ok, ms, dateOnly } ou { ok:false, reason, ambiguous }.
   * - dd/mm/aaaa [hh:mm], dd.mm.aaaa, aaaa-mm-dd[Thh:mm]
   * - "26 de outubro de 2026[, 14:30]", "26 out 2026"
   * - "hoje", "ontem", "amanhã" (+ hora opcional)
   * - Sem ano ("26 de outubro") é ambíguo, exceto se assumeCurrentYear = true.
   * - Mais de uma data distinta no texto é ambíguo.
   */
  function parseBrDate(text, opts) {
    const o = opts || {};
    const tz = o.tz || 'America/Sao_Paulo';
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const raw = String(text || '').trim();
    const s = normalizeDateText(raw);
    if (!s) return { ok: false, reason: 'vazio' };
    const found = [];

    const numRe = /(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})(?:[t ,]*(?:as|a|-)?\s*(\d{1,2}[:h]\d{2}(?::\d{2})?))?/g;
    let m;
    while ((m = numRe.exec(s))) {
      let y; let mo; let d;
      if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; } else if (m[3].length === 4 || m[3].length === 2) {
        d = +m[1]; mo = +m[2]; y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      } else continue;
      if (!isValidDate(y, mo, d)) { found.push({ invalid: true }); continue; }
      found.push({ y, m: mo, d, time: m[4] ? readTime(m[4]) : null });
    }

    const textRe = /(\d{1,2})\s*(?:de\s+)?([a-z]{3,9})\.?(?:\s*(?:de\s+)?(\d{4}))?(?:[ ,]*(?:as|a)?\s*(\d{1,2}[:h]\d{2}))?/g;
    while ((m = textRe.exec(s))) {
      const mo = MONTHS[m[2]];
      if (!mo) continue;
      const d = +m[1];
      if (!m[3]) {
        if (!o.assumeCurrentYear) { found.push({ noYear: true }); continue; }
        const y = localParts(now, tz).y;
        if (!isValidDate(y, mo, d)) { found.push({ invalid: true }); continue; }
        found.push({ y, m: mo, d, time: m[4] ? readTime(m[4]) : null, assumedYear: true });
        continue;
      }
      const y = +m[3];
      if (!isValidDate(y, mo, d)) { found.push({ invalid: true }); continue; }
      found.push({ y, m: mo, d, time: m[4] ? readTime(m[4]) : null });
    }

    const rel = s.match(/\b(hoje|ontem|amanha|today|yesterday|tomorrow)\b(?:[ ,]*(?:as|a|at)?\s*(\d{1,2}[:h]\d{2}))?/);
    if (rel) {
      const offset = { hoje: 0, today: 0, ontem: -1, yesterday: -1, amanha: 1, tomorrow: 1 }[rel[1]];
      const p = localParts(now, tz);
      const dd = addDays(p.y, p.m, p.d, offset);
      found.push({ y: dd.y, m: dd.m, d: dd.d, time: rel[2] ? readTime(rel[2]) : null, relative: true });
    }

    const valid = found.filter((f) => f.y);
    if (!valid.length) {
      if (found.some((f) => f.noYear)) return { ok: false, ambiguous: true, reason: 'data exibida sem ano' };
      if (found.some((f) => f.invalid)) return { ok: false, reason: 'data inválida' };
      return { ok: false, reason: 'nenhuma data reconhecida' };
    }
    const keys = new Set(valid.map((f) => dateKey(f.y, f.m, f.d) + (f.time && !f.time.invalid ? ' ' + f.time.hh + ':' + f.time.mm : '')));
    if (keys.size > 1) return { ok: false, ambiguous: true, reason: 'mais de uma data no mesmo campo' };
    const f = valid[0];
    if (f.time && f.time.invalid) return { ok: false, reason: 'hora inválida' };
    if (f.time) {
      return { ok: true, ms: zonedToUtc(f.y, f.m, f.d, f.time.hh, f.time.mm, f.time.ss, tz), dateOnly: false, assumedYear: !!f.assumedYear };
    }
    return { ok: true, ms: zonedToUtc(f.y, f.m, f.d, 0, 0, 0, tz), dateOnly: true, assumedYear: !!f.assumedYear };
  }

  const displayFormatters = new Map();
  function formatDateTime(ms, tz) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
    const key = tz || 'America/Sao_Paulo';
    let f = displayFormatters.get(key);
    if (!f) {
      f = new Intl.DateTimeFormat('pt-BR', {
        timeZone: key, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      displayFormatters.set(key, f);
    }
    return f.format(new Date(ms)).replace(',', '');
  }

  const api = {
    DAY_MS, isValidTimeZone, localParts, tzOffsetMs, zonedToUtc, addDays, dateKey, isValidDate,
    parseHHMM, parseHolidayLines, businessMs, addBusinessMs, durationMs, addDuration, endOfLocalDay,
    parseBrDate, formatDateTime
  };
  NS.time = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
