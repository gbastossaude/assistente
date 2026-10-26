// Priorização com critérios visíveis e configuráveis. Cada ponto da pontuação
// é explicado. Módulo puro.

export const DEFAULT_PRIORITY = {
  weights: {
    sla_etapa_vencido: 30, sla_processo_vencido: 30, prazo_vencido: 25, atividade_vencida: 20,
    parado_etapa: 15, sem_interacao: 15, sem_atividade_futura: 10,
    sla_etapa_proximo: 6, sla_processo_proximo: 6, prazo_proximo: 5
  },
  overduePointsPerDay: 4,      // tempo de atraso: pontos por dia de atraso (no modo da regra)
  overdueMaxPoints: 20,
  overPercentPointsPer100: 10, // estouro do SLA: pontos a cada 100% acima do prazo
  overPercentMaxPoints: 20,
  stageWeights: {},            // { "<entityTypeId>:<stageId>": pontos }
  valueTopPercent: 20,         // valor: cards no topo X% de valor (entre os monitorados) ganham bônus
  valueBonus: 10,
  extraAlertPoints: 5,         // cada alerta adicional no mesmo card
  extraAlertMaxPoints: 15,
  levels: { critica: 70, alta: 45, media: 25 }
};

export const LEVEL_LABEL = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export function mergePriority(cfg) {
  const d = DEFAULT_PRIORITY;
  return { ...d, ...(cfg || {}), weights: { ...d.weights, ...(cfg?.weights || {}) },
    levels: { ...d.levels, ...(cfg?.levels || {}) }, stageWeights: { ...(cfg?.stageWeights || {}) } };
}

/** Limiar de valor para o topo X% dos cards monitorados com valor informado. */
export function valueThreshold(values, topPercent) {
  const v = values.filter(x => x > 0).sort((a, b) => b - a);
  if (v.length < 5 || !(topPercent > 0)) return null; // amostra pequena demais para comparar
  const idx = Math.max(0, Math.ceil(v.length * topPercent / 100) - 1);
  return v[idx];
}

export function scoreCard(cardResult, card, cfgIn, ctx = {}) {
  const cfg = mergePriority(cfgIn);
  const reasons = [];
  let score = 0;
  const alerts = cardResult.alerts;
  if (!alerts.length) return { score: 0, level: null, reasons: [] };

  // Peso de cada tipo de alerta
  for (const a of alerts) {
    const w = cfg.weights[a.type] || 0;
    if (w) { score += w; reasons.push({ pts: w, text: a.title }); }
  }
  // Tempo de atraso (maior atraso entre os alertas)
  const worst = alerts.reduce((m, a) => (a.overdueMin || 0) > (m?.overdueMin || 0) ? a : m, null);
  if (worst && worst.overdueMin > 0 && cfg.overduePointsPerDay > 0) {
    const days = worst.overdueMin / (worst.mode === 'util' && ctx.dayMinutes ? ctx.dayMinutes : 1440);
    const pts = Math.min(cfg.overdueMaxPoints, Math.round(days * cfg.overduePointsPerDay));
    if (pts > 0) { score += pts; reasons.push({ pts, text: `Atraso de ${worst.overdueText} (${worst.title})` }); }
  }
  // Percentual de estouro do SLA
  const slaOver = alerts.filter(a => a.percent > 1).reduce((m, a) => Math.max(m, a.percent), 0);
  if (slaOver > 1 && cfg.overPercentPointsPer100 > 0) {
    const pts = Math.min(cfg.overPercentMaxPoints, Math.round((slaOver - 1) * cfg.overPercentPointsPer100));
    if (pts > 0) { score += pts; reasons.push({ pts, text: `SLA estourado em ${Math.round((slaOver - 1) * 100)}% além do prazo` }); }
  }
  // Etapa do processo
  const sw = cfg.stageWeights[`${card.entityTypeId}:${card.stageId}`];
  if (sw) { score += sw; reasons.push({ pts: sw, text: `Peso configurado para a etapa ${ctx.stageName || card.stageId}` }); }
  // Valor da oportunidade
  if (ctx.valueThreshold != null && card.opportunity >= ctx.valueThreshold && cfg.valueBonus > 0) {
    score += cfg.valueBonus;
    reasons.push({ pts: cfg.valueBonus, text: `Valor entre os ${cfg.valueTopPercent}% maiores dos cards monitorados` });
  }
  // Múltiplos alertas
  if (alerts.length > 1 && cfg.extraAlertPoints > 0) {
    const pts = Math.min(cfg.extraAlertMaxPoints, (alerts.length - 1) * cfg.extraAlertPoints);
    score += pts; reasons.push({ pts, text: `${alerts.length} alertas simultâneos` });
  }
  const L = cfg.levels;
  const level = score >= L.critica ? 'critica' : score >= L.alta ? 'alta' : score >= L.media ? 'media' : 'baixa';
  return { score, level, reasons };
}
