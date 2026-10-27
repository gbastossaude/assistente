// Roda no contexto da página do Bitrix24 (world: MAIN). Só entrega o token de sessão (sessid)
// ao script da extensão, para as consultas de leitura feitas com o login de quem está no portal.
// Não lê dados do CRM, não altera nada e não envia nada para fora da página.
(() => {
  // Reinjetado após atualizar a extensão: a ponte anterior continua funcionando (não depende da extensão).
  if (window.__slaMonitorBridge) return;
  window.__slaMonitorBridge = true;
  window.addEventListener('message', ev => {
    if (ev.source !== window || !ev.data || ev.data.type !== '__slaMonitor_getSessid') return;
    let sessid = null;
    try { sessid = window.BX && typeof window.BX.bitrix_sessid === 'function' ? window.BX.bitrix_sessid() : null; } catch { sessid = null; }
    let userId = null;
    try { userId = window.BX && window.BX.message ? window.BX.message('USER_ID') || null : null; } catch { userId = null; }
    window.postMessage({ type: '__slaMonitor_sessid', nonce: ev.data.nonce, sessid, userId }, window.location.origin);
  });
})();
