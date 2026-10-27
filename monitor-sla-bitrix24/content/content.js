// Script da extensão nas páginas do Bitrix24 (mundo isolado).
// 1) Faz as consultas de LEITURA com o login de quem está no portal (mesma origem, cookies + sessid).
// 2) Mostra a aba "SLA" e a gaveta com a análise dentro do próprio Bitrix.
// Não altera cards, etapas, atividades ou prazos.
//
// Ciclo de vida: depois de uma atualização da extensão, o service worker injeta este script de novo nas abas
// abertas. A instância nova remove a interface da antiga; a antiga percebe que foi substituída (ou que perdeu a
// ligação com a extensão) e se desliga sozinha, sem deixar ouvintes, temporizadores ou abas duplicadas.
(() => {
  if (window.top !== window) return;
  const TOKEN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const current = () => window.__slaMonitorToken === TOKEN && alive();
  document.getElementById('sla-monitor-root')?.remove(); // interface de uma instância anterior (versão antiga)
  window.__slaMonitorToken = TOKEN;
  window.__slaMonitorLoaded = true;

  const cleanups = [];
  const on = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); cleanups.push(() => target.removeEventListener(ev, fn, opts)); };
  let host = null;
  function teardown() {
    while (cleanups.length) { try { cleanups.pop()(); } catch { /* */ } }
    if (host && host.isConnected && window.__slaMonitorToken !== TOKEN) host.remove();
    if (host && host.isConnected && !alive()) host.remove();
  }
  /** Envolve um ouvinte: se a instância já não vale, desliga em vez de agir. */
  const guard = fn => (...args) => { if (!current()) { teardown(); return undefined; } return fn(...args); };
  const sendBg = msg => { if (!current()) { teardown(); return Promise.resolve(null); } return chrome.runtime.sendMessage(msg).catch(() => null); };

  const READ_ONLY = new Set(['crm.type.list', 'crm.category.list', 'crm.status.list', 'crm.item.fields', 'crm.item.list',
    'crm.stagehistory.list', 'crm.activity.list', 'crm.automatedsolution.list', 'crm.timeline.comment.list', 'crm.settings.mode.get',
    'user.get', 'user.current', 'department.get', 'profile', 'scope', 'batch']);

  /** Defesa extra: um "batch" só passa se todos os comandos dentro dele também forem de leitura. */
  function allowed(method, params) {
    if (!READ_ONLY.has(method)) return false;
    if (method !== 'batch') return true;
    const cmds = Object.values(params?.cmd || {});
    return cmds.length > 0 && cmds.every(c => {
      const m = String(c).split('?')[0].trim();
      return m !== 'batch' && READ_ONLY.has(m);
    });
  }

  // ---------- sessid (token de sessão) e usuário logado ----------
  let sess = null;
  function getSessid(force = false) {
    if (sess && !force && Date.now() - sess.at < 5 * 60000) return Promise.resolve(sess.value);
    return new Promise(resolve => {
      const nonce = Math.random().toString(36).slice(2);
      const onMsg = ev => {
        if (ev.source !== window || !ev.data || ev.data.type !== '__slaMonitor_sessid' || ev.data.nonce !== nonce) return;
        window.removeEventListener('message', onMsg);
        clearTimeout(t);
        sess = ev.data.sessid ? { value: ev.data.sessid, at: Date.now(), userId: ev.data.userId != null ? String(ev.data.userId) : null } : null;
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
    if (!allowed(method, params)) return { status: 403, text: JSON.stringify({ error: 'METHOD_NOT_ALLOWED', error_description: 'Somente leitura' }) };
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

  // ---------- aba lateral + gaveta ----------
  host = document.createElement('div');
  host.id = 'sla-monitor-root';
  host.dataset.instance = TOKEN;
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000; top: 0; right: 0; width: 0; height: 0;';
  const root = host.attachShadow({ mode: 'open' });
  const ICON = {
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  root.innerHTML = `<style>
    :host { all: initial; }
    .tab { position: fixed; right: 0; top: 42%; transform: translateY(-50%); background: #0B4F5E; color: #fff; border: 0; cursor: pointer;
      border-radius: 12px 0 0 12px; padding: 10px 7px 12px; font: 600 12px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 6px 18px rgba(8, 32, 40, .28); display: flex; flex-direction: column; align-items: center; gap: 7px; transition: padding .15s ease, background .15s ease; }
    .tab:hover { background: #0E6274; padding-right: 10px; }
    .tab:focus-visible { outline: 3px solid #7DD3E5; outline-offset: 2px; }
    .tab img { width: 20px; height: 20px; }
    .tab .lbl { writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: .06em; }
    .tab .n { background: #D92D20; border-radius: 999px; min-width: 20px; padding: 2px 5px; text-align: center; font-size: 11px; font-variant-numeric: tabular-nums; }
    .tab .n.ok { background: #12805C; } .tab .n.warn { background: #DC6803; } .tab .n.off { background: #667085; }
    .tab .n.hide { display: none; }
    .drawer { position: fixed; top: 0; right: 0; height: 100vh; width: min(1080px, 100vw); background: var(--bg); box-shadow: -12px 0 40px rgba(8, 20, 28, .28);
      transform: translateX(105%); transition: transform .22s cubic-bezier(.2,.8,.2,1); display: flex; flex-direction: column; visibility: hidden;
      --bg: #F5F7F9; --bar: #0B4F5E; }
    .drawer.dark { --bg: #0D1417; --bar: #0B3B46; }
    .drawer.open { transform: none; visibility: visible; }
    @media (prefers-reduced-motion: reduce) { .drawer, .tab { transition: none; } }
    .bar { display: flex; align-items: center; gap: 6px; padding: 7px 10px 7px 14px; background: var(--bar); color: #fff; font: 600 13px system-ui, sans-serif; }
    .bar .sp { flex: 1; }
    .bar button { background: rgba(255,255,255,.12); color: #fff; border: 0; border-radius: 8px; padding: 5px 9px; cursor: pointer; font: 500 12px system-ui, sans-serif;
      display: inline-flex; align-items: center; gap: 6px; }
    .bar button:hover { background: rgba(255,255,255,.24); }
    .bar button:focus-visible { outline: 2px solid #7DD3E5; outline-offset: 1px; }
    .bar button[aria-busy="true"] svg { animation: spin 1s linear infinite; }
    .bar svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    @keyframes spin { to { transform: rotate(360deg); } }
    iframe { border: 0; flex: 1; width: 100%; background: var(--bg); }
  </style>
  <button class="tab" title="Monitor de SLA — cards que precisam de atenção (Alt+Shift+S)" aria-haspopup="dialog" aria-expanded="false"><img alt=""><span class="n hide"></span><span class="lbl">SLA</span></button>
  <div class="drawer" role="dialog" aria-label="Monitor de SLA" aria-modal="false">
    <div class="bar"><span>Monitor de SLA</span><span class="sp"></span>
      <button data-a="sync" title="Buscar alterações no Bitrix24 agora">${ICON.refresh}<span>Atualizar</span></button>
      <button data-a="tab" title="Abrir o painel numa aba própria">${ICON.external}<span>Abrir em aba</span></button>
      <button data-a="close" title="Fechar (Esc)" aria-label="Fechar">${ICON.close}</button></div>
  </div>`;
  root.querySelector('.tab img').src = chrome.runtime.getURL('icons/icon32.png');
  const tab = root.querySelector('.tab');
  const drawer = root.querySelector('.drawer');
  const countEl = root.querySelector('.n');
  let frame = null;

  function applyTheme(t) {
    const dark = t === 'escuro' || (t !== 'claro' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    drawer.classList.toggle('dark', !!dark);
  }
  function openDrawer() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'Monitor de SLA';
      frame.src = chrome.runtime.getURL('ui/dashboard.html') + '?embed=1';
      drawer.appendChild(frame);
    }
    chrome.storage.local.get('uiTheme').then(r => applyTheme(r.uiTheme)).catch(() => {});
    drawer.classList.add('open');
    tab.setAttribute('aria-expanded', 'true');
    tellFrame(true);
  }
  function closeDrawer() { drawer.classList.remove('open'); tab.setAttribute('aria-expanded', 'false'); tellFrame(false); }
  /** Avisa o painel da gaveta se ele está à vista: fechado, ele adia as atualizações (sem gastar CPU na página). */
  function tellFrame(open) {
    try { frame?.contentWindow?.postMessage({ type: 'slaDrawer', open }, new URL(chrome.runtime.getURL('')).origin); } catch { /* quadro ainda carregando */ }
  }
  const toggleDrawer = () => (drawer.classList.contains('open') ? closeDrawer() : openDrawer());
  on(tab, 'click', guard(toggleDrawer));
  on(root.querySelector('.bar'), 'click', guard(e => {
    const b = e.target.closest('button');
    const a = b?.dataset.a;
    if (a === 'close') closeDrawer();
    if (a === 'tab') sendBg({ type: 'openDashboard' });
    if (a === 'sync') {
      b.setAttribute('aria-busy', 'true');
      sendBg({ type: 'syncNow', full: false }).finally(() => b.removeAttribute('aria-busy'));
    }
  }));
  on(document, 'keydown', guard(e => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); }));
  (document.body || document.documentElement).appendChild(host);

  function paint(info) {
    if (!info) { countEl.className = 'n hide'; return; }
    countEl.textContent = info.text;
    countEl.className = `n ${info.cls || ''}`;
    tab.title = `${info.title || 'Monitor de SLA'} (Alt+Shift+S)`;
  }
  chrome.storage.local.get('inpage').then(r => paint(r.inpage)).catch(() => {});

  // Mensagens da extensão (o contador chega por aqui, não pelo armazenamento).
  const onRuntimeMsg = (msg, sender, reply) => {
    if (!current()) { teardown(); return false; }
    if (sender.id !== chrome.runtime.id || !msg) return false;
    if (msg.type === 'slaRest') { restCall(msg.method, msg.params).then(reply); return true; }
    if (msg.type === 'slaPing') { getSessid().then(s => reply({ ok: true, loggedIn: !!s, userId: s ? sess?.userId || null : null, origin: location.origin, url: location.href, instance: TOKEN })); return true; }
    if (msg.type === 'slaInpage') { paint(msg.info); return false; }
    if (msg.type === 'slaToggleDrawer') { toggleDrawer(); reply({ ok: true, open: drawer.classList.contains('open') }); return false; }
    if (msg.type === 'slaTheme') { applyTheme(msg.theme); return false; }
    return false;
  };
  chrome.runtime.onMessage.addListener(onRuntimeMsg);
  cleanups.push(() => { try { chrome.runtime.onMessage.removeListener(onRuntimeMsg); } catch { /* contexto já invalidado */ } });

  // Avisa a extensão que o Bitrix foi aberto (dispara a análise, se configurada).
  getSessid().then(s => sendBg({ type: 'bitrixOpened', url: location.href, loggedIn: !!s, userId: sess?.userId || null }));

  // Navegação interna do Bitrix (sem recarregar): guarda o último endereço de card para sugestão.
  // Usa a Navigation API (evento a cada troca de endereço); sem ela, verifica a cada 3 s com a aba visível.
  let lastUrl = location.href;
  const onUrl = guard(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    sendBg({ type: 'bitrixUrl', url: lastUrl });
  });
  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    on(window.navigation, 'currententrychange', onUrl);
  } else {
    on(window, 'popstate', onUrl);
    const iv = setInterval(() => { if (document.visibilityState === 'visible') onUrl(); }, 3000);
    cleanups.push(() => clearInterval(iv));
  }
})();
