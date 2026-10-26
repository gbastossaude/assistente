'use strict';
/*
 * Páginas de teste REPRESENTATIVAS do Bitrix24 (não são cópias do portal real).
 * Marcação baseada na estrutura padrão dos componentes main.kanban/crm.kanban e
 * main.ui.grid. Servidas pelo Playwright no endereço https://crm.hub-bnk.com/...
 * sem acesso à rede.
 */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function field(label, value) {
  return `<div class="crm-kanban-item-fields-item"><div class="crm-kanban-item-fields-item-title"><div class="crm-kanban-item-fields-item-title-text">${esc(label)}</div></div><div class="crm-kanban-item-fields-item-value">${esc(value)}</div></div>`;
}

function item(c) {
  const fields = (c.fields || []).map(([l, v]) => field(l, v)).join('');
  const href = c.href || `/crm/deal/details/${c.id}/`;
  return `<div class="main-kanban-item" data-id="${c.id}" data-type="item"><div class="crm-kanban-item">
    <div class="crm-kanban-item-title-wrapper"><a class="crm-kanban-item-title" href="${esc(href)}">${esc(c.title)}</a></div>
    ${c.price ? `<div class="crm-kanban-item-total"><div class="crm-kanban-item-total-price">${esc(c.price)}</div></div>` : ''}
    <div class="crm-kanban-item-date">${esc(c.created || '20 de outubro')}</div>
    <div class="crm-kanban-item-fields">${fields}</div>
    <div class="crm-kanban-item-planner">${c.activity || '<span class="crm-kanban-item-activity-counter">0</span><span class="crm-kanban-item-plan-btn">Planejar</span>'}</div>
  </div></div>`;
}

function column(col) {
  return `<div class="main-kanban-column" data-id="${col.id}">
    <div class="main-kanban-column-header"><div class="main-kanban-column-title"><div class="main-kanban-column-title-text"><span class="main-kanban-column-title-text-inner">${esc(col.name)}</span></div>
    <div class="main-kanban-column-total"><span class="main-kanban-column-total-item">${col.total !== undefined ? col.total : col.items.length}</span></div></div></div>
    <div class="main-kanban-column-body"><div class="main-kanban-column-items">${col.items.map(item).join('')}</div></div>
  </div>`;
}

const KANBAN_COLUMNS = [
  {
    id: 'C2:NEW', name: 'Novo contato', total: 3, items: [
      { id: 101, title: 'Clínica Alfa — 120 vidas', price: 'R$ 45.000,00', fields: [['Responsável', 'Ana Souza'], ['Prazo operacional', '05/01/2026 18:00']],
        activity: '<span class="crm-kanban-item-activity-counter crm-kanban-item-activity-counter--danger" title="Atividades vencidas: 1">1</span>' },
      { id: 102, title: '"><img src=x onerror="window.__pwned=1">Empresa <b>Beta</b>', price: 'R$ 12.000,00', href: 'javascript:window.__pwned=2',
        fields: [['Responsável', 'Bruno Lima'], ['Comentário', 'cliente sem atividades vencidas, aguardando']] }
    ]
  },
  {
    id: 'C2:PREPARATION', name: 'Cotação', items: [
      { id: 103, title: 'Grupo Gama', price: 'US$ 3,000.00', fields: [['Responsável', 'Ana Souza'], ['Prazo operacional', '30/12/2030']],
        activity: '<div class="crm-kanban-item-activity-empty">Sem atividades planejadas</div>' },
      { id: 104, title: 'Delta Saúde', price: 'R$ 8.500,50', fields: [['Responsável', 'Carla Dias']],
        activity: '<span class="crm-kanban-sla-badge">SLA vencido</span>' }
    ]
  },
  { id: 'C2:WON', name: 'Contrato assinado', items: [{ id: 105, title: 'Épsilon Ltda', price: 'R$ 99.000,00', fields: [['Responsável', 'Ana Souza']] }] }
];

function fixtureScript() {
  return `<script>
  window.__fixture = {
    addCard(colId, id, title) {
      const col = document.querySelector('.main-kanban-column[data-id="' + colId + '"] .main-kanban-column-items');
      const div = document.createElement('div');
      div.innerHTML = ${JSON.stringify(item({ id: '__ID__', title: '__TITLE__', price: 'R$ 1.000,00', fields: [['Responsável', 'Diego Reis']] }))}.replace(/__ID__/g, id).replace('__TITLE__', title);
      col.appendChild(div.firstElementChild);
    },
    moveCard(id, colId) {
      const el = document.querySelector('.main-kanban-item[data-id="' + id + '"]');
      document.querySelector('.main-kanban-column[data-id="' + colId + '"] .main-kanban-column-items').appendChild(el);
    },
    navigate(path, html) {
      history.pushState({}, '', path);
      document.getElementById('workarea').innerHTML = html;
    },
    showLogin() {
      document.getElementById('workarea').innerHTML = '<form name="form_auth" class="bx-authform"><input name="USER_LOGIN"><input type="password" name="USER_PASSWORD"></form>';
    }
  };
  </script>`;
}

function shell(title, body, extraHead) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>${extraHead || ''}
  <style>body{font-family:sans-serif;margin:0} .main-kanban-grid{display:flex;gap:8px;padding:8px} .main-kanban-column{width:260px;background:#eef2f4;padding:6px}
  .main-kanban-item{background:#fff;margin:6px 0;padding:6px;border-radius:4px;min-height:80px}</style></head>
  <body><div id="header">Bitrix24 (simulado)</div><div id="pagetitle">Negócios</div>
  <div class="main-ui-filter-search"><div class="main-ui-square-item">Funil: Comercial Saúde</div><input value=""></div>
  <div id="workarea">${body}</div>${fixtureScript()}</body></html>`;
}

function kanbanBody(columns) {
  return `<div class="main-kanban"><div class="main-kanban-grid">${(columns || KANBAN_COLUMNS).map(column).join('')}</div></div>`;
}

function kanbanPage(columns) {
  return shell('Negócios — Kanban', kanbanBody(columns));
}

function listBody() {
  const rows = [
    { id: 201, title: 'Hospital Zeta', stage: 'Negociação', resp: 'Ana Souza', sum: 'R$ 20.000,00', close: '01/10/2026', act: '<span class="crm-list-activity crm-list-activity-expired" title="Atividade vencida">Ligar — 24/10/2026</span>' },
    { id: 202, title: 'Odonto Eta', stage: 'Proposta enviada', resp: 'Bruno Lima', sum: 'R$ 5.000,00', close: '15/12/2030', act: '' },
    { id: 203, title: 'Theta Corp', stage: 'Negociação', resp: '', sum: '', close: '', act: 'Sem atividades' }
  ];
  const head = [['', 'Ações'], ['TITLE', 'Negócio'], ['STAGE_ID', 'Etapa'], ['ASSIGNED_BY', 'Responsável'], ['OPPORTUNITY', 'Receita'], ['CLOSEDATE', 'Data prevista de fechamento'], ['ACTIVITY_ID', 'Atividades']];
  return `<div class="main-grid"><table class="main-grid-table"><thead><tr class="main-grid-row-head">${head.map(([c, l]) => `<th class="main-grid-cell-head" ${c ? `data-name="${c}"` : ''}><span class="main-grid-head-title">${l}</span></th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr class="main-grid-row main-grid-row-body" data-id="${r.id}"><td class="main-grid-cell">⋮</td><td class="main-grid-cell"><a href="/crm/deal/details/${r.id}/">${esc(r.title)}</a></td><td class="main-grid-cell">${esc(r.stage)}</td><td class="main-grid-cell">${esc(r.resp)}</td><td class="main-grid-cell">${esc(r.sum)}</td><td class="main-grid-cell">${esc(r.close)}</td><td class="main-grid-cell">${r.act}</td></tr>`).join('')}</tbody></table></div>`;
}

function listPage() {
  return shell('Negócios — Lista', listBody());
}

function unknownPage() {
  return shell('CRM novo layout', '<div class="board-x"><div class="lane"><div class="tile">Card sem estrutura conhecida</div></div></div>');
}

function loginPage() {
  return shell('Autorização', '<form name="form_auth" class="bx-authform" action="/auth/"><input name="USER_LOGIN"><input type="password" name="USER_PASSWORD"><button>Entrar</button></form>');
}

function streamPage() {
  return shell('Feed', '<div class="feed">Notícias</div>');
}

function detailsPage() {
  return shell('Negócio 101', '<div class="crm-entity-section">Detalhes do negócio</div>');
}

function framesPage() {
  return shell('Negócios — Kanban com iframes', '<div class="side-panel"><iframe class="side-panel-iframe" src="/crm/deal/kanban/category/2/?IFRAME=Y" style="width:900px;height:600px"></iframe></div>' +
    '<iframe src="https://outro-dominio.example/widget" style="width:200px;height:100px"></iframe>');
}

module.exports = { kanbanPage, kanbanBody, listPage, listBody, unknownPage, loginPage, streamPage, detailsPage, framesPage, KANBAN_COLUMNS };
