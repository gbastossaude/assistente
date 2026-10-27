// Identifica o processo (entityTypeId) dos cards de uma página de espaço digital do Bitrix24
// (ex.: /page/besmart/besmart_saude/). Roda na página e nos quadros internos (kanban, lista, card aberto).
// Lê apenas endereços de links e identificadores técnicos (números de tipo) — nunca o conteúdo dos cards.
(() => {
  // Reinjetado após atualizar a extensão: a instância nova assume e a antiga para de observar a página.
  const TOKEN = Math.random().toString(36).slice(2);
  window.__slaDetectToken = TOKEN;
  const alive = () => { try { return !!chrome.runtime?.id && window.__slaDetectToken === TOKEN; } catch { return false; } };

  let topPath = location.pathname;
  try { topPath = window.top.location.pathname; } catch { /* quadro de outra origem */ }
  const pageMatch = topPath.match(/^(\/page\/[^/]+\/[^/]+\/)/) || location.pathname.match(/^(\/page\/[^/]+\/[^/]+\/)/);
  if (!pageMatch) return;
  const pagePath = pageMatch[1];
  const IGNORE = new Set([7, 31]); // orçamentos e faturas inteligentes não são oportunidades
  const LINK_RE = /^(.*\/)type\/(\d+)\/details\/\d+/;

  function scan() {
    const score = {}, prefix = {}, links = {}, sources = {};
    const add = (id, pts, src, pre) => {
      id = Number(id);
      if (!id || id < 3 || IGNORE.has(id)) return;
      score[id] = (score[id] || 0) + pts;
      (sources[id] = sources[id] || new Set()).add(src);
      if (pre && (!prefix[id] || (!prefix[id].startsWith(pagePath) && pre.startsWith(pagePath)))) prefix[id] = pre;
    };
    for (const a of document.querySelectorAll('a[href*="/details/"]')) {
      let p; try { p = new URL(a.getAttribute('href'), location.origin).pathname; } catch { continue; }
      const m = p.match(LINK_RE);
      if (!m) continue;
      links[m[2]] = (links[m[2]] || 0) + 1;
      add(m[2], m[1].startsWith(pagePath) ? 100 : 5, 'links', m[1]);
    }
    const here = location.pathname.match(LINK_RE);
    if (here) add(here[2], 500, 'card aberto', here[1]);
    const list = location.pathname.match(/\/type\/(\d+)\/(?:kanban|list)\b/);
    if (list) add(list[1], 300, 'lista do processo');
    for (const el of document.querySelectorAll('[data-entity-type-id]')) add(el.getAttribute('data-entity-type-id'), 2, 'atributo da página');
    if (!Object.keys(score).length) {
      // Último recurso: identificador técnico do processo nas configurações da página (ex.: "entityTypeId":1056).
      for (const sc of document.querySelectorAll('script:not([src])')) {
        for (const m of (sc.textContent || '').matchAll(/entityTypeId["']?\s*[:=]\s*["']?(\d{3,5})\b/gi)) add(m[1], 1, 'configuração da página');
      }
    }
    return Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => ({
      entityTypeId: Number(id),
      linkPath: `${prefix[id] || pagePath}type/${id}/details/{id}/`,
      links: links[id] || 0,
      source: [...sources[id]].join(', ')
    }));
  }

  let reported = '';
  const report = () => {
    if (!alive()) { stop(); return; }
    const types = scan();
    const key = JSON.stringify(types.map(t => [t.entityTypeId, t.linkPath]));
    if (!types.length || key === reported) return;
    reported = key;
    chrome.runtime.sendMessage({ type: 'bitrixPageTypes', origin: location.origin, pagePath, types }).catch(() => {});
  };
  // O kanban/lista carrega depois da página e muda com filtros: verifica por um tempo e quando a lista muda.
  let tries = 0;
  const iv = setInterval(() => { report(); if (++tries >= 20) clearInterval(iv); }, 1000);
  let t = null;
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(report, 800); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  const stopTimer = setTimeout(() => mo.disconnect(), 3 * 60000);
  function stop() { clearInterval(iv); clearTimeout(t); clearTimeout(stopTimer); mo.disconnect(); }
  report();
})();
