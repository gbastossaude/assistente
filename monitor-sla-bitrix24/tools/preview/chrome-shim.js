// Simulação mínima das APIs do Chrome para a PRÉVIA em arquivo único (fora do Chrome).
// Permite abrir o painel com os dados fictícios da demonstração num navegador comum.
const listeners = { msg: [], changed: [], alarm: [] };
function area(name) {
  const data = {};
  return {
    async get(keys) {
      if (keys == null) return structuredClone(data);
      const ks = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
      const out = {};
      for (const k of ks) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(obj) {
      const ch = {};
      for (const [k, v] of Object.entries(obj)) { ch[k] = { oldValue: data[k], newValue: v }; data[k] = structuredClone(v); }
      setTimeout(() => listeners.changed.forEach(f => f(ch, name)), 0);
    },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
    async clear() { for (const k of Object.keys(data)) delete data[k]; }
  };
}
const ev = arr => ({ addListener: f => arr.push(f) });
const noop = async () => {};
globalThis.chrome = {
  runtime: {
    id: 'preview', lastError: null,
    getURL: p => p,
    onMessage: ev(listeners.msg), onInstalled: ev([]), onStartup: ev([]),
    sendMessage(msg, cb) {
      const f = listeners.msg[0];
      const ret = f(msg, { id: 'preview', url: 'chrome-extension://preview/ui/dashboard.html' }, r => cb && cb(r));
      if (!ret && cb) cb(undefined);
    }
  },
  storage: { local: area('local'), session: area('session'), onChanged: ev(listeners.changed) },
  alarms: { get: async () => null, create: noop, clearAll: noop, onAlarm: ev(listeners.alarm) },
  action: { setBadgeText: noop, setBadgeBackgroundColor: noop, setBadgeTextColor: noop, setTitle: noop, getBadgeText: async () => '' },
  permissions: { contains: async () => false, request: async () => false, remove: noop },
  notifications: { create: noop, clear: noop, onClicked: ev([]) },
  tabs: { create: ({ url }) => window.open(url, '_blank'), query: async () => [], sendMessage: async () => null }
};
