// Orquestra a análise: alertas por card, prioridade, indicadores, distribuições,
// resumo operacional e métricas históricas (somente quando há dados suficientes).
import { analyzeCard, cardLink, ALERT_TYPES } from './detect.js';
import { scoreCard, valueThreshold, mergePriority, LEVEL_LABEL } from './priority.js';
import { normalizeCalendar, measure, durationToMinutes, calendarDaysBetween } from './time.js';
import { effectiveMonitored, commercialOfCard } from './config.js';
import { buildMeetingRankings } from './meetings.js';

const LEVEL_ORDER = { critica: 0, alta: 1, media: 2, baixa: 3 };

function userName(meta, id) {
  const u = meta.users?.[id];
  return u ? u.name : (id ? `Usuário #${id}` : 'Sem assessor');
}

function teamsOf(meta, config, userId) {
  const out = [];
  for (const t of config.teams || []) if ((t.userIds || []).map(String).includes(String(userId))) out.push(t.name);
  for (const d of meta.users?.[userId]?.departments || []) {
    const dep = meta.departments?.[d];
    if (dep) out.push(dep.name);
  }
  return [...new Set(out)];
}

/** Comercial do card: e-mail do especialista (nome e sobrenome), senão campo escolhido ou quem abriu o card. */
function commercialOf(card, meta, config) {
  const c = commercialOfCard(card, config, meta);
  if (!c.source) return { commercialIds: [], commercialName: null, commercialField: null };
  const name = c.name || (c.ids.length ? c.ids.map(id => userName(meta, id)).join(', ') : 'Sem comercial');
  return { commercialIds: c.ids, commercialName: name, commercialField: c.label, commercialEmail: c.email,
    commercialSource: c.source, commercialIsCreator: c.source === 'criador' };
}

export function analyze(ds, config, now = Date.now(), opts = {}) {
  const meta = ds.meta || {};
  const cal = config.calendar || {};
  const ncal = normalizeCalendar(cal);
  const pcfg = mergePriority(config.priority);
  const scope = new Set(effectiveMonitored(config, meta).map(m => `${m.entityTypeId}:${m.categoryIds.map(Number).join(',')}`));
  const allowed = c => [...scope].some(k => { const [et, cats] = k.split(':'); return Number(et) === c.entityTypeId && cats.split(',').map(Number).includes(c.categoryId); });
  const openCards = Object.values(ds.cards || {}).filter(c => !c.closed && (!config.monitored || allowed(c)));
  const vth = valueThreshold(openCards.map(c => Number(c.opportunity) || 0), pcfg.valueTopPercent);

  const cards = [];
  for (const card of openCards) {
    const r = analyzeCard({
      card, hist: ds.history?.[card.key], obs: ds.observations?.[card.key],
      activities: ds.activities?.[card.key], comments: ds.comments?.[card.key],
      meta, config, now, lookbackStart: ds.sync?.lookbackStart
    });
    const stageKey = `${card.entityTypeId}:${card.stageId}`;
    const stageName = meta.stages?.[stageKey]?.name || card.stageId;
    const pr = scoreCard(r, card, config.priority, { valueThreshold: vth, stageName, dayMinutes: ncal.dayMinutes });
    // Silenciados continuam visíveis, mas marcados.
    for (const a of r.alerts) {
      const until = ds.alertState?.snoozed?.[a.key];
      if (until && until > now) a.snoozedUntil = until;
      const known = ds.alertState?.known?.[a.key];
      a.firstSeen = known?.firstSeen ?? null;
      a.missedWhileOffline = !!known?.missedWhileOffline;
    }
    cards.push({
      key: card.key, id: card.id, entityTypeId: card.entityTypeId, title: card.title || `#${card.id}`,
      link: cardLink(ds.portalUrl, card, config.cardTypes),
      entityName: meta.entities?.[card.entityTypeId]?.name || `Tipo ${card.entityTypeId}`,
      categoryId: card.categoryId, categoryKey: `${card.entityTypeId}:${card.categoryId}`,
      categoryName: meta.categories?.[`${card.entityTypeId}:${card.categoryId}`]?.name || `Funil ${card.categoryId}`,
      stageId: card.stageId, stageKey, stageName, stageSort: meta.stages?.[stageKey]?.sort ?? 0,
      responsibleId: card.assignedById, responsibleName: userName(meta, card.assignedById),
      ...commercialOf(card, meta, config),
      teams: teamsOf(meta, config, card.assignedById),
      opportunity: Number(card.opportunity) || 0, currency: card.currencyId || 'BRL',
      createdTime: card.createdTime ?? null, ageDays: calendarDaysBetween(card.createdTime, now, ncal.timezone),
      alerts: r.alerts, priority: pr,
      lastInteraction: r.lastInteraction ? { ...r.lastInteraction, authorName: userName(meta, r.lastInteraction.authorId) } : null,
      ignoredEvidence: r.ignoredEvidence,
      nextActivity: r.nextActivity ? { id: r.nextActivity.id, providerId: r.nextActivity.providerId, subject: r.nextActivity.subject,
        deadline: r.nextActivity.deadline, responsibleName: userName(meta, r.nextActivity.responsibleId) } : null,
      entrySource: r.vis.source, entryTime: r.vis.current.start, partial: r.vis.partial, returned: r.vis.returned,
      stageSlaStatus: r.stageSla?.status || null, processSlaStatus: r.procSla?.status || null
    });
  }

  const active = c => c.alerts.filter(a => !(a.snoozedUntil > now));
  const withAlerts = cards.filter(c => c.alerts.length);
  withAlerts.sort((a, b) => (LEVEL_ORDER[a.priority.level] - LEVEL_ORDER[b.priority.level]) || (b.priority.score - a.priority.score) ||
    (Math.max(0, ...b.alerts.map(x => x.overdueMin || 0)) - Math.max(0, ...a.alerts.map(x => x.overdueMin || 0))));

  const has = (c, pred) => active(c).some(pred);
  const isOverdue = a => ALERT_TYPES[a.type].overdue;
  const atraso = cards.filter(c => has(c, isOverdue));
  const slaVenc = cards.filter(c => has(c, a => a.type === 'sla_etapa_vencido' || a.type === 'sla_processo_vencido'));
  const proximos = cards.filter(c => has(c, a => ALERT_TYPES[a.type].group === 'aviso'));
  const semAcomp = cards.filter(c => has(c, a => a.type === 'sem_interacao' || a.type === 'sem_atividade_futura'));
  const valorAtraso = {};
  for (const c of atraso) if (c.opportunity > 0) valorAtraso[c.currency] = (valorAtraso[c.currency] || 0) + c.opportunity;

  const kpis = {
    monitorados: cards.length, comAlerta: withAlerts.length, comAtraso: atraso.length, slaVencido: slaVenc.length,
    proximos: proximos.length, semAcompanhamento: semAcomp.length, valorEmAtraso: valorAtraso,
    porNivel: Object.fromEntries(Object.keys(LEVEL_ORDER).map(l => [l, withAlerts.filter(c => c.priority.level === l).length])),
    porTipo: Object.fromEntries(Object.keys(ALERT_TYPES).map(t => [t, cards.filter(c => has(c, a => a.type === t)).length])),
    parciais: cards.filter(c => c.partial).length
  };

  const dist = (keyFn, nameFn) => {
    const m = new Map();
    for (const c of cards) {
      const k = keyFn(c);
      const e = m.get(k) || { key: k, name: nameFn(c), cards: 0, comAlerta: 0, comAtraso: 0, criticos: 0, alertas: 0, valor: {} };
      e.cards++;
      // Valor em aberto por moeda (moedas diferentes nunca são somadas entre si).
      if (c.opportunity > 0) e.valor[c.currency] = (e.valor[c.currency] || 0) + c.opportunity;
      const act = active(c);
      if (act.length) e.comAlerta++;
      if (act.some(isOverdue)) e.comAtraso++;
      if (c.priority.level === 'critica') e.criticos++;
      e.alertas += act.length;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.comAtraso - a.comAtraso || b.comAlerta - a.comAlerta || b.cards - a.cards);
  };
  const distributions = {
    byResponsible: dist(c => String(c.responsibleId), c => c.responsibleName),
    byCategory: dist(c => c.categoryKey, c => `${c.categoryName}`),
    byCommercial: cards.some(c => c.commercialField) ? dist(c => c.commercialIds.join(',') || '-', c => c.commercialName || 'Sem comercial') : [],
    byStage: dist(c => c.stageKey, c => `${c.stageName} · ${c.categoryName}`)
  };

  // Resumo operacional — somente fatos calculados.
  const summary = [];
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  if (!cards.length) summary.push('Nenhum card aberto nos funis monitorados.');
  else {
    summary.push(`${plural(cards.length, 'card monitorado', 'cards monitorados')}; ${plural(withAlerts.length, 'tem', 'têm')} ao menos um alerta.`);
    if (slaVenc.length) {
      summary.push(`Há ${plural(slaVenc.length, 'card', 'cards')} com SLA vencido (${kpis.porTipo.sla_etapa_vencido} de etapa, ${kpis.porTipo.sla_processo_vencido} do processo total).`);
    }
    const topStage = distributions.byStage[0];
    if (topStage && topStage.comAtraso >= 2) summary.push(`A etapa ${topStage.name} concentra ${topStage.comAtraso} cards em atraso.`);
    if (kpis.porTipo.atividade_vencida) summary.push(`${plural(kpis.porTipo.atividade_vencida, 'card tem', 'cards têm')} atividade pendente vencida.`);
    if (kpis.porTipo.sem_atividade_futura) summary.push(`Existem ${plural(kpis.porTipo.sem_atividade_futura, 'card', 'cards')} sem atividade futura agendada.`);
    if (kpis.porTipo.sem_interacao) summary.push(`${plural(kpis.porTipo.sem_interacao, 'card está', 'cards estão')} sem interação relevante além do limite configurado.`);
    if (kpis.porTipo.parado_etapa) summary.push(`${plural(kpis.porTipo.parado_etapa, 'card está parado', 'cards estão parados')} na mesma etapa além do limite.`);
    if (kpis.proximos) summary.push(`${plural(kpis.proximos, 'card se aproxima', 'cards se aproximam')} do vencimento.`);
    const topResp = distributions.byResponsible[0];
    if (topResp && topResp.comAtraso >= 2) summary.push(`Assessor com mais cards em atraso: ${topResp.name} (${topResp.comAtraso}).`);
    const topCom = distributions.byCommercial[0];
    if (topCom && topCom.comAtraso >= 2 && topCom.key !== '-') summary.push(`Comercial com mais cards em atraso: ${topCom.name} (${topCom.comAtraso}).`);
    if (kpis.porNivel.critica) summary.push(`Prioridade crítica: ${plural(kpis.porNivel.critica, 'card', 'cards')}.`);
    if (kpis.parciais) summary.push(`${plural(kpis.parciais, 'card tem', 'cards têm')} cálculo parcial por falta de data de entrada na etapa.`);
  }

  return {
    generatedAt: now, mode: ds.mode, cards, queue: withAlerts.map(c => c.key), kpis, distributions, summary,
    historical: historical(ds, config, cards, now, ncal),
    meetings: buildMeetingRankings(ds, config, now),
    levelLabel: LEVEL_LABEL
  };
}

/** Métricas históricas — exibidas apenas com amostra mínima. */
export function historical(ds, config, cards, now, ncal = normalizeCalendar(config.calendar || {})) {
  const minSample = config.analytics?.minSample ?? 5;
  const meta = ds.meta || {};
  const per = new Map();
  const breaches = new Map();
  for (const [key, hist] of Object.entries(ds.history || {})) {
    const h = (hist || []).slice().sort((a, b) => a.time - b.time || a.id - b.id);
    const etid = Number(key.split(':')[0]);
    for (let i = 0; i + 1 < h.length; i++) {
      const v = h[i], end = h[i + 1].time;
      const sk = `${etid}:${v.stageId}`;
      const e = per.get(sk) || { stageKey: sk, name: meta.stages?.[sk]?.name || v.stageId, n: 0, sumMin: 0, sumUtil: 0 };
      e.n++; e.sumMin += (end - v.time) / 60000; e.sumUtil += measure(v.time, end, 'util', ncal);
      per.set(sk, e);
      const rule = (config.slaRules || []).find(r => r.enabled !== false && Number(r.entityTypeId) === etid &&
        String(r.categoryId) === String(v.categoryId) && r.stageId === v.stageId);
      if (rule) {
        const mode = rule.mode || 'corrido';
        const budget = durationToMinutes(rule.duration, mode, config.calendar || {});
        const b = breaches.get(sk) || { stageKey: sk, name: e.name, visitas: 0, vencidas: 0 };
        b.visitas++;
        if (measure(v.time, end, mode, ncal) > budget) b.vencidas++;
        breaches.set(sk, b);
      }
    }
  }
  const stageAvg = [...per.values()].filter(e => e.n >= minSample)
    .map(e => ({ ...e, avgMin: e.sumMin / e.n, avgUtil: e.sumUtil / e.n })).sort((a, b) => b.avgMin - a.avgMin);
  const insufficient = [...per.values()].filter(e => e.n < minSample).length;
  const snaps = (ds.snapshots || []).slice(-60);
  return {
    minSample,
    stageAvg, stageAvgInsufficient: insufficient,
    breaches: [...breaches.values()].filter(b => b.visitas >= minSample),
    evolution: new Set(snaps.map(s => s.day)).size >= 3 ? snaps : null,
    evolutionDays: new Set(snaps.map(s => s.day)).size
  };
}
