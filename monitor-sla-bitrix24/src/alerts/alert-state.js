// Estado dos alertas: deduplicação, silenciamento, vencimentos ocorridos durante intervalos
// sem sincronização (Chrome fechado) e seleção do que notificar. Módulo puro.
import { ALERT_TYPES } from '../core/detect.js';
import { inDailyWindow } from '../core/time.js';

const LEVEL_RANK = { critica: 3, alta: 2, media: 1, baixa: 0 };

/**
 * Atualiza o estado de alertas após uma análise.
 * @param prevSuccess instante da sincronização bem-sucedida anterior
 * @param intervalMin intervalo configurado de sincronização
 */
export function updateAlertState(state, analysis, { now, prevSuccess, intervalMin }) {
  const st = structuredClone(state || { known: {}, snoozed: {} });
  st.known = st.known || {}; st.snoozed = st.snoozed || {}; st.pending = st.pending || [];
  const gap = prevSuccess && now - prevSuccess > 2 * intervalMin * 60000 ? { from: prevSuccess, to: now } : null;
  const current = new Set();
  const fresh = [];
  for (const c of analysis.cards) {
    for (const a of c.alerts) {
      current.add(a.key);
      // Silenciamento expirado: o alerta volta e pode ser notificado de novo
      if (st.snoozed[a.key] && st.snoozed[a.key] <= now) {
        delete st.snoozed[a.key];
        if (st.known[a.key]) st.known[a.key].notifiedAt = null;
      }
      if (!st.known[a.key]) {
        const missed = !!(gap && ALERT_TYPES[a.type].overdue && a.deadline && a.deadline > gap.from && a.deadline <= gap.to);
        st.known[a.key] = { firstSeen: now, notifiedAt: null, missedWhileOffline: missed, gap: missed ? gap : null };
        fresh.push({ card: c, alert: a });
      }
    }
  }
  for (const k of Object.keys(st.known)) if (!current.has(k)) delete st.known[k];
  for (const k of Object.keys(st.snoozed)) if (!current.has(k)) delete st.snoozed[k];
  st.pending = st.pending.filter(k => current.has(k));
  st.lastGap = gap || st.lastGap || null;
  return { state: st, fresh, gap };
}

/** Decide o que notificar agora (respeitando janela, nível mínimo e deduplicação). */
export function selectNotifications(state, analysis, cfg, now, tz) {
  const st = structuredClone(state);
  const n = cfg || {};
  const minRank = LEVEL_RANK[n.minLevel || 'alta'] ?? 2;
  const candidates = [];
  for (const c of analysis.cards) {
    if ((LEVEL_RANK[c.priority.level] ?? -1) < minRank) continue;
    for (const a of c.alerts) {
      const k = st.known[a.key];
      if (!k || k.notifiedAt) continue;
      if (st.snoozed[a.key] > now) continue;
      if (ALERT_TYPES[a.type].group === 'aviso' && !n.earlyWarning) continue;
      candidates.push({ card: c, alert: a });
    }
  }
  if (!candidates.length) return { state: st, send: [], digest: null, deferred: 0 };
  if (!inDailyWindow(now, n.window, tz)) {
    // fora do horário: acumula para enviar como resumo quando a janela abrir
    for (const x of candidates) if (!st.pending.includes(x.alert.key)) st.pending.push(x.alert.key);
    return { state: st, send: [], digest: null, deferred: candidates.length };
  }
  for (const x of candidates) st.known[x.alert.key].notifiedAt = now;
  const pendingCount = st.pending.length;
  st.pending = [];
  const max = n.maxPerSync ?? 3;
  if (candidates.length <= max && !pendingCount) return { state: st, send: candidates, digest: null, deferred: 0 };
  const crit = candidates.filter(x => x.card.priority.level === 'critica').length;
  return { state: st, send: [], deferred: 0,
    digest: { count: candidates.length + pendingCount, critical: crit,
      cards: new Set(candidates.map(x => x.card.key)).size } };
}

/** Número exibido no ícone da extensão. */
export function badgeCount(analysis, mode, now) {
  let n = 0, crit = false;
  for (const c of analysis.cards) {
    const act = c.alerts.filter(a => !(a.snoozedUntil > now));
    if (!act.length) continue;
    let counts = false;
    if (mode === 'todos') counts = true;
    else if (mode === 'critica') counts = c.priority.level === 'critica';
    else if (mode === 'alta') counts = c.priority.level === 'critica' || c.priority.level === 'alta';
    else counts = act.some(a => ALERT_TYPES[a.type].overdue);
    if (counts) { n++; if (c.priority.level === 'critica') crit = true; }
  }
  return { n, crit };
}
