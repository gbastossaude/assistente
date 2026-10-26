/*
 * Configurações (regras de SLA, expediente, campos) e acesso ao chrome.storage.local.
 * Nenhum prazo da empresa é pré-definido: todas as regras começam em 0 (desativadas).
 */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});
  const util = NS.util || (typeof require === 'function' ? require('./util.js') : null);
  const time = NS.time || (typeof require === 'function' ? require('./time.js') : null);

  const SETTINGS_VERSION = 1;
  const KEYS = { settings: 'bnka:settings', obs: 'bnka:obs', registry: 'bnka:registry', ui: 'bnka:ui' };

  // Chaves de versões/protótipos antigos baseados em webhook ou token: sempre removidas.
  const LEGACY_KEYS = [
    'webhook', 'webhookUrl', 'webhook_url', 'webhookURL', 'bitrixWebhook', 'restUrl', 'rest_url', 'restEndpoint',
    'token', 'accessToken', 'access_token', 'refreshToken', 'authToken', 'apiKey', 'api_key', 'clientSecret',
    'client_secret', 'portalUrl', 'serverUrl', 'password', 'senha'
  ];

  function defaults() {
    return {
      version: SETTINGS_VERSION,
      clock: {
        mode: 'corrido', // 'corrido' (24 h) ou 'expediente'
        tz: 'America/Sao_Paulo',
        workdays: [1, 2, 3, 4, 5],
        start: '08:00',
        end: '18:00',
        holidays: []
      },
      warnPct: 80,
      continuityMin: 15,
      countGaps: false,
      retentionDays: 30,
      assumeCurrentYear: false,
      deadlineLabels: [],
      stageEntryLabels: [],
      extraPhrases: { sla: [], overdueActivity: [], noActivity: [] },
      rules: {}
    };
  }

  function numberIn(v, min, max, fallback) {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  }

  function cleanLabelList(list, maxItems) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const item of list) {
      const s = util.cleanText(item, 80);
      if (s && !out.some((x) => util.normKey(x) === util.normKey(s))) out.push(s);
      if (out.length >= (maxItems || 20)) break;
    }
    return out;
  }

  function cleanRule(r) {
    const rule = r && typeof r === 'object' ? r : {};
    return {
      sla: numberIn(rule.sla, 0, 100000, 0),
      stall: numberIn(rule.stall, 0, 100000, 0),
      pause: rule.pause === true,
      final: rule.final === true ? true : rule.final === false ? false : null
    };
  }

  /**
   * Normaliza qualquer objeto salvo (inclusive de versões antigas) para o formato atual.
   * Retorna { settings, removedLegacy } — removedLegacy lista chaves de webhook/token descartadas.
   */
  function migrate(raw) {
    const base = defaults();
    const src = raw && typeof raw === 'object' ? raw : {};
    const removedLegacy = [];
    const scan = (obj, path) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      for (const k of Object.keys(obj)) {
        if (LEGACY_KEYS.includes(k)) removedLegacy.push(path + k);
        else if (k !== 'rules') scan(obj[k], path + k + '.');
      }
    };
    scan(src, '');

    const c = src.clock && typeof src.clock === 'object' ? src.clock : {};
    const s = base;
    s.clock.mode = c.mode === 'expediente' ? 'expediente' : 'corrido';
    s.clock.tz = time.isValidTimeZone(c.tz) ? c.tz : base.clock.tz;
    if (Array.isArray(c.workdays)) {
      const wd = [...new Set(c.workdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      if (wd.length) s.clock.workdays = wd;
    }
    if (time.parseHHMM(c.start) !== null) s.clock.start = c.start;
    if (time.parseHHMM(c.end) !== null) s.clock.end = c.end;
    if (time.parseHHMM(s.clock.end) <= time.parseHHMM(s.clock.start)) {
      s.clock.start = '08:00'; s.clock.end = '18:00';
    }
    if (Array.isArray(c.holidays)) {
      s.clock.holidays = time.parseHolidayLines(c.holidays.join('\n')).dates.slice(0, 400);
    }
    s.warnPct = numberIn(src.warnPct, 0, 99, base.warnPct);
    s.continuityMin = numberIn(src.continuityMin, 1, 240, base.continuityMin);
    s.countGaps = src.countGaps === true;
    s.retentionDays = numberIn(src.retentionDays, 1, 365, base.retentionDays);
    s.assumeCurrentYear = src.assumeCurrentYear === true;
    s.deadlineLabels = cleanLabelList(src.deadlineLabels);
    s.stageEntryLabels = cleanLabelList(src.stageEntryLabels);
    const ep = src.extraPhrases && typeof src.extraPhrases === 'object' ? src.extraPhrases : {};
    s.extraPhrases = {
      sla: cleanLabelList(ep.sla),
      overdueActivity: cleanLabelList(ep.overdueActivity),
      noActivity: cleanLabelList(ep.noActivity)
    };
    const rules = src.rules && typeof src.rules === 'object' ? src.rules : {};
    for (const fk of Object.keys(rules).slice(0, 200)) {
      const stages = rules[fk];
      if (!stages || typeof stages !== 'object') continue;
      const out = {};
      for (const sk of Object.keys(stages).slice(0, 300)) {
        const r = cleanRule(stages[sk]);
        if (r.sla || r.stall || r.pause || r.final !== null) out[util.cleanText(sk, 120)] = r;
      }
      if (Object.keys(out).length) s.rules[util.cleanText(fk, 120)] = out;
    }
    return { settings: s, removedLegacy };
  }

  function getRule(settings, funnelKey, stageKey) {
    const f = settings.rules[funnelKey];
    return cleanRule(f && f[stageKey]);
  }

  function setRule(settings, funnelKey, stageKey, rule) {
    const r = cleanRule(rule);
    if (!settings.rules[funnelKey]) settings.rules[funnelKey] = {};
    if (r.sla || r.stall || r.pause || r.final !== null) settings.rules[funnelKey][stageKey] = r;
    else delete settings.rules[funnelKey][stageKey];
    if (!Object.keys(settings.rules[funnelKey]).length) delete settings.rules[funnelKey];
  }

  // ---- chrome.storage.local (protegido contra contexto invalidado após atualização) ----

  function extensionAlive() {
    try {
      return !!(root.chrome && root.chrome.runtime && root.chrome.runtime.id && root.chrome.storage && root.chrome.storage.local);
    } catch (e) {
      return false;
    }
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (!extensionAlive()) return resolve({});
      try {
        root.chrome.storage.local.get(keys, (res) => {
          const err = root.chrome.runtime && root.chrome.runtime.lastError;
          resolve(err ? {} : res || {});
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      if (!extensionAlive()) return resolve(false);
      try {
        root.chrome.storage.local.set(obj, () => {
          const err = root.chrome.runtime && root.chrome.runtime.lastError;
          resolve(!err);
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve) => {
      if (!extensionAlive()) return resolve(false);
      try {
        root.chrome.storage.local.remove(keys, () => resolve(true));
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function loadSettings() {
    const res = await storageGet([KEYS.settings]);
    const { settings, removedLegacy } = migrate(res[KEYS.settings]);
    if (removedLegacy.length || !res[KEYS.settings]) await storageSet({ [KEYS.settings]: settings });
    return { settings, removedLegacy };
  }

  function saveSettings(settings) {
    return storageSet({ [KEYS.settings]: migrate(settings).settings });
  }

  const api = {
    SETTINGS_VERSION, KEYS, LEGACY_KEYS, defaults, migrate, getRule, setRule, cleanRule,
    extensionAlive, storageGet, storageSet, storageRemove, loadSettings, saveSettings
  };
  NS.settings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
