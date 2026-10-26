// Popup: visão rápida do que precisa de atenção primeiro.
import { send, esc, fmtDT, fmtAgo, LEVELS, STATUS_TEXT } from './common.js';

const body = document.getElementById('body');
const openDash = (hash = '') => chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html' + hash) });

async function render() {
  const S = await send('getState');
  document.getElementById('pill').innerHTML = S.mode === 'demo' ? '<span class="pill demo">DEMO · fictício</span>' : '';
  document.getElementById('sync').disabled = !S.mode || S.syncing;
  if (!S.mode) {
    body.innerHTML = `<p class="muted">Conecte o Bitrix24 ou abra a demonstração.</p>
      <button class="btn primary" data-open="#config">Configurar conexão</button>`;
    return;
  }
  const A = S.analysis, s = S.sync || {}, tz = S.config.calendar?.timezone;
  const now = Date.now();
  let html = '';
  if (['auth_error', 'sem_credencial', 'sem_permissao', 'erro'].includes(s.status)) {
    html += `<div class="banner err small" style="margin:0"><div><b>${esc(STATUS_TEXT[s.status])}</b><br>${esc(s.errors?.[0]?.message || '')}</div></div>`;
  }
  if (!A || !s.lastSuccess) {
    body.innerHTML = html + `<p class="muted">${S.syncing ? 'Sincronizando…' : 'Nenhuma consulta concluída ainda.'}</p><button class="btn primary" data-open="">Abrir painel</button>`;
    return;
  }
  const top = A.cards.filter(c => c.alerts.some(a => !(a.snoozedUntil > now))).slice(0, 5);
  html += `<div class="kpis"><div class="kpi crit"><div class="l">Em atraso</div><div class="v">${A.kpis.comAtraso}</div></div>
    <div class="kpi crit"><div class="l">SLA vencido</div><div class="v">${A.kpis.slaVencido}</div></div>
    <div class="kpi"><div class="l">Críticos</div><div class="v">${A.kpis.porNivel.critica}</div></div></div>`;
  html += top.length ? top.map(c => {
    const act = c.alerts.filter(a => !(a.snoozedUntil > now));
    const worst = act.reduce((m, a) => (a.overdueMin || 0) > (m?.overdueMin || 0) ? a : m, act[0]);
    return `<div class="item ${c.priority.level}"><div class="row"><span class="pill ${c.priority.level}">${LEVELS[c.priority.level]}</span>
      <span class="t" title="${esc(c.title)}" style="flex:1;min-width:0">${esc(c.title)}</span></div>
      <div class="small">${esc(worst.title)}${worst.overdueText ? ` · <b>${esc(worst.overdueText)}</b>` : ''}</div>
      <div class="small muted">${esc(c.stageName)} · ${esc(c.responsibleName)}${c.commercialField ? ` · Comercial: ${esc(c.commercialName)}` : ''}${act.length > 1 ? ` · +${act.length - 1} alerta(s)` : ''}</div>
      ${c.link ? `<a class="small" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">Abrir no Bitrix ↗</a>` : ''}</div>`;
  }).join('') : `<div class="banner ok small" style="margin:0"><div><b>Nenhuma pendência encontrada</b> nos ${A.kpis.monitorados} cards monitorados.</div></div>`;
  html += `<div class="row"><button class="btn primary" data-open="">Abrir painel completo</button><span class="spacer"></span>
    <span class="small faint">${s.lastSuccess ? `atualizado ${fmtAgo(s.lastSuccess)} (${fmtDT(s.lastSuccess, tz)})` : ''}</span></div>`;
  body.innerHTML = html;
}

document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (o) openDash(o.dataset.open);
});
document.getElementById('sync').addEventListener('click', async () => {
  document.getElementById('sync').disabled = true;
  await send('syncNow', {});
  render();
});
render().catch(e => { body.innerHTML = `<p>${esc(e.message)}</p>`; });
