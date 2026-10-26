// Motor de SLA: entrada na etapa, visitas, pausas, retorno de etapa, SLA de etapa,
// SLA total do processo e etapa parada. Módulo puro.
import { measure, addMeasure, durationToMinutes, normalizeCalendar } from './time.js';

/** Avalia uma condição de campo do card ({field, op, value}). */
export function matchCondition(card, cond) {
  if (!cond || !cond.field) return false;
  const raw = card.fields ? card.fields[cond.field] : undefined;
  const vals = Array.isArray(raw) ? raw.map(String) : raw == null || raw === '' ? [] : [String(raw)];
  const target = cond.value == null ? '' : String(cond.value);
  const list = target.split(',').map(s => s.trim()).filter(Boolean);
  switch (cond.op) {
    case 'eq': return vals.includes(target);
    case 'neq': return !vals.includes(target);
    case 'in': return vals.some(v => list.includes(v));
    case 'notIn': return !vals.some(v => list.includes(v));
    case 'empty': return vals.length === 0 || vals.every(v => v === '' || v === '0' || v === 'N');
    case 'notEmpty': return vals.length > 0 && vals.some(v => v !== '' && v !== '0' && v !== 'N');
    case 'contains': return vals.some(v => v.toLowerCase().includes(target.toLowerCase()));
    default: return false;
  }
}

/**
 * Reconstrói as visitas às etapas do card.
 * Fontes, em ordem: histórico de etapas (crm.stagehistory.list) → movedTime do card
 * (data de mudança de etapa, não a última alteração genérica) → início do acompanhamento.
 */
export function buildVisits(card, hist, obs, opts = {}, now = Date.now()) {
  const notes = [];
  const useMoved = opts.useMovedTime !== false;
  const h = (hist || []).slice().sort((a, b) => a.time - b.time || a.id - b.id);
  let visits = [];
  let source;
  let partial = false;
  let historyComplete = false;

  if (h.length) {
    for (let i = 0; i < h.length; i++) {
      visits.push({ stageId: h[i].stageId, categoryId: h[i].categoryId, start: h[i].time,
        end: i + 1 < h.length ? h[i + 1].time : null, source: 'historico' });
    }
    // Histórico completo quando começa com o registro de criação (TYPE_ID=1).
    historyComplete = h[0].typeId === 1;
    if (!historyComplete) notes.push('Histórico de etapas não inclui a criação do card; visitas anteriores podem faltar.');
  }

  const last = visits[visits.length - 1];
  if (last && last.stageId === card.stageId) {
    source = 'historico';
  } else {
    if (last) {
      // Histórico desatualizado em relação ao card: fecha a última visita conhecida.
      notes.push('Histórico de etapas ainda não registra a etapa atual.');
      last.end = last.end ?? (card.movedTime || null);
    }
    if (useMoved && card.movedTime) {
      visits.push({ stageId: card.stageId, categoryId: card.categoryId, start: card.movedTime, end: null, source: 'movedTime' });
      source = 'movedTime';
      if (!h.length) notes.push('Sem histórico de etapas: entrada na etapa atual obtida do campo movedTime do card.');
    } else {
      const since = obs && obs.stage && obs.stage.stageId === card.stageId ? obs.stage.since : now;
      visits.push({ stageId: card.stageId, categoryId: card.categoryId, start: since, end: null, source: 'acompanhamento' });
      source = 'acompanhamento';
      partial = true;
      notes.push('Sem data de entrada na etapa: contagem desde o início do acompanhamento pela extensão (cálculo parcial — o tempo real pode ser maior).');
    }
  }

  const current = visits[visits.length - 1];
  // Retorno: a etapa atual tem ordem menor que alguma etapa visitada antes.
  let returned = null;
  if (opts.stageSort && visits.length > 1) {
    const curSort = opts.stageSort[card.stageId];
    for (let i = visits.length - 2; i >= 0; i--) {
      const s = opts.stageSort[visits[i].stageId];
      if (curSort != null && s != null && s > curSort && visits[i].categoryId === card.categoryId) {
        returned = { fromStageId: visits[i].stageId, at: current.start };
        break;
      }
    }
  }
  return { visits, current, source, partial, historyComplete, notes, returned };
}

/** Subtrai intervalos de pausa dos segmentos de contagem. */
export function subtractIntervals(segs, pauses) {
  let out = segs.map(s => [s[0], s[1]]);
  for (const p of pauses) {
    const ps = p[0], pe = p[1];
    const next = [];
    for (const [s, e] of out) {
      if (pe <= s || ps >= e) { next.push([s, e]); continue; }
      if (ps > s) next.push([s, ps]);
      if (pe < e) next.push([pe, e]);
    }
    out = next;
  }
  return out.filter(([s, e]) => e > s);
}

/** Percorre segmentos de contagem e calcula decorrido, vencimento e atraso. */
export function evaluateBudget(segments, budgetMin, mode, cal, now, pausedNow) {
  let acc = 0;
  let deadline = null;
  for (const [s, e] of segments) {
    const m = measure(s, e, mode, cal);
    if (deadline == null && acc + m >= budgetMin) deadline = addMeasure(s, budgetMin - acc, mode, cal);
    acc += m;
  }
  if (deadline == null && !pausedNow) deadline = addMeasure(now, budgetMin - acc, mode, cal);
  const elapsed = acc;
  return {
    elapsed, budget: budgetMin, deadline,
    percent: budgetMin > 0 ? elapsed / budgetMin : 0,
    overdue: Math.max(0, elapsed - budgetMin)
  };
}

function stageRuleFor(rules, card) {
  return (rules || []).find(r => r.enabled !== false && Number(r.entityTypeId) === card.entityTypeId &&
    String(r.categoryId) === String(card.categoryId) && r.stageId === card.stageId);
}

/** SLA da etapa atual. */
export function evalStageSla(card, vis, rules, obs, now, calRaw) {
  const rule = stageRuleFor(rules, card);
  if (!rule) return null;
  const cal = normalizeCalendar(calRaw);
  const notes = [...vis.notes];
  let duration = rule.duration;
  let exception = null;
  for (const ex of rule.exceptions || []) {
    if (matchCondition(card, ex)) { exception = ex; break; }
  }
  if (exception && exception.action === 'ignorar') {
    return { rule, status: 'ignorado', exception, notes: [`Exceção aplicada: ${exception.label || exception.field} — sem SLA.`] };
  }
  if (exception && exception.action === 'prazo') {
    duration = exception.duration;
    notes.push(`Exceção aplicada: ${exception.label || exception.field} — prazo ${exception.duration.value}${exception.duration.unit}.`);
  }
  const mode = rule.mode || 'corrido';
  const budget = durationToMinutes(duration, mode, calRaw);
  if (!(budget > 0)) return null;

  const cur = vis.current;
  const sameStage = vis.visits.filter(v => v.stageId === card.stageId);
  let segs;
  let partial = vis.partial;
  const onReturn = rule.onReturn || 'reiniciar';
  if (onReturn === 'acumular') {
    segs = sameStage.map(v => [v.start, v.end ?? now]);
    if (vis.source !== 'historico' || !vis.historyComplete) {
      if (vis.source !== 'historico') { partial = true; notes.push('Regra "acumular": visitas anteriores a esta etapa não estão disponíveis.'); }
    }
  } else if (onReturn === 'primeira') {
    const first = sameStage[0] || cur;
    segs = [[first.start, now]];
  } else {
    segs = [[cur.start, now]];
  }

  // Pausas observadas (condição por campo), só no período desta contagem.
  const key = `${rule.id}`;
  const pauseList = (obs?.pauses || []).filter(p => p.ruleKey === key).map(p => [p.start, p.end ?? now]);
  const pausedNow = (rule.pause || []).length > 0 && (rule.pause || []).some(c => matchCondition(card, c));
  if ((rule.pause || []).length) {
    notes.push('Pausa por campo registrada a partir da observação da extensão (o Bitrix não fornece histórico de campos).');
  }
  const counting = subtractIntervals(segs, pauseList);
  const ev = evaluateBudget(counting, budget, mode, cal, now, pausedNow);
  const warn = (rule.warnPercent ?? 80) / 100;
  let status = ev.elapsed >= budget ? 'vencido' : (ev.percent >= warn ? 'aviso' : 'ok');
  if (pausedNow && status !== 'vencido') status = 'pausado';
  return { rule, mode, status, ...ev, start: segs[0]?.[0], source: vis.source, partial, pausedNow, exception, notes,
    warnAt: addMeasure(segs[0]?.[0] ?? now, budget * warn, mode, cal) };
}

/** SLA total do processo (por funil). */
export function evalProcessSla(card, vis, rules, now, calRaw) {
  const rule = (rules || []).find(r => r.enabled !== false && Number(r.entityTypeId) === card.entityTypeId &&
    String(r.categoryId) === String(card.categoryId));
  if (!rule) return null;
  const cal = normalizeCalendar(calRaw);
  const mode = rule.mode || 'corrido';
  const budget = durationToMinutes(rule.duration, mode, calRaw);
  if (!(budget > 0)) return null;
  const notes = [];
  let partial = false;
  let start = null;
  const startMode = rule.startMode || 'criacao';
  if (startMode === 'criacao') {
    start = card.createdTime;
    if (start == null) { partial = true; notes.push('Data de criação indisponível.'); }
  } else if (startMode === 'entrada_funil') {
    const v = vis.visits.find(x => String(x.categoryId) === String(card.categoryId) && x.source === 'historico');
    if (v) start = v.start;
    else { start = vis.visits[0]?.start ?? now; partial = true; notes.push('Sem histórico da entrada no funil: usada a primeira entrada conhecida (cálculo parcial).'); }
  } else if (startMode === 'etapa') {
    const v = vis.visits.find(x => x.stageId === rule.startStageId);
    if (v) { start = v.start; if (v.source === 'acompanhamento') partial = true; }
    else {
      return { rule, mode, status: 'nao_iniciado', notes: ['O card ainda não passou (ou não há registro) pela etapa que inicia o SLA do processo.'] };
    }
  }
  if (start == null) start = now;
  const pauseStages = new Set(rule.pauseStages || []);
  const pauseIntervals = vis.visits.filter(v => pauseStages.has(v.stageId)).map(v => [v.start, v.end ?? now]);
  if (pauseStages.size && vis.source !== 'historico') {
    partial = true;
    notes.push('Sem histórico completo: o tempo em etapas de pausa anteriores não pôde ser descontado (o decorrido pode estar superestimado).');
  }
  const pausedNow = pauseStages.has(card.stageId);
  const counting = subtractIntervals([[start, now]], pauseIntervals);
  const ev = evaluateBudget(counting, budget, mode, cal, now, pausedNow);
  const warn = (rule.warnPercent ?? 80) / 100;
  let status = ev.elapsed >= budget ? 'vencido' : (ev.percent >= warn ? 'aviso' : 'ok');
  if (pausedNow && status !== 'vencido') status = 'pausado';
  return { rule, mode, status, ...ev, start, partial: partial || vis.partial, pausedNow, notes };
}

/** Card parado na mesma etapa além do limite. */
export function evalStagnation(card, vis, rules, now, calRaw) {
  const list = (rules || []).filter(r => r.enabled !== false && Number(r.entityTypeId) === card.entityTypeId &&
    String(r.categoryId) === String(card.categoryId));
  const rule = list.find(r => r.stageId === card.stageId) || list.find(r => !r.stageId || r.stageId === '*');
  if (!rule) return null;
  const mode = rule.mode || 'corrido';
  const limit = durationToMinutes(rule.limit, mode, calRaw);
  if (!(limit > 0)) return null;
  const start = vis.current.start;
  const elapsed = measure(start, now, mode, normalizeCalendar(calRaw));
  return { rule, mode, start, elapsed, limit, exceeded: elapsed >= limit, overdue: Math.max(0, elapsed - limit),
    deadline: addMeasure(start, limit, mode, normalizeCalendar(calRaw)), partial: vis.partial, source: vis.source };
}

/**
 * Atualiza as observações (início de acompanhamento e pausas por campo) com o estado atual.
 * Retorna a nova observação (não muta a recebida).
 */
export function updateObservation(card, obs, stageRules, now) {
  const o = obs ? JSON.parse(JSON.stringify(obs)) : { firstSeen: now, stage: null, pauses: [] };
  if (!o.stage || o.stage.stageId !== card.stageId) {
    o.stage = { stageId: card.stageId, since: now };
    // fecha pausas abertas da etapa anterior
    for (const p of o.pauses) if (p.end == null) p.end = now;
  }
  const rule = stageRuleFor(stageRules, card);
  if (rule && (rule.pause || []).length) {
    const key = `${rule.id}`;
    const paused = rule.pause.some(c => matchCondition(card, c));
    const open = o.pauses.find(p => p.ruleKey === key && p.end == null);
    if (paused && !open) o.pauses.push({ ruleKey: key, start: now, end: null });
    if (!paused && open) open.end = now;
  }
  // mantém apenas pausas recentes (90 dias)
  o.pauses = o.pauses.filter(p => p.end == null || now - p.end < 90 * 86400000).slice(-50);
  return o;
}
