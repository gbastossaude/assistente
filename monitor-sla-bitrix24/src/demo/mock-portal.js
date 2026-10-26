// Portal Bitrix24 SIMULADO com DADOS FICTÍCIOS para demonstração e testes.
// Responde no mesmo formato da API REST oficial (crm.item.list, crm.stagehistory.list, batch...)
// para que a extensão use exatamente o mesmo cliente e a mesma sincronização do modo real.
// Nenhum dado aqui corresponde a pessoas, empresas ou operações reais.

export const DEMO_ORIGIN = 'https://demo-ficticio.bitrix24.invalid';
export const DEMO_WEBHOOK = `${DEMO_ORIGIN}/rest/1/demonstracao/`;

const DAY = 86400000, HOUR = 3600000;

// ---------- utilidades de consulta ----------
export function parseQuery(qs) {
  const root = {};
  for (const part of String(qs || '').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decodeURIComponent(eq < 0 ? part : part.slice(0, eq));
    const v = eq < 0 ? '' : decodeURIComponent(part.slice(eq + 1));
    const keys = [];
    const m = k.match(/^([^[]+)/);
    keys.push(m ? m[1] : k);
    for (const mm of k.matchAll(/\[([^\]]*)\]/g)) keys.push(mm[1]);
    let o = root;
    keys.forEach((kk, i) => {
      if (i === keys.length - 1) o[kk] = v;
      else o = o[kk] = o[kk] && typeof o[kk] === 'object' ? o[kk] : {};
    });
  }
  const arrify = o => {
    if (!o || typeof o !== 'object') return o;
    for (const k of Object.keys(o)) o[k] = arrify(o[k]);
    const ks = Object.keys(o);
    if (ks.length && ks.every((k, i) => String(i) === k)) return ks.map(k => o[k]);
    return o;
  };
  return arrify(root);
}

const OPS = ['>=', '<=', '!@', '!=', '@', '>', '<', '!', '='];
function cmp(a, b) {
  const da = typeof a === 'string' && /\d{4}-\d{2}-\d{2}T/.test(a) ? Date.parse(a) : NaN;
  const db = typeof b === 'string' && /\d{4}-\d{2}-\d{2}T/.test(b) ? Date.parse(b) : NaN;
  if (!isNaN(da) && !isNaN(db)) return da - db;
  if (a !== '' && b !== '' && a != null && b != null && !isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) - Number(b);
  return String(a ?? '').localeCompare(String(b ?? ''));
}
export function matchFilter(rec, filter) {
  for (const [rawK, val] of Object.entries(filter || {})) {
    const op = OPS.find(o => rawK.startsWith(o)) || '=';
    const field = rawK.startsWith(op) ? rawK.slice(op.length) : rawK;
    const v = rec[field];
    const list = Array.isArray(val) ? val : [val];
    switch (op) {
      case '>': if (!(v != null && cmp(v, val) > 0)) return false; break;
      case '<': if (!(v != null && cmp(v, val) < 0)) return false; break;
      case '>=': if (!(v != null && cmp(v, val) >= 0)) return false; break;
      case '<=': if (!(v != null && cmp(v, val) <= 0)) return false; break;
      case '@': if (!list.some(x => cmp(v, x) === 0)) return false; break;
      case '!@': if (list.some(x => cmp(v, x) === 0)) return false; break;
      case '!': case '!=': if (cmp(v, val) === 0) return false; break;
      default: if (Array.isArray(val) ? !list.some(x => cmp(v, x) === 0) : cmp(v, val) !== 0) return false;
    }
  }
  return true;
}
function sortBy(list, order) {
  const [[f, dir] = ['ID', 'ASC']] = Object.entries(order || {});
  const s = String(dir).toUpperCase() === 'DESC' ? -1 : 1;
  return list.slice().sort((a, b) => s * cmp(a[f], b[f]));
}
function page(list, start) {
  const st = Number(start ?? 0);
  if (st === -1) return { slice: list.slice(0, 50), total: undefined, next: undefined };
  const slice = list.slice(st, st + 50);
  return { slice, total: list.length, next: st + 50 < list.length ? st + 50 : undefined };
}
function pick(rec, select) {
  if (!select || !select.length || select.includes('*')) return { ...rec };
  const o = {};
  for (const f of select) if (f in rec) o[f] = rec[f];
  if ('id' in rec) o.id = rec.id;
  if ('ID' in rec) o.ID = rec.ID;
  return o;
}

// ---------- gerador de dados fictícios ----------
function iso(ts) { return new Date(ts).toISOString().replace(/\.\d{3}Z$/, '+00:00'); }

export function buildDemoPortal(now = Date.now()) {
  const users = [
    [1, 'Robô', 'de Automação (fictício)', [10]],
    [11, 'Ana', 'Ribeiro (fictícia)', [10]], [12, 'Bruno', 'Teixeira (fictício)', [10]], [13, 'Carla', 'Nunes (fictícia)', [10]],
    [21, 'Diego', 'Martins (fictício)', [20]], [22, 'Elisa', 'Prado (fictícia)', [20]],
    [31, 'Fábio', 'Lima (fictício)', [30]], [32, 'Gabriela', 'Souza (fictícia)', [30]]
  ].map(([ID, NAME, LAST_NAME, dep]) => ({ ID: String(ID), NAME, LAST_NAME, UF_DEPARTMENT: dep, ACTIVE: true }));
  const departments = [
    { ID: '10', NAME: 'Comercial', PARENT: '1' }, { ID: '20', NAME: 'Operacional', PARENT: '1' }, { ID: '30', NAME: 'Assessores', PARENT: '1' }
  ];
  const types = [{ id: 7, entityTypeId: 1036, title: 'Pós-venda e Assessoria', isCategoriesEnabled: true, isStagesEnabled: true, customSectionId: 3 }];
  const categories = {
    2: [{ id: 0, name: 'Comercial PME', sort: 100, entityTypeId: 2, isDefault: true }, { id: 3, name: 'Operacional – Implantação', sort: 200, entityTypeId: 2, isDefault: false }],
    1036: [{ id: 7, name: 'Atendimento ao cliente', sort: 100, entityTypeId: 1036, isDefault: true }]
  };
  const st = (ENTITY_ID, list) => list.map(([STATUS_ID, NAME, SEM], i) => ({ ID: String(i + 1), ENTITY_ID, STATUS_ID, NAME, SORT: String((i + 1) * 10),
    SEMANTICS: SEM === 'P' ? null : SEM, EXTRA: { SEMANTICS: SEM === 'S' ? 'success' : SEM === 'F' ? 'failure' : 'process' } }));
  const statuses = [
    ...st('STATUS', [['NEW', 'Não processado', 'P'], ['IN_PROCESS', 'Em atendimento', 'P'], ['CONVERTED', 'Convertido', 'S'], ['JUNK', 'Descartado', 'F']]),
    ...st('DEAL_STAGE', [['NEW', 'Em cotação', 'P'], ['PREPARATION', 'Aguardando retorno da operadora', 'P'], ['PREPAYMENT_INVOICE', 'Proposta apresentada', 'P'],
      ['EXECUTING', 'Enviado para assinatura', 'P'], ['FINAL_INVOICE', 'Aguardando assinatura', 'P'], ['WON', 'Venda fechada', 'S'], ['LOSE', 'Perdido', 'F']]),
    ...st('DEAL_STAGE_3', [['C3:NEW', 'Em digitação', 'P'], ['C3:PREPARATION', 'Pendência de documentos', 'P'], ['C3:EXECUTING', 'Em análise', 'P'],
      ['C3:UC_BOLETO', 'Aguardando boleto', 'P'], ['C3:UC_IMPL', 'Aguardando implantação', 'P'], ['C3:WON', 'Implantado', 'S'], ['C3:LOSE', 'Cancelado', 'F']]),
    ...st('DYNAMIC_1036_STAGE_7', [['DT1036_7:NEW', 'Solicitação recebida', 'P'], ['DT1036_7:PREPARATION', 'Em atendimento', 'P'],
      ['DT1036_7:CLIENT', 'Aguardando operadora', 'P'], ['DT1036_7:SUCCESS', 'Concluído', 'S'], ['DT1036_7:FAIL', 'Cancelado', 'F']])
  ];
  const fields = {
    2: {
      id: { type: 'integer', title: 'ID' }, title: { type: 'string', title: 'Nome' }, stageId: { type: 'crm_status', title: 'Etapa' },
      categoryId: { type: 'crm_category', title: 'Funil' }, assignedById: { type: 'user', title: 'Responsável' },
      createdBy: { type: 'user', title: 'Criado por' }, createdTime: { type: 'datetime', title: 'Criado em' },
      opportunity: { type: 'double', title: 'Valor' }, closedate: { type: 'date', title: 'Data prevista de fechamento' },
      ufCrm_PRAZO_PROPOSTA: { type: 'date', title: 'Prazo da proposta (fictício)' },
      ufCrm_TIPO_ATEND: { type: 'enumeration', title: 'Tipo de atendimento (fictício)', items: [{ ID: '101', VALUE: 'Novo contrato' }, { ID: '102', VALUE: 'Inclusão de vidas' }, { ID: '103', VALUE: 'Urgente' }] },
      ufCrm_AGUARD_CLIENTE: { type: 'boolean', title: 'Aguardando cliente (fictício)' }
    },
    1: { id: { type: 'integer', title: 'ID' }, title: { type: 'string', title: 'Nome' }, stageId: { type: 'crm_status', title: 'Status' } },
    1036: { id: { type: 'integer', title: 'ID' }, title: { type: 'string', title: 'Nome' }, stageId: { type: 'crm_status', title: 'Etapa' },
      assignedById: { type: 'user', title: 'Responsável' }, createdBy: { type: 'user', title: 'Criado por' },
      ufCrm7_PRIORIDADE: { type: 'enumeration', title: 'Prioridade (fictício)', items: [{ ID: '1', VALUE: 'Normal' }, { ID: '2', VALUE: 'Alta' }] },
      ufCrm7_COMERCIAL: { type: 'user', title: 'Comercial', isMultiple: false } }
  };

  // ---- cenários: [etid, cat, título, responsável, valor, caminho [[etapa, dias atrás]], extras]
  const items = { 1: [], 2: [], 1036: [] };
  const history = { 1: [], 2: [], 1036: [] };
  const activities = [];
  const comments = [];
  let nextId = { 1: 1, 2: 501, 1036: 901 };
  let hid = 1, aid = 1, cid = 1;
  const t = d => now - d * DAY;

  function add(etid, cat, title, resp, opp, path, ex = {}) {
    const id = nextId[etid]++;
    const created = t(path[0][1]);
    const [curStage, curAgo] = path[path.length - 1];
    const stageObj = statuses.find(s => s.STATUS_ID === curStage);
    const sem = stageObj?.SEMANTICS || 'P';
    let updated = Math.max(t(curAgo), ex.updatedAgo != null ? t(ex.updatedAgo) : 0);
    const rec = {
      id, title: `[DEMO] ${title}`, stageId: curStage, assignedById: resp, createdBy: String(ex.creator ?? ['11', '12', '13'][id % 3]),
      opportunity: opp, currencyId: 'BRL',
      createdTime: iso(created), movedTime: ex.noMovedTime ? null : iso(t(curAgo)), stageSemanticId: sem, ...(ex.fields || {})
    };
    if (etid !== 1) rec.categoryId = cat;
    // histórico
    if (!ex.noHistory) {
      let prevCat = null;
      path.forEach(([sid, ago], i) => {
        const so = statuses.find(s => s.STATUS_ID === sid);
        const pcat = ex.pathCats ? ex.pathCats[i] : cat;
        const typeId = i === 0 ? 1 : (prevCat != null && pcat !== prevCat ? 5 : (so?.SEMANTICS ? 3 : 2));
        prevCat = pcat;
        const h = { ID: hid++, TYPE_ID: typeId, OWNER_ID: id, CREATED_TIME: iso(t(ago)) };
        if (etid === 1) Object.assign(h, { STATUS_ID: sid, STATUS_SEMANTIC_ID: so?.SEMANTICS || 'P' });
        else Object.assign(h, { STAGE_ID: sid, CATEGORY_ID: pcat, STAGE_SEMANTIC_ID: so?.SEMANTICS || 'P' });
        history[etid].push(h);
      });
    }
    for (const a of ex.acts || []) {
      const createdA = t(a.createdAgo ?? curAgo);
      const done = !!a.done;
      const lastUpd = done ? t(a.doneAgo ?? 0) : createdA;
      updated = Math.max(updated, lastUpd);
      activities.push({
        ID: String(aid++), OWNER_ID: String(id), OWNER_TYPE_ID: String(etid), PROVIDER_ID: a.prov || 'CRM_TODO', TYPE_ID: a.prov === 'VOXIMPLANT_CALL' ? '2' : '6',
        SUBJECT: a.subj || 'Retorno ao cliente', COMPLETED: done ? 'Y' : 'N',
        DEADLINE: a.deadlineIn === null ? '9999-12-31T21:00:00+00:00' : iso(now + (a.deadlineIn ?? 1) * DAY),
        END_TIME: done ? iso(t(a.doneAgo ?? 0)) : null, CREATED: iso(createdA), LAST_UPDATED: iso(lastUpd),
        AUTHOR_ID: String(a.author ?? resp), RESPONSIBLE_ID: String(a.resp ?? resp), DIRECTION: '0'
      });
    }
    for (const c of ex.comments || []) {
      comments.push({ ID: String(cid++), ENTITY_ID: String(id), ENTITY_TYPE: etid === 2 ? 'deal' : etid === 1 ? 'lead' : `dynamic_${etid}`,
        CREATED: iso(t(c.ago)), AUTHOR_ID: String(c.author ?? resp), COMMENT: 'Comentário fictício' });
    }
    rec.updatedTime = iso(updated);
    rec.lastActivityTime = ex.lastActivityAgo != null ? iso(t(ex.lastActivityAgo)) : rec.updatedTime;
    items[etid].push(rec);
    return id;
  }
  const fut = (subj, inDays, ex = {}) => ({ subj, deadlineIn: inDays, ...ex });

  // --- Comercial PME (negócios, funil 0)
  add(2, 0, 'Padaria Sol Nascente — 12 vidas', '11', 18400, [['NEW', 4.2]], {
    acts: [{ prov: 'VOXIMPLANT_CALL', subj: 'Levantamento de vidas', done: true, createdAgo: 4.1, doneAgo: 4.1 }],
    fields: { ufCrm_PRAZO_PROPOSTA: new Date(now - 1 * DAY).toISOString().slice(0, 10), ufCrm_TIPO_ATEND: '101' } });
  add(2, 0, 'Escritório Contábil Horizonte — 6 vidas', '12', 9600, [['NEW', 0.6]], {
    acts: [fut('Enviar cotação comparativa', 1)], fields: { ufCrm_TIPO_ATEND: '103' } });
  add(2, 0, 'Clínica Veterinária Pata Feliz — 9 vidas', '13', 14100, [['NEW', 7], ['PREPARATION', 6.2]], {
    acts: [{ subj: 'Cobrar retorno da operadora', deadlineIn: -2.5, createdAgo: 5.4 }], comments: [{ ago: 5.4 }] });
  add(2, 0, 'Transportadora Rota Norte — 38 vidas', '11', 61200, [['NEW', 9], ['PREPARATION', 6], ['PREPAYMENT_INVOICE', 2]], {
    acts: [fut('Reunião de apresentação', 0.3, { prov: 'CRM_MEETING' })], comments: [{ ago: 1.9 }] });
  add(2, 0, 'Academia Movimento — 15 vidas', '12', 22500, [['NEW', 12], ['PREPARATION', 10], ['PREPAYMENT_INVOICE', 8], ['EXECUTING', 3.1]], {
    acts: [{ prov: 'CRM_BIZPROC_WORKFLOW', subj: 'Envio automático de lembrete', done: true, createdAgo: 1, doneAgo: 1, author: 1 }],
    updatedAgo: 0.2, lastActivityAgo: 0.2 });
  add(2, 0, 'Restaurante Sabor da Serra — 7 vidas', '13', 10800, [['NEW', 15], ['PREPARATION', 12], ['PREPAYMENT_INVOICE', 9], ['EXECUTING', 6], ['FINAL_INVOICE', 5.6]], {
    acts: [{ subj: 'Confirmar assinatura', deadlineIn: -4, createdAgo: 5.45 }], fields: { ufCrm_AGUARD_CLIENTE: 'N' } });
  add(2, 0, 'Agência Digital Pixel — 4 vidas', '11', 5200, [['NEW', 6], ['PREPARATION', 4], ['PREPAYMENT_INVOICE', 3], ['EXECUTING', 2.5], ['FINAL_INVOICE', 2.2]], {
    acts: [fut('Aguardar documento do sócio', 2)], fields: { ufCrm_AGUARD_CLIENTE: 'Y' }, comments: [{ ago: 0.8 }] });
  // retorno de etapa: estava em assinatura e voltou para cotação
  add(2, 0, 'Indústria Metal Forte — 52 vidas', '12', 98700, [['NEW', 14], ['PREPARATION', 11], ['PREPAYMENT_INVOICE', 8], ['EXECUTING', 6], ['NEW', 3.5]], {
    acts: [{ prov: 'CRM_EMAIL', subj: 'Nova tabela solicitada', done: true, createdAgo: 3.4, doneAgo: 3.4 }], fields: { ufCrm_TIPO_ATEND: '102' } });
  add(2, 0, 'Colégio Primeiros Passos — 21 vidas', '13', 31500, [['NEW', 1.1]], { acts: [fut('Ligação de qualificação', 0.5, { prov: 'VOXIMPLANT_CALL' })] });
  add(2, 0, 'Loja Casa & Cia — 5 vidas', '11', 7400, [['NEW', 20], ['PREPARATION', 18.5]], {
    acts: [{ prov: 'CRM_TODO', subj: 'Atividade sem prazo', deadlineIn: null, createdAgo: 18 }], noHistory: true });
  add(2, 0, 'Consultório Odonto Sorriso — 3 vidas', '12', 3900, [['NEW', 8], ['PREPARATION', 2.3]], {
    acts: [fut('Retorno operadora', -0.4), fut('Follow-up', 3)], noHistory: true, noMovedTime: true });
  add(2, 0, 'Hotel Mirante — 27 vidas', '13', 40500, [['NEW', 30], ['PREPARATION', 28], ['PREPAYMENT_INVOICE', 25]], {
    acts: [{ prov: 'CRM_TODO', subj: 'Revisar proposta', done: true, createdAgo: 24, doneAgo: 24 }] });
  add(2, 0, 'Farmácia Vida Plena — 11 vidas', '11', 16200, [['NEW', 2.0]], {
    acts: [fut('Enviar cotação', 0.2)], fields: { ufCrm_PRAZO_PROPOSTA: new Date(now).toISOString().slice(0, 10) } });
  // encerrados (não devem aparecer na fila)
  add(2, 0, 'Construtora Pedra Firme — 44 vidas', '12', 70000, [['NEW', 30], ['PREPARATION', 25], ['FINAL_INVOICE', 20], ['WON', 15]]);
  add(2, 0, 'Bar do Porto — 3 vidas', '13', 4100, [['NEW', 18], ['LOSE', 10]]);

  // --- Operacional – Implantação (negócios, funil 3) — cards chegam por mudança de funil
  const opCats = n => [0, ...Array(n).fill(3)];
  add(2, 3, 'Studio Pilates Equilíbrio — 8 vidas', '21', 12000, [['FINAL_INVOICE', 12], ['C3:NEW', 2.1]], {
    pathCats: opCats(1), acts: [fut('Concluir digitação', -0.8)] });
  add(2, 3, 'Gráfica Impressão Rápida — 14 vidas', '22', 20300, [['FINAL_INVOICE', 15], ['C3:NEW', 9], ['C3:PREPARATION', 6]], {
    pathCats: opCats(2), acts: [{ subj: 'Cobrar RG e comprovante', deadlineIn: -3, createdAgo: 6 }] });
  add(2, 3, 'Auto Peças Avenida — 19 vidas', '21', 27600, [['FINAL_INVOICE', 25], ['C3:NEW', 22], ['C3:PREPARATION', 18], ['C3:EXECUTING', 8.4]], {
    pathCats: opCats(3), acts: [{ prov: 'CRM_EMAIL', subj: 'Status da análise', done: true, createdAgo: 8, doneAgo: 8 }] });
  add(2, 3, 'Laboratório Análise Certa — 33 vidas', '22', 49900, [['FINAL_INVOICE', 20], ['C3:NEW', 16], ['C3:EXECUTING', 10], ['C3:UC_BOLETO', 3.2]], {
    pathCats: opCats(3), acts: [fut('Enviar boleto ao cliente', -1.2)], comments: [{ ago: 3.1 }] });
  add(2, 3, 'Pet Shop Amigo Fiel — 6 vidas', '21', 8700, [['FINAL_INVOICE', 14], ['C3:NEW', 11], ['C3:EXECUTING', 7], ['C3:UC_BOLETO', 5], ['C3:UC_IMPL', 2]], {
    pathCats: opCats(4), acts: [fut('Confirmar vigência', 4)] });
  add(2, 3, 'Escola de Idiomas Global — 10 vidas', '22', 15000, [['FINAL_INVOICE', 40], ['C3:NEW', 35], ['C3:EXECUTING', 30], ['C3:UC_BOLETO', 25], ['C3:UC_IMPL', 14]], {
    pathCats: opCats(4) });
  add(2, 3, 'Mercado Bom Preço — 25 vidas', '21', 36000, [['FINAL_INVOICE', 6], ['C3:NEW', 0.15]], { pathCats: opCats(1), acts: [fut('Iniciar digitação', 0.5)] });
  add(2, 3, 'Oficina Motor Bom — 9 vidas', '22', 13200, [['FINAL_INVOICE', 30], ['C3:NEW', 25], ['C3:EXECUTING', 20], ['C3:WON', 12]], { pathCats: opCats(3) });

  // --- Pós-venda (processo inteligente 1036)
  add(1036, 7, 'Inclusão de dependente — Empresa Fictícia A', '31', 0, [['DT1036_7:NEW', 0.9]], { acts: [fut('Analisar pedido', -0.1)] });
  add(1036, 7, '2ª via de carteirinha — Empresa Fictícia B', '32', 0, [['DT1036_7:NEW', 3], ['DT1036_7:PREPARATION', 2.6]], {
    acts: [{ prov: 'IMOPENLINES_SESSION', subj: 'Atendimento via canal aberto', done: true, createdAgo: 2.6, doneAgo: 2.5 }] });
  add(1036, 7, 'Reembolso pendente — Empresa Fictícia C', '31', 0, [['DT1036_7:NEW', 12], ['DT1036_7:PREPARATION', 10], ['DT1036_7:CLIENT', 8]], {
    acts: [{ subj: 'Cobrar operadora', deadlineIn: -5, createdAgo: 8 }], fields: { ufCrm7_PRIORIDADE: '2' } });
  add(1036, 7, 'Troca de plano — Empresa Fictícia D', '32', 0, [['DT1036_7:NEW', 1.5], ['DT1036_7:PREPARATION', 1.2]], { acts: [fut('Simular troca', 1)], comments: [{ ago: 0.3 }] });
  add(1036, 7, 'Cancelamento — Empresa Fictícia E', '31', 0, [['DT1036_7:NEW', 9], ['DT1036_7:SUCCESS', 7]]);

  // --- Leads (não monitorados na configuração de demonstração)
  add(1, 0, 'Lead fictício — site', '11', 0, [['NEW', 1]]);
  add(1, 0, 'Lead fictício — indicação', '12', 0, [['IN_PROCESS', 2]]);

  // Reuniões fictícias para o ranking (inclui cards já ganhos/perdidos e "A fazer" com "Reunião" no assunto).
  const meeting = (etid, ownerId, subj, inDays, done, resp, prov = 'CRM_MEETING') => {
    const at = iso(now + inDays * DAY);
    activities.push({ ID: String(aid++), OWNER_ID: String(ownerId), OWNER_TYPE_ID: String(etid), PROVIDER_ID: prov, TYPE_ID: prov === 'CRM_MEETING' ? '1' : '6',
      SUBJECT: subj, COMPLETED: done ? 'Y' : 'N', DEADLINE: at, START_TIME: at, END_TIME: done ? at : null,
      CREATED: iso(now + Math.min(inDays, 0) * DAY - DAY), LAST_UPDATED: done ? at : iso(now - DAY), AUTHOR_ID: String(resp), RESPONSIBLE_ID: String(resp), DIRECTION: '0' });
  };
  meeting(2, 501, 'Apresentação da proposta', -1, true, '11');
  meeting(2, 503, 'Reunião com o RH', -2, true, '13');
  meeting(2, 504, 'Visita ao cliente', -3, true, '12');
  meeting(2, 508, 'Reunião de renegociação', -5, true, '12', 'CRM_TODO');
  meeting(2, 509, 'Reunião de apresentação', 2, false, '13', 'CRM_TODO');
  meeting(2, 512, 'Alinhamento com o sócio', -0.5, false, '13');
  meeting(2, 514, 'Reunião de fechamento', -16, true, '12');
  meeting(2, 514, 'Assinatura do contrato', -20, true, '12');
  meeting(2, 515, 'Apresentação', -11, true, '13');
  meeting(2, 513, 'Reunião rápida', -0.2, true, '11');
  meeting(2, 502, 'Diagnóstico de benefícios', -8, true, '11');
  meeting(2, 507, 'Reunião inicial', -35, true, '11');
  meeting(2, 506, 'Reunião com a diretoria', -40, true, '13');
  meeting(1036, 901, 'Reunião de pós-venda', -1, true, '31');
  meeting(2, 510, 'Ligar para o cliente', -1, true, '11', 'CRM_TODO'); // não é reunião

  // Comercial (campo de usuário) nos cards do processo 1036; um card fica sem comercial.
  items[1036].forEach((it, i) => { it.ufCrm7_COMERCIAL = i === 3 ? null : ['11', '12', '13'][i % 3]; });
  return { now, users, departments, types, categories, statuses, fields, items, history, activities, comments };
}

// ---------- servidor simulado ----------
export function createMockPortal(opts = {}) {
  const data = opts.portal || buildDemoPortal(opts.now || Date.now());
  const state = { requests: 0, writeAttempts: 0, methods: {} };
  const err = (status, error, desc) => ({ status, body: { error, error_description: desc || error } });
  const time = () => ({ start: 0, finish: 0, duration: 0.01, operating: 0, operating_reset_at: Math.floor(Date.now() / 1000) + 600 });

  function single(method, p) {
    state.methods[method] = (state.methods[method] || 0) + 1;
    if (/\.(add|update|delete|set|bind|unbind)$/.test(method) || method.includes('.update') || method.includes('.delete')) {
      state.writeAttempts++;
      return err(403, 'WRITE_NOT_EXPECTED', 'Escrita não esperada');
    }
    switch (method) {
      case 'crm.settings.mode.get': return { status: 200, body: { result: 1 } };
      case 'crm.type.list':
        if (opts.typeListDenied) return err(400, 'ACCESS_DENIED', 'Access denied');
        return { status: 200, body: { result: { types: data.types }, total: data.types.length } };
      case 'crm.automatedsolution.list':
        if (opts.typeListDenied) return err(400, 'ACCESS_DENIED', 'Access denied');
        return { status: 200, body: { result: { automatedSolutions: [{ id: 3, title: 'be.smart (fictício)', typeIds: [1036] }] }, total: 1 } };
      case 'crm.category.list': {
        const list = data.categories[Number(p.entityTypeId)];
        if (!list) return err(400, 'NOT_FOUND', 'Categories not supported');
        return { status: 200, body: { result: { categories: list }, total: list.length } };
      }
      case 'crm.status.list': {
        const list = sortBy(data.statuses.filter(s => matchFilter(s, p.filter)), p.order || { SORT: 'ASC' });
        const pg = page(list, p.start);
        return { status: 200, body: { result: pg.slice, total: pg.total, next: pg.next } };
      }
      case 'crm.item.fields': return { status: 200, body: { result: { fields: data.fields[Number(p.entityTypeId)] || {} } } };
      case 'crm.item.list': {
        const etid = Number(p.entityTypeId);
        if (!data.items[etid]) return err(400, 'NOT_FOUND', 'Smart process not found');
        const list = sortBy(data.items[etid].filter(r => matchFilter(r, p.filter)), p.order || { id: 'ASC' });
        const pg = page(list, p.start);
        return { status: 200, body: { result: { items: pg.slice.map(r => pick(r, p.select)) }, total: pg.total, next: pg.next } };
      }
      case 'crm.stagehistory.list': {
        const etid = Number(p.entityTypeId);
        if ((opts.historyUnsupported || []).includes(etid) || !data.history[etid]) return err(400, 'ENTITY_TYPE_NOT_SUPPORTED', 'Entity type is not supported');
        const list = sortBy(data.history[etid].filter(r => matchFilter(r, p.filter)), p.order || { ID: 'ASC' });
        const pg = page(list, p.start);
        return { status: 200, body: { result: { items: pg.slice.map(r => pick(r, p.select)) }, total: pg.total, next: pg.next } };
      }
      case 'crm.activity.list': {
        const list = sortBy(data.activities.filter(r => matchFilter(r, p.filter)), p.order || { ID: 'ASC' });
        const pg = page(list, p.start);
        return { status: 200, body: { result: pg.slice.map(r => pick(r, p.select)), total: pg.total, next: pg.next } };
      }
      case 'crm.timeline.comment.list': {
        if (!p.filter || !p.filter.ENTITY_ID || !p.filter.ENTITY_TYPE) return err(400, 'ERROR_REQUIRED', 'ENTITY_ID and ENTITY_TYPE are required');
        const list = sortBy(data.comments.filter(r => matchFilter(r, p.filter)), p.order || { ID: 'ASC' });
        const pg = page(list, p.start);
        return { status: 200, body: { result: pg.slice.map(r => pick(r, p.select)), total: pg.total, next: pg.next } };
      }
      case 'user.get': {
        const list = data.users.filter(u => !p.ID || String(u.ID) === String(p.ID));
        return { status: 200, body: { result: list, total: list.length } };
      }
      case 'department.get':
        if (opts.noDepartmentScope) return err(401, 'insufficient_scope', 'The request requires higher privileges than provided by the webhook token');
        return { status: 200, body: { result: data.departments, total: data.departments.length } };
      case 'profile': return { status: 200, body: { result: { ID: '1', ADMIN: false } } };
      default: return err(404, 'ERROR_METHOD_NOT_FOUND', 'Method not found!');
    }
  }

  function handle(method, params = {}) {
    state.requests++;
    if (opts.authFail) return err(401, 'INVALID_CREDENTIALS', 'Invalid request credentials');
    if (opts.rateLimitEvery && state.requests % opts.rateLimitEvery === 0) return err(503, 'QUERY_LIMIT_EXCEEDED', 'Too many requests');
    if (method === 'batch') {
      const out = { result: {}, result_error: {}, result_total: {}, result_next: {}, result_time: {} };
      for (const [k, cmd] of Object.entries(params.cmd || {})) {
        const q = cmd.indexOf('?');
        const m = q < 0 ? cmd : cmd.slice(0, q);
        const p = q < 0 ? {} : parseQuery(cmd.slice(q + 1));
        const r = single(m, p);
        if (r.status !== 200) out.result_error[k] = r.body;
        else {
          out.result[k] = r.body.result;
          if (r.body.total != null) out.result_total[k] = r.body.total;
          if (r.body.next != null) out.result_next[k] = r.body.next;
        }
      }
      return { status: 200, body: { result: out, time: time() } };
    }
    const r = single(method, params);
    if (r.status === 200) r.body.time = time();
    return r;
  }

  /** fetch compatível, para usar o cliente real sem rede. */
  function fetchImpl(url, init) {
    const m = String(url).match(/\/rest\/\d+\/[A-Za-z0-9]+\/([^/?]+?)(?:\.json)?$/);
    const method = m ? m[1] : '';
    const params = init?.body ? JSON.parse(init.body) : {};
    const r = handle(method, params);
    const text = JSON.stringify(r.body);
    return Promise.resolve({ status: r.status, ok: r.status < 300, text: () => Promise.resolve(text) });
  }

  return { data, state, handle, fetchImpl };
}
