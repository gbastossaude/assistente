// Sincronização (somente leitura) com cache e modo incremental.
// Full: lista cards abertos dos funis monitorados, histórico de etapas, atividades e comentários.
// Incremental: apenas o que mudou desde a última sincronização (updatedTime, ID do histórico,
// LAST_UPDATED das atividades). Uma sincronização completa periódica reconcilia exclusões.
import { loadStructure, loadFields, loadUsers, loadDepartments } from './bitrix-api.js';
import { isFatal } from './bitrix-client.js';
import { effectiveMonitored, commercialFieldFor, commercialIdsOf, specialistFieldFor, CREATOR_FIELD } from '../core/config.js';
import { parseBitrixDate } from '../core/time.js';
import { updateObservation } from '../core/sla.js';
import { meetingConfig, isMeeting, normalizeMeeting, meetingTime } from '../core/meetings.js';

const MARGIN = 5 * 60000;
const ACT_SELECT = ['ID', 'OWNER_ID', 'OWNER_TYPE_ID', 'PROVIDER_ID', 'TYPE_ID', 'SUBJECT', 'COMPLETED', 'DEADLINE',
  'END_TIME', 'CREATED', 'LAST_UPDATED', 'AUTHOR_ID', 'RESPONSIBLE_ID', 'DIRECTION', 'START_TIME'];
const MEET_SELECT = ['ID', 'OWNER_ID', 'OWNER_TYPE_ID', 'PROVIDER_ID', 'SUBJECT', 'COMPLETED', 'DEADLINE', 'START_TIME', 'CREATED',
  'RESPONSIBLE_ID', 'AUTHOR_ID'];
const MAX_MEETINGS_PER_QUERY = 20000;

export function isoForFilter(ts) {
  return new Date(ts).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export function emptyDataset(mode = 'real') {
  return {
    mode, portalUrl: null,
    meta: { entities: {}, categories: {}, stages: {}, fields: {}, users: {}, departments: {} },
    cards: {}, history: {}, observations: {}, activities: {}, comments: {}, meetings: {}, meetingOwners: {},
    sync: { status: 'nunca', errors: [], warnings: [], cursors: { items: {}, historyId: {}, activities: {} }, coverage: {} },
    alertState: { known: {}, snoozed: {} },
    snapshots: []
  };
}

/** Campos referenciados pela configuração (prazo, exceções, pausas) — os únicos campos extras lidos. */
export function referencedFields(config, etid, meta) {
  const set = new Set();
  const cf = commercialFieldFor(config, meta, etid);
  if (cf?.field && cf.field !== CREATOR_FIELD) set.add(cf.field);
  const sf = specialistFieldFor(config, meta, etid);
  if (sf?.field) set.add(sf.field);
  const df = config.deadlineFields?.[etid];
  if (df?.field) set.add(df.field);
  for (const r of config.slaRules || []) {
    if (Number(r.entityTypeId) !== Number(etid)) continue;
    for (const c of [...(r.pause || []), ...(r.exceptions || [])]) if (c.field) set.add(c.field);
  }
  return [...set];
}

export function normalizeCard(raw, etid, extraFields, meta) {
  const stageId = raw.stageId ?? raw.statusId ?? raw.STAGE_ID ?? raw.STATUS_ID;
  const categoryId = Number(raw.categoryId ?? raw.CATEGORY_ID ?? 0);
  let semantic = raw.stageSemanticId || raw.STAGE_SEMANTIC_ID || meta?.stages?.[`${etid}:${stageId}`]?.semantic || 'P';
  const fields = {};
  for (const f of extraFields) if (raw[f] !== undefined) fields[f] = raw[f];
  return {
    key: `${etid}:${raw.id ?? raw.ID}`, entityTypeId: Number(etid), id: Number(raw.id ?? raw.ID),
    title: String(raw.title ?? raw.TITLE ?? '').slice(0, 160), stageId, categoryId,
    assignedById: raw.assignedById != null ? String(raw.assignedById) : null,
    createdById: (raw.createdBy ?? raw.CREATED_BY_ID) != null ? String(raw.createdBy ?? raw.CREATED_BY_ID) : null,
    opportunity: Number(raw.opportunity) || 0, currencyId: raw.currencyId || 'BRL',
    createdTime: parseBitrixDate(raw.createdTime), updatedTime: parseBitrixDate(raw.updatedTime),
    movedTime: parseBitrixDate(raw.movedTime), lastActivityTime: parseBitrixDate(raw.lastActivityTime),
    semantic, closed: semantic === 'S' || semantic === 'F', fields
  };
}

export function normalizeHistory(h) {
  return {
    id: Number(h.ID), typeId: Number(h.TYPE_ID), ownerId: Number(h.OWNER_ID), time: parseBitrixDate(h.CREATED_TIME),
    stageId: h.STAGE_ID ?? h.STATUS_ID, categoryId: Number(h.CATEGORY_ID ?? 0),
    semantic: h.STAGE_SEMANTIC_ID ?? h.STATUS_SEMANTIC_ID ?? 'P'
  };
}

export function normalizeActivity(a, subjectMax = 80) {
  return {
    id: Number(a.ID), ownerTypeId: Number(a.OWNER_TYPE_ID), ownerId: Number(a.OWNER_ID), providerId: a.PROVIDER_ID || null,
    typeId: Number(a.TYPE_ID), subject: subjectMax > 0 ? String(a.SUBJECT || '').slice(0, subjectMax) : '',
    completed: a.COMPLETED === 'Y' || a.COMPLETED === true, deadline: parseBitrixDate(a.DEADLINE),
    endTime: parseBitrixDate(a.END_TIME), created: parseBitrixDate(a.CREATED), lastUpdated: parseBitrixDate(a.LAST_UPDATED),
    authorId: a.AUTHOR_ID != null ? String(a.AUTHOR_ID) : null, responsibleId: a.RESPONSIBLE_ID != null ? String(a.RESPONSIBLE_ID) : null,
    direction: Number(a.DIRECTION) || 0
  };
}

function commentEntityType(etid) {
  if (etid === 1) return 'lead';
  if (etid === 2) return 'deal';
  return `dynamic_${etid}`;
}

function configSignature(config, meta) {
  return JSON.stringify({
    m: effectiveMonitored(config, meta).map(m => [m.entityTypeId, [...m.categoryIds].sort()]),
    f: effectiveMonitored(config, meta).map(m => referencedFields(config, m.entityTypeId, meta)),
    cb: effectiveMonitored(config, meta).map(m => commercialFieldFor(config, meta, m.entityTypeId)?.field || ''),
    c: !!config.interaction?.countComments, l: config.interaction?.lookbackDays,
    r: (({ enabled, providers, todoKeywords, lookbackDays }) => [enabled, providers, todoKeywords, lookbackDays])(meetingConfig(config))
  });
}

function upsertActivity(ds, a, keepCompleted = 30) {
  const key = `${a.ownerTypeId}:${a.ownerId}`;
  if (!ds.cards[key]) return;
  const list = (ds.activities[key] || []).filter(x => x.id !== a.id);
  list.push(a);
  const open = list.filter(x => !x.completed);
  const done = list.filter(x => x.completed).sort((x, y) => (y.lastUpdated || 0) - (x.lastUpdated || 0)).slice(0, keepCompleted);
  ds.activities[key] = [...open, ...done];
}

/**
 * Executa uma sincronização. Nunca altera dados no Bitrix24.
 * @returns {Promise<{ds: object, report: object}>}
 */
export async function syncData({ client, config, ds: dsIn, now = Date.now(), forceFull = false, onProgress = () => {} }) {
  const ds = structuredClone(dsIn);
  ds.mode = 'real';
  ds.portalUrl = client.origin;
  const report = { full: false, steps: [], warnings: [], errors: [], requests: 0 };
  const s = ds.sync;
  s.lastAttempt = now;
  s.errors = [];
  s.warnings = [];
  const warn = (msg) => { s.warnings.push(msg); report.warnings.push(msg); };
  let monitored = effectiveMonitored(config, ds.meta);
  const req0 = client.stats.requests;

  try {
    // 1) Estrutura do portal
    if (!ds.meta.loadedAt || now - ds.meta.loadedAt > 24 * 3600e3 || !Object.keys(ds.meta.stages || {}).length) {
      onProgress('estrutura');
      const { meta, warnings } = await loadStructure(client, { manualTypes: config.cardTypes, includeLeads: config.includeLeads });
      ds.meta = { ...ds.meta, ...meta };
      warnings.forEach(warn);
    }
    // Funis excluídos pelo nome (ex.: pós-venda) dependem dos nomes lidos agora.
    monitored = effectiveMonitored(config, ds.meta);
    // Cards fora do escopo (leads de versões anteriores, funis excluídos) saem do cache.
    const scope = new Set(monitored.flatMap(m => m.categoryIds.map(c => `${Number(m.entityTypeId)}:${Number(c)}`)));
    for (const k of Object.keys(ds.cards)) if (!scope.has(`${ds.cards[k].entityTypeId}:${ds.cards[k].categoryId}`)) delete ds.cards[k];
    if (!monitored.length) {
      s.status = config.focusPage && !config.focusEntityTypeId ? 'aguardando_pagina' : 'sem_configuracao';
      report.steps.push('Nenhum funil selecionado para monitoramento.');
      return { ds, report };
    }
    for (const m of monitored) {
      if (!ds.meta.fields?.[m.entityTypeId]) {
        try { ds.meta.fields = { ...(ds.meta.fields || {}), [m.entityTypeId]: await loadFields(client, m.entityTypeId) }; }
        catch (e) { if (isFatal(e)) throw e; warn(`Campos de ${m.entityTypeId} indisponíveis (${e.code}).`); }
      }
    }

    const sig = configSignature(config, ds.meta);
    const full = forceFull || !s.lastFull || s.configSig !== sig ||
      now - s.lastFull > (config.sync?.fullRefreshHours ?? 6) * 3600e3;
    report.full = full;
    const lookbackDays = config.interaction?.lookbackDays ?? 60;
    if (full) s.lookbackStart = now - lookbackDays * 86400e3;
    const changedKeys = new Set();
    const newKeys = new Set();

    // 2) Cards
    for (const m of monitored) {
      const etid = Number(m.entityTypeId);
      const cats = new Set(m.categoryIds.map(Number));
      const extra = referencedFields(config, etid, ds.meta);
      const select = ['id', 'title', 'stageId', 'assignedById', 'createdBy', 'opportunity', 'currencyId', 'createdTime', 'updatedTime',
        'movedTime', 'lastActivityTime', 'stageSemanticId', ...(etid === 1 ? [] : ['categoryId']), ...extra];
      onProgress('cards', ds.meta.entities?.[etid]?.name);
      if (full) {
        const baseFilter = etid === 1 ? {} : { '@categoryId': [...cats] };
        let raw;
        try {
          raw = await client.listById('crm.item.list', { entityTypeId: etid, select, filter: { ...baseFilter, stageSemanticId: 'P' } },
            { idField: 'id', extract: r => r?.items });
        } catch (e) {
          if (e.kind !== 'other') throw e;
          warn('Filtro por semântica de etapa não aceito; filtrando cards abertos localmente.');
          raw = await client.listById('crm.item.list', { entityTypeId: etid, select, filter: baseFilter }, { idField: 'id', extract: r => r?.items });
        }
        for (const k of Object.keys(ds.cards)) if (ds.cards[k].entityTypeId === etid) delete ds.cards[k];
        for (const r of raw) {
          const c = normalizeCard(r, etid, extra, ds.meta);
          if (c.closed || !cats.has(c.categoryId)) continue;
          ds.cards[c.key] = c; changedKeys.add(c.key);
        }
      } else {
        const since = (s.cursors.items[etid] || s.lastSuccess || now) - MARGIN;
        const raw = await client.listById('crm.item.list', { entityTypeId: etid, select, filter: { '>updatedTime': isoForFilter(since) } },
          { idField: 'id', extract: r => r?.items });
        for (const r of raw) {
          const c = normalizeCard(r, etid, extra, ds.meta);
          const prev = ds.cards[c.key];
          if (c.closed || !cats.has(c.categoryId)) { delete ds.cards[c.key]; continue; }
          if (!prev) newKeys.add(c.key);
          if (!prev || prev.updatedTime !== c.updatedTime || prev.lastActivityTime !== c.lastActivityTime) changedKeys.add(c.key);
          ds.cards[c.key] = c;
        }
      }
      s.cursors.items[etid] = now;
    }
    const openKeys = Object.keys(ds.cards);

    // 3–5) Histórico, atividades e comentários não dependem um do outro: são lidos em paralelo,
    // sempre dentro do limite de requisições do cliente (a fila do balde continua valendo).
    const stepHistory = async () => {
      // 3) Histórico de etapas
      s.coverage.history = s.coverage.history || {};
      for (const m of monitored) {
        const etid = Number(m.entityTypeId);
        onProgress('historico', ds.meta.entities?.[etid]?.name);
        const select = etid === 1 ? ['ID', 'TYPE_ID', 'OWNER_ID', 'CREATED_TIME', 'STATUS_ID', 'STATUS_SEMANTIC_ID']
          : ['ID', 'TYPE_ID', 'OWNER_ID', 'CREATED_TIME', 'CATEGORY_ID', 'STAGE_ID', 'STAGE_SEMANTIC_ID'];
        const fetchFor = (keys) => {
          const ids = keys.filter(k => ds.cards[k]?.entityTypeId === etid).map(k => ds.cards[k].id);
          const cmds = {};
          for (let i = 0; i < ids.length; i += 25) {
            cmds[`h${i}`] = ['crm.stagehistory.list', { entityTypeId: etid, filter: { '@OWNER_ID': ids.slice(i, i + 25) }, order: { ID: 'ASC' }, select }];
          }
          return cmds;
        };
        try {
          let records = [];
          const targetKeys = full ? openKeys : [...newKeys];
          const cmds = fetchFor(targetKeys);
          if (Object.keys(cmds).length) {
            const r = await client.batchListAll(cmds, { extract: x => x?.items });
            const errs = Object.values(r.errors);
            if (errs.length) throw errs[0];
            for (const list of Object.values(r.results)) records.push(...list);
            if (full) for (const k of targetKeys) if (ds.cards[k]?.entityTypeId === etid) ds.history[k] = [];
          }
          if (!full) {
            const after = s.cursors.historyId[etid] || 0;
            const inc = await client.listById('crm.stagehistory.list', { entityTypeId: etid, select }, { idField: 'ID', extract: x => x?.items, startAfter: after });
            records.push(...inc);
          }
          let maxId = s.cursors.historyId[etid] || 0;
          for (const raw of records) {
            const h = normalizeHistory(raw);
            maxId = Math.max(maxId, h.id);
            const key = `${etid}:${h.ownerId}`;
            if (!ds.cards[key]) continue;
            const list = ds.history[key] || (ds.history[key] = []);
            if (!list.some(x => x.id === h.id)) list.push(h);
            if (list.length > 100) list.splice(0, list.length - 100);
          }
          // No modo completo, garante cursor ao menos no maior ID visto
          s.cursors.historyId[etid] = maxId;
          s.coverage.history[etid] = 'ok';
        } catch (e) {
          if (isFatal(e) || e.kind === 'rate' || e.kind === 'operation') throw e;
          s.coverage.history[etid] = `indisponível (${e.code})`;
          warn(`Histórico de etapas indisponível para ${ds.meta.entities?.[etid]?.name || etid} (${e.code}). Será usado movedTime ou o início do acompanhamento.`);
        }
      }
    };
    const stepActivities = async () => {
      // 4) Atividades
      s.coverage.activities = s.coverage.activities || {};
      const subjMax = config.privacy?.storeActivitySubject === false ? 0 : 80;
      for (const m of monitored) {
        const etid = Number(m.entityTypeId);
        onProgress('atividades', ds.meta.entities?.[etid]?.name);
        try {
          if (full) {
            for (const k of openKeys) if (ds.cards[k].entityTypeId === etid) ds.activities[k] = [];
            const open = await client.listById('crm.activity.list', { filter: { OWNER_TYPE_ID: etid, COMPLETED: 'N' }, select: ACT_SELECT }, { idField: 'ID' });
            for (const a of open) upsertActivity(ds, normalizeActivity(a, subjMax));
            // Concluídas recentes: primeira página (50 mais recentes) por card, em lote
            const cmds = {};
            for (const k of openKeys) {
              const c = ds.cards[k];
              if (c.entityTypeId !== etid) continue;
              cmds[`a${c.id}`] = ['crm.activity.list', { filter: { OWNER_TYPE_ID: etid, OWNER_ID: c.id, COMPLETED: 'Y', '>=LAST_UPDATED': isoForFilter(s.lookbackStart) },
                order: { LAST_UPDATED: 'DESC' }, select: ACT_SELECT }];
            }
            if (Object.keys(cmds).length) {
              const r = await client.batch(cmds);
              const errs = Object.values(r.errors);
              if (errs.length) warn(`${errs.length} consulta(s) de atividades concluídas falharam (${errs[0].code}).`);
              for (const list of Object.values(r.result)) for (const a of list || []) upsertActivity(ds, normalizeActivity(a, subjMax));
            }
          } else {
            const since = (s.cursors.activities[etid] || s.lastSuccess || now) - MARGIN;
            const inc = await client.listById('crm.activity.list', { filter: { OWNER_TYPE_ID: etid, '>LAST_UPDATED': isoForFilter(since) }, select: ACT_SELECT }, { idField: 'ID' });
            incActivities.push(...inc); // o ranking de reuniões reaproveita esta mesma consulta
            for (const a of inc) upsertActivity(ds, normalizeActivity(a, subjMax));
            // cards novos: carrega atividades abertas deles
            const fresh = [...newKeys].filter(k => ds.cards[k]?.entityTypeId === etid);
            if (fresh.length) {
              const cmds = Object.fromEntries(fresh.map(k => [`n${ds.cards[k].id}`, ['crm.activity.list',
                { filter: { OWNER_TYPE_ID: etid, OWNER_ID: ds.cards[k].id }, order: { LAST_UPDATED: 'DESC' }, select: ACT_SELECT }]]));
              const r = await client.batch(cmds);
              for (const list of Object.values(r.result)) for (const a of list || []) upsertActivity(ds, normalizeActivity(a, subjMax));
            }
          }
          s.cursors.activities[etid] = now;
          s.coverage.activities[etid] = 'ok';
        } catch (e) {
          if (isFatal(e) || e.kind === 'rate' || e.kind === 'operation') throw e;
          s.coverage.activities[etid] = `indisponível (${e.code})`;
          warn(`Atividades indisponíveis para ${ds.meta.entities?.[etid]?.name || etid} (${e.code}). Alertas de atividade e acompanhamento ficam desativados para este tipo.`);
        }
      }
    };
    const stepComments = async () => {
      // 5) Comentários da timeline (somente data e autor; o texto não é armazenado)
      if (config.interaction?.countComments !== false) {
        onProgress('comentarios');
        const keys = full ? openKeys : [...changedKeys].filter(k => ds.cards[k]);
        const cmds = {};
        for (const k of keys) {
          const c = ds.cards[k];
          cmds[`c_${c.entityTypeId}_${c.id}`] = ['crm.timeline.comment.list', { filter: { ENTITY_ID: c.id, ENTITY_TYPE: commentEntityType(c.entityTypeId) },
            order: { CREATED: 'DESC' }, select: ['ID', 'CREATED', 'AUTHOR_ID'] }];
        }
        if (Object.keys(cmds).length) {
          try {
            const r = await client.batch(cmds);
            let failed = 0;
            for (const ck of Object.keys(cmds)) {
              const [, etid, id] = ck.split('_');
              const key = `${etid}:${id}`;
              if (r.errors[ck]) { failed++; continue; }
              ds.comments[key] = (r.result[ck] || []).slice(0, 20).map(x => ({ id: Number(x.ID), created: parseBitrixDate(x.CREATED), authorId: String(x.AUTHOR_ID) }));
            }
            s.coverage.comments = failed ? `parcial (${failed} de ${Object.keys(cmds).length} falharam)` : 'ok';
            if (failed) warn(`Comentários de ${failed} card(s) não puderam ser lidos.`);
          } catch (e) {
            if (isFatal(e) || e.kind === 'rate' || e.kind === 'operation') throw e;
            s.coverage.comments = `indisponível (${e.code})`;
            warn(`Comentários da timeline indisponíveis (${e.code}).`);
          }
        }
      } else s.coverage.comments = 'desativado';
    };
    // Reuniões (ranking): na sincronização completa, lê as reuniões da janela, inclusive de cards já
    // encerrados; na incremental, aproveita as atividades alteradas lidas no passo 4.
    const mcfg = meetingConfig(config);
    const windowStart = now - (Number(mcfg.lookbackDays) || 70) * 86400e3;
    const meetingsOn = mcfg.enabled !== false && ((mcfg.providers || []).length || (mcfg.todoKeywords || []).length);
    const stepMeetingsFull = async () => {
      if (!full || !meetingsOn) return;
      onProgress('reunioes');
      const provs = [...new Set([...(mcfg.providers || []), ...((mcfg.todoKeywords || []).length ? ['CRM_TODO'] : [])])];
      for (const m of monitored) {
        const etid = Number(m.entityTypeId);
        try {
          const found = {};
          for (const prov of provs) {
            const list = await client.listById('crm.activity.list', { filter: { OWNER_TYPE_ID: etid, PROVIDER_ID: prov, '>=DEADLINE': isoForFilter(windowStart) },
              select: MEET_SELECT }, { idField: 'ID', max: MAX_MEETINGS_PER_QUERY });
            for (const raw of list) if (isMeeting(raw, mcfg)) found[`${etid}:${raw.ID}`] = normalizeMeeting(raw, parseBitrixDate);
          }
          for (const k of Object.keys(ds.meetings)) if (k.startsWith(`${etid}:`)) delete ds.meetings[k];
          Object.assign(ds.meetings, found);
          s.coverage.meetings = 'ok';
        } catch (e) {
          if (isFatal(e) || e.kind === 'rate' || e.kind === 'operation') throw e;
          s.coverage.meetings = `indisponível (${e.code})`;
          warn(`Reuniões indisponíveis para ${ds.meta.entities?.[etid]?.name || etid} (${e.code}); o ranking usa a última leitura.`);
        }
      }
    };
    const incActivities = [];
    await Promise.all([stepHistory(), stepActivities(), stepComments(), stepMeetingsFull()]);
    if (!ds.meetings) ds.meetings = {};
    if (!ds.meetingOwners) ds.meetingOwners = {};
    if (!meetingsOn) { ds.meetings = {}; ds.meetingOwners = {}; s.coverage.meetings = 'desativado'; }
    else {
      if (!full) {
        for (const raw of incActivities) {
          const k = `${raw.OWNER_TYPE_ID}:${raw.ID}`;
          if (isMeeting(raw, mcfg)) ds.meetings[k] = normalizeMeeting(raw, parseBitrixDate);
          else delete ds.meetings[k]; // deixou de ser reunião (ex.: assunto alterado)
        }
      }
      // janela móvel: reuniões antigas saem
      for (const [k, m] of Object.entries(ds.meetings)) { const t = meetingTime(m); if (t != null && t < windowStart) delete ds.meetings[k]; }
      s.meetingsWindowStart = full ? windowStart : Math.max(s.meetingsWindowStart || windowStart, windowStart);
      // Cards das reuniões que não estão abertos no cache (ganhos/perdidos): funil, responsável e comercial.
      const needed = new Set(Object.values(ds.meetings).map(m => `${m.ownerTypeId}:${m.ownerId}`).filter(k => !ds.cards[k]));
      for (const k of Object.keys(ds.meetingOwners)) if (!needed.has(k)) delete ds.meetingOwners[k];
      const missing = [...needed].filter(k => full || !ds.meetingOwners[k]);
      if (missing.length) {
        onProgress('reunioes');
        try {
          const byEt = {};
          for (const k of missing) { const [et, id] = k.split(':'); (byEt[et] = byEt[et] || []).push(Number(id)); }
          const cmds = {};
          for (const [et, ids] of Object.entries(byEt)) {
            const sel = ['id', 'categoryId', 'createdBy', 'assignedById', 'stageId', ...referencedFields(config, Number(et), ds.meta)];
            for (let i = 0; i < ids.length; i += 50) cmds[`o${et}_${i}`] = ['crm.item.list', { entityTypeId: Number(et), filter: { '@id': ids.slice(i, i + 50) }, select: sel }];
          }
          const r = await client.batch(cmds);
          for (const [ck, res] of Object.entries(r.result)) {
            const et = ck.slice(1).split('_')[0];
            const extra = referencedFields(config, Number(et), ds.meta);
            for (const it of res?.items || []) {
              const fields = {};
              for (const f of extra) if (it[f] !== undefined) fields[f] = it[f];
              ds.meetingOwners[`${et}:${it.id}`] = { categoryId: Number(it.categoryId ?? 0), assignedById: it.assignedById != null ? String(it.assignedById) : null,
                createdById: it.createdBy != null ? String(it.createdBy) : null, stageId: it.stageId ?? null, fields };
            }
          }
          const errs = Object.values(r.errors);
          if (errs.length) warn(`Dados de ${errs.length} grupo(s) de cards com reunião não puderam ser lidos (${errs[0].code}).`);
        } catch (e) {
          if (isFatal(e) || e.kind === 'rate' || e.kind === 'operation') throw e;
          warn(`Cards encerrados com reunião não puderam ser lidos (${e.code}); o ranking pode ficar incompleto.`);
        }
      }
    }

    // 6) Usuários e departamentos
    onProgress('usuarios');
    const ids = new Set();
    for (const k of openKeys) {
      ids.add(ds.cards[k].assignedById);
      for (const v of commercialIdsOf(ds.cards[k], commercialFieldFor(config, ds.meta, ds.cards[k].entityTypeId))) ids.add(v);
      for (const a of ds.activities[k] || []) { ids.add(a.responsibleId); ids.add(a.authorId); }
      for (const c of ds.comments[k] || []) ids.add(c.authorId);
    }
    for (const m of Object.values(ds.meetings || {})) ids.add(m.responsibleId);
    for (const [k, o] of Object.entries(ds.meetingOwners || {})) {
      ids.add(o.assignedById);
      for (const v of commercialIdsOf(o, commercialFieldFor(config, ds.meta, Number(k.split(':')[0])))) ids.add(v);
    }
    const stale = !ds.meta.usersLoadedAt || now - ds.meta.usersLoadedAt > 24 * 3600e3;
    const missing = [...ids].filter(id => id && (stale || !ds.meta.users?.[id]));
    const stepUsers = async () => {
      if (missing.length) {
        try {
          const r = await loadUsers(client, missing);
          ds.meta.users = { ...(ds.meta.users || {}), ...r.users };
          if (stale) ds.meta.usersLoadedAt = now;
          s.coverage.users = r.errors.length ? `parcial (${r.errors[0].code})` : 'ok';
        } catch (e) {
          if (isFatal(e)) throw e;
          s.coverage.users = `indisponível (${e.code})`;
          warn(`Nomes de usuários indisponíveis (${e.code}); serão exibidos os IDs.`);
        }
      }
    };
    const stepDepartments = async () => {
      if (!ds.meta.departmentsLoadedAt || now - ds.meta.departmentsLoadedAt > 24 * 3600e3) {
        try { ds.meta.departments = await loadDepartments(client); s.coverage.departments = 'ok'; }
        catch (e) {
          if (isFatal(e)) throw e;
          ds.meta.departments = {};
          s.coverage.departments = `indisponível (${e.code})`;
          warn('Departamentos do Bitrix indisponíveis (requer escopo "department"). Use as equipes manuais nas configurações.');
        }
        ds.meta.departmentsLoadedAt = now;
      }
    };
    await Promise.all([stepUsers(), stepDepartments()]);

    // 7) Observações (início de acompanhamento e pausas por campo) e limpeza
    for (const k of openKeys) ds.observations[k] = updateObservation(ds.cards[k], ds.observations[k], config.slaRules, now);
    for (const store of ['history', 'observations', 'activities', 'comments']) {
      for (const k of Object.keys(ds[store])) if (!ds.cards[k]) delete ds[store][k];
    }

    s.coverage.entities = monitored.map(m => ({
      entityTypeId: m.entityTypeId, name: ds.meta.entities?.[m.entityTypeId]?.name || String(m.entityTypeId),
      categories: m.categoryIds.map(c => ds.meta.categories?.[`${m.entityTypeId}:${c}`]?.name || String(c)),
      cards: openKeys.filter(k => ds.cards[k].entityTypeId === Number(m.entityTypeId)).length
    }));
    s.coverage.lookbackDays = lookbackDays;
    s.coverage.cards = openKeys.length;
    if (full) { s.lastFull = now; s.configSig = sig; }
    s.lastSuccess = now;
    s.status = s.warnings.length ? 'parcial' : 'ok';
    report.requests = client.stats.requests - req0;
    s.stats = { requests: report.requests, retries: client.stats.retries, rateLimited: client.stats.rateLimited, full };
    return { ds, report };
  } catch (e) {
    // Falha: mantém os dados anteriores intactos e registra o erro.
    const keep = structuredClone(dsIn);
    keep.sync.lastAttempt = now;
    keep.sync.status = { auth: 'auth_error', session: 'sem_sessao', no_tab: 'sem_aba' }[e.kind] || 'erro';
    keep.sync.errors = [{ at: now, code: e.code || 'ERRO', kind: e.kind || 'other', message: String(e.message || e).slice(0, 300), retryAt: e.retryAt || null }];
    keep.sync.warnings = s.warnings;
    report.errors.push(keep.sync.errors[0]);
    report.requests = client.stats.requests - req0;
    return { ds: keep, report, error: e };
  }
}

export { loadStructure, loadFields };
