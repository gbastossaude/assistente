// Estudo dos cards encerrados: concluídos (etapa de sucesso) e cancelados (etapa de falha).
// Módulo puro: recebe os cards encerrados já lidos do Bitrix24 e calcula indicadores por período.
// Só fatos calculados — sem atribuir causa ou culpa.
import { commercialOfCard, effectiveMonitored } from './config.js';
import { calendarDaysBetween, zonedParts, zonedToUtc } from './time.js';
import { periodRange } from './meetings.js';
import { cardLink } from './detect.js';

export const DEFAULT_CLOSED_STUDY = {
  enabled: true,
  lookbackDays: 180,   // encerrados nos últimos N dias são lidos
  reasonFields: {}     // { [entityTypeId]: { field, label } } — campo "motivo"; vazio = detecção automática
};

export const CLOSED_PERIODS = [
  ['30d', 'Últimos 30 dias'], ['90d', 'Últimos 90 dias'], ['180d', 'Últimos 180 dias'], ['mes', 'Este mês'], ['mes_anterior', 'Mês anterior']
];

export function closedConfig(config) {
  return { ...DEFAULT_CLOSED_STUDY, ...(config?.closedStudy || {}) };
}

/** Campo com o motivo do cancelamento/perda: escolhido pelo usuário ou detectado pelo nome ("Motivo…"). */
export function reasonFieldFor(config, meta, etid) {
  const chosen = closedConfig(config).reasonFields?.[etid];
  if (chosen && chosen.field === '') return null;
  if (chosen?.field) return { field: chosen.field, label: chosen.label || chosen.field, auto: false };
  const fields = meta?.fields?.[etid];
  if (!fields) return null;
  const hits = Object.entries(fields).filter(([k, f]) => /motivo/i.test(`${f.title || ''} ${k}`) && !['user', 'date', 'datetime'].includes(f.type))
    .sort((a, b) => /perd|cancel/i.test(b[1].title || '') - /perd|cancel/i.test(a[1].title || ''));
  return hits.length ? { field: hits[0][0], label: hits[0][1].title || hits[0][0], auto: true } : null;
}

/** Valor legível do motivo (lista → texto do item). */
export function reasonText(card, rf, meta) {
  if (!rf) return null;
  const raw = card.fields?.[rf.field];
  const vals = [].concat(raw ?? []).filter(v => v !== '' && v != null && v !== false);
  if (!vals.length) return null;
  const items = meta?.fields?.[card.entityTypeId]?.[rf.field]?.items;
  return vals.map(v => (items ? (items.find(i => String(i.id) === String(v))?.value ?? String(v)) : String(v))).join(', ').slice(0, 120);
}

const stats = list => {
  if (!list.length) return { media: null, mediana: null, n: 0 };
  const s = list.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return { media: s.reduce((a, b) => a + b, 0) / s.length, mediana: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2, n: s.length };
};

const addMoney = (map, c) => { if (c.opportunity > 0) map[c.currency] = (map[c.currency] || 0) + c.opportunity; };

function group(items, keyFn, nameFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    const e = m.get(k) || { key: k, name: nameFn(it), concluidos: 0, cancelados: 0, valorConcluido: {}, valorCancelado: {}, ciclos: [] };
    if (it.type === 'concluido') { e.concluidos++; addMoney(e.valorConcluido, it); if (it.cycleDays != null) e.ciclos.push(it.cycleDays); }
    else { e.cancelados++; addMoney(e.valorCancelado, it); }
    m.set(k, e);
  }
  return [...m.values()].map(e => {
    const total = e.concluidos + e.cancelados;
    return { key: e.key, name: e.name, concluidos: e.concluidos, cancelados: e.cancelados, total,
      taxa: total ? e.concluidos / total : null, valorConcluido: e.valorConcluido, valorCancelado: e.valorCancelado, cicloMedio: stats(e.ciclos).media };
  }).sort((a, b) => b.total - a.total || b.concluidos - a.concluidos || a.name.localeCompare(b.name, 'pt-BR'));
}

function count(items, keyFn) {
  const m = new Map();
  for (const it of items) { const k = keyFn(it); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'pt-BR'));
}

const pct = v => `${Math.round(v * 100)}%`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function summarize(items, totals, byCommercial, lostByStage, byReason) {
  const out = [];
  const n = items.length;
  if (!n) return ['Nenhum card encerrado no período.'];
  out.push(`${plural(n, 'card encerrado', 'cards encerrados')}: ${plural(totals.concluidos, 'concluído', 'concluídos')} e ${plural(totals.cancelados, 'cancelado', 'cancelados')}` +
    (totals.taxa != null ? ` — taxa de conclusão de ${pct(totals.taxa)}.` : '.'));
  if (totals.cicloConcluido.n) out.push(`Os concluídos levaram em média ${Math.round(totals.cicloConcluido.media)} dia(s) da criação ao encerramento (mediana ${Math.round(totals.cicloConcluido.mediana)}).`);
  if (totals.cicloCancelado.n) out.push(`Os cancelados ficaram em média ${Math.round(totals.cicloCancelado.media)} dia(s) abertos antes do cancelamento.`);
  const topStage = lostByStage.find(x => x.name !== 'Etapa anterior não identificada');
  if (topStage && topStage.n >= 2) out.push(`Etapa em que mais cards foram cancelados: ${topStage.name} (${topStage.n}).`);
  if (byReason[0] && byReason[0].n >= 2) out.push(`Motivo/etapa final mais frequente nos cancelados: ${byReason[0].name} (${byReason[0].n}).`);
  const elig = byCommercial.filter(x => x.total >= 3 && x.key !== '-');
  if (elig.length >= 2) {
    const best = elig.slice().sort((a, b) => b.taxa - a.taxa || b.total - a.total)[0];
    out.push(`Maior taxa de conclusão entre comerciais com 3 ou mais encerrados: ${best.name} (${pct(best.taxa)} de ${best.total}).`);
  }
  return out;
}

/** Estudo completo: todos os períodos, distribuições, evolução mensal e lista dos encerrados. */
export function buildClosedStudy(ds, config, now = Date.now()) {
  const cfg = closedConfig(config);
  const meta = ds.meta || {};
  const tz = config.calendar?.timezone || 'America/Sao_Paulo';
  const scope = new Set(effectiveMonitored(config, meta).flatMap(m => m.categoryIds.map(c => `${Number(m.entityTypeId)}:${Number(c)}`)));
  const windowStart = ds.sync?.closedWindowStart || now - cfg.lookbackDays * 86400000;
  const userName = id => (meta.users?.[id]?.name) || (id ? `Usuário #${id}` : 'Sem assessor');

  const items = [];
  let foraDoEscopo = 0;
  for (const c of Object.values(ds.closed || {})) {
    if (!scope.has(`${c.entityTypeId}:${c.categoryId}`)) { foraDoEscopo++; continue; }
    if (c.closedTime == null || c.closedTime < windowStart) continue;
    const com = commercialOfCard(c, config, meta);
    const st = meta.stages || {};
    const rf = reasonFieldFor(config, meta, c.entityTypeId);
    items.push({
      key: c.key, id: c.id, entityTypeId: c.entityTypeId, title: c.title || `#${c.id}`, link: cardLink(ds.portalUrl, c, config.cardTypes),
      type: c.semantic === 'S' ? 'concluido' : 'cancelado',
      funnelKey: `${c.entityTypeId}:${c.categoryId}`,
      funnelName: `${meta.categories?.[`${c.entityTypeId}:${c.categoryId}`]?.name || `Funil ${c.categoryId}`}`,
      finalStageName: st[`${c.entityTypeId}:${c.stageId}`]?.name || c.stageId,
      prevStageName: c.prevStageId ? (st[`${c.entityTypeId}:${c.prevStageId}`]?.name || c.prevStageId) : null,
      assessorId: c.assignedById, assessorName: userName(c.assignedById),
      commercialKey: com.ids.join(',') || '-', commercialName: com.name || (com.ids.length ? com.ids.map(userName).join(', ') : 'Sem comercial'),
      commercialEmail: com.email || null,
      opportunity: Number(c.opportunity) || 0, currency: c.currencyId || 'BRL',
      createdTime: c.createdTime ?? null, closedTime: c.closedTime, closedTimeSource: c.closedTimeSource || null,
      cycleDays: c.createdTime != null ? calendarDaysBetween(c.createdTime, c.closedTime, tz) : null,
      reason: reasonText(c, rf, meta)
    });
  }
  items.sort((a, b) => b.closedTime - a.closedTime);

  const periods = {};
  for (const [pid, label] of CLOSED_PERIODS) {
    const m = /^(\d+)d$/.exec(pid);
    const { from, to } = m ? { from: now - Number(m[1]) * 86400000, to: now + 1 } : periodRange(pid, now, tz);
    const list = items.filter(it => it.closedTime >= from && it.closedTime < to);
    const done = list.filter(it => it.type === 'concluido'), lost = list.filter(it => it.type === 'cancelado');
    const totals = {
      concluidos: done.length, cancelados: lost.length, taxa: list.length ? done.length / list.length : null,
      valorConcluido: done.reduce((mm, c) => (addMoney(mm, c), mm), {}), valorCancelado: lost.reduce((mm, c) => (addMoney(mm, c), mm), {}),
      cicloConcluido: stats(done.map(x => x.cycleDays).filter(x => x != null)), cicloCancelado: stats(lost.map(x => x.cycleDays).filter(x => x != null))
    };
    const byCommercial = group(list, it => it.commercialKey, it => it.commercialName);
    const lostByStage = count(lost, it => it.prevStageName || 'Etapa anterior não identificada');
    const byReason = count(lost, it => it.reason || it.finalStageName);
    periods[pid] = {
      label, from, to: Math.min(to, now), totals, byCommercial,
      byAssessor: group(list, it => String(it.assessorId || '-'), it => it.assessorName),
      byFunnel: group(list, it => it.funnelKey, it => it.funnelName),
      lostByStage, byReason, summary: summarize(list, totals, byCommercial, lostByStage, byReason),
      partialWindow: from < windowStart - 60000
    };
  }

  // Evolução mensal (últimos 6 meses, no fuso)
  const p = zonedParts(now, tz);
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    let y = p.y, mo = p.m - i;
    while (mo < 1) { mo += 12; y--; }
    const from = zonedToUtc(y, mo, 1, 0, 0, tz);
    const to = mo === 12 ? zonedToUtc(y + 1, 1, 1, 0, 0, tz) : zonedToUtc(y, mo + 1, 1, 0, 0, tz);
    const list = items.filter(it => it.closedTime >= from && it.closedTime < to);
    monthly.push({ label: `${String(mo).padStart(2, '0')}/${y}`, concluidos: list.filter(x => x.type === 'concluido').length,
      cancelados: list.filter(x => x.type === 'cancelado').length, partial: from < windowStart - 60000 });
  }

  const rfs = effectiveMonitored(config, meta).map(m => reasonFieldFor(config, meta, Number(m.entityTypeId))).filter(Boolean);
  return {
    enabled: cfg.enabled !== false, generatedAt: now, windowStart, lookbackDays: cfg.lookbackDays, periods, monthly,
    items: items.slice(0, 2000),
    coverage: { total: items.length, foraDoEscopo, prevStageKnown: items.filter(x => x.prevStageName).length,
      reasonField: rfs[0]?.label || null, fromHistory: items.filter(x => x.closedTimeSource === 'historico').length }
  };
}
