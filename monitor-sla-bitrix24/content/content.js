// Script da extensão nas páginas do Bitrix24 (mundo isolado).
// 1) Faz as consultas de LEITURA com o login de quem está no portal (mesma origem, cookies + sessid).
// 2) Mostra a aba "SLA" e a gaveta com a análise dentro do próprio Bitrix.
// Não altera cards, etapas, atividades ou prazos.
(() => {
  if (window.top !== window || window.__slaMonitorLoaded) return;
  window.__slaMonitorLoaded = true;

  const READ_ONLY = new Set(['crm.type.list', 'crm.category.list', 'crm.status.list', 'crm.item.fields', 'crm.item.list',
    'crm.stagehistory.list', 'crm.activity.list', 'crm.automatedsolution.list', 'crm.timeline.comment.list', 'crm.settings.mode.get',
    'user.get', 'user.current', 'department.get', 'profile', 'scope', 'batch']);

  // ---------- sessid (token de sessão) ----------
  let sess = null;
  function getSessid(force = false) {
    if (sess && !force && Date.now() - sess.at < 5 * 60000) return Promise.resolve(sess.value);
    return new Promise(resolve => {
      const nonce = Math.random().toString(36).slice(2);
      const onMsg = ev => {
        if (ev.source !== window || !ev.data || ev.data.type !== '__slaMonitor_sessid' || ev.data.nonce !== nonce) return;
        window.removeEventListener('message', onMsg);
        clearTimeout(t);
        sess = ev.data.sessid ? { value: ev.data.sessid, at: Date.now() } : null;
        resolve(ev.data.sessid || null);
      };
      const t = setTimeout(() => { window.removeEventListener('message', onMsg); resolve(null); }, 3000);
      window.addEventListener('message', onMsg);
      window.postMessage({ type: '__slaMonitor_getSessid', nonce }, window.location.origin);
    });
  }

  function buildQuery(obj, prefix) {
    const parts = [];
    const add = (k, v) => {
      if (v === undefined) return;
      if (v === null) v = '';
      if (Array.isArray(v)) { if (!v.length) parts.push(`${encodeURIComponent(k)}=`); v.forEach((x, i) => add(`${k}[${i}]`, x)); }
      else if (typeof v === 'object') { for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv); }
      else parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'boolean' ? (v ? 'Y' : 'N') : v)}`);
    };
    for (const [k, v] of Object.entries(obj || {})) add(prefix ? `${prefix}[${k}]` : k, v);
    return parts.join('&');
  }

  async function restCall(method, params) {
    if (!READ_ONLY.has(method)) return { status: 403, text: JSON.stringify({ error: 'METHOD_NOT_ALLOWED', error_description: 'Somente leitura' }) };
    for (let attempt = 0; attempt < 2; attempt++) {
      const sessid = await getSessid(attempt > 0);
      if (!sessid) return { status: 401, text: JSON.stringify({ error: 'NO_SESSION', error_description: 'Sem sessão ativa no Bitrix24' }) };
      let res;
      try {
        res = await fetch(`${location.origin}/rest/${method}.json`, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'application/json' },
          body: `${buildQuery(params)}&sessid=${encodeURIComponent(sessid)}`
        });
      } catch {
        return { status: 0, text: JSON.stringify({ error: 'NETWORK_ERROR', error_description: 'Falha de rede' }) };
      }
      const text = await res.text();
      // Sessão expirada/sessid inválido: tenta uma vez com token novo.
      if (attempt === 0 && (res.status === 401 || /"error"\s*:\s*"(NO_AUTH_FOUND|INVALID_CREDENTIALS)"/.test(text))) continue;
      if (!/^\s*[{[]/.test(text)) return { status: 401, text: JSON.stringify({ error: 'NO_SESSION', error_description: 'O portal não devolveu JSON (sessão expirada ou página de login).' }) };
      return { status: res.status, text };
    }
    return { status: 401, text: JSON.stringify({ error: 'NO_SESSION', error_description: 'Sessão expirada' }) };
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !msg) return false;
    if (msg.type === 'slaRest') { restCall(msg.method, msg.params).then(reply); return true; }
    if (msg.type === 'slaPing') { getSessid().then(s => reply({ ok: true, loggedIn: !!s, origin: location.origin, url: location.href })); return true; }
    return false;
  });

  // ---------- aba lateral + gaveta ----------
  const host = document.createElement('div');
  host.id = 'sla-monitor-root';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000; top: 0; right: 0; width: 0; height: 0;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { all: initial; }
    .tab { position: fixed; right: 0; top: 42%; transform: translateY(-50%); background: #0F4C5C; color: #fff; border: 0; cursor: pointer;
      border-radius: 10px 0 0 10px; padding: 10px 7px; font: 600 12px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,.25); display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .tab img { width: 20px; height: 20px; }
    .tab .lbl { writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: .04em; }
    .tab .n { background: #B42318; border-radius: 999px; min-width: 20px; padding: 2px 5px; text-align: center; font-size: 11px; }
    .tab .n.ok { background: #157F3D; } .tab .n.warn { background: #C2410C; } .tab .n.off { background: #64748B; }
    .tab .n.hide { display: none; }
    .drawer { position: fixed; top: 0; right: 0; height: 100vh; width: min(640px, 100vw); background: #F4F6F8; box-shadow: -8px 0 30px rgba(0,0,0,.25);
      transform: translateX(105%); transition: transform .2s ease; display: flex; flex-direction: column; }
    .drawer.open { transform: none; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #0F4C5C; color: #fff; font: 600 13px system-ui, sans-serif; }
    .bar .sp { flex: 1; }
    .bar button { background: rgba(255,255,255,.15); color: #fff; border: 0; border-radius: 6px; padding: 5px 9px; cursor: pointer; font: 500 12px system-ui, sans-serif; }
    .bar button:hover { background: rgba(255,255,255,.28); }
    iframe { border: 0; flex: 1; width: 100%; background: #F4F6F8; }
    @media (prefers-color-scheme: dark) { .drawer, iframe { background: #0E1418; } }
  </style>
  <button class="tab" title="Monitor de SLA — cards que precisam de atenção"><img alt=""><span class="n hide"></span><span class="lbl">SLA</span></button>
  <div class="drawer" role="dialog" aria-label="Monitor de SLA">
    <div class="bar"><span>Monitor de SLA</span><span class="sp"></span>
      <button data-a="sync" title="Buscar alterações agora">Atualizar</button>
      <button data-a="tab" title="Abrir o painel numa aba própria">Abrir em aba ↗</button>
      <button data-a="close" title="Fechar">✕</button></div>
  </div>`;
  root.querySelector('.tab img').src = chrome.runtime.getURL('icons/icon32.png');
  const tab = root.querySelector('.tab');
  const drawer = root.querySelector('.drawer');
  const countEl = root.querySelector('.n');
  let frame = null;

  function openDrawer() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.src = chrome.runtime.getURL('ui/dashboard.html') + '?embed=1';
      drawer.appendChild(frame);
    }
    drawer.classList.add('open');
  }
  tab.addEventListener('click', () => (drawer.classList.contains('open') ? drawer.classList.remove('open') : openDrawer()));
  root.querySelector('.bar').addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'close') drawer.classList.remove('open');
    if (a === 'tab') chrome.runtime.sendMessage({ type: 'openDashboard' });
    if (a === 'sync') chrome.runtime.sendMessage({ type: 'syncNow', full: false });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') drawer.classList.remove('open'); });
  (document.body || document.documentElement).appendChild(host);

  function paint(info) {
    if (!info) { countEl.className = 'n hide'; return; }
    countEl.textContent = info.text;
    countEl.className = `n ${info.cls || ''}`;
    tab.title = info.title || 'Monitor de SLA';
  }
  chrome.storage.local.get('inpage').then(r => paint(r.inpage));
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.inpage) paint(ch.inpage.newValue); });

  // Avisa a extensão que o Bitrix foi aberto (dispara a análise, se configurada).
  getSessid().then(s => chrome.runtime.sendMessage({ type: 'bitrixOpened', url: location.href, loggedIn: !!s }).catch(() => {}));
  // Navegação interna do Bitrix (sem recarregar): guarda o último endereço de card para sugestão.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; chrome.runtime.sendMessage({ type: 'bitrixUrl', url: lastUrl }).catch(() => {}); }
  }, 1500);
})();
