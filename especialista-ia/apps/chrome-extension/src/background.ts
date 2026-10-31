// Service worker da extensão: apenas faz o clique no ícone abrir o painel lateral.
// Não há content scripts: a extensão NÃO lê, coleta nem envia nada pelo WhatsApp Web.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
