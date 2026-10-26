// Ranking automático de reuniões. Módulo puro: recebe as reuniões já lidas do Bitrix24 e monta o
// ranking por período e por agrupamento. Recalculado a cada sincronização, sem nenhuma ação manual.
import { zonedParts, zonedToUtc, isSentinelDeadline } from './time.js';
import { commercialOfCard, effectiveMonitored, nameFromEmail } from './config.js';

export const DEFAULT_MEETINGS = {
  enabled: true,
  providers: ['CRM_MEETING'],          // tipos de atividade que são reunião
  todoKeywords: ['reunião', 'reuniao'], // atividades "A fazer" com estas palavras no assunto também contam
  lookbackDays: 70,                    // janela lida (cobre o mês anterior inteiro); agendadas futuras sempre entram
  includeClosed: true,                 // conta reuniões de cards já ganhos/perdidos
  groupBy: 'comercial'                 // padrão de exibição
};

export const PERIODS = [
  ['hoje', 'Hoje'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['mes_anterior', 'Mês anterior'], ['30d', 'Últimos 30 dias']
];

export const GROUPS = [
  ['comercial', 'Comercial (especialista)'], ['responsavel_reuniao', 'Responsável pela reunião'], ['responsavel_card', 'Assessor do card']
];

export function meetingConfig(config) {
  return { ...DEFAULT_MEETINGS, ...(config?.meetings || {}) };
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A atividade (formato da API ou normalizado) é uma reunião segundo a configuração? */
export function isMeeting(a, cfg) {
  const prov = a.providerId ?? a.PROVIDER_ID;
  if ((cfg.providers || []).includes(prov)) return true;
  if (prov === 'CRM_TODO' && (cfg.todoKeywords || []).length) {
    const subj = norm(a.subject ?? a.SUBJECT);
    return cfg.todoKeywords.some(k => norm(k).trim() && subj.includes(norm(k).trim()));
  }
  return false;
}

/** Horário da reunião: início, senão prazo (quando real), senão criação. */
export function meetingTime(m) {
  if (m.start) return m.start;
  if (m.deadline && !isSentinelDeadline(m.deadline)) return m.deadline;
  return m.created ?? null;
}

/** Intervalo [from, to) do período no fuso configurado. */
export function periodRange(period, now, tz) {
  const p = zonedParts(now, tz);
  const day = (y, m, d) => zonedToUtc(y, m, d, 0, 0, tz);
  const shift = (y, m, d, n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
  switch (period) {
    case 'hoje': return { from: day(p.y, p.m, p.d), to: day(...shift(p.y, p.m, p.d, 1)) };
    case 'semana': {
      const back = (p.weekday + 6) % 7; // semana de segunda a domingo
      const mon = shift(p.y, p.m, p.d, -back);
      return { from: day(...mon), to: day(...shift(...mon, 7)) };
    }
    case 'mes': return { from: day(p.y, p.m, 1), to: p.m === 12 ? day(p.y + 1, 1, 1) : day(p.y, p.m + 1, 1) };
    case 'mes_anterior': return { from: p.m === 1 ? day(p.y - 1, 12, 1) : day(p.y, p.m - 1, 1), to: day(p.y, p.m, 1) };
    default: return { from: now - 30 * 86400000, to: now };
  }
}

function userName(meta, id) {
  const u = meta.users?.[id];
  return u ? u.name : (id ? `Usuário #${id}` : 'Sem identificação');
}

/**
 * Monta os rankings de todos os períodos e agrupamentos.
 * ds.meetings: { "<etid>:<activityId>": reunião normalizada }; ds.meetingOwners: dados mínimos dos cards
 * que não estão abertos no cache (encerrados), para saber funil, responsável e comercial.
 */
export function buildMeetingRankings(ds, config, now = Date.now()) {
  const cfg = meetingConfig(config);
  const meta = ds.meta || {};
  const tz = config.calendar?.timezone || 'America/Sao_Paulo';
  const scope = new Map();
  const monitored = effectiveMonitored(config, meta);
  for (const m of monitored) scope.set(Number(m.entityTypeId), new Set(m.categoryIds.map(Number)));
  const coverage = { total: 0, foraDoEscopo: 0, encerrados: 0, semCard: 0, semData: 0, windowStart: ds.sync?.meetingsWindowStart || null };

  const items = [];
  for (const m of Object.values(ds.meetings || {})) {
    coverage.total++;
    const key = `${m.ownerTypeId}:${m.ownerId}`;
    const owner = ds.cards?.[key] || ds.meetingOwners?.[key];
    if (!owner) { coverage.semCard++; continue; }
    const cats = scope.get(Number(m.ownerTypeId));
    if (!cats || !cats.has(Number(owner.categoryId))) { coverage.foraDoEscopo++; continue; }
    const closed = !ds.cards?.[key];
    if (closed && !cfg.includeClosed) continue;
    if (closed) coverage.encerrados++;
    const time = meetingTime(m);
    if (time == null) { coverage.semData++; continue; }
    items.push({ m, key, time, owner, commercialIds: commercialOfCard(owner, config, meta, Number(m.ownerTypeId)).ids });
  }

  const groupKeys = {
    comercial: it => (it.commercialIds.length ? it.commercialIds : ['-']),
    responsavel_reuniao: it => [it.m.responsibleId || '-'],
    responsavel_card: it => [it.owner.assignedById || '-']
  };
  const nameOf = id => (id === '-' ? 'Sem identificação' : id.startsWith('email:') ? nameFromEmail(id.slice(6)) : userName(meta, id));

  const periods = {};
  for (const [pid, label] of PERIODS) {
    const { from, to } = periodRange(pid, now, tz);
    const inPeriod = items.filter(it => it.time >= from && it.time < to);
    const byGroup = {};
    for (const [gid] of GROUPS) {
      const rows = new Map();
      for (const it of inPeriod) {
        for (const uid of groupKeys[gid](it)) {
          const r = rows.get(uid) || { key: uid, name: nameOf(uid), realizadas: 0, agendadas: 0, pendentes: 0, cards: new Set() };
          if (it.m.completed) r.realizadas++;
          else if (it.time >= now) r.agendadas++;
          else r.pendentes++;
          r.cards.add(it.key);
          rows.set(uid, r);
        }
      }
      const list = [...rows.values()].map(r => ({ ...r, cards: r.cards.size, total: r.realizadas + r.agendadas + r.pendentes }))
        .sort((a, b) => b.realizadas - a.realizadas || b.agendadas - a.agendadas || a.pendentes - b.pendentes || a.name.localeCompare(b.name, 'pt-BR'));
      // posição com empate: mesma posição para o mesmo número de realizadas e agendadas
      list.forEach((r, i) => {
        const prev = list[i - 1];
        r.pos = prev && prev.realizadas === r.realizadas && prev.agendadas === r.agendadas ? prev.pos : i + 1;
      });
      byGroup[gid] = list;
    }
    const totals = { realizadas: 0, agendadas: 0, pendentes: 0 };
    for (const it of inPeriod) {
      if (it.m.completed) totals.realizadas++; else if (it.time >= now) totals.agendadas++; else totals.pendentes++;
    }
    periods[pid] = { label, from, to, byGroup, totals, partialWindow: !!(coverage.windowStart && from < coverage.windowStart) };
  }
  return { generatedAt: now, config: { providers: cfg.providers, todoKeywords: cfg.todoKeywords, lookbackDays: cfg.lookbackDays, includeClosed: cfg.includeClosed },
    periods, coverage, enabled: cfg.enabled };
}

/** Reunião normalizada a partir do formato da API (sem assunto: só o necessário para contar). */
export function normalizeMeeting(raw, parseDate) {
  return {
    id: Number(raw.ID), ownerTypeId: Number(raw.OWNER_TYPE_ID), ownerId: Number(raw.OWNER_ID), providerId: raw.PROVIDER_ID || null,
    completed: raw.COMPLETED === 'Y' || raw.COMPLETED === true,
    start: parseDate(raw.START_TIME), deadline: parseDate(raw.DEADLINE), created: parseDate(raw.CREATED),
    responsibleId: raw.RESPONSIBLE_ID != null ? String(raw.RESPONSIBLE_ID) : null, authorId: raw.AUTHOR_ID != null ? String(raw.AUTHOR_ID) : null
  };
}
