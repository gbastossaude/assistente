import { isFatal } from './bitrix-client.js';
// Leitura da estrutura do portal: tipos de entidade (negócios, leads, processos inteligentes),
// funis, etapas, campos e usuários. Nada é presumido: o que não existir no portal é informado.

function semanticOf(s) {
  const raw = s.SEMANTICS ?? s.EXTRA?.SEMANTICS ?? null;
  if (raw === 'S' || raw === 'success') return 'S';
  if (raw === 'F' || raw === 'failure' || raw === 'apology') return 'F';
  return 'P';
}

export function stageEntityId(entityTypeId, categoryId) {
  if (entityTypeId === 1) return 'STATUS';
  if (entityTypeId === 2) return Number(categoryId) > 0 ? `DEAL_STAGE_${categoryId}` : 'DEAL_STAGE';
  return `DYNAMIC_${entityTypeId}_STAGE_${categoryId}`;
}

/** Carrega a estrutura do portal. Retorna { meta, warnings }. */
/**
 * Lê o número do processo e o formato do link a partir do endereço de um card aberto no Bitrix24.
 * Aceita, por exemplo: /page/besmart/seguros/type/1036/details/245/, /crm/type/1036/details/245/,
 * /crm/deal/details/88/ e /crm/lead/details/12/.
 */
export function parseCardUrl(input) {
  let u;
  try { u = new URL(String(input || '').trim()); } catch { throw new Error('Cole o endereço completo de um card aberto (começando com https://).'); }
  const path = u.pathname;
  const m = path.match(/^(.*\/)details\/(\d+)\/?$/);
  if (!m) throw new Error('O endereço não parece ser de um card aberto (esperado …/details/NÚMERO/).');
  let entityTypeId = null;
  const t = path.match(/\/type\/(\d+)\/details\//);
  if (t) entityTypeId = Number(t[1]);
  else if (/\/crm\/deal\/details\//.test(path)) entityTypeId = 2;
  else if (/\/crm\/lead\/details\//.test(path)) entityTypeId = 1;
  if (!entityTypeId) throw new Error('Não foi possível identificar o tipo do card nesse endereço.');
  return { origin: u.origin, entityTypeId, linkPath: `${m[1]}details/{id}/`, sampleId: Number(m[2]) };
}

export async function loadStructure(client, opts = {}) {
  const warnings = [];
  const entities = {};
  const categories = {};
  const stages = {};

  // Leads não são monitorados (decisão de escopo da operação); só entram se includeLeads for ativado.
  if (opts.includeLeads) {
    let leadsEnabled = true;
    try {
      const r = await client.call('crm.settings.mode.get', {});
      leadsEnabled = Number(r.result) !== 2;
    } catch (e) { if (isFatal(e)) throw e; }
    if (leadsEnabled) entities[1] = { entityTypeId: 1, name: 'Leads', kind: 'lead', categories: [0] };
  }
  entities[2] = { entityTypeId: 2, name: 'Negócios', kind: 'deal', categories: [] };

  try {
    let start = 0;
    for (let i = 0; i < 10; i++) {
      const r = await client.call('crm.type.list', { start });
      for (const t of r.result?.types || []) {
        if (t.isStagesEnabled === false || t.isStagesEnabled === 'N') {
          warnings.push(`Processo inteligente "${t.title}" não usa etapas e foi ignorado.`);
          continue;
        }
        entities[t.entityTypeId] = { entityTypeId: t.entityTypeId, name: t.title, kind: 'spa', categories: [],
          categoriesEnabled: t.isCategoriesEnabled !== false && t.isCategoriesEnabled !== 'N',
          customSectionId: t.customSectionId ?? null };
      }
      if (r.next == null) break;
      start = r.next;
    }
  } catch (e) {
    if (isFatal(e)) throw e;
    warnings.push(`A lista de processos inteligentes não pôde ser lida (${e.code}). O Bitrix24 só a libera para administradores do CRM. ` +
      'Adicione o processo colando o link de um card aberto em Configurações › Funis e etapas.');
  }

  // Processos adicionados manualmente (pelo link de um card) — funcionam sem acesso de administrador.
  for (const [etidStr, ov] of Object.entries(opts.manualTypes || {})) {
    const etid = Number(etidStr);
    if (!entities[etid] && etid > 2) {
      entities[etid] = { entityTypeId: etid, name: ov.name || `Processo inteligente ${etid}`, kind: 'spa', categories: [], manual: true };
    }
  }

  // Espaços digitais (opcional: exige permissão de configuração; só usado para exibir o nome)
  try {
    const r = await client.call('crm.automatedsolution.list', {});
    for (const ws of r.result?.automatedSolutions || []) {
      for (const tid of ws.typeIds || []) if (entities[tid]) entities[tid].workspace = ws.title;
    }
  } catch (e) {
    if (isFatal(e)) throw e;
  }

  // Funis
  const catCmds = {};
  for (const etid of Object.keys(entities)) if (Number(etid) !== 1) catCmds[`c${etid}`] = ['crm.category.list', { entityTypeId: Number(etid) }];
  const catRes = Object.keys(catCmds).length ? await client.batch(catCmds) : { result: {}, errors: {} };
  for (const etid of Object.keys(entities)) {
    const e = entities[etid];
    if (Number(etid) === 1) { categories['1:0'] = { name: 'Leads', sort: 0, entityTypeId: 1, id: 0 }; continue; }
    const err = catRes.errors[`c${etid}`];
    let list = catRes.result[`c${etid}`]?.categories || [];
    if (err || !list.length) {
      if (err && e.manual) {
        warnings.push(`O processo ${etid} não pôde ser lido (${err.code}). Confira o número e se o usuário do webhook tem acesso a ele.`);
        delete entities[etid];
        continue;
      }
      if (err) warnings.push(`Funis de "${e.name}" não puderam ser lidos (${err.code}); usando o funil padrão.`);
      list = [{ id: 0, name: 'Funil padrão', sort: 0 }];
    }
    for (const c of list) {
      categories[`${etid}:${c.id}`] = { name: c.name, sort: Number(c.sort) || 0, entityTypeId: Number(etid), id: Number(c.id), isDefault: !!c.isDefault };
      e.categories.push(Number(c.id));
    }
  }

  // Etapas
  const stCmds = {};
  for (const [ck, c] of Object.entries(categories)) {
    stCmds[`s_${ck.replace(':', '_')}`] = ['crm.status.list', { filter: { ENTITY_ID: stageEntityId(c.entityTypeId, c.id) }, order: { SORT: 'ASC' } }];
  }
  const st = await client.batchListAll(stCmds);
  for (const [ck, c] of Object.entries(categories)) {
    const k = `s_${ck.replace(':', '_')}`;
    if (st.errors[k]) { warnings.push(`Etapas do funil "${c.name}" não puderam ser lidas (${st.errors[k].code}).`); continue; }
    for (const s of st.results[k] || []) {
      stages[`${c.entityTypeId}:${s.STATUS_ID}`] = {
        statusId: s.STATUS_ID, name: s.NAME, sort: Number(s.SORT) || 0, semantic: semanticOf(s),
        categoryId: c.id, entityTypeId: c.entityTypeId
      };
    }
  }
  return { meta: { entities, categories, stages, loadedAt: Date.now() }, warnings };
}

/** Campos do tipo de entidade (inclui campos personalizados). */
export async function loadFields(client, entityTypeId) {
  const r = await client.call('crm.item.fields', { entityTypeId });
  const out = {};
  for (const [name, f] of Object.entries(r.result?.fields || {})) {
    out[name] = {
      // Campos personalizados costumam trazer o código em `title` e o nome visível em formLabel/listLabel.
      title: (f.title && !/^uf_?crm/i.test(f.title) ? f.title : null) || f.formLabel || f.listLabel || f.filterLabel || f.title || name,
      type: f.type, multiple: !!f.isMultiple,
      items: Array.isArray(f.items) ? f.items.map(i => ({ id: String(i.ID ?? i.id), value: i.VALUE ?? i.value })) : undefined
    };
  }
  return out;
}

/** Busca nomes e departamentos dos usuários informados. */
export async function loadUsers(client, ids) {
  const out = {};
  const uniq = [...new Set(ids.map(String).filter(x => x && x !== '0'))];
  const cmds = Object.fromEntries(uniq.map(id => [`u${id}`, ['user.get', { ID: id }]]));
  if (!uniq.length) return { users: out, errors: [] };
  const r = await client.batch(cmds);
  const errors = [];
  for (const id of uniq) {
    if (r.errors[`u${id}`]) { errors.push(r.errors[`u${id}`]); continue; }
    const u = (r.result[`u${id}`] || [])[0];
    if (u) out[id] = { name: [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim() || u.EMAIL || `Usuário #${id}`,
      departments: (u.UF_DEPARTMENT || []).map(String), active: u.ACTIVE !== false && u.ACTIVE !== 'N' };
  }
  return { users: out, errors };
}

export async function loadDepartments(client) {
  const r = await client.batchListAll({ d: ['department.get', {}] });
  if (r.errors.d) throw r.errors.d;
  const out = {};
  for (const d of r.results.d || []) out[String(d.ID)] = { name: d.NAME, parent: d.PARENT ? String(d.PARENT) : null };
  return out;
}
