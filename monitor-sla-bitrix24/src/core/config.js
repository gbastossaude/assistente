// Configuração padrão. Nenhum prazo de operação é presumido: as regras de SLA,
// parada, interação e prazo começam vazias e são definidas pelo usuário.
import { DEFAULT_RELEVANT_PROVIDERS } from './interactions.js';
import { DEFAULT_PRIORITY } from './priority.js';
import { DEFAULT_MEETINGS } from './meetings.js';

export const CONFIG_VERSION = 1;

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
    includeLeads: false,          // leads ficam fora do monitoramento      // processo identificado nos links dos cards dessa página
    commercialFields: {},         // { [entityTypeId]: { field, label } } — campo do Comercial; vazio = detecção automática
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

/** Mescla configuração salva com a padrão (para versões futuras). */
export function mergeConfig(saved) {
  const d = defaultConfig();
  if (!saved) return d;
  return {
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
  };
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
export function effectiveMonitored(config) {
  let list = (config.monitored || []).filter(m => (m.categoryIds || []).length);
  if (!config.includeLeads) list = list.filter(m => Number(m.entityTypeId) !== 1);
  if (config.focusPage) {
    const et = Number(config.focusEntityTypeId);
    list = et ? list.filter(m => Number(m.entityTypeId) === et) : [];
  }
  return list;
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

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}
