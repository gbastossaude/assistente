// Popup: visão rápida do que precisa de atenção primeiro. Lê só o resumo gravado a cada análise
// (indicadores e os primeiros cards), por isso abre na hora mesmo com milhares de cards.
import { send, esc, fmtDT, fmtAgo, LEVELS, STATUS_TEXT, applyTheme } from './common.js';
import { icon } from './icons.js';

const body = document.getElementById('body');
const syncBtn = document.getElementById('sync');
const openDash = (hash = '') => chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html' + hash) });
chrome.storage.local.get('uiTheme').then(r => applyTheme(r.uiTheme)).catch(() => {});

function dot(status, syncing) {
  const cls = syncing ? 'run' : status === 'ok' ? 'ok' : ['parcial', 'sem_aba', 'sem_sessao', 'sem_conexao'].includes(status) ? 'warn' : ['erro', 'auth_error', 'sem_credencial', 'sem_permissao'].includes(status) ? 'err' : '';
  return `<span class="syncinfo" style="display:inline-flex"><span class="dot ${cls}"></span></span>`;
}

async function render() {
  const S = await send('getSummary');
  const s = S.sync || {}, tz = S.timezone;
  document.getElementById('pill').innerHTML = S.mode === 'demo' ? '<span class="pill demo">DEMO · fictício</span>' : '';
  syncBtn.disabled = !S.mode || S.syncing;
  syncBtn.setAttribute('aria-busy', String(!!S.syncing));
  syncBtn.innerHTML = `${icon('sync')}${S.syncing ? 'Sincronizando…' : 'Sincronizar'}`;
  document.getElementById('st').innerHTML = S.mode ? `${dot(s.status, S.syncing)} ${esc(S.syncing ? 'sincronizando agora' : STATUS_TEXT[s.status] || s.status || '')}${s.lastSuccess && !S.syncing ? ` · ${esc(fmtAgo(s.lastSuccess))}` : ''}` : 'não configurado';
  if (!S.mode) {
    body.innerHTML = `<div class="empty" style="padding:22px 14px"><div class="ico">${icon('link')}</div><h3>Conecte o Bitrix24</h3>
      <p class="muted small">Use o seu login do Bitrix ou veja a demonstração com dados fictícios.</p>
      <button class="btn primary" type="button" data-open="#config">Configurar conexão</button></div>`;
    return;
  }
  const A = S.summary;
  let html = '';
  if (['auth_error', 'sem_credencial', 'sem_permissao', 'erro'].includes(s.status)) {
    html += `<div class="banner err small" style="margin:0">${icon('alert')}<div><b>${esc(STATUS_TEXT[s.status])}</b><br>${esc(s.errors?.[0]?.message || '')}</div></div>`;
  } else if (['sem_aba', 'sem_sessao', 'sem_conexao'].includes(s.status)) {
    html += `<div class="banner warn small" style="margin:0">${icon('info')}<div><b>${esc(STATUS_TEXT[s.status])}</b><br>Os números são da última atualização.
      ${S.portalOrigin ? `<a href="${esc(S.portalOrigin)}/" target="_blank" rel="noopener noreferrer">Abrir o Bitrix24</a>` : ''}</div></div>`;
  }
  if (!A || !s.lastSuccess) {
    body.innerHTML = html + `<p class="muted">${S.syncing ? 'Sincronizando… os cards aparecem aqui ao terminar.' : 'Nenhuma consulta concluída ainda.'}</p>
      <button class="btn primary" type="button" data-open="">Abrir painel</button>`;
    return;
  }
  html += `<div class="kpis"><button class="kpi crit" type="button" data-open=""><div class="l">Em atraso</div><div class="v">${A.kpis.comAtraso}</div></button>
    <button class="kpi crit" type="button" data-open=""><div class="l">SLA vencido</div><div class="v">${A.kpis.slaVencido}</div></button>
    <button class="kpi" type="button" data-open=""><div class="l">Críticos</div><div class="v">${A.kpis.porNivel.critica}</div></button></div>`;
  const top = A.top.slice(0, 5);
  html += top.length ? top.map(c => `<div class="item ${c.level}"><div class="row"><span class="pill ${c.level}">${LEVELS[c.level]}</span>
      <span class="t" title="${esc(c.title)}" style="flex:1;min-width:0">${esc(c.title)}</span></div>
      <div class="small">${esc(c.worst.title)}${c.worst.overdueText ? ` · <b>${esc(c.worst.overdueText)}</b>` : ''}</div>
      <div class="small muted">${esc(c.stageName)} · Assessor: ${esc(c.responsibleName)}${c.commercialName ? ` · Comercial: ${esc(c.commercialName)}` : ''}${c.alerts > 1 ? ` · +${c.alerts - 1} alerta(s)` : ''}</div>
      ${c.link ? `<a class="small" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">Abrir no Bitrix ↗</a>` : ''}</div>`).join('')
    : `<div class="banner ok small" style="margin:0">${icon('check')}<div><b>Nenhuma pendência encontrada</b> nos ${A.kpis.monitorados} cards monitorados.</div></div>`;
  html += `<div class="actions"><button class="btn primary" type="button" data-open="">${icon('painel')}Abrir painel completo</button>
    ${S.portalOrigin ? `<a class="btn" href="${esc(S.portalOrigin)}/" target="_blank" rel="noopener noreferrer">${icon('external')}Abrir o Bitrix24</a>` : `<button class="btn" type="button" data-open="#alertas">${icon('alertas')}Central de alertas</button>`}</div>
    <div class="foot"><span>${s.lastSuccess ? `atualizado ${esc(fmtAgo(s.lastSuccess))} (${fmtDT(s.lastSuccess, tz)})` : ''}</span><span>v${esc(S.version)}</span></div>`;
  body.innerHTML = html;
}

function fail(e) {
  body.innerHTML = `<div class="empty err" style="padding:18px 12px"><div class="ico">${icon('alert')}</div><h3>Não foi possível ler os dados</h3><p class="small">${esc(e.message)}</p></div>`;
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (o) openDash(o.dataset.open);
});
syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  try { await send('syncNow', {}); } catch (e) { fail(e); return; }
  render().catch(fail);
});
// atualiza sozinho enquanto o popup estiver aberto (aviso pequeno, sem reler tudo)
let t = null;
chrome.storage.session.onChanged.addListener(ch => { if (ch.uiRev || ch.syncProgress) { clearTimeout(t); t = setTimeout(() => render().catch(fail), 150); } });
render().catch(fail);
