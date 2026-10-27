// Ícone (contador) e notificações do Chrome. Nunca envia e-mail, WhatsApp ou comentário no Bitrix.
import { badgeCount } from './alert-state.js';

/**
 * Indicador mostrado na aba "SLA" dentro do Bitrix. Fica gravado (para a página que abrir depois) e é
 * enviado por mensagem só às abas do portal: o script da página não precisa escutar o armazenamento,
 * que lhe entregaria a cada sincronização todos os dados gravados.
 */
let lastInpage = '';
export async function setInpage(v) {
  const sig = JSON.stringify(v);
  try { if (sig !== lastInpage) await chrome.storage.local.set({ inpage: v }); } catch { /* */ }
  lastInpage = sig;
  try {
    const matches = [...new Set((chrome.runtime.getManifest().content_scripts || []).flatMap(c => c.matches || []))];
    const tabs = matches.length ? await chrome.tabs.query({ url: matches }) : [];
    await Promise.all(tabs.map(t => chrome.tabs.sendMessage(t.id, { type: 'slaInpage', info: v }).catch(() => {})));
  } catch { /* sem abas do portal */ }
}

export async function updateBadge({ analysis, mode, syncStatus, badgeMode, now = Date.now() }) {
  const a = chrome.action;
  if (syncStatus === 'auth_error' || syncStatus === 'sem_credencial' || syncStatus === 'sem_permissao') {
    await a.setBadgeText({ text: '!' });
    await a.setBadgeBackgroundColor({ color: '#B42318' });
    await a.setTitle({ title: 'Monitor de SLA Bitrix24 — reconexão necessária' });
    await setInpage({ text: '!', cls: 'warn', title: 'Monitor de SLA — reconexão necessária' });
    return;
  }
  if (!analysis) {
    await a.setBadgeText({ text: '' });
    await a.setTitle({ title: 'Monitor de SLA Bitrix24 — sem dados' });
    await setInpage(mode ? { text: '…', cls: 'off', title: 'Monitor de SLA — analisando ou sem dados ainda' } : { text: '?', cls: 'off', title: 'Monitor de SLA — clique para configurar' });
    return;
  }
  const { n, crit } = badgeCount(analysis, badgeMode, now);
  const stale = ['sem_aba', 'sem_sessao', 'erro'].includes(syncStatus);
  await setInpage({ text: String(n > 999 ? '999+' : n), cls: n === 0 ? 'ok' : crit ? '' : 'warn',
    title: `Monitor de SLA — ${n} card(s) precisam de atenção${stale ? ' (dados da última atualização)' : ''}` });
  await a.setBadgeText({ text: n ? (n > 999 ? '999+' : String(n)) : '' });
  await a.setBadgeBackgroundColor({ color: mode === 'demo' ? '#1D4ED8' : crit ? '#B42318' : '#C2410C' });
  if (a.setBadgeTextColor) await a.setBadgeTextColor({ color: '#FFFFFF' });
  const staleText = syncStatus === 'erro' ? ' (última sincronização falhou — dados podem estar desatualizados)'
    : syncStatus === 'sem_aba' ? ' (abra o Bitrix24 para atualizar)' : syncStatus === 'sem_sessao' ? ' (entre no Bitrix24 para atualizar)' : '';
  await a.setTitle({ title: `${mode === 'demo' ? '[DEMONSTRAÇÃO] ' : ''}Monitor de SLA Bitrix24 — ${n} card(s) no contador${staleText}` });
}

export async function canNotify() {
  try { return await chrome.permissions.contains({ permissions: ['notifications'] }); } catch { return false; }
}

/** Envia notificações e registra o destino do clique na sessão (sem dados sensíveis). */
export async function sendNotifications({ send, digest, mode }) {
  if (!(await canNotify())) return 0;
  const prefix = mode === 'demo' ? '[DEMO] ' : '';
  const targets = {};
  let count = 0;
  for (const { card, alert } of send) {
    const id = `card:${alert.key}`.slice(0, 200);
    targets[id] = card.link || null;
    await chrome.notifications.create(id, {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `${prefix}${alert.title}`,
      message: `${card.title}\n${card.stageName} · Assessor: ${card.responsibleName}${card.commercialField ? ` · Comercial: ${card.commercialName}` : ''}${alert.overdueText ? ` · atraso ${alert.overdueText}` : ''}`,
      priority: card.priority.level === 'critica' ? 2 : 1
    });
    count++;
  }
  if (digest) {
    const id = `digest:${Date.now()}`;
    targets[id] = 'dashboard';
    await chrome.notifications.create(id, {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `${prefix}${digest.count} novo(s) alerta(s) em ${digest.cards} card(s)`,
      message: digest.critical ? `${digest.critical} de prioridade crítica. Clique para abrir o painel.` : 'Clique para abrir o painel.',
      priority: digest.critical ? 2 : 1
    });
    count++;
  }
  if (Object.keys(targets).length) {
    const cur = (await chrome.storage.session.get('notifTargets')).notifTargets || {};
    await chrome.storage.session.set({ notifTargets: { ...cur, ...targets } });
  }
  return count;
}
