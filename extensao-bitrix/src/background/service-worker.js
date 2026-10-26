/*
 * Service worker: somente
 *  1) reinjeta o content script nas abas já abertas do portal após instalação/atualização
 *     (o Chrome não faz isso sozinho e o script antigo fica sem contexto);
 *  2) clique no ícone da extensão: abre/minimiza o painel na aba do portal.
 * Não faz requisições de rede.
 */
'use strict';

const PORTAL = 'https://crm.hub-bnk.com/';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;
  const files = (chrome.runtime.getManifest().content_scripts || [])[0]?.js || [];
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: PORTAL + '*' });
  } catch (e) {
    return;
  }
  for (const tab of tabs) {
    if (!tab.id || tab.discarded) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
    } catch (e) {
      // Aba ainda carregando, página de erro ou sem permissão: o manifesto injeta no próximo carregamento.
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id && typeof tab.url === 'string' && tab.url.startsWith(PORTAL)) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'bnka:toggle' });
      return;
    } catch (e) {
      // Script ainda não carregado nesta aba: tenta injetar.
      try {
        const files = chrome.runtime.getManifest().content_scripts[0].js;
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
      } catch (e2) { /* sem acesso */ }
      return;
    }
  }
  await chrome.tabs.create({ url: PORTAL + 'crm/' });
});
