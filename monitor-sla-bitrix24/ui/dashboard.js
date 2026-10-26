// Painel principal: indicadores, fila priorizada, central de alertas, análises e configurações.
import { send, esc, fmtDT, fmtAgo, fmtMoney, fmtDate, fmtAge, fmtMoneyMap, LEVELS, STATUS_TEXT, downloadCsv } from './common.js';
import { PERIODS, GROUPS, DEFAULT_MEETINGS } from '../src/core/meetings.js';
import { CLOSED_PERIODS, DEFAULT_CLOSED_STUDY, reasonFieldFor } from '../src/core/closed.js';
import { ALERT_TYPES } from '../src/core/detect.js';
import { DEFAULT_PRIORITY } from '../src/core/priority.js';
import { PROVIDER_LABELS, DEFAULT_RELEVANT_PROVIDERS } from '../src/core/interactions.js';
import { newId, defaultConfig, mergeConfig, DEFAULT_PORTAL, DEFAULT_FOCUS_PAGE, normalizeFocusPage, effectiveMonitored, commercialFieldFor, specialistFieldFor, isExcludedName, DEFAULT_EXCLUDE_NAMES } from '../src/core/config.js';
import { fmtMinutes } from '../src/core/time.js';
import { parseWebhook, normalizePortal } from '../src/integration/bitrix-client.js';

let S = null;          // estado vindo do service worker
let cfg = null;        // cópia editável da configuração
let dirty = false;
const QUEUE_PAGE = 150; // linhas desenhadas por vez na fila (o restante sob demanda)
const ui = {
  tab: 'painel', cfgTab: 'conexao', expanded: new Set(), queueLimit: QUEUE_PAGE, mt: { period: 'mes', group: null }, cs: { period: '90d', type: '', com: '', sort: 'encerramento', limit: 150 },
  f: { q: '', resp: '', com: '', team: '', cat: '', stage: '', type: '', level: '', snoozed: false }, sort: 'criacao',
  dir: (() => { try { return localStorage.getItem('ordemCriacao') === 'recentes' ? 'recentes' : 'antigos'; } catch { return 'antigos'; } })()
};
const $ = s => document.querySelector(s);
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
if (EMBED) document.body.classList.add('embed');
const LT = EMBED ? '_top' : '_blank'; // dentro do Bitrix, os links abrem o card na própria página
const main = $('#main');
const tz = () => (S?.config?.calendar?.timezone) || 'America/Sao_Paulo';

// ---------------------------------------------------------------- carregamento
async function load({ keepCfg = false } = {}) {
  S = await send('getState');
  if (!keepCfg || !cfg) { cfg = structuredClone(S.config); dirty = false; }
  render();
}
function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && (ch.an_real || ch.an_demo || ch.mode || ch.config_real)) load({ keepCfg: dirty });
  if (area === 'session' && ch.syncProgress) renderSyncInfo(ch.syncProgress.newValue);
});

// ---------------------------------------------------------------- topo
function renderSyncInfo(progress) {
  const el = $('#syncinfo');
  if (!S) return;
  const s = S.sync || {};
  const st = STATUS_TEXT[s.status] || s.status || '';
  const prog = progress !== undefined ? progress : S.progress;
  if (prog) { el.innerHTML = `<b>Sincronizando…</b><br>${esc(stepText(prog.step))}${prog.detail ? ' · ' + esc(prog.detail) : ''}`; return; }
  el.innerHTML = `<b>${esc(st)}</b><br>Última consulta bem-sucedida: ${s.lastSuccess ? `${fmtDT(s.lastSuccess, tz())} (${fmtAgo(s.lastSuccess)})` : 'nenhuma'}`;
}
function stepText(s) {
  return { inicio: 'iniciando', estrutura: 'lendo funis e etapas', cards: 'lendo cards', historico: 'lendo histórico de etapas',
    atividades: 'lendo atividades', comentarios: 'lendo comentários', usuarios: 'lendo usuários', reunioes: 'lendo reuniões', encerrados: 'lendo cards encerrados' }[s] || s;
}

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $('#modePill').innerHTML = S.mode === 'demo' ? '<span class="pill demo">DEMONSTRAÇÃO · DADOS FICTÍCIOS</span>' : '';
  renderSyncInfo();
  $('#btnSync').disabled = !S.mode || S.syncing;
  $('#savebar').classList.toggle('hidden', !(ui.tab === 'config' && dirty));
  const html = ui.tab === 'painel' ? renderPainel() : ui.tab === 'etapas' ? renderEtapas() : ui.tab === 'reunioes' ? renderReunioes() : ui.tab === 'encerrados' ? renderEncerrados()
    : ui.tab === 'alertas' ? renderAlertas() : ui.tab === 'analises' ? renderAnalises() : renderConfig();
  main.innerHTML = html;
}

// ---------------------------------------------------------------- avisos de estado
function banners() {
  const out = [];
  const s = S.sync || {};
  if (S.mode === 'demo') {
    out.push(`<div class="banner demo"><div><div class="t">Modo demonstração — todos os cards, pessoas, empresas e prazos são fictícios.</div>
      <div class="small">Os dados vêm de um portal simulado embutido na extensão, separado da conexão real. Nenhuma informação do seu Bitrix24 é usada aqui.
      <button class="link" data-act="exit-demo">Sair da demonstração</button></div></div></div>`);
  }
  if (S.mode === 'real' && ['auth_error', 'sem_credencial', 'sem_permissao'].includes(s.status)) {
    out.push(`<div class="banner err"><div><div class="t">Não foi possível consultar o Bitrix24: ${esc(STATUS_TEXT[s.status])}.</div>
      <div class="small">${esc(s.errors?.[0]?.message || '')} <button class="link" data-act="goto-conn">Reconectar</button></div></div></div>`);
  } else if (S.mode === 'real' && ['sem_aba', 'sem_sessao'].includes(s.status)) {
    out.push(`<div class="banner warn"><div><div class="t">${s.status === 'sem_aba' ? 'O Bitrix24 está fechado.' : 'Você não está logado no Bitrix24.'}</div>
      <div class="small">A análise usa o seu login do Bitrix e atualiza quando o portal está aberto.
      ${s.lastSuccess ? `Os números abaixo são da última atualização (${fmtDT(s.lastSuccess, tz())}).` : ''}
      ${S.connection.origin ? `<a href="${esc(S.connection.origin)}/" target="${LT}" rel="noopener noreferrer">Abrir o Bitrix24</a>` : ''}</div></div></div>`);
  } else if (s.status === 'erro') {
    const e = s.errors?.[0] || {};
    out.push(`<div class="banner err"><div><div class="t">A última consulta falhou${e.at ? ` (${fmtDT(e.at, tz())})` : ''}.</div>
      <div class="small">${esc(e.message || '')}${e.retryAt ? ` Nova tentativa automática às ${fmtDT(e.retryAt, tz())}.` : ''}
      ${s.lastSuccess ? ` Os números abaixo são da última sincronização bem-sucedida (${fmtDT(s.lastSuccess, tz())}) e podem estar desatualizados.` : ''}</div></div></div>`);
  }
  if ((s.warnings || []).length && s.status !== 'erro') {
    out.push(`<div class="banner warn"><div><div class="t">Sincronização com ressalvas (${s.warnings.length})</div>
      <ul class="small" style="margin:4px 0 0;padding-left:18px">${s.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div></div>`);
  }
  const gap = S.analysis?.gap;
  const missed = (S.analysis?.cards || []).flatMap(c => c.alerts).filter(a => a.missedWhileOffline).length;
  if (missed) {
    out.push(`<div class="banner warn"><div><div class="t">${missed} alerta(s) venceram durante um intervalo sem monitoramento.</div>
      <div class="small">${gap ? `Sem sincronização entre ${fmtDT(gap.from, tz())} e ${fmtDT(gap.to, tz())} (Chrome fechado ou computador desligado).` : ''}
      Veja em <button class="link" data-act="tab" data-tab="alertas">Central de alertas</button>.</div></div></div>`);
  }
  return out.join('');
}

function onboarding() {
  return `<div class="empty"><div class="ico">🔗</div><h3>Conecte seu Bitrix24 ou veja uma demonstração</h3>
    <p class="muted">A extensão lê (sem alterar) negócios, leads e processos inteligentes para identificar atrasos e SLAs vencidos.</p>
    <div class="row" style="justify-content:center"><button class="btn primary" data-act="connect-login">Analisar com meu login do Bitrix</button>
    <button class="btn" data-act="goto-conn">Outras formas de conexão</button>
    <button class="btn" data-act="load-demo">Ver demonstração com dados fictícios</button></div>
    <p class="small faint" style="margin-top:10px">Portal: ${esc(currentBitrixOrigin() || cfg?.portalAddress || DEFAULT_PORTAL)} · é preciso estar logado nele numa aba do Chrome.</p>
    <div id="loginResult" class="small" style="margin-top:6px"></div></div>`;
}

// ---------------------------------------------------------------- painel
function cardsFiltered() {
  const A = S.analysis; if (!A) return [];
  const f = ui.f, now = Date.now(), q = f.q.trim().toLowerCase();
  let list = A.cards.filter(c => c.alerts.length);
  list = list.map(c => {
    const alerts = c.alerts.filter(a => (f.snoozed || !(a.snoozedUntil > now)) && (!f.type || a.type === f.type));
    return { ...c, vis: alerts };
  }).filter(c => c.vis.length);
  if (f.resp) list = list.filter(c => String(c.responsibleId) === f.resp);
  if (f.com) list = list.filter(c => (c.commercialIds || []).join(',') === f.com || (f.com === '-' && !(c.commercialIds || []).length) || (c.commercialIds || []).includes(f.com));
  if (f.team) list = list.filter(c => c.teams.includes(f.team));
  if (f.cat) list = list.filter(c => c.categoryKey === f.cat);
  if (f.stage) list = list.filter(c => c.stageKey === f.stage);
  if (f.level) list = list.filter(c => c.priority.level === f.level);
  if (q) list = list.filter(c => `${c.title} ${c.id} ${c.responsibleName} ${c.commercialName || ''} ${c.stageName} ${c.categoryName}`.toLowerCase().includes(q));
  const maxOver = c => Math.max(0, ...c.vis.map(a => a.overdueMin || 0));
  const order = { critica: 0, alta: 1, media: 2, baixa: 3 };
  const sorters = {
    prioridade: (a, b) => order[a.priority.level] - order[b.priority.level] || b.priority.score - a.priority.score,
    atraso: (a, b) => maxOver(b) - maxOver(a), valor: (a, b) => b.opportunity - a.opportunity,
    etapa: (a, b) => a.categoryName.localeCompare(b.categoryName) || a.stageSort - b.stageSort,
    responsavel: (a, b) => a.responsibleName.localeCompare(b.responsibleName),
    comercial: (a, b) => (a.commercialName || '~').localeCompare(b.commercialName || '~'),
    criacao: byCreation,
    recente: (a, b) => Math.max(0, ...b.vis.map(x => x.firstSeen || 0)) - Math.max(0, ...a.vis.map(x => x.firstSeen || 0))
  };
  return list.sort(sorters[ui.sort] || byCreation);
}

/** Ordem por data de criação do card: mais antigos primeiro (padrão) ou mais recentes primeiro. Sem data vai para o fim. */
function byCreation(a, b) {
  const ta = a.createdTime ?? null, tb = b.createdTime ?? null;
  if (ta == null || tb == null) return (ta == null) - (tb == null);
  return ui.dir === 'recentes' ? tb - ta : ta - tb;
}

/** Botão que inverte a ordem de criação (vale para a fila, as etapas e a central de alertas). */
function orderToggle() {
  const old = ui.dir !== 'recentes';
  return `<button class="btn sm" data-act="ordem" title="Inverter a ordem por data de criação">${old ? '↑ Mais antigos primeiro' : '↓ Mais recentes primeiro'} · inverter</button>`;
}

/** Foco definido, mas o processo da página ainda não foi identificado: nada é monitorado. */
function awaitingFocus() {
  return S.mode === 'real' && S.config.focusPage && !S.config.focusEntityTypeId;
}
function awaitingFocusHtml() {
  const portal = S.connection.origin || S.config.portalAddress || DEFAULT_PORTAL;
  const url = portal + S.config.focusPage;
  const det = S.lastPageTypes && S.lastPageTypes.pagePath === S.config.focusPage ? S.lastPageTypes : null;
  return `<div class="empty"><div class="ico">🔎</div><h3>Abra a página be.smart Saúde no Bitrix</h3>
    <p class="muted">A extensão monitora <b>somente os cards abertos</b> de <span class="mono">${esc(url)}</span>.
    Para saber qual é o processo dessa página, ela precisa ver a lista carregada, ou um card aberto dela, com você logado.</p>
    <div class="row" style="justify-content:center"><a class="btn primary" href="${esc(url)}" target="${LT}" rel="noopener noreferrer">Abrir be.smart Saúde</a></div>
    ${det ? `<p class="small" style="margin-top:10px">Encontrado na página: processo ${det.types.map(t => esc(t.entityTypeId)).join(', ')} — clique em “Analisar com meu login do Bitrix” na aba SLA para começar.</p>` : ''}
    <p class="small faint" style="margin-top:10px">Se a lista não carregar cards, abra qualquer oportunidade dessa página: o endereço do card também serve.</p></div>`;
}

function renderPainel() {
  if (!S.mode) return onboarding();
  const A = S.analysis, s = S.sync || {};
  let html = banners();
  if (awaitingFocus()) return html + awaitingFocusHtml();
  if (!A || !s.lastSuccess) {
    if (s.status === 'sem_configuracao' || (S.mode === 'real' && !(S.config.monitored || []).length)) {
      return html + `<div class="empty"><div class="ico">🧭</div><h3>Escolha os funis que serão monitorados</h3>
        <p class="muted">A conexão foi feita. Selecione os funis e etapas para começar.</p>
        <button class="btn primary" data-act="goto-cfg" data-cfg="funis">Selecionar funis</button></div>`;
    }
    if (S.syncing) return html + `<div class="empty"><div class="ico">⏳</div><h3>Primeira sincronização em andamento…</h3></div>`;
    return html + `<div class="empty err"><div class="ico">⚠️</div><h3>Não foi possível consultar o Bitrix24</h3>
      <p>${esc(s.errors?.[0]?.message || 'Nenhuma sincronização concluída ainda.')}</p>
      <div class="row" style="justify-content:center"><button class="btn primary" data-act="sync">Tentar novamente</button>
      <button class="btn" data-act="goto-conn">Verificar conexão</button></div></div>`;
  }
  const k = A.kpis;
  const money = Object.entries(k.valorEmAtraso || {}).map(([c, v]) => fmtMoney(v, c)).join(' + ') || fmtMoney(0);
  html += `<section class="kpis">
    ${kpi('Cards monitorados', k.monitorados, `${k.comAlerta} com algum alerta`, '', '')}
    ${kpi('Cards com atraso', k.comAtraso, 'prazo, atividade, SLA ou parado', 'crit', 'atraso')}
    ${kpi('SLA vencido', k.slaVencido, `${k.porTipo.sla_etapa_vencido} etapa · ${k.porTipo.sla_processo_vencido} processo`, 'crit', 'sla')}
    ${kpi('Próximos do vencimento', k.proximos, 'aviso antecipado', 'mid', 'aviso')}
    ${kpi('Sem acompanhamento', k.semAcompanhamento, `${k.porTipo.sem_atividade_futura} sem ativ. futura · ${k.porTipo.sem_interacao} sem interação`, 'high', 'acomp')}
    ${kpi('Valor em atraso', money, 'soma sem duplicar cards', '', 'atraso')}
  </section>`;

  const topStages = A.distributions.byStage.filter(x => x.comAlerta).slice(0, 6);
  html += `<section class="grid2">
    <div class="panel"><div class="hd"><h2>Resumo operacional</h2><span class="spacer"></span><span class="small faint">calculado em ${fmtDT(A.generatedAt, tz())}</span></div>
      <ul class="summary">${A.summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="small faint" style="margin-top:8px">Cobertura: ${coverageLine()} · <button class="link" data-act="tab" data-tab="analises">detalhes</button></div></div>
    <div class="panel"><h2>Etapas com mais pendências</h2>${topStages.length ? bars(topStages, x => x.name, 'stage') : '<p class="muted">Nenhuma etapa com pendências.</p>'}</div>
  </section>
  <section class="grid3">
    <div class="panel"><h2>Por assessor</h2>${bars(A.distributions.byResponsible.filter(x => x.comAlerta).slice(0, 8), x => x.name, 'resp')}</div>
    ${(A.distributions.byCommercial || []).length ? `<div class="panel"><h2>Por comercial</h2>${bars(A.distributions.byCommercial.filter(x => x.comAlerta).slice(0, 8), x => x.name, 'com')}</div>` : ''}
    <div class="panel"><h2>Por funil</h2>${bars(A.distributions.byCategory, x => x.name, 'cat')}</div>
    <div class="panel"><h2>Por prioridade</h2>${levelBars(k.porNivel)}</div>
    ${meetingsMini()}
    ${closedMini()}
  </section>`;

  const list = cardsFiltered();
  html += `<section class="panel"><div class="hd"><h2>Fila priorizada de atendimento</h2><span class="spacer"></span>
    <span class="small muted" id="queueCount">${list.length} card(s)</span></div>${filtersHtml()}<div id="queueBox">${queueHtml(list)}</div></section>`;
  return html;
}

function clearFiltersHtml() {
  return Object.entries(ui.f).some(([k, v]) => v && k !== 'snoozed') ? '<button class="link" data-act="clear-filters">limpar filtros</button>' : '';
}

/** Busca: atualiza só a fila (sem redesenhar indicadores e gráficos), com pequena espera entre teclas. */
let qTimer = null;
function refreshQueueOnly() {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    const box = $('#queueBox');
    if (!box || ui.tab !== 'painel') { render(); return; }
    const list = cardsFiltered();
    box.innerHTML = queueHtml(list);
    const cnt = $('#queueCount');
    if (cnt) cnt.textContent = `${list.length} card(s)`;
    const clr = $('#clearFilters');
    if (clr) clr.innerHTML = clearFiltersHtml();
  }, 120);
}

function kpi(label, value, sub, cls, filt) {
  return `<button class="kpi ${cls}" data-act="kpi" data-k="${filt}"><div class="l">${esc(label)}</div><div class="v">${esc(value)}</div><div class="s">${esc(sub)}</div></button>`;
}
function bars(list, nameFn, filt) {
  if (!list.length) return '<p class="muted">Sem dados.</p>';
  const max = Math.max(1, ...list.map(x => x.comAlerta));
  return `<div class="bars">${list.map(x => `<div class="bar" ${filt ? `data-act="filter" data-f="${filt}" data-v="${esc(x.key)}" style="cursor:pointer"` : ''}>
    <div class="name" title="${esc(nameFn(x))}">${esc(nameFn(x))}</div><div class="num">${x.comAtraso}<span class="faint">/${x.comAlerta}</span></div>
    <div class="track"><i style="width:${(x.comAtraso / max) * 100}%;background:var(--crit)"></i><i style="width:${((x.comAlerta - x.comAtraso) / max) * 100}%;background:var(--mid)"></i></div></div>`).join('')}
    <div class="small faint">vermelho: em atraso · amarelo: outros alertas (aviso/acompanhamento)</div></div>`;
}
function levelBars(n) {
  const max = Math.max(1, ...Object.values(n));
  const col = { critica: 'var(--crit)', alta: 'var(--high)', media: 'var(--mid)', baixa: 'var(--low)' };
  return `<div class="bars">${['critica', 'alta', 'media', 'baixa'].map(l => [l, n[l] || 0]).map(([l, v]) => `<div class="bar" data-act="filter" data-f="level" data-v="${l}" style="cursor:pointer">
    <div class="name">${LEVELS[l]}</div><div class="num">${v}</div><div class="track"><i style="width:${(v / max) * 100}%;background:${col[l]}"></i></div></div>`).join('')}</div>`;
}
function coverageLine() {
  const cov = S.sync?.coverage || {};
  const parts = (cov.entities || []).map(e => `${e.name}: ${e.cards}`);
  const src = { historico: 0, movedTime: 0, acompanhamento: 0 };
  for (const c of S.analysis?.cards || []) src[c.entrySource] = (src[c.entrySource] || 0) + 1;
  return `${parts.join(' · ')} — entrada na etapa: ${src.historico} por histórico, ${src.movedTime} por movedTime, ${src.acompanhamento} parcial`;
}

function filtersHtml() {
  const A = S.analysis, f = ui.f;
  const opts = (arr, cur) => arr.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const resp = [...new Map(A.cards.map(c => [String(c.responsibleId), c.responsibleName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const teams = [...new Set(A.cards.flatMap(c => c.teams))].sort().map(t => [t, t]);
  const comMap = new Map();
  for (const c of A.cards) { if (!c.commercialField) continue; if (!(c.commercialIds || []).length) comMap.set('-', 'Sem comercial'); else c.commercialIds.forEach((id, i) => comMap.set(id, (c.commercialName || '').split(', ')[i] || id)); }
  const coms = [...comMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cats = [...new Map(A.cards.map(c => [c.categoryKey, `${c.categoryName} (${c.entityName})`])).entries()];
  const stages = [...new Map(A.cards.filter(c => !f.cat || c.categoryKey === f.cat).sort((a, b) => a.stageSort - b.stageSort)
    .map(c => [c.stageKey, `${c.stageName} · ${c.categoryName}`])).entries()];
  return `<div class="filters">
    <input type="search" placeholder="Buscar card, ID, assessor, comercial, etapa…" data-filter="q" value="${esc(f.q)}">
    <select data-filter="resp"><option value="">Todos os assessores</option>${opts(resp, f.resp)}</select>
    ${A.cards.some(c => c.commercialField) ? `<select data-filter="com"><option value="">Todos os comerciais</option>${opts(coms, f.com)}</select>` : ''}
    <select data-filter="team"><option value="">Todas as equipes</option>${opts(teams, f.team)}</select>
    <select data-filter="cat"><option value="">Todos os funis</option>${opts(cats, f.cat)}</select>
    <select data-filter="stage"><option value="">Todas as etapas</option>${opts(stages, f.stage)}</select>
    <select data-filter="type"><option value="">Todos os tipos de alerta</option>${opts(Object.entries(ALERT_TYPES).map(([k, v]) => [k, v.label]), f.type)}</select>
    <select data-filter="level"><option value="">Todas as gravidades</option>${opts(Object.entries(LEVELS), f.level)}</select>
    <select data-sort><option value="criacao">Ordenar: data de criação</option>${opts([['prioridade', 'Ordenar: prioridade'], ['atraso', 'Ordenar: maior atraso'], ['valor', 'Ordenar: valor'],
      ['etapa', 'Ordenar: funil e etapa'], ['responsavel', 'Ordenar: assessor'], ['comercial', 'Ordenar: comercial'], ['recente', 'Ordenar: detectado recentemente']], ui.sort)}</select>
    ${orderToggle()}
    <label><input type="checkbox" data-filter="snoozed" ${f.snoozed ? 'checked' : ''}> incluir silenciados</label>
    <span id="clearFilters">${clearFiltersHtml()}</span>
  </div>`;
}

function queueHtml(list = cardsFiltered()) {
  const A = S.analysis;
  if (!A.cards.some(c => c.alerts.length)) {
    return `<div class="empty ok"><div class="ico">✅</div><h3>Nenhuma pendência encontrada</h3>
      <p class="muted">Consulta concluída em ${fmtDT(S.sync.lastSuccess, tz())} sobre ${A.kpis.monitorados} card(s) monitorados, com as regras atuais.
      Se você esperava alertas, confira se há regras de SLA e acompanhamento configuradas.</p></div>`;
  }
  if (!list.length) return `<div class="empty"><h3>Nenhum card corresponde aos filtros</h3><button class="link" data-act="clear-filters">limpar filtros</button></div>`;
  const shown = list.slice(0, ui.queueLimit);
  const cols = `<div class="qcols" aria-hidden="true"><span>Prioridade</span><span>Card · criado em</span><span>Etapa</span><span>Assessor</span>
    <span>Comercial</span><span>Maior atraso</span><span>Valor</span><span></span></div>`;
  return `<div class="queue">${cols}${shown.map(rowHtml).join('')}</div>${list.length > shown.length
    ? `<div class="row" style="justify-content:center;margin-top:10px"><span class="small muted">Mostrando ${shown.length} de ${list.length}.</span>
      <button class="btn sm" data-act="more">Mostrar mais ${Math.min(QUEUE_PAGE, list.length - shown.length)}</button></div>` : ''}`;
}

function rowHtml(c) {
  const now = Date.now();
  const worst = c.vis.reduce((m, a) => (a.overdueMin || 0) > (m?.overdueMin || 0) ? a : m, null);
  const chips = c.vis.map(a => `<span class="chip ${ALERT_TYPES[a.type].group} ${a.snoozedUntil > now ? 'snoozed' : ''}" title="${esc(a.reason)}">${esc(a.title)}${a.overdueText ? ' · ' + esc(a.overdueText) : ''}</span>`).join('');
  const open = ui.expanded.has(c.key);
  return `<div class="qrow ${c.priority.level}">
    <div class="qhead" data-act="toggle" data-key="${esc(c.key)}" aria-expanded="${open}">
      <div><span class="pill ${c.priority.level}">${LEVELS[c.priority.level]}</span><div class="small faint num" style="margin-top:3px">${c.priority.score} pts</div></div>
      <div style="min-width:0"><div class="title" title="${esc(c.title)}">${esc(c.title)}</div>
        <div class="sub">#${c.id} · ${esc(c.entityName)}${c.partial ? ' · <span class="pill partial">cálculo parcial</span>' : ''}${c.returned ? ' · <span class="pill neutral">retornou de etapa</span>' : ''}</div>
        <div class="sub created">${createdHtml(c)}</div>
        <div class="c-mobile sub">${esc(c.stageName)} · Assessor: <b>${esc(c.responsibleName)}</b>${c.commercialField ? ` · Comercial: <b>${esc(c.commercialName)}</b>` : ''}</div>
        <div class="chips">${chips}</div></div>
      <div class="c-stage" style="min-width:0"><div>${esc(c.stageName)}</div><div class="sub">${esc(c.categoryName)}</div></div>
      <div class="c-resp" style="min-width:0"><div title="Assessor (responsável pelo card no Bitrix)">${esc(c.responsibleName)}</div><div class="sub">${esc(c.teams.join(', ') || 'assessor')}</div></div>
      <div class="c-com" style="min-width:0">${c.commercialField ? `<div title="${esc(c.commercialField)}">${esc(c.commercialName)}</div><div class="sub" title="${esc(c.commercialEmail || '')}">${esc(comSource(c))}</div>` : '<span class="faint">—</span>'}</div>
      <div class="c-over"><div class="num">${worst?.overdueText ? esc(worst.overdueText) : '—'}</div><div class="sub">maior atraso</div></div>
      <div class="c-val num">${c.opportunity ? fmtMoney(c.opportunity, c.currency) : '<span class="faint">—</span>'}</div>
      <div>${c.link ? `<a class="btn sm" href="${esc(c.link)}" target="${LT}" rel="noopener noreferrer">Abrir no Bitrix ↗</a>` : ''}</div>
    </div>${open ? detailHtml(c) : ''}</div>`;
}

/** Origem do comercial mostrada abaixo do nome: o e-mail do especialista, "abriu o card" ou o campo escolhido. */
function comSource(c) {
  return c.commercialEmail || (c.commercialIsCreator ? 'abriu o card' : c.commercialField || '');
}

/** "Criado em 12/10/2026 · há 14 dias" (dias de calendário no fuso configurado). */
function createdHtml(c) {
  if (c.createdTime == null) return '<span class="faint">criação não informada</span>';
  return `<span title="Data de criação do card no Bitrix">Criado em ${fmtDate(c.createdTime, tz())} · <b>${esc(fmtAge(c.ageDays))}</b></span>`;
}

function detailHtml(c) {
  const now = Date.now(), t = tz();
  const alerts = c.alerts.map(a => {
    const snoozed = a.snoozedUntil > now;
    let extra = '';
    if (a.items) extra += `<div class="small" style="margin-top:6px"><b>Atividades vencidas:</b><ul class="notes">${a.items.map(i => `<li>${esc(i.label)} — prazo ${fmtDT(i.deadline, t)}</li>`).join('')}</ul></div>`;
    if (a.evidence) {
      const u = a.evidence.used;
      extra += `<div class="small" style="margin-top:6px"><b>Evidência usada:</b> ${u ? `${esc(u.desc)} em ${fmtDT(u.time, t)}` : 'nenhuma interação relevante encontrada nos dados consultados'}
        ${(a.evidence.ignored || []).length ? `<br><b>Desconsiderado:</b><ul class="notes">${a.evidence.ignored.map(i => `<li>${esc(i.desc)} (${fmtDT(i.time, t)}): ${esc(i.reason)}</li>`).join('')}</ul>` : ''}</div>`;
    }
    return `<div class="alertbox"><div class="h"><span class="chip ${ALERT_TYPES[a.type].group}">${esc(a.title)}</span>
        ${a.partial ? '<span class="pill partial">parcial</span>' : ''}${a.missedWhileOffline ? '<span class="pill alta">venceu sem monitoramento</span>' : ''}
        ${snoozed ? `<span class="pill neutral">silenciado até ${fmtDT(a.snoozedUntil, t)}</span>` : ''}</div>
      <div style="margin-top:4px">${esc(a.reason)}</div>
      <dl class="kv"><dt>Prazo/limite aplicado</dt><dd>${esc(a.limitText || '—')}</dd>
        <dt>Tempo de atraso</dt><dd>${a.overdueText ? esc(a.overdueText) : '—'}</dd>
        ${a.deadline ? `<dt>Vencimento</dt><dd>${fmtDT(a.deadline, t, true)}</dd>` : ''}
        ${a.firstSeen ? `<dt>Detectado em</dt><dd>${fmtDT(a.firstSeen, t, true)}</dd>` : ''}</dl>
      ${extra}${(a.notes || []).length ? `<ul class="notes">${a.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="row" style="margin-top:8px"><span class="small muted">Silenciar:</span>
        ${snoozed ? `<button class="btn sm" data-act="snooze" data-keys="${esc(a.key)}" data-h="0">Reativar</button>` :
          [[1, '1 h'], [4, '4 h'], [24, '1 dia'], [72, '3 dias']].map(([h, l]) => `<button class="btn sm" data-act="snooze" data-keys="${esc(a.key)}" data-h="${h}">${l}</button>`).join('')}</div></div>`;
  }).join('');
  const li = c.lastInteraction, na = c.nextActivity;
  return `<div class="qdetail"><div>${alerts}
      <div class="row"><button class="btn sm" data-act="snooze" data-keys="${esc(c.alerts.map(a => a.key).join(','))}" data-h="24">Silenciar todos deste card por 1 dia</button></div></div>
    <div>
      <div class="alertbox"><div class="h">Por que prioridade ${LEVELS[c.priority.level]} (${c.priority.score} pts)</div>
        <ul class="reasons">${c.priority.reasons.map(r => `<li><b>+${r.pts}</b><span>${esc(r.text)}</span></li>`).join('')}</ul>
        <div class="small faint" style="margin-top:4px">Faixas: crítica ≥ ${S.config.priority.levels.critica}, alta ≥ ${S.config.priority.levels.alta}, média ≥ ${S.config.priority.levels.media}. Pesos em Configurações › Prioridade.</div></div>
      <div class="alertbox"><dl class="kv" style="margin:0">
        <dt>Funil / etapa</dt><dd>${esc(c.categoryName)} › ${esc(c.stageName)}</dd>
        <dt>Entrada na etapa</dt><dd>${fmtDT(c.entryTime, t, true)} <span class="faint">(${esc({ historico: 'histórico de etapas', movedTime: 'movedTime do card', acompanhamento: 'início do acompanhamento — parcial' }[c.entrySource])})</span></dd>
        ${c.returned ? `<dt>Retorno</dt><dd>Voltou para esta etapa vindo de ${esc(S.meta.stages?.[`${c.entityTypeId}:${c.returned.fromStageId}`]?.name || c.returned.fromStageId)}</dd>` : ''}
        <dt>Criado em</dt><dd>${c.createdTime != null ? `${fmtDT(c.createdTime, t, true)} <span class="faint">(${esc(fmtAge(c.ageDays))})</span>` : '<span class="faint">não informado</span>'}</dd>
        <dt>Assessor</dt><dd>${esc(c.responsibleName)}</dd>
        ${c.commercialField ? `<dt>Comercial</dt><dd>${esc(c.commercialName)} <span class="faint small">(${esc(c.commercialEmail ? 'e-mail do especialista: ' + c.commercialEmail : c.commercialIsCreator ? 'quem abriu o card' : 'campo ' + c.commercialField)})</span></dd>` : ''}
        <dt>Última interação</dt><dd>${li ? `${esc(li.desc)} — ${fmtDT(li.time, t, true)} por ${esc(li.authorName)}` : '<span class="faint">nenhuma relevante nos dados consultados</span>'}</dd>
        <dt>Próxima atividade</dt><dd>${na ? `${esc(PROVIDER_LABELS[na.providerId] || 'Atividade')}${na.subject ? ` "${esc(na.subject)}"` : ''} — ${fmtDT(na.deadline, t, true)} (${esc(na.responsibleName)})` : '<span class="faint">nenhuma agendada</span>'}</dd>
        <dt>Valor</dt><dd>${c.opportunity ? fmtMoney(c.opportunity, c.currency) : '<span class="faint">não informado</span>'}</dd>
      </dl>${c.link ? `<div style="margin-top:8px"><a class="btn primary sm" href="${esc(c.link)}" target="${LT}" rel="noopener noreferrer">Abrir card no Bitrix24 ↗</a></div>` : ''}</div>
    </div></div>`;
}

// ---------------------------------------------------------------- etapas
function renderEtapas() {
  if (!S.mode) return onboarding();
  let html = banners();
  if (awaitingFocus()) return html + awaitingFocusHtml();
  const A = S.analysis;
  if (!A || !S.sync?.lastSuccess) return html + '<div class="empty"><h3>Sem dados ainda</h3><p class="muted">Sincronize para ver as etapas.</p></div>';
  const now = Date.now(), t = tz();
  const scope = effectiveMonitored(S.config, S.meta);
  const funnels = [];
  for (const m of scope) for (const cid of m.categoryIds) funnels.push({ etid: Number(m.entityTypeId), cid: Number(cid) });
  const histAvg = Object.fromEntries((A.historical?.stageAvg || []).map(x => [x.stageKey, x]));
  html += `<div class="row" style="margin-bottom:10px"><span class="small muted">Cards de cada etapa por data de criação:</span>${orderToggle()}</div>`;
  const ruleText = r => {
    if (!r) return null;
    const u = { min: 'min', h: 'h', d: Number(r.duration.value) === 1 ? ' dia' : ' dias' }[r.duration.unit];
    return `${r.duration.value}${u} corridos`;
  };
  const SLA_PILL = { vencido: ['critica', 'SLA vencido'], aviso: ['media', 'perto do vencimento'], pausado: ['neutral', 'pausado'], ok: ['ok', 'no prazo'], ignorado: ['neutral', 'sem SLA (exceção)'] };
  for (const fn of funnels) {
    const stages = Object.values(S.meta.stages || {}).filter(s => s.entityTypeId === fn.etid && Number(s.categoryId) === fn.cid && s.semantic === 'P').sort((a, b) => a.sort - b.sort);
    const fnCards = A.cards.filter(c => c.entityTypeId === fn.etid && Number(c.categoryId) === fn.cid);
    const name = `${S.meta.entities?.[fn.etid]?.name || fn.etid} › ${S.meta.categories?.[`${fn.etid}:${fn.cid}`]?.name || fn.cid}`;
    const byStage = st => fnCards.filter(c => c.stageId === st.statusId);
    // Valor em aberto por moeda (cada card uma vez; moedas não são somadas entre si).
    const sumValue = list => list.reduce((m, c) => { if (c.opportunity > 0) m[c.currency] = (m[c.currency] || 0) + c.opportunity; return m; }, {});
    const semValor = list => list.filter(c => !(c.opportunity > 0)).length;
    // Fluxo resumido
    html += `<section class="panel" style="margin-bottom:12px"><div class="hd"><h2>${esc(name)}</h2><span class="spacer"></span>
      <span class="small muted">${fnCards.length} card(s) abertos · valor em aberto <b class="num">${esc(fmtMoneyMap(sumValue(fnCards)))}</b></span></div>
      <div class="flow">${stages.map(st => {
        const cs = byStage(st), venc = cs.filter(c => c.stageSlaStatus === 'vencido').length;
        const val = cs.length ? (fmtMoneyMap(sumValue(cs)).replace(/^—$/, 'sem valor')) : 'R$ 0';
        return `<a class="flowstep ${venc ? 'bad' : cs.length ? 'has' : ''}" href="#st-${esc(st.statusId)}" data-act="goto-stage" data-st="${esc(st.statusId)}">
          <span class="fname">${esc(st.name)}</span><span class="fnum">${cs.length}</span><span class="fval num" title="Valor em aberto na etapa">${esc(val)}</span>${venc ? `<span class="fbad">${venc} vencido(s)</span>` : ''}</a>`;
      }).join('<span class="farrow">›</span>')}</div></section>`;
    // Detalhe por etapa
    for (const st of stages) {
      const cs = byStage(st).map(c => {
        const corr = c.entryTime ? (now - c.entryTime) / 60000 : null;
        return { c, corr };
      }).sort((a, b) => byCreation(a.c, b.c));
      const rule = (S.config.slaRules || []).find(r => r.enabled !== false && Number(r.entityTypeId) === fn.etid && Number(r.categoryId) === fn.cid && r.stageId === st.statusId);
      const cnt = k => cs.filter(x => x.c.stageSlaStatus === k).length;
      const avg = cs.length ? cs.reduce((s, x) => s + (x.corr || 0), 0) / cs.length : null;
      const ha = histAvg[`${fn.etid}:${st.statusId}`];
      html += `<details class="panel stage" id="st-${esc(st.statusId)}" ${cs.length ? 'open' : ''} style="margin-bottom:10px">
        <summary><div class="row" style="gap:10px"><h3 style="margin:0">${esc(st.name)}</h3><span class="pill neutral">${cs.length} card(s)</span>
          ${cnt('vencido') ? `<span class="pill critica">${cnt('vencido')} SLA vencido</span>` : ''}${cnt('aviso') ? `<span class="pill media">${cnt('aviso')} perto do vencimento</span>` : ''}
          ${cnt('pausado') ? `<span class="pill neutral">${cnt('pausado')} pausado(s)</span>` : ''}
          ${cs.length ? `<span class="pill neutral num" title="Soma dos valores dos cards abertos nesta etapa">Valor: ${esc(fmtMoneyMap(sumValue(cs.map(x => x.c))))}${semValor(cs.map(x => x.c)) ? ` · ${semValor(cs.map(x => x.c))} sem valor` : ''}</span>` : ''}
          <span class="spacer"></span><span class="small muted">SLA: ${rule ? esc(ruleText(rule)) : '<button class="link" data-act="goto-cfg" data-cfg="sla">definir</button>'}
          ${avg != null ? ` · média atual ${esc(fmtMinutes(avg, 'corrido'))}` : ''}${ha ? ` · histórico ${esc(fmtMinutes(ha.avgMin, 'corrido'))} (${ha.n} passagens)` : ''}</span></div></summary>
        ${cs.length ? `<div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>Card</th><th>Assessor</th><th>Comercial</th><th>Criado em</th><th class="n">Valor</th><th class="n">Na etapa há</th><th>SLA da etapa</th><th>Próxima atividade</th><th>Alertas</th></tr></thead><tbody>
          ${cs.map(({ c, corr }) => {
            const pill = SLA_PILL[c.stageSlaStatus];
            return `<tr><td data-l="Card">${c.link ? `<a href="${esc(c.link)}" target="${LT}" rel="noopener noreferrer"><b>${esc(c.title)}</b></a>` : `<b>${esc(c.title)}</b>`}<div class="small faint">#${c.id}${c.returned ? ' · voltou de etapa' : ''}</div></td>
              <td data-l="Assessor">${esc(c.responsibleName)}</td>
              <td data-l="Comercial">${c.commercialField ? `${esc(c.commercialName)}<div class="small faint">${esc(comSource(c))}</div>` : '<span class="faint">—</span>'}</td>
              <td data-l="Criado em">${c.createdTime != null ? `${fmtDate(c.createdTime, t)}<div class="small faint">${esc(fmtAge(c.ageDays))}</div>` : '<span class="faint">—</span>'}</td>
              <td class="n" data-l="Valor">${c.opportunity > 0 ? fmtMoney(c.opportunity, c.currency) : '<span class="faint">—</span>'}</td>
              <td class="n" data-l="Na etapa há">${corr != null ? `${esc(fmtMinutes(corr, 'corrido'))}${c.partial ? '<div class="small faint">parcial</div>' : ''}` : '—'}
                <div class="small faint">desde ${fmtDT(c.entryTime, t)}</div></td>
              <td data-l="SLA da etapa">${pill ? `<span class="pill ${pill[0]}">${pill[1]}</span>` : '<span class="faint small">sem SLA definido</span>'}</td>
              <td class="small" data-l="Próxima atividade">${c.nextActivity ? `${fmtDT(c.nextActivity.deadline, t)}<div class="faint">${esc(c.nextActivity.subject || '')}</div>` : '<span style="color:var(--high)">nenhuma agendada</span>'}</td>
              <td data-l="Alertas">${c.alerts.length ? `<span class="pill ${c.priority.level}">${LEVELS[c.priority.level]}</span> <span class="small">${c.alerts.length} alerta(s)</span>` : '<span class="pill ok">ok</span>'}</td></tr>`;
          }).join('')}</tbody></table></div>` : '<p class="muted small" style="margin:8px 0 0">Nenhum card aberto nesta etapa.</p>'}</details>`;
    }
  }
  if (!funnels.length) html += '<div class="empty"><h3>Nenhum funil monitorado</h3></div>';
  return html + '<p class="small faint">“Na etapa há” usa a entrada na etapa pelo histórico do Bitrix (ou movedTime; “parcial” quando só há o início do acompanhamento).  Todos os tempos são corridos (24 h por dia, todos os dias). “Criado em” é a data de criação do card no Bitrix e a idade conta dias de calendário no fuso configurado. Os valores somam o campo Valor dos cards abertos, sem converter moedas.</p>';
}

// ---------------------------------------------------------------- ranking de reuniões
const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
function meetingGroup() { return ui.mt.group || S.config.meetings?.groupBy || DEFAULT_MEETINGS.groupBy; }

/** Resumo no Painel: 5 primeiros do mês, pelo agrupamento padrão. */
function meetingsMini() {
  const M = S.analysis?.meetings;
  if (!M || M.enabled === false) return '';
  const p = M.periods.mes, g = meetingGroup();
  const rows = (p.byGroup[g] || []).slice(0, 5);
  return `<div class="panel"><div class="hd"><h2>Ranking de reuniões · ${esc(p.label.toLowerCase())}</h2><span class="spacer"></span>
    <button class="link small" data-act="tab" data-tab="reunioes">ver ranking</button></div>
    ${rows.length ? `<div class="bars">${rows.map(r => `<div class="bar"><div class="name" title="${esc(r.name)}">${MEDAL[r.pos] || r.pos + 'º'} ${esc(r.name)}</div>
      <div class="num">${r.realizadas}<span class="faint">${r.agendadas ? ' +' + r.agendadas : ''}</span></div>
      <div class="track"><i style="width:${(r.realizadas / Math.max(1, rows[0].realizadas)) * 100}%;background:var(--ok)"></i></div></div>`).join('')}
      <div class="small faint">${esc(GROUPS.find(x => x[0] === g)?.[1] || '')} · realizadas (+ agendadas)</div></div>`
      : '<p class="muted">Nenhuma reunião registrada neste mês.</p>'}</div>`;
}

function renderReunioes() {
  if (!S.mode) return onboarding();
  let html = banners();
  if (awaitingFocus()) return html + awaitingFocusHtml();
  const M = S.analysis?.meetings;
  if (!M || !S.sync?.lastSuccess) return html + '<div class="empty"><h3>Sem dados ainda</h3><p class="muted">Sincronize para montar o ranking.</p></div>';
  if (M.enabled === false) {
    return html + `<div class="empty"><div class="ico">📅</div><h3>Ranking de reuniões desativado</h3>
      <button class="btn primary" data-act="goto-cfg" data-cfg="reunioes">Ativar e configurar</button></div>`;
  }
  const t = tz(), g = meetingGroup();
  const p = M.periods[ui.mt.period] || M.periods.mes;
  const rows = p.byGroup[g] || [];
  const max = Math.max(1, ...rows.map(r => r.realizadas));
  const provLabel = (M.config.providers || []).map(x => PROVIDER_LABELS[x] || x).join(', ');
  const cov = M.coverage || {};
  html += `<section class="panel"><div class="hd"><h2>Ranking de reuniões</h2><span class="spacer"></span>
      <span class="small faint">atualizado automaticamente a cada sincronização · ${fmtDT(M.generatedAt, t)}</span></div>
    <div class="row" style="margin-bottom:10px">
      <div class="seg">${PERIODS.map(([k, l]) => `<button class="${(ui.mt.period === k) ? 'on' : ''}" data-act="mt-period" data-v="${k}">${esc(l)}</button>`).join('')}</div>
      <label class="small muted">Agrupar por <select data-act="mt-group">${GROUPS.map(([k, l]) => `<option value="${k}" ${g === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <span class="spacer"></span><button class="btn sm" data-act="mt-csv">Exportar CSV</button></div>
    <div class="small muted" style="margin-bottom:8px">${fmtDT(p.from, t, true)} até ${fmtDT(p.to - 60000, t, true)}${p.partialWindow ? ' · <span class="pill partial">período começa antes da janela lida — aumente a janela em Configurações › Ranking de reuniões</span>' : ''}</div>
    <section class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      ${kpi('Reuniões realizadas', p.totals.realizadas, 'concluídas no período', '', '')}
      ${kpi('Agendadas', p.totals.agendadas, 'ainda vão acontecer no período', 'mid', '')}
      ${kpi('Pendentes', p.totals.pendentes, 'passaram do horário sem ser concluídas', p.totals.pendentes ? 'high' : '', '')}
    </section>
    ${rows.length ? `<div class="tablewrap"><table class="rank"><thead><tr><th class="n">Posição</th><th>${esc(GROUPS.find(x => x[0] === g)[1])}</th>
      <th class="n">Realizadas</th><th></th><th class="n">Agendadas</th><th class="n">Pendentes</th><th class="n">Cards</th><th class="n">Total</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.pos <= 3 ? 'top' : ''}"><td class="n"><b>${MEDAL[r.pos] || ''} ${r.pos}º</b></td><td>${esc(r.name)}</td>
        <td class="n"><b>${r.realizadas}</b></td><td style="width:28%"><div class="track"><i style="width:${(r.realizadas / max) * 100}%;background:var(--ok)"></i></div></td>
        <td class="n">${r.agendadas}</td><td class="n">${r.pendentes ? `<span style="color:var(--high)">${r.pendentes}</span>` : 0}</td>
        <td class="n">${r.cards}</td><td class="n">${r.total}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><h3>Nenhuma reunião neste período</h3><p class="muted">Troque o período ou confira em Configurações › Ranking de reuniões o que conta como reunião.</p></div>'}
    <p class="help" style="margin-top:10px">Ordem: reuniões realizadas; empate por agendadas (mesma posição quando os dois empatam). Conta como reunião: atividades do tipo
      <b>${esc(provLabel || 'nenhum tipo')}</b>${(M.config.todoKeywords || []).length ? ` e atividades "A fazer" com <b>${esc(M.config.todoKeywords.join(', '))}</b> no assunto` : ''}.
      A data é a do início da reunião (ou o prazo). ${M.config.includeClosed ? 'Inclui reuniões de cards já ganhos ou perdidos.' : 'Somente cards abertos.'}
      Janela lida: últimos ${esc(M.config.lookbackDays)} dias e as agendadas. Comercial = nome tirado do e-mail do especialista; sem e-mail, quem abriu o card.
      ${cov.foraDoEscopo ? `${cov.foraDoEscopo} reunião(ões) de funis não monitorados ficaram de fora.` : ''} ${cov.semCard ? `${cov.semCard} sem card identificado.` : ''}
      <button class="link" data-act="goto-cfg" data-cfg="reunioes">Configurar</button></p></section>`;
  return html;
}

function exportMeetingsCsv() {
  const M = S.analysis?.meetings; if (!M) return;
  const p = M.periods[ui.mt.period] || M.periods.mes, g = meetingGroup();
  const rows = [['Posição', GROUPS.find(x => x[0] === g)[1], 'Realizadas', 'Agendadas', 'Pendentes', 'Cards', 'Total', 'Período', 'De', 'Até']];
  for (const r of p.byGroup[g] || []) rows.push([r.pos, r.name, r.realizadas, r.agendadas, r.pendentes, r.cards, r.total, p.label, fmtDT(p.from, tz(), true), fmtDT(p.to - 60000, tz(), true)]);
  downloadCsv(`ranking-reunioes-${ui.mt.period}.csv`, rows);
}

// ---------------------------------------------------------------- estudo de concluídos e cancelados
const pctTxt = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const daysTxt = v => (v == null ? '—' : `${Math.round(v)} dia(s)`);

function closedMini() {
  const C = S.analysis?.closedStudy;
  if (!C || C.enabled === false) return '';
  const p = C.periods['30d'], t = p.totals;
  return `<div class="panel"><div class="hd"><h2>Encerrados · últimos 30 dias</h2><span class="spacer"></span>
    <button class="link small" data-act="tab" data-tab="encerrados">ver estudo</button></div>
    <div class="row" style="gap:18px"><div><div class="num" style="font-size:22px;font-weight:700;color:var(--ok)">${t.concluidos}</div><div class="small muted">concluídos</div></div>
      <div><div class="num" style="font-size:22px;font-weight:700;color:var(--crit)">${t.cancelados}</div><div class="small muted">cancelados</div></div>
      <div><div class="num" style="font-size:22px;font-weight:700">${pctTxt(t.taxa)}</div><div class="small muted">taxa de conclusão</div></div></div>
    <div class="small muted" style="margin-top:6px">Valor concluído: <b>${esc(fmtMoneyMap(t.valorConcluido))}</b></div></div>`;
}

function closedTable(rows, title, keyLabel) {
  return `<div class="panel"><h2>${esc(title)}</h2>${rows.length ? `<div class="tablewrap"><table><thead><tr><th>${esc(keyLabel)}</th><th class="n">Concluídos</th><th class="n">Cancelados</th>
    <th class="n">Taxa</th><th class="n">Valor concluído</th><th class="n">Ciclo médio</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${r.concluidos}</td><td class="n">${r.cancelados}</td><td class="n"><b>${pctTxt(r.taxa)}</b></td>
      <td class="n">${esc(fmtMoneyMap(r.valorConcluido))}</td><td class="n">${daysTxt(r.cicloMedio)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Nenhum encerrado no período.</p>'}</div>`;
}

function countBars(rows, color, empty) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  const max = Math.max(1, ...rows.map(r => r.n));
  return `<div class="bars">${rows.slice(0, 10).map(r => `<div class="bar"><div class="name" title="${esc(r.name)}">${esc(r.name)}</div><div class="num">${r.n}</div>
    <div class="track"><i style="width:${(r.n / max) * 100}%;background:${color}"></i></div></div>`).join('')}</div>`;
}

function closedList(C, p) {
  const t = tz();
  let list = C.items.filter(it => it.closedTime >= p.from && it.closedTime <= p.to + 1);
  if (ui.cs.type) list = list.filter(it => it.type === ui.cs.type);
  if (ui.cs.com) list = list.filter(it => it.commercialKey === ui.cs.com);
  // o botão "inverter" vale para as duas ordens: mais antigos primeiro (padrão) ou mais recentes primeiro
  list.sort(ui.cs.sort === 'criacao' ? byCreation : (a, b) => (ui.dir === 'recentes' ? b.closedTime - a.closedTime : a.closedTime - b.closedTime));
  return list;
}

function renderEncerrados() {
  if (!S.mode) return onboarding();
  let html = banners();
  if (awaitingFocus()) return html + awaitingFocusHtml();
  const C = S.analysis?.closedStudy;
  if (!C || !S.sync?.lastSuccess) return html + '<div class="empty"><h3>Sem dados ainda</h3><p class="muted">Sincronize para montar o estudo.</p></div>';
  if (C.enabled === false) return html + `<div class="empty"><h3>Estudo de concluídos e cancelados desativado</h3>
    <button class="btn primary" data-act="goto-cfg" data-cfg="encerrados">Ativar e configurar</button></div>`;
  const t = tz();
  const p = C.periods[ui.cs.period] || C.periods['90d'];
  const T = p.totals;
  const coms = [...new Map(C.items.map(it => [it.commercialKey, it.commercialName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  html += `<section class="panel"><div class="hd"><h2>Concluídos e cancelados</h2><span class="spacer"></span>
      <span class="small faint">atualizado a cada sincronização · ${fmtDT(C.generatedAt, t)}</span></div>
    <div class="row" style="margin-bottom:10px"><div class="seg">${CLOSED_PERIODS.map(([k, l]) => `<button class="${ui.cs.period === k ? 'on' : ''}" data-act="cs-period" data-v="${k}">${esc(l)}</button>`).join('')}</div>
      <span class="spacer"></span><button class="btn sm" data-act="cs-csv">Exportar CSV</button></div>
    <div class="small muted" style="margin-bottom:8px">Encerrados entre ${fmtDT(p.from, t, true)} e ${fmtDT(p.to, t, true)} · concluído = etapa final de sucesso; cancelado = etapa final de falha (perdido, cancelado…).
      ${p.partialWindow ? '<span class="pill partial">período começa antes da janela lida — aumente a janela nas configurações</span>' : ''}</div>
    <section class="kpis">
      ${kpi('Concluídos', T.concluidos, fmtMoneyMap(T.valorConcluido), '', '')}
      ${kpi('Cancelados', T.cancelados, fmtMoneyMap(T.valorCancelado), 'crit', '')}
      ${kpi('Taxa de conclusão', pctTxt(T.taxa), 'concluídos ÷ encerrados', '', '')}
      ${kpi('Ciclo dos concluídos', daysTxt(T.cicloConcluido.media), T.cicloConcluido.n ? `mediana ${Math.round(T.cicloConcluido.mediana)} dia(s), da criação ao encerramento` : 'sem dados', '', '')}
      ${kpi('Tempo até o cancelamento', daysTxt(T.cicloCancelado.media), T.cicloCancelado.n ? `mediana ${Math.round(T.cicloCancelado.mediana)} dia(s)` : 'sem dados', 'mid', '')}
      ${kpi('Encerrados no período', T.concluidos + T.cancelados, 'nos funis monitorados', '', '')}
    </section>
    <div class="panel" style="margin:12px 0 0;box-shadow:none"><h2>Resumo do estudo</h2><ul class="summary">${p.summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
  </section>
  <section class="grid2">
    <div class="panel"><h2>Onde os cards foram cancelados</h2><p class="help" style="margin-top:-4px">Etapa em que o card estava antes de ir para a etapa de cancelamento.</p>
      ${countBars(p.lostByStage, 'var(--crit)', 'Nenhum cancelamento no período.')}</div>
    <div class="panel"><h2>Motivos dos cancelamentos</h2><p class="help" style="margin-top:-4px">${C.coverage.reasonField ? `Campo "${esc(C.coverage.reasonField)}"; sem motivo preenchido, vale o nome da etapa final.` : 'Nome da etapa final de cancelamento (nenhum campo de motivo encontrado).'}</p>
      ${countBars(p.byReason, 'var(--high)', 'Nenhum cancelamento no período.')}</div>
  </section>
  <section class="grid3">
    ${closedTable(p.byCommercial, 'Por comercial', 'Comercial')}
    ${closedTable(p.byAssessor, 'Por assessor', 'Assessor')}
    ${closedTable(p.byFunnel, 'Por funil', 'Funil')}
    <div class="panel"><h2>Evolução mensal</h2>${monthlyBars(C.monthly)}</div>
  </section>`;
  const list = closedList(C, p);
  const shown = list.slice(0, ui.cs.limit);
  html += `<section class="panel"><div class="hd"><h2>Cards encerrados</h2><span class="spacer"></span><span class="small muted">${list.length} card(s)</span></div>
    <div class="filters">
      <select data-act="cs-type"><option value="">Concluídos e cancelados</option><option value="concluido" ${ui.cs.type === 'concluido' ? 'selected' : ''}>Só concluídos</option><option value="cancelado" ${ui.cs.type === 'cancelado' ? 'selected' : ''}>Só cancelados</option></select>
      <select data-act="cs-com"><option value="">Todos os comerciais</option>${coms.map(([k, n]) => `<option value="${esc(k)}" ${ui.cs.com === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <select data-act="cs-sort"><option value="encerramento" ${ui.cs.sort === 'encerramento' ? 'selected' : ''}>Ordenar: data de encerramento</option><option value="criacao" ${ui.cs.sort === 'criacao' ? 'selected' : ''}>Ordenar: data de criação</option></select>
      ${orderToggle()}</div>
    ${shown.length ? `<div class="tablewrap"><table><thead><tr><th>Card</th><th>Situação</th><th>Etapa anterior → final</th><th>Assessor</th><th>Comercial</th><th class="n">Valor</th>
      <th>Criado em</th><th>Encerrado em</th><th class="n">Dias aberto</th><th>Motivo</th></tr></thead><tbody>
      ${shown.map(it => `<tr><td data-l="Card">${it.link ? `<a href="${esc(it.link)}" target="${LT}" rel="noopener noreferrer"><b>${esc(it.title)}</b></a>` : `<b>${esc(it.title)}</b>`}<div class="small faint">#${it.id} · ${esc(it.funnelName)}</div></td>
        <td><span class="pill ${it.type === 'concluido' ? 'ok' : 'critica'}">${it.type === 'concluido' ? 'Concluído' : 'Cancelado'}</span></td>
        <td class="small">${esc(it.prevStageName || '—')} → <b>${esc(it.finalStageName)}</b></td>
        <td>${esc(it.assessorName)}</td><td>${esc(it.commercialName)}${it.commercialEmail ? `<div class="small faint">${esc(it.commercialEmail)}</div>` : ''}</td>
        <td class="n">${it.opportunity > 0 ? fmtMoney(it.opportunity, it.currency) : '<span class="faint">—</span>'}</td>
        <td>${it.createdTime != null ? fmtDate(it.createdTime, t) : '—'}</td><td>${fmtDate(it.closedTime, t)}</td>
        <td class="n">${it.cycleDays ?? '—'}</td><td class="small">${esc(it.reason || '—')}</td></tr>`).join('')}</tbody></table></div>
      ${list.length > shown.length ? `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm" data-act="cs-more">Mostrar mais</button></div>` : ''}`
      : '<div class="empty"><h3>Nenhum card encerrado com estes filtros</h3></div>'}
    <p class="help" style="margin-top:10px">Lidos os cards encerrados nos últimos ${esc(C.lookbackDays)} dias dos funis monitorados (funis excluídos, como pós-venda, ficam de fora).
      Data de encerramento e etapa anterior vêm do histórico de etapas do Bitrix (${C.coverage.fromHistory} de ${C.coverage.total} cards); sem histórico, usa-se a data da mudança de etapa.
      Dias aberto = dias de calendário da criação ao encerramento. Valores somados por moeda, sem conversão. <button class="link" data-act="goto-cfg" data-cfg="encerrados">Configurar</button></p></section>`;
  return html;
}

function monthlyBars(months) {
  const max = Math.max(1, ...months.map(m => m.concluidos + m.cancelados));
  return `<div class="bars">${months.map(m => `<div class="bar"><div class="name">${esc(m.label)}${m.partial ? ' <span class="faint">(parcial)</span>' : ''}</div>
    <div class="num">${m.concluidos}<span class="faint">/${m.cancelados}</span></div>
    <div class="track"><i style="width:${(m.concluidos / max) * 100}%;background:var(--ok)"></i><i style="width:${(m.cancelados / max) * 100}%;background:var(--crit)"></i></div></div>`).join('')}
    <div class="small faint">verde: concluídos · vermelho: cancelados</div></div>`;
}

function exportClosedCsv() {
  const C = S.analysis?.closedStudy; if (!C) return;
  const p = C.periods[ui.cs.period] || C.periods['90d'], t = tz();
  const rows = [['ID', 'Card', 'Situação', 'Funil', 'Etapa anterior', 'Etapa final', 'Assessor', 'Comercial', 'E-mail do especialista', 'Valor', 'Moeda',
    'Criado em', 'Encerrado em', 'Dias aberto', 'Motivo', 'Link']];
  for (const it of closedList(C, p)) rows.push([it.id, it.title, it.type === 'concluido' ? 'Concluído' : 'Cancelado', it.funnelName, it.prevStageName || '',
    it.finalStageName, it.assessorName, it.commercialName, it.commercialEmail || '', it.opportunity ? String(it.opportunity).replace('.', ',') : '', it.currency,
    it.createdTime != null ? fmtDate(it.createdTime, t) : '', fmtDate(it.closedTime, t), it.cycleDays ?? '', it.reason || '', it.link || '']);
  downloadCsv(`concluidos-cancelados-${ui.cs.period}.csv`, rows);
}

// ---------------------------------------------------------------- central de alertas
function renderAlertas() {
  if (!S.mode) return onboarding();
  const A = S.analysis;
  if (!A) return banners() + '<div class="empty"><h3>Sem dados ainda</h3></div>';
  const now = Date.now(), t = tz();
  const all = A.cards.flatMap(c => c.alerts.map(a => ({ c, a })));
  const snoozed = all.filter(x => x.a.snoozedUntil > now);
  const act = all.filter(x => !(x.a.snoozedUntil > now));
  const groups = [
    ['Venceram durante intervalo sem monitoramento', act.filter(x => x.a.missedWhileOffline), 'Alertas cujo vencimento ocorreu enquanto o Chrome estava fechado ou sem sincronizar.'],
    ['Novos nas últimas 24 horas', act.filter(x => x.a.firstSeen && now - x.a.firstSeen < 86400000 && !x.a.missedWhileOffline), ''],
    ['Em atraso', act.filter(x => ALERT_TYPES[x.a.type].group === 'atraso'), ''],
    ['Próximos do vencimento', act.filter(x => ALERT_TYPES[x.a.type].group === 'aviso'), 'Aviso antecipado conforme o percentual configurado em cada regra.'],
    ['Acompanhamento', act.filter(x => ALERT_TYPES[x.a.type].group === 'acompanhamento'), ''],
    ['Silenciados', snoozed, 'Voltam automaticamente ao fim do período, se ainda estiverem ativos.']
  ];
  const table = list => `<div class="tablewrap"><table><thead><tr><th>Prioridade</th><th>Card</th><th>Alerta</th><th>Motivo</th><th class="n">Atraso</th><th>Assessor</th><th>Comercial</th><th>Criado</th><th>Detectado</th><th></th></tr></thead><tbody>
    ${list.sort((x, y) => byCreation(x.c, y.c) || y.c.priority.score - x.c.priority.score).map(({ c, a }) => `<tr>
      <td><span class="pill ${c.priority.level}">${LEVELS[c.priority.level]}</span></td>
      <td>${c.link ? `<a href="${esc(c.link)}" target="${LT}" rel="noopener noreferrer">${esc(c.title)}</a>` : esc(c.title)}<div class="small muted">${esc(c.categoryName)} › ${esc(c.stageName)}</div></td>
      <td>${esc(a.title)}${a.partial ? ' <span class="pill partial">parcial</span>' : ''}</td><td class="small">${esc(a.reason)}</td>
      <td class="n">${esc(a.overdueText || '—')}</td><td>${esc(c.responsibleName)}</td><td>${c.commercialField ? esc(c.commercialName) : '<span class="faint">—</span>'}</td>
      <td class="small">${c.createdTime != null ? `${fmtDate(c.createdTime, t)}<div class="faint">${esc(fmtAge(c.ageDays))}</div>` : '—'}</td><td class="small">${a.firstSeen ? fmtDT(a.firstSeen, t) : '—'}</td>
      <td>${a.snoozedUntil > now ? `<button class="btn sm" data-act="snooze" data-keys="${esc(a.key)}" data-h="0">Reativar</button>`
        : `<button class="btn sm" data-act="snooze" data-keys="${esc(a.key)}" data-h="4">Silenciar 4 h</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  return banners() + `<div class="row" style="margin-bottom:10px"><span class="small muted">Cards por data de criação:</span>${orderToggle()}</div>` +
    groups.filter(([, l], i) => l.length || i >= 2 && i <= 4).map(([title, list, help]) =>
    `<section class="panel" style="margin-bottom:12px"><div class="hd"><h2>${esc(title)}</h2><span class="pill neutral">${list.length}</span></div>
     ${help ? `<p class="help" style="margin-top:-4px">${esc(help)}</p>` : ''}${list.length ? table(list) : '<p class="muted">Nenhum alerta neste grupo.</p>'}</section>`).join('') +
    `<p class="small faint">As notificações do Chrome são opcionais e respeitam o horário configurado. Nenhuma mensagem é enviada por e-mail, WhatsApp ou comentário no Bitrix.</p>`;
}

// ---------------------------------------------------------------- análises
function renderAnalises() {
  if (!S.mode) return onboarding();
  const A = S.analysis;
  if (!A) return banners() + '<div class="empty"><h3>Sem dados ainda</h3></div>';
  const cov = S.sync?.coverage || {}, s = S.sync || {}, H = A.historical, t = tz();
  const src = { historico: 0, movedTime: 0, acompanhamento: 0 };
  for (const c of A.cards) src[c.entrySource]++;
  const dt = (rows, name) => `<div class="tablewrap"><table><thead><tr><th>${name}</th><th class="n">Cards</th><th class="n">Com alerta</th><th class="n">Em atraso</th><th class="n">Críticos</th><th class="n">Valor em aberto</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${r.cards}</td><td class="n">${r.comAlerta}</td><td class="n">${r.comAtraso}</td><td class="n">${r.criticos}</td><td class="n">${esc(fmtMoneyMap(r.valor))}</td></tr>`).join('')}</tbody></table></div>`;
  let html = banners() + `<section class="grid2">
    <div class="panel"><h2>Cobertura dos dados</h2><dl class="kv">
      <dt>Última consulta OK</dt><dd>${s.lastSuccess ? fmtDT(s.lastSuccess, t, true) : 'nenhuma'} ${s.stats ? `<span class="faint">(${s.stats.full ? 'completa' : 'incremental'}, ${s.stats.requests} requisições)</span>` : ''}</dd>
      <dt>Última completa</dt><dd>${s.lastFull ? fmtDT(s.lastFull, t, true) : '—'}</dd>
      ${(cov.entities || []).map(e => `<dt>${esc(e.name)}</dt><dd>${e.cards} card(s) abertos · ${esc(e.categories.join(', '))}</dd>`).join('')}
      <dt>Histórico de etapas</dt><dd>${Object.entries(cov.history || {}).map(([k, v]) => `${esc(S.meta.entities?.[k]?.name || k)}: ${esc(v)}`).join(' · ') || '—'}</dd>
      <dt>Atividades</dt><dd>${Object.entries(cov.activities || {}).map(([k, v]) => `${esc(S.meta.entities?.[k]?.name || k)}: ${esc(v)}`).join(' · ') || '—'}</dd>
      <dt>Comentários</dt><dd>${esc(cov.comments || '—')}</dd><dt>Usuários</dt><dd>${esc(cov.users || '—')}</dd><dt>Departamentos</dt><dd>${esc(cov.departments || '—')}</dd>
      <dt>Janela de interações</dt><dd>últimos ${cov.lookbackDays ?? '—'} dias</dd>
      <dt>Entrada na etapa</dt><dd>${src.historico} por histórico · ${src.movedTime} por movedTime · ${src.acompanhamento} parcial (desde o início do acompanhamento)</dd>
    </dl></div>
    <div class="panel"><h2>Evolução dos atrasos</h2>${H.evolution ? spark(H.evolution) :
      `<p class="muted">Disponível após sincronizações em pelo menos 3 dias diferentes (atualmente ${H.evolutionDays}). A extensão guarda apenas contagens diárias.</p>`}</div>
  </section>
  <section class="grid3">
    <div class="panel"><h2>Por assessor</h2>${dt(A.distributions.byResponsible, 'Assessor')}</div>
    ${(A.distributions.byCommercial || []).length ? `<div class="panel"><h2>Por comercial</h2>${dt(A.distributions.byCommercial, 'Comercial')}</div>` : ''}
    <div class="panel"><h2>Por funil</h2>${dt(A.distributions.byCategory, 'Funil')}</div>
    <div class="panel"><h2>Por etapa</h2>${dt(A.distributions.byStage, 'Etapa')}</div>
  </section>
  <section class="grid2">
    <div class="panel"><h2>Tempo médio por etapa</h2>
      ${H.stageAvg.length ? `<div class="tablewrap"><table><thead><tr><th>Etapa</th><th class="n">Visitas concluídas</th><th class="n">Média (tempo corrido)</th></tr></thead><tbody>
        ${H.stageAvg.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${r.n}</td><td class="n">${fmtMinutes(r.avgMin, 'corrido')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="help">${H.stageAvg.length ? '' : 'Dados insuficientes. '}Calculado a partir do histórico de etapas dos cards abertos monitorados; exibido só para etapas com pelo menos ${H.minSample} passagens concluídas${H.stageAvgInsufficient ? ` (${H.stageAvgInsufficient} etapa(s) abaixo do mínimo, ocultas)` : ''}.</p></div>
    <div class="panel"><h2>Vencimentos históricos (etapas já concluídas)</h2>
      ${H.breaches.length ? `<div class="tablewrap"><table><thead><tr><th>Etapa</th><th class="n">Passagens</th><th class="n">Acima do SLA</th><th class="n">%</th></tr></thead><tbody>
        ${H.breaches.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${r.visitas}</td><td class="n">${r.vencidas}</td><td class="n">${Math.round(r.vencidas / r.visitas * 100)}%</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Dados insuficientes para comparar passagens anteriores com as regras atuais.</p>'}
      <p class="help">Diferente do atraso atual: aqui contam passagens já encerradas que ficaram acima do SLA configurado hoje. Não entram na fila de pendências.</p></div>
  </section>`;
  return html;
}
function spark(snaps) {
  const W = 520, Hh = 70, max = Math.max(1, ...snaps.map(s => s.comAtraso));
  const pts = key => snaps.map((s, i) => `${(i / Math.max(1, snaps.length - 1)) * W},${Hh - (s[key] / max) * (Hh - 6) - 3}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none"><polyline fill="none" stroke="var(--crit)" stroke-width="2" points="${pts('comAtraso')}"/>
    <polyline fill="none" stroke="var(--mid)" stroke-width="2" points="${pts('slaVencido')}"/></svg>
    <div class="small muted">${esc(snaps[0].day)} → ${esc(snaps[snaps.length - 1].day)} · <span style="color:var(--crit)">cards em atraso</span> · <span style="color:var(--mid)">SLA vencido</span></div>`;
}

// ---------------------------------------------------------------- configurações
const CFG_TABS = [['conexao', 'Conexão'], ['funis', 'Funis e etapas'], ['sla', 'Regras de SLA'],
  ['acomp', 'Acompanhamento e prazos'], ['reunioes', 'Ranking de reuniões'], ['encerrados', 'Concluídos e cancelados'], ['prioridade', 'Prioridade'], ['equipes', 'Equipes'], ['notif', 'Notificações e sincronização'], ['dados', 'Dados e privacidade']];

function renderConfig() {
  const sec = { conexao: cfgConexao, funis: cfgFunis, sla: cfgSla, acomp: cfgAcomp, prioridade: cfgPrioridade,
    equipes: cfgEquipes, notif: cfgNotif, dados: cfgDados, reunioes: cfgReunioes, encerrados: cfgEncerrados }[ui.cfgTab];
  return `${S.mode === 'demo' ? '<div class="banner demo"><div class="small"><b>Configuração da demonstração.</b> Os prazos são exemplos fictícios; alterá-los não afeta a configuração real.</div></div>' : ''}
  <div class="cfg"><nav class="cfgnav">${CFG_TABS.map(([k, l]) => `<button class="${ui.cfgTab === k ? 'on' : ''}" data-act="cfgtab" data-cfg="${k}">${l}</button>`).join('')}</nav>
  <div class="section">${sec()}</div></div>`;
}

const sel = (path, options, cur, rerender) => `<select data-bind="${path}" ${rerender ? 'data-rerender="1"' : ''}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const num = (path, v, attrs = '') => `<input type="number" data-bind="${path}" data-type="number" value="${esc(v ?? '')}" ${attrs}>`;
const chk = (path, v, label, rerender) => `<label class="check"><input type="checkbox" data-bind="${path}" data-type="bool" ${v ? 'checked' : ''} ${rerender ? 'data-rerender="1"' : ''}> ${label}</label>`;
const UNITS = [['min', 'min'], ['h', 'horas'], ['d', 'dias']];

function monitoredFunnels() {
  const out = [];
  for (const m of effectiveMonitored({ ...cfg, focusPage: null }, S.meta)) for (const cid of m.categoryIds) {
    const etid = Number(m.entityTypeId);
    out.push({ etid, cid: Number(cid), name: `${S.meta.entities?.[etid]?.name || etid} › ${S.meta.categories?.[`${etid}:${cid}`]?.name || cid}`,
      stages: Object.entries(S.meta.stages || {}).filter(([k, s]) => k.startsWith(etid + ':') && Number(s.categoryId) === Number(cid)).map(([, s]) => s).sort((a, b) => a.sort - b.sort) });
  }
  return out;
}

function cfgConexao() {
  const c = S.connection;
  let portalAddr = c.origin || cfg.portalAddress || DEFAULT_PORTAL;
  try { portalAddr = normalizePortal(portalAddr, { allowLocalHttp: true }); } catch { portalAddr = DEFAULT_PORTAL; }
  const status = S.mode === 'demo' ? '<span class="pill demo">demonstração ativa</span>'
    : c.origin ? `${c.hasCredential ? '<span class="pill ok">credencial disponível</span>' : '<span class="pill critica">credencial ausente</span>'}
      ${c.hasPermission ? '<span class="pill ok">acesso ao domínio concedido</span>' : '<span class="pill critica">sem permissão de domínio</span>'}`
    : '<span class="pill neutral">não conectado</span>';
  const loginOn = S.mode === 'real' && c.authMode === 'login';
  return `<div class="panel"><h2>Opção 1 — usar o meu login do Bitrix24 (recomendado)</h2>
    <p class="help">Sem webhook: quando você entra no portal, a extensão consulta os cards com o seu próprio login, só para leitura, e mostra a aba <b>SLA</b> dentro do Bitrix.
    Ela vê exatamente o que o seu usuário vê. A atualização acontece enquanto houver uma aba do portal aberta e logada.</p>
    <div class="row"><span class="muted">Portal:</span> <b>${esc(portalAddr)}</b>
      ${loginOn ? `<span class="pill ok">em uso</span> ${c.bitrixTabs ? `<span class="pill ok">${c.bitrixTabs} aba(s) do portal aberta(s)</span>` : '<span class="pill neutral">portal fechado</span>'}` : ''}
      <span class="spacer"></span><button class="btn ${loginOn ? '' : 'primary'}" data-act="connect-login">${loginOn ? 'Testar novamente' : 'Usar meu login do Bitrix'}</button></div>
    <div id="loginResult" class="small" style="margin-top:8px"></div></div>
  <div class="panel"><h2>Opção 2 — webhook de entrada</h2>
    <p class="help">Use se o portal recusar a consulta pelo login, ou se quiser que a extensão atualize mesmo sem o Bitrix aberto.</p>
    <div class="row" style="margin-bottom:10px"><span class="muted">Portal:</span> <b>${esc(c.origin || '—')}</b> ${c.authMode === 'webhook' || !c.authMode ? status : '<span class="pill neutral">não usado</span>'}</div>
    <div class="formgrid">
      <label class="field" style="grid-column:1/-1"><span>Endereço do portal</span>
        <span class="row"><input id="portalAddr" value="${esc(portalAddr)}" placeholder="https://crm.suaempresa.com" spellcheck="false" style="flex:1">
        <a class="btn sm" href="${esc(portalAddr)}/" target="${LT}" rel="noopener noreferrer">Abrir portal ↗</a></span></label>
      <label class="field" style="grid-column:1/-1"><span>URL do webhook de entrada (gerada no portal acima)</span>
        <input type="password" id="whUrl" placeholder="${esc(portalAddr)}/rest/ID_DO_USUARIO/CODIGO/" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Plano do Bitrix24 (limite de requisições)</span>
        <select id="whRate"><option value="2" ${cfg.requestsPerSecond !== 5 ? 'selected' : ''}>Padrão — 2 req/s (seguro para qualquer portal)</option><option value="5" ${cfg.requestsPerSecond === 5 ? 'selected' : ''}>Enterprise ou servidor próprio — 5 req/s</option></select></label>
      <label class="field"><span>Guardar credencial</span>
        <select id="whPersist"><option value="0" ${!c.persisted ? 'selected' : ''}>Só nesta sessão do Chrome (recomendado)</option><option value="1" ${c.persisted ? 'selected' : ''}>Lembrar neste dispositivo</option></select></label>
    </div>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="connect">Conectar e testar</button>
      <label class="check small"><input type="checkbox" id="whShow" data-act="toggle-wh"> mostrar URL</label>
      ${c.origin ? `<span class="spacer"></span><button class="btn" data-act="refresh-structure">Recarregar funis e etapas</button>
      <button class="btn danger" data-act="disconnect">Desconectar</button><button class="btn danger" data-act="disconnect-wipe">Desconectar e apagar dados</button>` : ''}</div>
    <div id="connResult" class="small" style="margin-top:8px"></div></div>
  <div class="panel help"><h3>Como criar o webhook (somente leitura na prática)</h3><ol>
    <li>Entre no portal (<b>${esc(portalAddr)}</b>) e abra <b>Aplicativos › Recursos para desenvolvedores › Outros › Webhook de entrada</b> (em versões antigas: <b>Aplicativos › Webhooks</b>). Se a opção não aparecer, um administrador precisa liberar em <b>Configurações › Segurança › Integrações › Quem pode criar webhooks de entrada</b>.</li>
    <li>Crie um <b>webhook de entrada</b> com as permissões <b>CRM (crm)</b> e <b>Usuários (user)</b>. Opcional: <b>Estrutura da empresa (department)</b> para filtrar por equipe.</li>
    <li>Recomendado: crie o webhook com um <b>usuário dedicado cujo papel no CRM só permita leitura</b> dos funis monitorados. As permissões de webhook do Bitrix24 são por escopo, não por leitura/escrita — a garantia de "somente leitura" vem do usuário e desta extensão, que bloqueia qualquer método que não seja de consulta.</li>
    <li>Se o Bitrix oferecer <b>data de expiração</b> para o webhook, anote-a: depois dela a extensão passa a mostrar erro de autenticação e é preciso gerar outro.</li>
    <li>Copie a URL completa (<span class="mono">${esc(portalAddr)}/rest/ID/CÓDIGO/</span>) e cole acima. O Chrome pedirá permissão para acessar apenas <b>${esc(portalAddr.replace(/^https?:\/\//, ''))}</b>.</li></ol>
    <p><b>Segurança da credencial.</b> A URL do webhook dá acesso ao CRM e é tratada como senha. Por padrão fica só na memória do Chrome e é apagada ao fechar o navegador (você informa de novo ao reabrir). "Lembrar neste dispositivo" grava a URL no perfil do Chrome <b>sem criptografia</b>; use apenas em computador pessoal protegido. Ela nunca aparece em logs, mensagens de erro ou na exportação de configurações. Se vazar, exclua o webhook no Bitrix24 e gere outro.</p>
    <p><b>Por que não OAuth?</b> O fluxo OAuth do Bitrix24 exige o segredo do aplicativo para renovar tokens, que não pode ficar com segurança dentro de uma extensão sem um servidor intermediário. Para uso individual, o webhook com usuário de leitura é o caminho mais seguro viável.</p></div>
  <div class="panel"><h3>Demonstração</h3><p class="help">Usa um portal simulado com dados fictícios, separado da conexão real.</p>
    ${S.mode === 'demo' ? '<button class="btn" data-act="exit-demo">Sair da demonstração</button>' : '<button class="btn" data-act="load-demo">Abrir demonstração</button>'}</div>`;
}

function cfgFunis() {
  const ents = Object.values(S.meta.entities || {});
  if (!ents.length) return `<div class="panel"><h2>Funis e etapas</h2><p class="muted">Conecte-se ao portal para carregar a estrutura.</p></div>`;
  const isOn = (etid, cid) => (cfg.monitored || []).some(m => Number(m.entityTypeId) === Number(etid) && m.categoryIds.map(Number).includes(Number(cid)));
  const portal = S.connection.origin || cfg.portalAddress || DEFAULT_PORTAL;
  const types = Object.entries(cfg.cardTypes || {});
  const focusEt = cfg.focusPage && cfg.focusEntityTypeId ? Number(cfg.focusEntityTypeId) : null;
  const focusEnt = focusEt ? S.meta.entities?.[focusEt] : null;
  const det = S.lastPageTypes && S.lastPageTypes.pagePath === cfg.focusPage ? S.lastPageTypes : null;
  const exclPanel = `<div class="panel"><h2>Funis excluídos</h2>
    <p class="help">Funis ou processos cujo nome contém estes termos nunca são monitorados, nem entram nas etapas, alertas e ranking de reuniões
    (sem diferença de acento, maiúsculas, espaço ou hífen: "pós-venda" exclui "Pós venda", "POS-VENDA" e "Pós-venda e Assessoria").</p>
    <label class="field"><span>Termos (separe por vírgula)</span><input data-bind="excludeNames" data-type="words" value="${esc((cfg.excludeNames ?? DEFAULT_EXCLUDE_NAMES).join(', '))}" placeholder="pós-venda"></label></div>`;
  const focusPanel = `<div class="panel"><h2>Escopo: somente as oportunidades de uma página</h2>
    <p class="help">Com a página de foco definida, a extensão analisa <b>apenas</b> os cards dessa página do Bitrix e ignora negócios, leads e outros processos.
    O processo é identificado sozinho pelos links dos cards quando você abre a página no Bitrix.</p>
    <div class="row"><input id="focusPage" value="${esc(cfg.focusPage ? portal + cfg.focusPage : '')}" placeholder="${esc(portal + DEFAULT_FOCUS_PAGE)}" style="flex:1;min-width:260px" spellcheck="false">
      <button class="btn primary" data-act="set-focus">Aplicar</button>
      ${cfg.focusPage ? '<button class="btn" data-act="clear-focus">Remover foco</button>' : ''}</div>
    <div style="margin-top:8px">${!cfg.focusPage ? '<span class="pill neutral">sem foco — escolha os funis abaixo</span>'
      : focusEnt ? `<span class="pill ok">monitorando somente</span> <b>${esc(focusEnt.name)}</b> <span class="small muted">(processo ${focusEt}, ${focusEnt.categories.length} funil(is)) · página ${esc(cfg.focusPage)}</span>`
      : `<span class="pill partial">aguardando identificação</span> <span class="small">Abra <a href="${esc(portal + cfg.focusPage)}" target="${LT}" rel="noopener noreferrer">${esc(portal + cfg.focusPage)}</a> no Bitrix (logado) com os cards carregados.${det ? ' Processo encontrado: ' + det.types.map(t => t.entityTypeId).join(', ') + '.' : ''}</span>`}</div></div>`;
  const comEts = [...new Set(effectiveMonitored(cfg, S.meta).map(m => Number(m.entityTypeId)))];
  const comPanel = comEts.length ? `<div class="panel"><h2>Comercial do card</h2>
    <p class="help">O <b>comercial</b> aparece em coluna própria, separado do <b>assessor</b> (o responsável pelo card no Bitrix), em todas as telas, nos filtros e no ranking de reuniões.
    1º) <b>E-mail do especialista</b>: o e-mail do campo vira nome e sobrenome (ex.: <span class="mono">yago.barbosa@besmart.com.br</span> → <b>Yago Barbosa</b>).
    2º) Cards sem esse e-mail usam <b>quem abriu o card</b> (campo "Criado por"), ou outro campo de usuário escolhido abaixo.</p>
    ${comEts.map(etid => {
      const f = S.meta.fields?.[etid];
      const cur = commercialFieldFor(cfg, S.meta, etid);
      const chosen = cfg.commercialFields?.[etid];
      const selVal = chosen ? chosen.field : '__auto';
      if (!f) return `<div class="row" style="margin:6px 0"><b>${esc(S.meta.entities?.[etid]?.name || etid)}</b> <button class="btn sm" data-act="load-fields" data-etid="${etid}">Carregar campos</button></div>`;
      const userFields = Object.entries(f).filter(([k, v]) => v.type === 'user' && !['createdBy', 'updatedBy', 'movedBy', 'lastActivityBy'].includes(k))
        .sort((a, b) => a[1].title.localeCompare(b[1].title));
      const spec = specialistFieldFor(cfg, S.meta, etid);
      const specChosen = cfg.specialistFields?.[etid];
      const specVal = specChosen ? specChosen.field : '__auto';
      const textFields = Object.entries(f).filter(([, v]) => !['user', 'date', 'datetime', 'boolean', 'double', 'integer', 'money', 'crm_status', 'crm_category'].includes(v.type))
        .sort((a, b) => String(a[1].title).localeCompare(String(b[1].title)));
      return `<div class="row" style="margin:6px 0"><b style="min-width:160px">${esc(S.meta.entities?.[etid]?.name || etid)}</b>
        <span class="small muted">E-mail do especialista:</span>
        <select data-act="set-specialist-field" data-etid="${etid}">
          <option value="__auto" ${specVal === '__auto' ? 'selected' : ''}>Automático${!specChosen ? (spec ? ` (${esc(spec.label)})` : ' (nenhum campo encontrado)') : ''}</option>
          ${textFields.map(([k, v]) => `<option value="${esc(k)}" ${specVal === k ? 'selected' : ''}>${esc(v.title)} (${esc(k)})</option>`).join('')}
          <option value="" ${specVal === '' ? 'selected' : ''}>Não usar</option></select>
        ${spec ? `<span class="pill ok">usando: ${esc(spec.label)}</span>` : '<span class="pill neutral">sem campo de e-mail</span>'}</div>
      <div class="row" style="margin:6px 0 12px"><span style="min-width:160px"></span><span class="small muted">Sem e-mail, usar:</span>
        <select data-act="set-commercial-field" data-etid="${etid}">
          <option value="__auto" ${selVal === '__auto' || selVal === 'createdBy' ? 'selected' : ''}>Quem abriu o card (Criado por) — padrão</option>
          ${userFields.map(([k, v]) => `<option value="${esc(k)}" ${selVal === k ? 'selected' : ''}>${esc(v.title)} (${esc(k)})</option>`).join('')}
          <option value="" ${selVal === '' ? 'selected' : ''}>Não mostrar comercial</option></select>
        ${cur ? `<span class="pill ok">usando: ${esc(cur.label)}</span>` : '<span class="pill neutral">sem campo de comercial</span>'}</div>`;
    }).join('')}</div>` : '';
  return focusPanel + exclPanel + comPanel + (focusEnt ? '' : `<div class="panel"><h2>O que representa um "card"</h2><p class="help">Escolha os funis monitorados entre negócios, leads e processos inteligentes encontrados no portal.
    Tarefas avulsas do módulo Tarefas não são cards nesta versão — tarefas vinculadas a um card entram como atividades dele.</p></div>
  <div class="panel"><h2>Processo de um espaço digital (ex.: be.smart › Seguros)</h2>
    <p class="help">Cards de espaços digitais (páginas como <span class="mono">${esc(portal)}/page/besmart/seguros/</span>) são processos inteligentes.
    O Bitrix24 só lista os processos inteligentes para administradores do CRM; com um usuário somente-leitura, adicione o processo aqui:
    abra <b>qualquer card</b> desse espaço, copie o endereço da barra do navegador (algo como <span class="mono">${esc(portal)}/page/besmart/seguros/type/NÚMERO/details/123/</span>) e cole abaixo.
    O mesmo endereço define o formato do botão "Abrir no Bitrix".</p>
    ${/\/type\/\d+\/details\/\d+/.test(S.lastBitrixUrl || '') && !types.some(([etid]) => (S.lastBitrixUrl || '').includes(`/type/${etid}/`))
      ? `<div class="banner ok small" style="margin:6px 0"><div>Você abriu um card desse tipo no Bitrix agora há pouco. O endereço já foi preenchido abaixo — confira e clique em Adicionar processo.</div></div>` : ''}
    <div class="row"><input id="cardUrl" value="${esc(/\/details\/\d+/.test(S.lastBitrixUrl || '') ? S.lastBitrixUrl : '')}" placeholder="${esc(portal)}/page/besmart/seguros/type/…/details/…/" style="flex:1;min-width:240px" spellcheck="false">
      <button class="btn primary" data-act="add-card-type">Adicionar processo</button></div>
    <div id="cardTypeResult" class="small" style="margin-top:6px"></div>
    ${types.length ? `<table style="margin-top:8px;table-layout:fixed"><thead><tr><th>Tipo</th><th>Processo</th><th>Link do card</th><th></th></tr></thead><tbody>${types.map(([etid, t]) =>
      `<tr><td class="mono">${esc(etid)}</td><td>${esc(S.meta.entities?.[etid]?.name || 'não encontrado na última leitura')}${S.meta.entities?.[etid]?.workspace ? ` <span class="pill neutral">${esc(S.meta.entities[etid].workspace)}</span>` : ''}</td>
       <td class="mono" style="word-break:break-all">${esc(t.linkPath)}</td><td><button class="btn sm danger" data-act="rm-card-type" data-etid="${esc(etid)}">remover</button></td></tr>`).join('')}</tbody></table>` : ''}</div>`) +
    (focusEt ? ents.filter(e => Number(e.entityTypeId) === focusEt) : cfg.focusPage ? [] : ents).map(e => `<div class="panel"><div class="hd"><h2>${esc(e.name)}</h2><span class="pill neutral">${e.kind === 'deal' ? 'negócios' : e.kind === 'lead' ? 'leads' : 'processo inteligente'} · tipo ${e.entityTypeId}</span>${e.workspace ? `<span class="pill neutral">espaço digital: ${esc(e.workspace)}</span>` : e.customSectionId ? '<span class="pill neutral">espaço digital</span>' : ''}</div>
      ${(e.categories || []).map(cid => {
        const stages = Object.values(S.meta.stages || {}).filter(s => s.entityTypeId === e.entityTypeId && Number(s.categoryId) === Number(cid)).sort((a, b) => a.sort - b.sort);
        const catName = S.meta.categories?.[`${e.entityTypeId}:${cid}`]?.name || String(cid);
        const excl = isExcludedName(catName, cfg.excludeNames ?? DEFAULT_EXCLUDE_NAMES) || isExcludedName(e.name, cfg.excludeNames ?? DEFAULT_EXCLUDE_NAMES);
        return `<div style="margin:6px 0 10px"><label class="check"><input type="checkbox" data-act="toggle-cat" data-etid="${e.entityTypeId}" data-cid="${cid}" ${isOn(e.entityTypeId, cid) && !excl ? 'checked' : ''} ${excl ? 'disabled' : ''}>
          <b>${esc(catName)}</b></label>${excl ? ' <span class="pill neutral">excluído do monitoramento</span>' : ''}
          <div class="chips" style="margin-left:24px">${stages.map(s => `<span class="chip">${esc(s.name)} ${s.semantic !== 'P' ? `<span class="stage-sem ${s.semantic}">${s.semantic === 'S' ? 'sucesso' : 'falha'}</span>` : ''}</span>`).join('') || '<span class="faint small">sem etapas lidas</span>'}</div></div>`;
      }).join('')}</div>`).join('') +
    (cfg.focusPage && !focusEt ? `<p class="help">Nenhum outro funil é monitorado enquanto o foco estiver ativo. Abra a página no Bitrix para identificar o processo.</p>` : '') +
    (focusEt ? `<p class="help">Outros tipos de card estão ocultos porque o foco está ativo. Use "Remover foco" para escolher outros funis.</p>` : '') +
    `<p class="help">Etapas finais (sucesso/falha) encerram o card: ele sai da fila de pendências atuais. Ao selecionar um funil, a regra objetiva "sem atividade futura" é ativada; prazos de SLA continuam vazios até você defini-los.</p>`;
}

function fieldOptions(etid, filterFn = () => true) {
  const f = S.meta.fields?.[etid];
  if (!f) return null;
  return Object.entries(f).filter(([k, v]) => filterFn(k, v)).map(([k, v]) => [k, `${v.title} (${k})`]).sort((a, b) => a[1].localeCompare(b[1]));
}
function condEditor(path, conds, etid, withAction) {
  const fopts = fieldOptions(etid, k => k.startsWith('uf') || ['opportunity', 'sourceId', 'typeId', 'assignedById'].includes(k));
  if (!fopts) return `<button class="btn sm" data-act="load-fields" data-etid="${etid}">Carregar campos do portal</button>`;
  return (conds || []).map((c, i) => {
    const field = S.meta.fields?.[etid]?.[c.field];
    const valInput = field?.items ? sel(`${path}.${i}.value`, [['', '—'], ...field.items.map(it => [it.id, it.value])], c.value)
      : field?.type === 'boolean' ? sel(`${path}.${i}.value`, [['Y', 'Sim'], ['N', 'Não']], c.value)
      : `<input data-bind="${path}.${i}.value" value="${esc(c.value ?? '')}" placeholder="valor" style="width:110px">`;
    return `<div class="cond">${sel(`${path}.${i}.field`, [['', 'campo…'], ...fopts], c.field, true)}
      ${sel(`${path}.${i}.op`, [['eq', '='], ['neq', '≠'], ['in', 'em (lista)'], ['notIn', 'fora de'], ['empty', 'vazio'], ['notEmpty', 'preenchido'], ['contains', 'contém']], c.op)}
      ${['empty', 'notEmpty'].includes(c.op) ? '' : valInput}
      ${withAction ? `${sel(`${path}.${i}.action`, [['prazo', 'usar prazo'], ['ignorar', 'sem SLA']], c.action, true)}
        ${c.action === 'prazo' ? `${num(`${path}.${i}.duration.value`, c.duration?.value, 'style="width:60px" min="0"')}${sel(`${path}.${i}.duration.unit`, UNITS, c.duration?.unit)}` : ''}` : ''}
      <button class="btn sm" data-act="rm" data-path="${path}" data-i="${i}">×</button></div>`;
  }).join('') + `<button class="link small" data-act="add-cond" data-path="${path}" data-with="${withAction ? 1 : 0}">+ ${withAction ? 'exceção' : 'condição de pausa'}</button>`;
}

function cfgSla() {
  const funnels = monitoredFunnels();
  if (!funnels.length) return `<div class="panel"><h2>Regras de SLA</h2><p class="muted">Selecione primeiro os funis monitorados.</p></div>`;
  const intro = `<div class="panel help"><h2 style="color:var(--text)">Regras de SLA por funil e etapa</h2>
    <p>Nenhum prazo vem preenchido: defina somente os que fazem parte da sua operação. Nenhuma etapa é pausa automática — "aguardando documentos", por exemplo, só pausa se você configurar.</p>
    <ul><li><b>Retorno à etapa:</b> <i>reiniciar</i> conta do zero a cada nova entrada; <i>acumular</i> soma todas as passagens; <i>manter original</i> conta desde a primeira entrada.</li>
    <li><b>Pausa:</b> por valor de campo do card (registrada a partir da observação pela extensão, pois o Bitrix não guarda histórico de campos).</li>
    <li><b>Exceções:</b> por campo ou tipo de atendimento — usar outro prazo ou não aplicar SLA.</li>
    <li><b>Limite parado:</b> alerta independente do SLA, para card sem mudança de etapa além do limite.</li></ul></div>`;
  return intro + funnels.map(fn => {
    const rows = fn.stages.filter(s => s.semantic === 'P').map(s => {
      const i = cfg.slaRules.findIndex(r => Number(r.entityTypeId) === fn.etid && Number(r.categoryId) === fn.cid && r.stageId === s.statusId);
      const r = cfg.slaRules[i];
      const si = cfg.stagnationRules.findIndex(x => Number(x.entityTypeId) === fn.etid && Number(x.categoryId) === fn.cid && x.stageId === s.statusId);
      const st = cfg.stagnationRules[si];
      const stag = st ? `<span class="inline">${num(`stagnationRules.${si}.limit.value`, st.limit.value, 'min="0"')}${sel(`stagnationRules.${si}.limit.unit`, UNITS, st.limit.unit)}</span>
        <span class="small faint">corridos</span> <button class="btn sm" data-act="rm" data-path="stagnationRules" data-i="${si}">×</button>`
        : `<button class="link small" data-act="add-stag" data-etid="${fn.etid}" data-cid="${fn.cid}" data-stage="${esc(s.statusId)}">definir</button>`;
      if (!r) return `<tr><td><b>${esc(s.name)}</b><div class="mono faint">${esc(s.statusId)}</div></td><td colspan="4"><button class="btn sm" data-act="add-sla" data-etid="${fn.etid}" data-cid="${fn.cid}" data-stage="${esc(s.statusId)}">Definir SLA da etapa</button>
        ${r === undefined ? '<span class="small faint">sem SLA</span>' : ''}</td><td>${stag}</td></tr>`;
      return `<tr><td><b>${esc(s.name)}</b><div class="mono faint">${esc(s.statusId)}</div>${r.example ? '<span class="pill partial">exemplo</span>' : ''}</td>
        <td><span class="inline">${num(`slaRules.${i}.duration.value`, r.duration.value, 'min="0"')}${sel(`slaRules.${i}.duration.unit`, UNITS, r.duration.unit)}</span><div class="small faint" style="margin-top:4px">dias corridos</div></td>
        <td><span class="inline">${num(`slaRules.${i}.warnPercent`, r.warnPercent, 'min="1" max="100" style="width:60px"')}%</span></td>
        <td>${sel(`slaRules.${i}.onReturn`, [['reiniciar', 'reiniciar'], ['acumular', 'acumular'], ['primeira', 'manter original']], r.onReturn)}</td>
        <td style="min-width:260px"><div class="small muted"><b>Pausa</b></div>${condEditor(`slaRules.${i}.pause`, r.pause, fn.etid, false)}
          <div class="small muted" style="margin-top:6px"><b>Exceções</b></div>${condEditor(`slaRules.${i}.exceptions`, r.exceptions, fn.etid, true)}</td>
        <td>${stag}<div style="margin-top:6px"><button class="btn sm danger" data-act="rm" data-path="slaRules" data-i="${i}">remover SLA</button></div></td></tr>`;
    }).join('');
    const di = cfg.stagnationRules.findIndex(x => Number(x.entityTypeId) === fn.etid && Number(x.categoryId) === fn.cid && (x.stageId === '*' || !x.stageId));
    const ds = cfg.stagnationRules[di];
    const pi = cfg.processRules.findIndex(x => Number(x.entityTypeId) === fn.etid && Number(x.categoryId) === fn.cid);
    const pr = cfg.processRules[pi];
    const pStages = fn.stages.filter(s => s.semantic === 'P');
    return `<div class="panel"><h2>${esc(fn.name)}</h2><div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>Etapa</th><th>SLA da etapa</th><th>Alertar a partir de</th><th>Retorno à etapa</th><th>Pausa e exceções</th><th>Limite parado</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row" style="margin-top:10px"><b class="small">Limite parado padrão do funil (etapas sem limite próprio):</b>
        ${ds ? `<span class="inline">${num(`stagnationRules.${di}.limit.value`, ds.limit.value, 'min="0"')}${sel(`stagnationRules.${di}.limit.unit`, UNITS, ds.limit.unit)}</span><span class="small faint">corridos</span>
          <button class="btn sm" data-act="rm" data-path="stagnationRules" data-i="${di}">×</button>` : `<button class="link small" data-act="add-stag" data-etid="${fn.etid}" data-cid="${fn.cid}" data-stage="*">definir</button>`}</div>
      <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><h3>SLA total do processo</h3>
        ${pr ? `<div class="formgrid" style="margin-top:6px">
          <label class="field"><span>Prazo total</span><span class="inline">${num(`processRules.${pi}.duration.value`, pr.duration.value, 'min="0"')}${sel(`processRules.${pi}.duration.unit`, UNITS, pr.duration.unit)}</span></label>
            <label class="field"><span>Alertar a partir de (%)</span>${num(`processRules.${pi}.warnPercent`, pr.warnPercent, 'min="1" max="100"')}</label>
          <label class="field"><span>Início da contagem</span>${sel(`processRules.${pi}.startMode`, [['criacao', 'criação do card'], ['entrada_funil', 'entrada neste funil'], ['etapa', 'entrada em uma etapa']], pr.startMode, true)}</label>
          ${pr.startMode === 'etapa' ? `<label class="field"><span>Etapa inicial</span>${sel(`processRules.${pi}.startStageId`, pStages.map(s => [s.statusId, s.name]), pr.startStageId)}</label>` : ''}</div>
          <div style="margin-top:6px"><span class="small muted"><b>Etapas que não contam no prazo total (pausa por etapa):</b></span>
            <div class="row">${pStages.map(s => `<label class="check small"><input type="checkbox" data-act="toggle-in" data-path="processRules.${pi}.pauseStages" data-v="${esc(s.statusId)}" ${(pr.pauseStages || []).includes(s.statusId) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div></div>
          <button class="btn sm danger" style="margin-top:8px" data-act="rm" data-path="processRules" data-i="${pi}">remover SLA total</button>`
        : `<button class="btn sm" data-act="add-proc" data-etid="${fn.etid}" data-cid="${fn.cid}">Definir SLA total do processo</button>`}</div></div>`;
  }).join('');
}

function cfgAcomp() {
  const funnels = monitoredFunnels();
  const etids = [...new Set(funnels.map(f => f.etid))];
  const provs = new Set([...DEFAULT_RELEVANT_PROVIDERS, ...Object.keys(PROVIDER_LABELS), ...Object.keys(S.observedProviders || {})].filter(Boolean));
  const users = Object.entries(S.meta.users || {}).sort((a, b) => a[1].name.localeCompare(b[1].name));
  let html = '';
  html += `<div class="panel"><h2>Por funil</h2>${funnels.length ? funnels.map(fn => {
    const nfi = cfg.noFutureActivityRules.findIndex(r => Number(r.entityTypeId) === fn.etid && Number(r.categoryId) === fn.cid);
    const nf = cfg.noFutureActivityRules[nfi];
    const nii = cfg.noInteractionRules.findIndex(r => Number(r.entityTypeId) === fn.etid && Number(r.categoryId) === fn.cid);
    const ni = cfg.noInteractionRules[nii];
    const pst = fn.stages.filter(s => s.semantic === 'P');
    return `<div style="border-top:1px solid var(--line);padding:10px 0"><h3>${esc(fn.name)}</h3>
      <div style="margin-top:6px"><b class="small">Sem atividade futura agendada</b>:
        ${nf ? `${chk(`noFutureActivityRules.${nfi}.enabled`, nf.enabled !== false, 'ativo')}
          <div class="row small" style="margin-top:4px"><span class="muted">Não alertar nas etapas:</span>${pst.map(s => `<label class="check"><input type="checkbox" data-act="toggle-in" data-path="noFutureActivityRules.${nfi}.excludeStages" data-v="${esc(s.statusId)}" ${(nf.excludeStages || []).includes(s.statusId) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div>`
          : `<button class="link small" data-act="add-nf" data-etid="${fn.etid}" data-cid="${fn.cid}">ativar</button>`}</div>
      <div style="margin-top:8px"><b class="small">Sem interação relevante há mais de</b>:
        ${ni ? `<span class="inline">${num(`noInteractionRules.${nii}.limit.value`, ni.limit.value, 'min="0"')}${sel(`noInteractionRules.${nii}.limit.unit`, UNITS, ni.limit.unit)}</span><span class="small faint">corridos</span>
          ${ni.example ? '<span class="pill partial">exemplo</span>' : ''}<button class="btn sm" data-act="rm" data-path="noInteractionRules" data-i="${nii}">×</button>
          <div class="row small" style="margin-top:4px"><span class="muted">Não alertar nas etapas:</span>${pst.map(s => `<label class="check"><input type="checkbox" data-act="toggle-in" data-path="noInteractionRules.${nii}.excludeStages" data-v="${esc(s.statusId)}" ${(ni.excludeStages || []).includes(s.statusId) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div>`
          : `<button class="link small" data-act="add-ni" data-etid="${fn.etid}" data-cid="${fn.cid}">definir limite</button>`}</div></div>`;
  }).join('') : '<p class="muted">Selecione funis primeiro.</p>'}</div>`;

  html += `<div class="panel"><h2>Prazo definido no card</h2><p class="help">Escolha o campo de data que representa o prazo do card. Nada é presumido: a "data prevista de fechamento" do Bitrix costuma ser preenchida automaticamente e por isso não é usada sem sua escolha.</p>
    ${etids.map(etid => {
      const opts = fieldOptions(etid, (k, v) => ['date', 'datetime'].includes(v.type));
      const d = cfg.deadlineFields[etid] || {};
      return `<div class="row" style="margin:6px 0"><b style="min-width:180px">${esc(S.meta.entities?.[etid]?.name || etid)}</b>
        ${opts ? `<select data-act="set-deadline-field" data-etid="${etid}"><option value="">— nenhum —</option>${opts.map(([k, l]) => `<option value="${esc(k)}" ${d.field === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
          ${d.field ? `<span class="small muted">avisar</span>${num(`deadlineFields.${etid}.warnHours`, d.warnHours ?? 24, 'min="0" style="width:70px"')}<span class="small muted">horas antes</span>` : ''}`
        : `<button class="btn sm" data-act="load-fields" data-etid="${etid}">Carregar campos</button>`}</div>`;
    }).join('') || '<p class="muted">Selecione funis primeiro.</p>'}</div>`;

  html += `<div class="panel"><h2>O que conta como interação comercial</h2>
    <p class="help">Só os tipos marcados contam como acompanhamento. Alterações genéricas do card, automações e o "lastActivityTime" do Bitrix nunca contam sozinhos — aparecem como evidência descartada.</p>
    <div class="tablewrap"><table><thead><tr><th>Conta?</th><th>Tipo de atividade</th><th>Código</th><th class="n">Encontradas</th></tr></thead><tbody>
    ${[...provs].sort().map(p => `<tr><td><input type="checkbox" data-act="toggle-in" data-path="interaction.relevantProviders" data-v="${esc(p)}" ${cfg.interaction.relevantProviders.includes(p) ? 'checked' : ''}></td>
      <td>${esc(PROVIDER_LABELS[p] || 'Outro')}</td><td class="mono">${esc(p)}</td><td class="n">${S.observedProviders?.[p] || 0}</td></tr>`).join('')}</tbody></table></div>
    <div style="margin-top:10px"><b class="small">Usuários de automação (atividades e comentários deles não contam):</b>
      <div class="row small">${users.length ? users.map(([id, u]) => `<label class="check"><input type="checkbox" data-act="toggle-in" data-path="interaction.automationUserIds" data-v="${esc(id)}" ${cfg.interaction.automationUserIds.includes(id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('') : '<span class="faint">usuários carregados após a primeira sincronização</span>'}</div></div>
    <div class="formgrid" style="margin-top:10px">
      ${chk('interaction.countComments', cfg.interaction.countComments, 'Comentários na timeline contam como interação')}
      ${chk('interaction.countCreatedByHuman', cfg.interaction.countCreatedByHuman, 'Agendar/criar atividade conta como interação')}
      <label class="field"><span>Janela de consulta de atividades concluídas (dias)</span>${num('interaction.lookbackDays', cfg.interaction.lookbackDays, 'min="7" max="365"')}</label>
      ${chk('useMovedTime', cfg.useMovedTime, 'Sem histórico de etapas, usar o campo movedTime do card como entrada na etapa')}</div></div>`;
  return html;
}

function cfgPrioridade() {
  const p = cfg.priority;
  const funnels = monitoredFunnels();
  return `<div class="panel"><h2>Pontuação de prioridade</h2><p class="help">A prioridade de cada card é a soma dos pontos abaixo; os motivos aparecem no detalhe do card.</p>
    <div class="formgrid">${Object.entries(ALERT_TYPES).map(([k, v]) => `<label class="field"><span>${esc(v.label)}</span>${num(`priority.weights.${k}`, p.weights[k] ?? 0, 'min="0"')}</label>`).join('')}</div></div>
  <div class="panel"><h2>Intensidade</h2><div class="formgrid">
    <label class="field"><span>Pontos por dia de atraso</span>${num('priority.overduePointsPerDay', p.overduePointsPerDay, 'min="0" step="0.5"')}</label>
    <label class="field"><span>Máximo por atraso</span>${num('priority.overdueMaxPoints', p.overdueMaxPoints, 'min="0"')}</label>
    <label class="field"><span>Pontos a cada 100% de estouro do SLA</span>${num('priority.overPercentPointsPer100', p.overPercentPointsPer100, 'min="0"')}</label>
    <label class="field"><span>Máximo por estouro</span>${num('priority.overPercentMaxPoints', p.overPercentMaxPoints, 'min="0"')}</label>
    <label class="field"><span>Bônus por valor no topo (%) dos cards</span>${num('priority.valueTopPercent', p.valueTopPercent, 'min="0" max="100"')}</label>
    <label class="field"><span>Pontos do bônus de valor</span>${num('priority.valueBonus', p.valueBonus, 'min="0"')}</label>
    <label class="field"><span>Pontos por alerta adicional</span>${num('priority.extraAlertPoints', p.extraAlertPoints, 'min="0"')}</label>
    <label class="field"><span>Máximo por alertas adicionais</span>${num('priority.extraAlertMaxPoints', p.extraAlertMaxPoints, 'min="0"')}</label></div>
    <p class="help">O bônus de valor compara com os demais cards monitorados (exige ao menos 5 cards com valor); nenhum valor em reais é presumido.</p></div>
  <div class="panel"><h2>Faixas</h2><div class="formgrid">
    <label class="field"><span>Crítica a partir de</span>${num('priority.levels.critica', p.levels.critica)}</label>
    <label class="field"><span>Alta a partir de</span>${num('priority.levels.alta', p.levels.alta)}</label>
    <label class="field"><span>Média a partir de</span>${num('priority.levels.media', p.levels.media)}</label></div></div>
  <div class="panel"><h2>Peso por etapa</h2><p class="help">Pontos extras para etapas mais sensíveis (ex.: assinatura, boleto).</p>
    ${funnels.map(fn => `<h3 style="margin-top:8px">${esc(fn.name)}</h3><div class="formgrid">${fn.stages.filter(s => s.semantic === 'P').map(s =>
      `<label class="field"><span>${esc(s.name)}</span><input type="number" data-act="stage-weight" data-k="${fn.etid}:${esc(s.statusId)}" value="${esc(p.stageWeights?.[`${fn.etid}:${s.statusId}`] ?? '')}" placeholder="0"></label>`).join('')}</div>`).join('')}
    <button class="btn sm" style="margin-top:10px" data-act="reset-priority">Restaurar pesos padrão</button></div>`;
}

function cfgEquipes() {
  const users = Object.entries(S.meta.users || {}).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const deps = Object.values(S.meta.departments || {});
  return `<div class="panel"><h2>Equipes</h2><p class="help">${deps.length ? `Departamentos do Bitrix24 já são usados como equipes (${deps.map(d => esc(d.name)).join(', ')}).` : 'Departamentos do Bitrix24 indisponíveis (requer o escopo "department" no webhook).'}
    Você também pode criar equipes manuais, por exemplo Comercial, Operacional e Assessores.</p>
    ${cfg.teams.map((t, i) => `<div style="border-top:1px solid var(--line);padding:8px 0"><div class="row"><input data-bind="teams.${i}.name" value="${esc(t.name)}" placeholder="Nome da equipe">
      <button class="btn sm danger" data-act="rm" data-path="teams" data-i="${i}">remover</button></div>
      <div class="row small" style="margin-top:4px">${users.map(([id, u]) => `<label class="check"><input type="checkbox" data-act="toggle-in" data-path="teams.${i}.userIds" data-v="${esc(id)}" ${t.userIds.includes(id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('') || '<span class="faint">usuários aparecem após a primeira sincronização</span>'}</div></div>`).join('')}
    <button class="btn sm" data-act="add-team">+ equipe</button></div>`;
}

function cfgNotif() {
  const n = cfg.notifications;
  return `<div class="panel"><h2>Notificações do Chrome</h2>
    <div class="row">${chk('notifications.enabled', n.enabled, 'Ativar notificações', true)} ${S.notificationsPermission ? '<span class="pill ok">permissão concedida</span>' : '<span class="pill neutral">permissão será solicitada</span>'}</div>
    <div class="formgrid" style="margin-top:10px">
      ${chk('notifications.earlyWarning', n.earlyWarning, 'Avisar antes do vencimento')}
      <label class="field"><span>Notificar a partir da prioridade</span>${sel('notifications.minLevel', [['critica', 'Crítica'], ['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Todas']], n.minLevel)}</label>
      <label class="field"><span>Máximo de notificações individuais por sincronização</span>${num('notifications.maxPerSync', n.maxPerSync, 'min="0" max="10"')}</label></div>
    <div style="margin-top:10px">${chk('notifications.window.enabled', n.window.enabled, 'Notificar só no horário abaixo')}
      <div class="row" style="margin-top:6px">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => `<label class="check"><input type="checkbox" data-act="toggle-day" data-path="notifications.window.days" data-day="${i}" ${n.window.days.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}
        <input type="time" data-bind="notifications.window.start" value="${esc(n.window.start)}"> até <input type="time" data-bind="notifications.window.end" value="${esc(n.window.end)}"></div></div>
    <p class="help">Cada alerta é notificado uma única vez. Fora do horário, os alertas são acumulados e enviados em um resumo quando o horário começar. Alertas silenciados não notificam.</p></div>
  <div class="panel"><h2>Contador no ícone</h2>${sel('badge.count', [['atraso', 'Cards com atraso (prazo, atividade, SLA, parado)'], ['alta', 'Cards de prioridade alta ou crítica'], ['critica', 'Só cards críticos'], ['todos', 'Todos os cards com alerta']], cfg.badge.count)}</div>
  <div class="panel"><h2>Sincronização</h2><div class="formgrid">
    <label class="field"><span>Intervalo (minutos)</span>${num('sync.intervalMinutes', cfg.sync.intervalMinutes, 'min="1" max="240"')}</label>
    <label class="field"><span>Sincronização completa a cada (horas)</span>${num('sync.fullRefreshHours', cfg.sync.fullRefreshHours, 'min="1" max="48"')}</label></div>
    <p class="help">Entre as completas, só o que mudou é consultado. A extensão funciona apenas com o Chrome aberto: o navegador pode suspender a execução em segundo plano e nada é monitorado com ele fechado. Ao reabrir, os dados são atualizados e os vencimentos ocorridos no intervalo são destacados.</p></div>`;
}

function cfgReunioes() {
  const m = { ...DEFAULT_MEETINGS, ...(cfg.meetings || {}) };
  cfg.meetings = m;
  const provs = [...new Set(['CRM_MEETING', 'CRM_TODO', 'CRM_CALENDAR_SHARING', 'CRM_BOOKING', 'VOXIMPLANT_CALL', 'CRM_EMAIL', 'IMOPENLINES_SESSION',
    ...Object.keys(S.observedProviders || {})])];
  return `<div class="panel"><h2>Ranking de reuniões</h2>
    <p class="help">O ranking é montado sozinho a cada sincronização, com as reuniões registradas nos cards monitorados — inclusive de cards já ganhos ou perdidos.
    Nada é preenchido à mão e nada é alterado no Bitrix.</p>
    ${chk('meetings.enabled', m.enabled !== false, '<b>Ranking de reuniões ativo</b>', true)}
    <div style="margin-top:10px"><span class="small muted"><b>Tipos de atividade que contam como reunião</b></span>
      <div class="row" style="flex-wrap:wrap">${provs.map(pv => `<label class="check"><input type="checkbox" data-act="toggle-in" data-path="meetings.providers" data-v="${esc(pv)}" ${m.providers.includes(pv) ? 'checked' : ''}>
        ${esc(PROVIDER_LABELS[pv] || pv)} <span class="faint small">${esc(pv)}${S.observedProviders?.[pv] ? ` · ${S.observedProviders[pv]} encontradas` : ''}</span></label>`).join('')}</div></div>
    <div class="formgrid" style="margin-top:10px">
      <label class="field" style="grid-column:1/-1"><span>Atividades "A fazer" contam como reunião quando o assunto contém (separe por vírgula; vazio desativa)</span>
        <input data-bind="meetings.todoKeywords" data-type="words" value="${esc((m.todoKeywords || []).join(', '))}" placeholder="reunião, reuniao"></label>
      <label class="field"><span>Janela de leitura (dias para trás)</span>${num('meetings.lookbackDays', m.lookbackDays, 'min="7" max="400"')}</label>
      <label class="field"><span>Agrupamento padrão</span>${sel('meetings.groupBy', GROUPS, m.groupBy)}</label>
    </div>
    <div style="margin-top:8px">${chk('meetings.includeClosed', m.includeClosed !== false, 'Contar reuniões de cards já ganhos ou perdidos')}</div>
    <p class="help">Realizadas = concluídas, contadas pela data da reunião. Agendadas = ainda não aconteceram. Pendentes = passaram do horário e não foram concluídas.
    A janela padrão (70 dias) cobre o mês anterior inteiro; janelas maiores fazem a sincronização completa ler mais atividades. O assunto das atividades é usado só para classificar e não é guardado.</p></div>`;
}

function cfgEncerrados() {
  const c = { ...DEFAULT_CLOSED_STUDY, ...(cfg.closedStudy || {}) };
  cfg.closedStudy = c;
  const ets = [...new Set(effectiveMonitored(cfg, S.meta).map(m => Number(m.entityTypeId)))];
  return `<div class="panel"><h2>Estudo de concluídos e cancelados</h2>
    <p class="help">Lê os cards que foram para uma etapa final — de sucesso (concluídos) ou de falha (cancelados/perdidos) — nos funis monitorados, e calcula taxa de conclusão,
    valores, tempo até o encerramento, em que etapa os cards são cancelados, motivos e resultados por comercial, assessor e funil. Atualiza sozinho a cada sincronização.</p>
    ${chk('closedStudy.enabled', c.enabled !== false, '<b>Estudo ativo</b>', true)}
    <div class="formgrid" style="margin-top:10px"><label class="field"><span>Janela (dias para trás)</span>${num('closedStudy.lookbackDays', c.lookbackDays, 'min="30" max="730"')}</label></div>
    <div style="margin-top:10px"><span class="small muted"><b>Campo com o motivo da perda/cancelamento</b> (opcional; sem campo, vale o nome da etapa final)</span>
    ${ets.map(etid => {
      const f = S.meta.fields?.[etid];
      if (!f) return `<div class="row" style="margin:6px 0"><b>${esc(S.meta.entities?.[etid]?.name || etid)}</b> <button class="btn sm" data-act="load-fields" data-etid="${etid}">Carregar campos</button></div>`;
      const cur = reasonFieldFor(cfg, S.meta, etid);
      const chosen = c.reasonFields?.[etid];
      const val = chosen ? chosen.field : '__auto';
      const opts = Object.entries(f).filter(([, v]) => ['enumeration', 'string', 'crm_status', 'text'].includes(v.type)).sort((a, b) => String(a[1].title).localeCompare(String(b[1].title)));
      return `<div class="row" style="margin:6px 0"><b style="min-width:160px">${esc(S.meta.entities?.[etid]?.name || etid)}</b>
        <select data-act="set-reason-field" data-etid="${etid}"><option value="__auto" ${val === '__auto' ? 'selected' : ''}>Automático${!chosen ? (cur ? ` (${esc(cur.label)})` : ' (nenhum campo "Motivo…" encontrado)') : ''}</option>
        ${opts.map(([k, v]) => `<option value="${esc(k)}" ${val === k ? 'selected' : ''}>${esc(v.title)} (${esc(k)})</option>`).join('')}
        <option value="" ${val === '' ? 'selected' : ''}>Não usar</option></select></div>`;
    }).join('')}</div>
    <p class="help">Janelas maiores fazem a sincronização completa (a cada 6 h) ler mais cards. Entre elas, cards que se encerram entram pela consulta incremental, sem requisições extras.</p></div>`;
}

function cfgDados() {
  return `<div class="panel"><h2>O que fica armazenado neste navegador</h2><ul class="help">
    <li>Cards abertos dos funis monitorados: ID, título, funil, etapa, assessor (responsável), comercial, valor, datas de criação/alteração/mudança de etapa e <b>apenas</b> os campos usados nas suas regras.</li>
    <li>Histórico de mudança de etapa, atividades (tipo, prazo, situação, autor e assunto resumido) e comentários (somente data e autor — o texto não é lido).</li>
    <li>Nome e departamento dos assessores (responsáveis). Contagens diárias para a evolução histórica.</li>
    <li>Não são lidos contatos, documentos, arquivos, descrições ou dados de beneficiários. A extensão não envia dados para nenhum serviço além do seu portal Bitrix24.</li></ul>
    ${chk('privacy.storeActivitySubject', cfg.privacy.storeActivitySubject !== false, 'Guardar o assunto das atividades (até 80 caracteres) para exibir na fila')}
    <p class="help">Se os assuntos das atividades puderem conter dados de saúde, desmarque e faça uma sincronização completa.</p></div>
  <div class="panel"><h2>Configurações</h2><div class="row"><button class="btn" data-act="export">Exportar configurações (JSON)</button>
    <label class="btn">Importar configurações<input type="file" accept="application/json" id="importFile" class="hidden"></label></div>
    <p class="help">A exportação não contém o webhook nem dados de cards.</p></div>
  <div class="panel"><h2>Limpar</h2><div class="row"><button class="btn danger" data-act="clear-data">Apagar dados locais (mantém configurações)</button>
    <button class="btn danger" data-act="clear-all">Apagar tudo e desconectar</button></div></div>`;
}

// ---------------------------------------------------------------- edição da configuração
function getPath(obj, path) { return path.split('.').reduce((o, k) => o?.[k], obj); }
function setPath(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = val;
}
function markDirty(rerender) { dirty = true; $('#savebar').classList.remove('hidden'); if (rerender) render(); }
function parseVal(el) {
  const t = el.dataset.type;
  if (t === 'bool') return el.checked;
  if (t === 'number') return el.value === '' ? null : Number(el.value);
  if (t === 'lines') return el.value.split(/\s+/).map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
  if (t === 'words') return [...new Set(el.value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean))].slice(0, 20);
  return el.value;
}

main.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.bind && el.tagName !== 'SELECT' && el.type !== 'checkbox') { setPath(cfg, el.dataset.bind, parseVal(el)); markDirty(false); }
  if (el.dataset.filter === 'q') { ui.f.q = el.value; ui.queueLimit = QUEUE_PAGE; refreshQueueOnly(); }
});
main.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.bind && (el.tagName === 'SELECT' || el.type === 'checkbox')) {
    setPath(cfg, el.dataset.bind, parseVal(el));
    if (el.dataset.bind === 'notifications.enabled' && el.checked && !S.notificationsPermission) {
      const ok = await chrome.permissions.request({ permissions: ['notifications'] });
      S.notificationsPermission = ok;
      if (!ok) { setPath(cfg, 'notifications.enabled', false); toast('Permissão de notificação não concedida.'); }
    }
    markDirty(!!el.dataset.rerender || el.dataset.bind.endsWith('.field') || el.dataset.bind.endsWith('.action'));
  }
  if (el.dataset.filter && el.dataset.filter !== 'q') {
    ui.f[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value;
    ui.queueLimit = QUEUE_PAGE;
    if (el.dataset.filter === 'cat') ui.f.stage = '';
    render();
  }
  if (el.hasAttribute('data-sort')) { ui.sort = el.value; render(); }
  if (el.dataset.act === 'mt-group') { ui.mt.group = el.value; render(); }
  if (['cs-type', 'cs-com', 'cs-sort'].includes(el.dataset.act)) { ui.cs[el.dataset.act.slice(3)] = el.value; ui.cs.limit = 150; render(); }
  const act = el.dataset.act;
  if (act === 'toggle-cat') {
    const etid = Number(el.dataset.etid), cid = Number(el.dataset.cid);
    let m = cfg.monitored.find(x => Number(x.entityTypeId) === etid);
    if (!m) { m = { entityTypeId: etid, categoryIds: [] }; cfg.monitored.push(m); }
    m.categoryIds = el.checked ? [...new Set([...m.categoryIds.map(Number), cid])] : m.categoryIds.map(Number).filter(x => x !== cid);
    cfg.monitored = cfg.monitored.filter(x => x.categoryIds.length);
    if (el.checked && !cfg.noFutureActivityRules.some(r => Number(r.entityTypeId) === etid && Number(r.categoryId) === cid)) {
      cfg.noFutureActivityRules.push({ id: newId(), entityTypeId: etid, categoryId: cid, excludeStages: [], enabled: true });
    }
    if (el.checked && !S.meta.fields?.[etid]) send('loadFields', { entityTypeId: etid }).then(r => { if (r.ok) { S.meta.fields = { ...(S.meta.fields || {}), [etid]: r.fields }; } });
    markDirty(true);
  }
  if (act === 'toggle-day') {
    const arr = getPath(cfg, el.dataset.path); const d = Number(el.dataset.day);
    setPath(cfg, el.dataset.path, el.checked ? [...new Set([...arr, d])].sort() : arr.filter(x => x !== d)); markDirty(false);
  }
  if (act === 'toggle-in') {
    const arr = getPath(cfg, el.dataset.path) || []; const v = el.dataset.v;
    setPath(cfg, el.dataset.path, el.checked ? [...new Set([...arr, v])] : arr.filter(x => x !== v)); markDirty(false);
  }
  if (act === 'set-deadline-field') {
    const etid = el.dataset.etid;
    if (!el.value) delete cfg.deadlineFields[etid];
    else {
      const f = S.meta.fields?.[etid]?.[el.value];
      cfg.deadlineFields[etid] = { field: el.value, label: f?.title || el.value, type: f?.type || 'date', warnHours: cfg.deadlineFields[etid]?.warnHours ?? 24 };
    }
    markDirty(true);
  }
  if (act === 'set-reason-field') {
    const etid = el.dataset.etid;
    cfg.closedStudy = { ...DEFAULT_CLOSED_STUDY, ...(cfg.closedStudy || {}) };
    cfg.closedStudy.reasonFields = { ...(cfg.closedStudy.reasonFields || {}) };
    if (el.value === '__auto') delete cfg.closedStudy.reasonFields[etid];
    else cfg.closedStudy.reasonFields[etid] = { field: el.value, label: el.value ? (S.meta.fields?.[etid]?.[el.value]?.title || el.value) : '' };
    markDirty(true);
  }
  if (act === 'set-specialist-field') {
    const etid = el.dataset.etid;
    cfg.specialistFields = { ...(cfg.specialistFields || {}) };
    if (el.value === '__auto') delete cfg.specialistFields[etid];
    else cfg.specialistFields[etid] = { field: el.value, label: el.value ? (S.meta.fields?.[etid]?.[el.value]?.title || el.value) : '' };
    markDirty(true);
  }
  if (act === 'set-commercial-field') {
    const etid = el.dataset.etid;
    cfg.commercialFields = { ...(cfg.commercialFields || {}) };
    if (el.value === '__auto') delete cfg.commercialFields[etid];
    else cfg.commercialFields[etid] = { field: el.value, label: el.value ? (S.meta.fields?.[etid]?.[el.value]?.title || el.value) : '' };
    markDirty(true);
  }
  if (act === 'stage-weight') {
    const v = el.value === '' ? null : Number(el.value);
    if (v) cfg.priority.stageWeights[el.dataset.k] = v; else delete cfg.priority.stageWeights[el.dataset.k];
    markDirty(false);
  }
  if (el.id === 'importFile' && el.files[0]) {
    try {
      const data = JSON.parse(await el.files[0].text());
      if (data.webhook || JSON.stringify(data).includes('/rest/')) throw new Error('O arquivo parece conter uma credencial; importação recusada.');
      cfg = mergeConfig({ ...data, portalOrigin: cfg.portalOrigin, credentialMode: cfg.credentialMode });
      markDirty(true); toast('Configurações importadas. Revise e salve.');
    } catch (err) { toast('Arquivo inválido: ' + err.message); }
  }
  if (el.id === 'whShow') { const i = $('#whUrl'); if (i) i.type = el.checked ? 'text' : 'password'; }
});

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act], [data-tab]');
  if (!t) return;
  if (t.closest('#tabs') && t.dataset.tab) { ui.tab = t.dataset.tab; location.hash = ui.tab === 'painel' ? '' : ui.tab; render(); return; }
  const act = t.dataset.act;
  if (!act || t.tagName === 'INPUT' && !['connect'].includes(act)) return;
  const etid = Number(t.dataset.etid), cid = Number(t.dataset.cid);
  switch (act) {
    case 'toggle': if (e.target.closest('a')) return; ui.expanded.has(t.dataset.key) ? ui.expanded.delete(t.dataset.key) : ui.expanded.add(t.dataset.key); render(); break;
    case 'tab': ui.tab = t.dataset.tab; render(); break;
    case 'more': ui.queueLimit += QUEUE_PAGE; refreshQueueOnly(); break;
    case 'ordem':
      ui.dir = ui.dir === 'recentes' ? 'antigos' : 'recentes';
      if (ui.tab === 'painel') ui.sort = 'criacao';
      try { localStorage.setItem('ordemCriacao', ui.dir); } catch { /* preferência só desta sessão */ }
      render(); break;
    case 'mt-period': ui.mt.period = t.dataset.v; render(); break;
    case 'mt-csv': exportMeetingsCsv(); break;
    case 'cs-period': ui.cs.period = t.dataset.v; ui.cs.limit = 150; render(); break;
    case 'cs-csv': exportClosedCsv(); break;
    case 'cs-more': ui.cs.limit += 150; render(); break;
    case 'goto-stage': e.preventDefault(); { const d = document.getElementById(`st-${t.dataset.st}`); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth' }); } } break;
    case 'goto-conn': ui.tab = 'config'; ui.cfgTab = 'conexao'; render(); break;
    case 'goto-cfg': case 'cfgtab': ui.tab = 'config'; ui.cfgTab = t.dataset.cfg; render(); break;
    case 'kpi': {
      const k = t.dataset.k; ui.f = { ...ui.f, type: '', level: '' };
      ui.f.type = { sla: 'sla_etapa_vencido', aviso: 'sla_etapa_proximo', acomp: 'sem_interacao' }[k] || '';
      if (k === 'atraso') ui.sort = 'atraso';
      render(); main.querySelector('.filters')?.scrollIntoView({ behavior: 'smooth' }); break;
    }
    case 'filter': ui.f[t.dataset.f] = t.dataset.v; if (t.dataset.f === 'stage') ui.f.cat = ''; render(); main.querySelector('.filters')?.scrollIntoView({ behavior: 'smooth' }); break;
    case 'clear-filters': ui.f = { q: '', resp: '', com: '', team: '', cat: '', stage: '', type: '', level: '', snoozed: false }; render(); break;
    case 'snooze': await send('snooze', { keys: t.dataset.keys.split(','), hours: Number(t.dataset.h) }); await load({ keepCfg: dirty });
      toast(Number(t.dataset.h) ? 'Alerta silenciado.' : 'Alerta reativado.'); break;
    case 'sync': doSync(); break;
    case 'load-demo': t.disabled = true; toast('Carregando demonstração…'); await send('loadDemo'); ui.tab = 'painel'; await load(); break;
    case 'exit-demo': await send('exitDemo'); await load(); break;
    case 'connect': await connect(); break;
    case 'connect-login': await connectLogin(t); break;
    case 'set-focus': case 'clear-focus': {
      if (dirty) { toast('Salve ou descarte as alterações pendentes antes.'); break; }
      let fp = null;
      if (act === 'set-focus') { fp = normalizeFocusPage($('#focusPage').value); if (!fp) { toast('Informe uma página no formato /page/ESPAÇO/PÁGINA/.'); break; } }
      const r = await send('setFocusPage', { focusPage: fp });
      await load();
      toast(act === 'clear-focus' ? 'Foco removido: escolha os funis livremente.'
        : r.applied ? `Monitorando somente "${r.name}" (processo ${r.entityTypeId}).` : 'Página salva. Abra essa página no Bitrix para a extensão identificar o processo.', 6000);
      break;
    }
    case 'refresh-structure': { const r = await send('refreshStructure'); toast(r.ok ? 'Estrutura recarregada.' : 'Falha: ' + r.error); await load({ keepCfg: dirty }); break; }
    case 'disconnect': case 'disconnect-wipe':
      if (!confirm(act === 'disconnect' ? 'Remover a credencial e a permissão de acesso ao portal?' : 'Remover a credencial, a permissão e apagar os dados locais do portal?')) return;
      await send('disconnect', { wipe: act === 'disconnect-wipe' }); await load(); toast('Desconectado.'); break;
    case 'clear-data': case 'clear-all':
      if (!confirm(act === 'clear-all' ? 'Apagar tudo, inclusive configurações e credencial?' : 'Apagar os dados de cards armazenados localmente?')) return;
      await send('clearData', { all: act === 'clear-all' }); await load(); toast('Dados apagados.'); break;
    case 'save': await saveCfg(); break;
    case 'discard': cfg = structuredClone(S.config); dirty = false; render(); break;
    case 'add-card-type': {
      const out = $('#cardTypeResult');
      if (dirty) { out.innerHTML = '<span style="color:var(--crit)">Salve ou descarte as alterações pendentes antes.</span>'; break; }
      out.textContent = 'Lendo o processo no portal…';
      const r = await send('addCardType', { url: $('#cardUrl').value });
      if (!r.ok) { out.innerHTML = `<span style="color:var(--crit)">${esc(r.error)}</span>`; break; }
      await load();
      toast(`Processo "${r.name}" (tipo ${r.entityTypeId}) adicionado com ${r.categories} funil(is). Marque os funis abaixo.`, 6000);
      break;
    }
    case 'rm-card-type': {
      if (dirty) { toast('Salve ou descarte as alterações pendentes antes.'); break; }
      await send('removeCardType', { entityTypeId: t.dataset.etid }); await load(); break;
    }
    case 'load-fields': { const r = await send('loadFields', { entityTypeId: etid }); if (r.ok) { S.meta.fields = { ...(S.meta.fields || {}), [etid]: r.fields }; render(); } else toast('Falha ao carregar campos: ' + r.error); break; }
    case 'add-sla': cfg.slaRules.push({ id: newId(), entityTypeId: etid, categoryId: cid, stageId: t.dataset.stage, duration: { value: null, unit: 'd' }, mode: 'corrido', warnPercent: 80, onReturn: 'reiniciar', pause: [], exceptions: [], enabled: true }); markDirty(true); break;
    case 'add-stag': cfg.stagnationRules.push({ id: newId(), entityTypeId: etid, categoryId: cid, stageId: t.dataset.stage, limit: { value: null, unit: 'd' }, mode: 'corrido', enabled: true }); markDirty(true); break;
    case 'add-proc': cfg.processRules.push({ id: newId(), entityTypeId: etid, categoryId: cid, duration: { value: null, unit: 'd' }, mode: 'corrido', warnPercent: 80, startMode: 'criacao', pauseStages: [], enabled: true }); markDirty(true); break;
    case 'add-nf': cfg.noFutureActivityRules.push({ id: newId(), entityTypeId: etid, categoryId: cid, excludeStages: [], enabled: true }); markDirty(true); break;
    case 'add-ni': cfg.noInteractionRules.push({ id: newId(), entityTypeId: etid, categoryId: cid, limit: { value: null, unit: 'd' }, mode: 'corrido', excludeStages: [], enabled: true }); markDirty(true); break;
    case 'add-cond': { const arr = getPath(cfg, t.dataset.path) || []; arr.push(t.dataset.with === '1' ? { field: '', op: 'eq', value: '', action: 'prazo', duration: { value: null, unit: 'h' } } : { field: '', op: 'eq', value: '' }); setPath(cfg, t.dataset.path, arr); markDirty(true); break; }
    case 'rm': { const arr = getPath(cfg, t.dataset.path); arr.splice(Number(t.dataset.i), 1); markDirty(true); break; }
    case 'add-team': cfg.teams.push({ id: newId(), name: 'Nova equipe', userIds: [] }); markDirty(true); break;
    case 'reset-priority': cfg.priority = { ...structuredClone(DEFAULT_PRIORITY), stageWeights: cfg.priority.stageWeights }; markDirty(true); break;
    case 'export': {
      const out = structuredClone(cfg); delete out.webhook;
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'monitor-sla-bitrix24-config.json'; a.click(); break;
    }
  }
});

function validateCfg(c) {
  const errs = [];
  const chkDur = (d, label) => { if (!(Number(d?.value) > 0)) errs.push(`${label}: informe um prazo maior que zero.`); };
  c.slaRules.forEach(r => chkDur(r.duration, `SLA da etapa ${S.meta.stages?.[`${r.entityTypeId}:${r.stageId}`]?.name || r.stageId}`));
  c.processRules.forEach(r => chkDur(r.duration, 'SLA total do processo'));
  c.stagnationRules.forEach(r => chkDur(r.limit, 'Limite parado'));
  c.noInteractionRules.forEach(r => chkDur(r.limit, 'Sem interação'));
  c.slaRules.forEach(r => [...(r.pause || []), ...(r.exceptions || [])].forEach(x => { if (!x.field) errs.push('Há condição de pausa/exceção sem campo selecionado.'); }));
  const ml = Number(c.meetings?.lookbackDays);
  if (c.meetings && !(ml >= 7 && ml <= 400)) errs.push('Ranking de reuniões: a janela deve ter entre 7 e 400 dias.');
  const cl = Number(c.closedStudy?.lookbackDays);
  if (c.closedStudy && !(cl >= 30 && cl <= 730)) errs.push('Concluídos e cancelados: a janela deve ter entre 30 e 730 dias.');
  return [...new Set(errs)];
}
async function saveCfg() {
  const errs = validateCfg(cfg);
  if (errs.length) { toast(errs.slice(0, 3).join(' '), 6000); return; }
  const r = await send('saveConfig', { config: cfg });
  dirty = false;
  await load();
  toast(r.needsSync ? 'Configurações salvas. Uma sincronização completa será feita para buscar os novos dados.' : 'Configurações salvas e alertas recalculados.');
  if (r.needsSync) doSync(true);
}

async function connect() {
  const url = $('#whUrl').value.trim();
  const out = $('#connResult');
  let wh;
  let portal;
  try {
    portal = normalizePortal($('#portalAddr').value, { allowLocalHttp: true });
    wh = parseWebhook(url, { allowLocalHttp: true });
    if (wh.origin !== portal) throw new Error(`O webhook é de ${wh.origin}, mas o portal informado é ${portal}. Gere o webhook dentro do portal correto ou corrija o endereço.`);
  } catch (e) { out.innerHTML = `<span style="color:var(--crit)">${esc(e.message)}</span>`; return; }
  const granted = await chrome.permissions.request({ origins: [`${wh.origin}/*`] });
  if (!granted) { out.innerHTML = '<span style="color:var(--crit)">Permissão de acesso ao domínio negada. A extensão só acessa o domínio que você autorizar.</span>'; return; }
  out.textContent = 'Testando conexão e lendo funis…';
  const r = await send('connect', { webhookUrl: url, persist: $('#whPersist').value === '1', requestsPerSecond: Number($('#whRate').value) });
  $('#whUrl').value = '';
  if (!r.ok) { out.innerHTML = `<span style="color:var(--crit)">Falha: ${esc(r.error)}</span>`; return; }
  await load();
  ui.cfgTab = 'funis'; render();
  toast(`Conectado. ${r.entities} tipo(s) de card e ${r.stages} etapa(s) encontrados.${r.warnings?.length ? ' Há avisos na estrutura.' : ''}`, 5000);
}

/** Dentro do Bitrix (gaveta), usa o endereço da própria página aberta. */
function currentBitrixOrigin() {
  if (!EMBED || !S?.lastBitrixUrl) return null;
  try { return new URL(S.lastBitrixUrl).origin; } catch { return null; }
}

async function connectLogin(btn) {
  const out = $('#loginResult');
  const portal = $('#portalAddr')?.value || currentBitrixOrigin() || cfg?.portalAddress || DEFAULT_PORTAL;
  let origin;
  try { origin = normalizePortal(portal, { allowLocalHttp: true }); } catch (e) { if (out) out.innerHTML = `<span style="color:var(--crit)">${esc(e.message)}</span>`; return; }
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) { if (out) out.innerHTML = '<span style="color:var(--crit)">Permissão de acesso ao portal negada.</span>'; return; }
  if (btn) btn.disabled = true;
  if (out) out.textContent = 'Lendo funis e etapas com o seu login…';
  const r = await send('connectLogin', { portal: origin });
  if (btn) btn.disabled = false;
  if (!r.ok) {
    const msg = /WRONG_AUTH_TYPE|recusou|não permite/.test(r.error || '') ? `${r.error} Use a Opção 2 (webhook).` : r.error;
    if (out) out.innerHTML = `<span style="color:var(--crit)">${esc(msg)}</span>`; else toast(msg, 8000);
    return;
  }
  await load();
  if (r.focus?.applied) {
    ui.tab = 'config'; ui.cfgTab = 'sla'; render();
    toast(`Conectado. Monitorando somente "${r.focus.name}" (${cfg.focusPage}). Defina os prazos de SLA.`, 7000);
    return;
  }
  ui.tab = 'config'; ui.cfgTab = 'funis'; render();
  toast(`Conectado com o seu login. ${r.entities} tipo(s) de card e ${r.stages} etapa(s) encontrados. Escolha os funis.`, 6000);
}

async function doSync(full = false) {
  if (!S?.mode) return;
  $('#btnSync').disabled = true;
  const r = await send('syncNow', { full });
  await load({ keepCfg: dirty });
  if (r?.ok === false) toast('A sincronização não foi concluída: ' + r.error, 6000);
  else if (r?.status && !['ok', 'parcial'].includes(r.status)) toast('A sincronização não foi concluída: ' + (STATUS_TEXT[r.status] || r.status));
}
$('#btnSync').addEventListener('click', () => doSync());

// ---------------------------------------------------------------- início
const h = location.hash.replace('#', '');
if (['etapas', 'reunioes', 'encerrados', 'alertas', 'analises', 'config'].includes(h)) ui.tab = h;
load().catch(e => { main.innerHTML = `<div class="empty err"><h3>Erro ao carregar</h3><p>${esc(e.message)}</p></div>`; });
setInterval(() => { if (S?.syncing && !dirty) load(); }, 4000);
