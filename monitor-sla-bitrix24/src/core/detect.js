// Detecção de alertas por card. Cada indicador é avaliado separadamente;
// um card pode ter vários alertas. Módulo puro.
import { buildVisits, evalStageSla, evalProcessSla, evalStagnation } from './sla.js';
import { lastRelevantInteraction, classifyOpenActivities, providerLabel } from './interactions.js';
import { fmtMinutes, zonedParts, zonedToUtc, measure, durationToMinutes, normalizeCalendar, parseBitrixDate } from './time.js';

export const ALERT_TYPES = {
  prazo_vencido:        { label: 'Prazo do card vencido',            group: 'atraso',        overdue: true },
  atividade_vencida:    { label: 'Atividade pendente vencida',       group: 'atraso',        overdue: true },
  sla_etapa_vencido:    { label: 'SLA da etapa vencido',             group: 'atraso',        overdue: true, sla: true },
  sla_processo_vencido: { label: 'SLA total do processo vencido',    group: 'atraso',        overdue: true, sla: true },
  parado_etapa:         { label: 'Parado na etapa além do limite',   group: 'atraso',        overdue: true },
  sem_atividade_futura: { label: 'Sem atividade futura agendada',    group: 'acompanhamento' },
  sem_interacao:        { label: 'Sem interação relevante',          group: 'acompanhamento' },
  sla_etapa_proximo:    { label: 'SLA da etapa próximo do vencimento', group: 'aviso' },
  sla_processo_proximo: { label: 'SLA do processo próximo do vencimento', group: 'aviso' },
  prazo_proximo:        { label: 'Prazo do card próximo',            group: 'aviso' }
};

export function cardLink(portalUrl, card, cardTypes) {
  if (!portalUrl) return null;
  const base = portalUrl.replace(/\/+$/, '');
  const custom = cardTypes?.[card.entityTypeId]?.linkPath;
  if (custom) return `${base}${custom.replace('{id}', card.id)}`;
  if (card.entityTypeId === 2) return `${base}/crm/deal/details/${card.id}/`;
  if (card.entityTypeId === 1) return `${base}/crm/lead/details/${card.id}/`;
  return `${base}/crm/type/${card.entityTypeId}/details/${card.id}/`;
}

function fmtDate(ts, tz) {
  if (ts == null) return '—';
  const p = zonedParts(ts, tz);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(p.d)}/${pad(p.m)}/${p.y} ${pad(p.hh)}:${pad(p.mm)}`;
}

function durText(d) {
  if (!d) return '';
  const u = { min: 'min', h: 'h', d: d.value == 1 ? ' dia' : ' dias' }[d.unit] || d.unit;
  return `${d.value}${u}`;
}

const SOURCE_TEXT = {
  historico: 'histórico de etapas do Bitrix',
  movedTime: 'campo movedTime do card (data da mudança de etapa)',
  acompanhamento: 'início do acompanhamento pela extensão (parcial)'
};

/** Prazo definido em campo do card (configurável por tipo de entidade). */
function deadlineFromField(card, dfCfg, tz) {
  if (!dfCfg || !dfCfg.field) return null;
  const raw = card.fields?.[dfCfg.field];
  if (!raw) return null;
  // Campos só-data: o prazo termina no fim do dia, no fuso configurado.
  if (dfCfg.type === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return zonedToUtc(+m[1], +m[2], +m[3], 23, 59, tz) + 59000;
  }
  return parseBitrixDate(raw);
}

/**
 * Analisa um card e devolve alertas e evidências.
 */
export function analyzeCard(ctx) {
  const { card, hist, obs, activities, comments, meta, config, now } = ctx;
  const cal = config.calendar || {};
  const tz = cal.timezone || 'America/Sao_Paulo';
  const ncal = normalizeCalendar(cal);
  const stageSort = {};
  for (const [k, s] of Object.entries(meta.stages || {})) {
    if (k.startsWith(card.entityTypeId + ':')) stageSort[s.statusId] = s.sort;
  }
  const vis = buildVisits(card, hist, obs, { useMovedTime: config.useMovedTime !== false, stageSort }, now);
  const alerts = [];
  const push = (type, data) => {
    alerts.push({ key: `${card.key}|${type}|${data.ref ?? ''}`, cardKey: card.key, type,
      title: ALERT_TYPES[type].label, group: ALERT_TYPES[type].group, ...data });
  };

  // 1. Prazo definido em campo do card
  const dfCfg = config.deadlineFields?.[card.entityTypeId];
  const due = deadlineFromField(card, dfCfg, tz);
  if (due != null) {
    if (due < now) {
      const od = (now - due) / 60000;
      push('prazo_vencido', { ref: dfCfg.field, deadline: due, overdueMin: od, overdueText: fmtMinutes(od, 'corrido'), mode: 'corrido',
        reason: `Campo "${dfCfg.label || dfCfg.field}" venceu em ${fmtDate(due, tz)}.`, limitText: fmtDate(due, tz) });
    } else if (dfCfg.warnHours > 0 && due - now <= dfCfg.warnHours * 3600000) {
      push('prazo_proximo', { ref: dfCfg.field, deadline: due, overdueMin: 0, mode: 'corrido',
        reason: `Campo "${dfCfg.label || dfCfg.field}" vence em ${fmtMinutes((due - now) / 60000, 'corrido')}.`, limitText: fmtDate(due, tz) });
    }
  }

  // 2. Atividades pendentes vencidas
  const act = classifyOpenActivities(activities, now);
  if (act.overdue.length) {
    const first = act.overdue[0];
    const od = (now - first.deadline) / 60000;
    push('atividade_vencida', { ref: first.id, deadline: first.deadline, overdueMin: od, overdueText: fmtMinutes(od, 'corrido'), mode: 'corrido',
      count: act.overdue.length,
      reason: `${act.overdue.length} atividade(s) aberta(s) com prazo ultrapassado. Mais antiga: ${providerLabel(first.providerId)}${first.subject ? ` "${first.subject}"` : ''}, prazo ${fmtDate(first.deadline, tz)}.`,
      limitText: fmtDate(first.deadline, tz),
      items: act.overdue.slice(0, 5).map(a => ({ id: a.id, label: `${providerLabel(a.providerId)}${a.subject ? ` "${a.subject}"` : ''}`, deadline: a.deadline, responsibleId: a.responsibleId })) });
  }

  // 3. SLA da etapa
  const stageSla = evalStageSla(card, vis, config.slaRules, obs, now, cal);
  if (stageSla && (stageSla.status === 'vencido' || stageSla.status === 'aviso')) {
    const r = stageSla.rule;
    const base = {
      ref: `${card.stageId}@${stageSla.start}`, deadline: stageSla.deadline, mode: stageSla.mode, partial: stageSla.partial,
      percent: stageSla.percent, notes: stageSla.notes,
      limitText: `${durText(stageSla.exception?.action === 'prazo' ? stageSla.exception.duration : r.duration)} ${stageSla.mode === 'util' ? 'em horário comercial' : 'corridos'} (vence ${fmtDate(stageSla.deadline, tz)})`
    };
    if (stageSla.status === 'vencido') {
      push('sla_etapa_vencido', { ...base, overdueMin: stageSla.overdue, overdueText: fmtMinutes(stageSla.overdue, stageSla.mode),
        reason: `Na etapa há ${fmtMinutes(stageSla.elapsed, stageSla.mode)} (${Math.round(stageSla.percent * 100)}% do SLA). Entrada: ${fmtDate(stageSla.start, tz)}, fonte: ${SOURCE_TEXT[stageSla.source]}.${stageSla.pausedNow ? ' Card em pausa agora.' : ''}` });
    } else {
      push('sla_etapa_proximo', { ...base, overdueMin: 0,
        reason: `${Math.round(stageSla.percent * 100)}% do SLA consumido (alerta a partir de ${r.warnPercent ?? 80}%). Vence ${fmtDate(stageSla.deadline, tz)}.` });
    }
  }

  // 4. SLA total do processo
  const procSla = evalProcessSla(card, vis, config.processRules, now, cal);
  if (procSla && (procSla.status === 'vencido' || procSla.status === 'aviso')) {
    const r = procSla.rule;
    const base = { ref: `${card.categoryId}@${procSla.start}`, deadline: procSla.deadline, mode: procSla.mode, partial: procSla.partial,
      percent: procSla.percent, notes: procSla.notes,
      limitText: `${durText(r.duration)} ${procSla.mode === 'util' ? 'em horário comercial' : 'corridos'} desde ${fmtDate(procSla.start, tz)}` };
    if (procSla.status === 'vencido') {
      push('sla_processo_vencido', { ...base, overdueMin: procSla.overdue, overdueText: fmtMinutes(procSla.overdue, procSla.mode),
        reason: `Processo em andamento há ${fmtMinutes(procSla.elapsed, procSla.mode)} (${Math.round(procSla.percent * 100)}% do SLA total)${(r.pauseStages || []).length ? ', descontadas as etapas de pausa' : ''}.` });
    } else {
      push('sla_processo_proximo', { ...base, overdueMin: 0,
        reason: `${Math.round(procSla.percent * 100)}% do SLA total consumido. Vence ${fmtDate(procSla.deadline, tz)}.` });
    }
  }

  // 5. Parado na mesma etapa
  const stag = evalStagnation(card, vis, config.stagnationRules, now, cal);
  if (stag && stag.exceeded) {
    push('parado_etapa', { ref: `${card.stageId}@${stag.start}`, deadline: stag.deadline, mode: stag.mode, partial: stag.partial,
      overdueMin: stag.overdue, overdueText: fmtMinutes(stag.overdue, stag.mode),
      limitText: `${durText(stag.rule.limit)} ${stag.mode === 'util' ? 'úteis' : 'corridos'} na mesma etapa`,
      reason: `Na etapa desde ${fmtDate(stag.start, tz)} (${fmtMinutes(stag.elapsed, stag.mode)}), fonte: ${SOURCE_TEXT[stag.source]}.` });
  }

  // 6. Sem atividade futura agendada
  const nfa = (config.noFutureActivityRules || []).find(r => r.enabled !== false && Number(r.entityTypeId) === card.entityTypeId &&
    String(r.categoryId) === String(card.categoryId));
  if (nfa && !(nfa.excludeStages || []).includes(card.stageId) && !act.next) {
    const extra = act.noDeadline.length ? ` Há ${act.noDeadline.length} atividade(s) aberta(s) sem prazo, que não contam como agendamento.` : '';
    const overdueTxt = act.overdue.length ? ` As ${act.overdue.length} atividade(s) abertas já estão vencidas.` : '';
    push('sem_atividade_futura', { ref: card.stageId, overdueMin: 0, mode: 'corrido',
      reason: `Nenhuma atividade aberta com prazo futuro.${overdueTxt}${extra}`, limitText: 'Ao menos 1 atividade futura' });
  }

  // 7. Sem interação relevante
  const li = lastRelevantInteraction(card, activities, comments, config.interaction, now);
  const nir = (config.noInteractionRules || []).find(r => r.enabled !== false && Number(r.entityTypeId) === card.entityTypeId &&
    String(r.categoryId) === String(card.categoryId));
  if (nir && !(nir.excludeStages || []).includes(card.stageId)) {
    const mode = nir.mode || 'corrido';
    const limit = durationToMinutes(nir.limit, mode, cal);
    const lookbackStart = ctx.lookbackStart || null;
    let base, baseText, lowerBound = false;
    if (li.last) { base = li.last.time; baseText = `última interação relevante em ${fmtDate(base, tz)} (${li.last.desc})`; }
    else if (card.createdTime && (!lookbackStart || card.createdTime >= lookbackStart)) { base = card.createdTime; baseText = `nenhuma interação relevante desde a criação (${fmtDate(base, tz)})`; }
    else { base = lookbackStart || card.createdTime; lowerBound = true; baseText = `nenhuma interação relevante no período consultado (desde ${fmtDate(base, tz)})`; }
    const elapsed = measure(base, now, mode, ncal);
    if (limit > 0 && elapsed >= limit) {
      const od = elapsed - limit;
      push('sem_interacao', { ref: String(base), overdueMin: od, overdueText: (lowerBound ? 'mais de ' : '') + fmtMinutes(od, mode), mode, partial: lowerBound,
        limitText: `${durText(nir.limit)} ${mode === 'util' ? 'úteis' : 'corridos'} sem interação`,
        reason: `Sem acompanhamento: ${baseText}.`,
        evidence: { used: li.last, ignored: li.ignored } });
    }
  }

  return {
    key: card.key, vis, alerts, stageSla, procSla, stagnation: stag,
    lastInteraction: li.last, ignoredEvidence: li.ignored,
    nextActivity: act.next, openOverdue: act.overdue.length, openNoDeadline: act.noDeadline.length
  };
}
