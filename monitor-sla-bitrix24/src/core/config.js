// Configuração padrão. Nenhum prazo de operação é presumido: as regras de SLA,
// parada, interação e prazo começam vazias e são definidas pelo usuário.
import { DEFAULT_RELEVANT_PROVIDERS } from './interactions.js';
import { DEFAULT_PRIORITY } from './priority.js';
import { DEFAULT_MEETINGS } from './meetings.js';

export const CONFIG_VERSION = 1;

/** Funis e processos excluídos por padrão (comparação sem acento, maiúsculas, espaço ou hífen). */
export const DEFAULT_EXCLUDE_NAMES = ['pós-venda'];

/** Endereço do portal da corretora, sugerido na tela de conexão (pode ser alterado). */
export const DEFAULT_PORTAL = 'https://crm.hub-bnk.com';

/** Página do espaço digital cujas oportunidades são monitoradas (somente elas). */
export const DEFAULT_FOCUS_PAGE = '/page/besmart/besmart_saude/';

/** Normaliza o endereço da página de foco: aceita URL completa ou caminho; corta em /type/… se for link de card. */
export function normalizeFocusPage(input) {
  let v = String(input || '').trim();
  if (!v) return null;
  try { if (/^[a-z]+:\/\//i.test(v)) v = new URL(v).pathname; } catch { return null; }
  v = v.split('?')[0].split('#')[0];
  const m = v.match(/^(\/page\/[^/]+\/[^/]+)\/?/);
  return m ? `${m[1]}/` : null;
}

export function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    portalOrigin: null,
    portalAddress: DEFAULT_PORTAL, // endereço informado pelo usuário (origem)
    credentialMode: 'session',   // 'session' (memória, apaga ao fechar o Chrome) | 'persist'
    requestsPerSecond: 2,        // 2 nos planos padrão; 5 no Enterprise
    monitored: [],               // [{ entityTypeId, categoryIds: [] }]
    useMovedTime: true,
    calendar: {
      timezone: 'America/Sao_Paulo',
      workdays: [1, 2, 3, 4, 5],
      intervals: [{ start: '09:00', end: '18:00' }],
      holidays: [],
      dayMinutes: null,
      confirmed: false            // expediente padrão precisa ser confirmado pelo usuário
    },
    slaRules: [],                 // por funil e etapa
    processRules: [],             // SLA total por funil
    stagnationRules: [],          // limite de permanência na mesma etapa
    noFutureActivityRules: [],    // por funil
    noInteractionRules: [],       // por funil
    deadlineFields: {},           // { [entityTypeId]: { field, label, type, warnHours } }
    focusPage: DEFAULT_FOCUS_PAGE, // monitora SOMENTE as oportunidades desta página (null = escolher funis livremente)
    focusEntityTypeId: null,
    includeLeads: false,          // leads ficam fora do monitoramento
    excludeNames: [...DEFAULT_EXCLUDE_NAMES], // funis/processos com estes nomes nunca são monitorados
    commercialFields: {},         // { [entityTypeId]: { field, label } } — campo de usuário do Comercial; vazio = quem abriu o card
    specialistFields: {},         // { [entityTypeId]: { field, label } } — campo "E-mail do especialista"; vazio = detecção automática
    cardTypes: {},                // { [entityTypeId]: { linkPath: '/page/.../type/N/details/{id}/', sampleUrl } } — via link de um card
    interaction: {
      relevantProviders: [...DEFAULT_RELEVANT_PROVIDERS],
      automationUserIds: [],
      countComments: true,
      countCreatedByHuman: true,
      lookbackDays: 60
    },
    teams: [],                    // equipes manuais: [{ id, name, userIds: [] }]
    priority: structuredClone(DEFAULT_PRIORITY),
    notifications: {
      enabled: false,             // exige permissão opcional "notifications"
      earlyWarning: true,
      minLevel: 'alta',           // nível mínimo para notificar
      window: { enabled: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '19:00' },
      maxPerSync: 3
    },
    badge: { count: 'atraso' },   // 'atraso' | 'alta' | 'critica' | 'todos'
    sync: { intervalMinutes: 15, fullRefreshHours: 6 },
    privacy: { storeActivitySubject: true },
    meetings: structuredClone(DEFAULT_MEETINGS), // ranking automático de reuniões
    analytics: { minSample: 5 }
  };
}

/**
 * O expediente (horário comercial) foi removido: toda contagem é em tempo corrido. Regras salvas em
 * versões anteriores com "horário comercial" passam a valer em tempo corrido.
 */
export function withoutBusinessHours(c) {
  for (const k of ['slaRules', 'processRules', 'stagnationRules', 'noInteractionRules']) {
    c[k] = (c[k] || []).map(r => ({ ...r, mode: 'corrido' }));
  }
  return c;
}

/** Mescla configuração salva com a padrão (para versões futuras). */
export function mergeConfig(saved) {
  const d = defaultConfig();
  if (!saved) return d;
  return withoutBusinessHours({
    ...d, ...saved,
    calendar: { ...d.calendar, ...(saved.calendar || {}) },
    interaction: { ...d.interaction, ...(saved.interaction || {}) },
    notifications: { ...d.notifications, ...(saved.notifications || {}), window: { ...d.notifications.window, ...(saved.notifications?.window || {}) } },
    sync: { ...d.sync, ...(saved.sync || {}) },
    privacy: { ...d.privacy, ...(saved.privacy || {}) },
    analytics: { ...d.analytics, ...(saved.analytics || {}) },
    meetings: { ...d.meetings, ...(saved.meetings || {}) },
    badge: { ...d.badge, ...(saved.badge || {}) },
    priority: { ...d.priority, ...(saved.priority || {}), weights: { ...d.priority.weights, ...(saved.priority?.weights || {}) },
      levels: { ...d.priority.levels, ...(saved.priority?.levels || {}) } }
  });
}

/** Feriados nacionais (Lei 662/1949, 6.802/1980, 14.759/2023) + Sexta-feira Santa. Opcionais: Carnaval e Corpus Christi. */
export function brazilHolidays(year, { carnaval = false, corpusChristi = false } = {}) {
  // Páscoa (algoritmo de Meeus/Jones/Butcher)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = Date.UTC(year, month - 1, day);
  const off = n => new Date(easter + n * 86400000).toISOString().slice(0, 10);
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(x => `${year}-${x}`);
  const out = [...fixed, off(-2)];
  if (carnaval) out.push(off(-48), off(-47));
  if (corpusChristi) out.push(off(60));
  return out.sort();
}

/**
 * Funis efetivamente monitorados. Com página de foco: SOMENTE o processo dela (nada enquanto não for
 * identificado). Leads nunca entram, salvo se includeLeads estiver ativo.
 */
export function effectiveMonitored(config, meta) {
  let list = (config.monitored || []).filter(m => (m.categoryIds || []).length);
  if (!config.includeLeads) list = list.filter(m => Number(m.entityTypeId) !== 1);
  if (config.focusPage) {
    const et = Number(config.focusEntityTypeId);
    list = et ? list.filter(m => Number(m.entityTypeId) === et) : [];
  }
  // Funis/processos excluídos pelo nome (padrão: pós-venda). Precisa dos nomes lidos do portal (meta).
  if (meta) {
    const pats = config.excludeNames ?? DEFAULT_EXCLUDE_NAMES;
    list = list.filter(m => !isExcludedName(meta.entities?.[m.entityTypeId]?.name, pats))
      .map(m => ({ ...m, categoryIds: m.categoryIds.filter(c => !isExcludedName(meta.categories?.[`${m.entityTypeId}:${c}`]?.name, pats)) }))
      .filter(m => m.categoryIds.length);
  }
  return list;
}

const normName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** O nome do funil/processo contém algum dos termos excluídos? ("Pós venda", "POS-VENDA" e "Pós-Venda e Assessoria" contêm "pós-venda"). */
export function isExcludedName(name, patterns) {
  const n = normName(name);
  return !!n && (patterns || []).some(p => { const q = normName(p); return q && n.includes(q); });
}

/** Comercial padrão: a pessoa que abriu (criou) o card no Bitrix — campo nativo `createdBy`. */
export const CREATOR_FIELD = 'createdBy';
export const CREATOR_LABEL = 'Quem abriu o card (Criado por)';

/**
 * Campo que identifica o Comercial do card. Sem escolha do usuário, o comercial é quem abriu o card
 * (`createdBy`), mostrado em coluna própria, separado do responsável atual. O usuário pode escolher outro
 * campo de usuário do processo; `field: ''` explícito desativa.
 */
export function commercialFieldFor(config, meta, etid) {
  const chosen = config.commercialFields?.[etid];
  if (chosen && chosen.field === '') return null;
  if (chosen?.field && chosen.field !== CREATOR_FIELD) return { field: chosen.field, label: chosen.label || chosen.field, auto: false, creator: false };
  return { field: CREATOR_FIELD, label: CREATOR_LABEL, auto: !chosen, creator: true };
}

/** IDs de usuário do comercial de um card normalizado (pode haver mais de um num campo múltiplo). */
export function commercialIdsOf(card, cf) {
  if (!cf) return [];
  const raw = cf.creator ? (card.createdById ?? card.fields?.[CREATOR_FIELD]) : card.fields?.[cf.field];
  return [].concat(raw ?? []).map(String).filter(v => v && v !== '0' && v !== 'null');
}

/**
 * Campo do card com o e-mail do especialista (comercial). Usa a escolha do usuário; sem escolha, procura um
 * campo cujo nome tenha "especialista" (de preferência "E-mail do especialista"). `field: ''` desativa.
 */
export function specialistFieldFor(config, meta, etid) {
  const chosen = config.specialistFields?.[etid];
  if (chosen && chosen.field === '') return null;
  if (chosen?.field) return { field: chosen.field, label: chosen.label || chosen.field, auto: false };
  const fields = meta?.fields?.[etid];
  if (!fields) return null;
  const hits = Object.entries(fields).filter(([k, f]) => /especialista/i.test(`${f.title || ''} ${k}`) && f.type !== 'user')
    .sort((a, b) => /e-?mail/i.test(b[1].title || b[0]) - /e-?mail/i.test(a[1].title || a[0]));
  return hits.length ? { field: hits[0][0], label: hits[0][1].title || hits[0][0], auto: true } : null;
}

/** Primeiro e-mail encontrado no valor do campo (texto, lista ou campo múltiplo do Bitrix). */
export function extractEmail(v) {
  const s = [].concat(v ?? []).map(x => (x && typeof x === 'object' ? (x.VALUE ?? x.value ?? '') : x)).join(' ');
  const m = String(s).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

const NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** "yago.barbosa@besmart.com.br" → "Yago Barbosa"; "maria.da.silva2@..." → "Maria da Silva". */
export function nameFromEmail(email) {
  const local = String(email || '').split('@')[0].split('+')[0];
  const parts = local.split(/[._\-]+/).map(p => p.replace(/\d+/g, '')).filter(Boolean);
  if (!parts.length) return String(email || '');
  return parts.map((p, i) => (i > 0 && NAME_PARTICLES.has(p.toLowerCase()) ? p.toLowerCase()
    : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR'))).join(' ');
}

/**
 * Comercial do card: primeiro o e-mail do especialista (convertido em nome e sobrenome); sem e-mail,
 * o campo de usuário escolhido ou quem abriu o card. `ids` identifica o comercial em filtros e rankings.
 */
export function commercialOfCard(card, config, meta, etid = card.entityTypeId) {
  const sf = specialistFieldFor(config, meta, etid);
  const email = sf ? extractEmail(card.fields?.[sf.field]) : null;
  if (email) return { ids: [`email:${email}`], email, name: nameFromEmail(email), source: 'especialista', label: sf.label };
  const cf = commercialFieldFor(config, meta, etid);
  if (!cf) return { ids: [], email: null, name: null, source: null, label: null };
  return { ids: commercialIdsOf(card, cf), email: null, name: null, source: cf.creator ? 'criador' : 'campo', label: cf.label };
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}
