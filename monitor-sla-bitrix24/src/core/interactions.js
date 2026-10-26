// Classifica interações: atividade comercial relevante × atualização automática do sistema.
// Toda conclusão vem acompanhada da evidência usada. Módulo puro.
import { isSentinelDeadline } from './time.js';

export const DEFAULT_RELEVANT_PROVIDERS = [
  'CRM_TODO',            // atividade universal ("A fazer")
  'VOXIMPLANT_CALL',     // ligação via telefonia
  'CALL_LIST',           // lista de chamadas
  'CRM_MEETING',         // reunião
  'CRM_EMAIL',           // e-mail
  'IMOPENLINES_SESSION', // canais abertos (WhatsApp, chat)
  'TASKS_TASK'           // tarefa vinculada ao card
];

export const PROVIDER_LABELS = {
  CRM_TODO: 'Atividade', VOXIMPLANT_CALL: 'Ligação', CALL_LIST: 'Lista de chamadas', CRM_MEETING: 'Reunião',
  CRM_EMAIL: 'E-mail', IMOPENLINES_SESSION: 'Canal aberto', TASKS_TASK: 'Tarefa', CRM_SMS: 'SMS',
  CRM_BIZPROC_WORKFLOW: 'Fluxo de trabalho', CRM_WEBFORM: 'Formulário', CRM_NOTIFICATION: 'Notificação',
  CONFIGURABLE_REST_APP: 'Atividade de aplicativo', CRM_BOOKING: 'Agendamento', CRM_CALENDAR_SHARING: 'Reunião pelo calendário'
};

export function providerLabel(p) { return PROVIDER_LABELS[p] || p || 'Atividade'; }

/**
 * Última interação relevante de um card e evidências ignoradas.
 * @returns {{last: object|null, ignored: object[], considered: number}}
 */
export function lastRelevantInteraction(card, activities, comments, cfg = {}, now = Date.now()) {
  const relevant = new Set(cfg.relevantProviders || DEFAULT_RELEVANT_PROVIDERS);
  const autoUsers = new Set((cfg.automationUserIds || []).map(String));
  const countCreated = cfg.countCreatedByHuman !== false;
  const countComments = cfg.countComments !== false;
  const candidates = [];
  const ignored = [];

  for (const a of activities || []) {
    const label = `${providerLabel(a.providerId)}${a.subject ? ` "${a.subject}"` : ''}`;
    if (!relevant.has(a.providerId)) {
      ignored.push({ time: a.lastUpdated || a.created, desc: label, reason: `tipo ${a.providerId || '?'} não classificado como interação comercial` });
      continue;
    }
    if (autoUsers.has(String(a.authorId))) {
      ignored.push({ time: a.lastUpdated || a.created, desc: label, reason: 'criada por usuário de automação' });
      continue;
    }
    if (a.completed) {
      const t = a.endTime && a.endTime <= now ? a.endTime : a.lastUpdated;
      if (t) candidates.push({ time: t, kind: 'atividade', desc: `${label} concluída`, authorId: a.responsibleId || a.authorId, activityId: a.id });
    } else if (countCreated && a.created) {
      candidates.push({ time: a.created, kind: 'atividade', desc: `${label} criada`, authorId: a.authorId, activityId: a.id });
    }
  }
  if (countComments) {
    for (const c of comments || []) {
      if (autoUsers.has(String(c.authorId))) { ignored.push({ time: c.created, desc: 'Comentário', reason: 'autor é usuário de automação' }); continue; }
      candidates.push({ time: c.created, kind: 'comentario', desc: 'Comentário na timeline', authorId: c.authorId });
    }
  }
  candidates.sort((a, b) => b.time - a.time);
  const last = candidates[0] || null;

  // Sinais genéricos que NÃO são usados como interação, mas são mostrados como evidência descartada.
  if (card.updatedTime && (!last || card.updatedTime > last.time)) {
    ignored.push({ time: card.updatedTime, desc: 'Última alteração do card', reason: 'alteração genérica (pode ser automação ou edição de campo) — não conta como acompanhamento' });
  }
  if (card.lastActivityTime && (!last || card.lastActivityTime > last.time + 60000)) {
    ignored.push({ time: card.lastActivityTime, desc: 'lastActivityTime do Bitrix', reason: 'sem registro relevante correspondente nos dados consultados' });
  }
  ignored.sort((a, b) => (b.time || 0) - (a.time || 0));
  return { last, ignored: ignored.slice(0, 4), considered: candidates.length };
}

/** Separa atividades abertas em vencidas, futuras e sem prazo. */
export function classifyOpenActivities(activities, now = Date.now()) {
  const overdue = [], future = [], noDeadline = [];
  for (const a of activities || []) {
    if (a.completed) continue;
    if (isSentinelDeadline(a.deadline)) noDeadline.push(a);
    else if (a.deadline < now) overdue.push(a);
    else future.push(a);
  }
  overdue.sort((a, b) => a.deadline - b.deadline);
  future.sort((a, b) => a.deadline - b.deadline);
  return { overdue, future, noDeadline, next: future[0] || null };
}
