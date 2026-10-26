// Entrada da prévia: shim do Chrome → service worker → painel, e carrega a demonstração.
import './chrome-shim.js';
import '../../background.js';
window.__previewBoot = async () => {
  await new Promise(r => chrome.runtime.sendMessage({ type: 'loadDemo' }, r));
};
await window.__previewBoot();
await import('../../ui/dashboard.js');
