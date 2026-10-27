// Cenário "atualizei a extensão com o Bitrix aberto", para comparar versões (portal SIMULADO, dados fictícios).
// Uso: node tools/check-update.mjs <pasta-da-extensão> <rótulo>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(new URL(import.meta.url).pathname);
const srcExt = path.resolve(process.argv[2]);
const label = process.argv[3] || 'versão';
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-upd-'));
for (const f of ['manifest.json', 'background.js', 'src', 'ui', 'icons', 'content']) fs.cpSync(path.join(srcExt, f), path.join(ext, f), { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
man.host_permissions = ['http://127.0.0.1/*'];
for (const cs of man.content_scripts) cs.matches = ['http://127.0.0.1/*'];
man.web_accessible_resources[0].matches = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man, null, 2));
const PORT = 8794, P = `http://127.0.0.1:${PORT}`;
const server = await new Promise(r => { const p = spawn(process.execPath, [path.join(here, 'mock-server.mjs'), String(PORT)], { stdio: 'pipe' }); p.stdout.once('data', () => r(p)); });
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'prof-upd-')), {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 950 },
  args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
const res = { versao: label };
try {
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const bx = await ctx.newPage();
  await bx.goto(`${P}/login`);
  await bx.locator('#sla-monitor-root').waitFor({ state: 'attached', timeout: 10000 });
  await bx.locator('#sla-monitor-root .tab').click();
  const fr = await (await bx.waitForSelector('#sla-monitor-root iframe')).contentFrame();
  await fr.click('text=Analisar com meu login do Bitrix', { timeout: 15000 });
  await fr.waitForSelector('text=O que representa um "card"', { timeout: 20000 });
  await fr.click('button:has-text("Remover foco")');
  await fr.locator('input[data-act="toggle-cat"][data-etid="2"][data-cid="0"]').check();
  await fr.click('#savebar button:has-text("Salvar configurações")');
  await fr.waitForTimeout(800);
  await fr.click('#tabs button[data-tab="painel"]');
  await fr.waitForSelector('.qrow', { timeout: 40000 });
  await bx.locator('#sla-monitor-root .bar button[data-a="close"]').click(); // fecha a gaveta
  // atualização (equivale ao botão "Atualizar" em chrome://extensions), sem recarregar o Bitrix
  const cdp = await ctx.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: ext });
  await bx.waitForTimeout(4000);
  sw = ctx.serviceWorkers().find(w => w.url().includes(id));
  res.abasSlaNaPagina = await bx.evaluate(() => document.querySelectorAll('#sla-monitor-root').length);
  // a aba "SLA" ainda abre o painel?
  await bx.locator('#sla-monitor-root .tab').first().click();
  await bx.waitForTimeout(2500);
  res.gavetaAbreComPainel = await bx.evaluate(async () => {
    const f = document.getElementById('sla-monitor-root')?.shadowRoot?.querySelector('.drawer.open iframe');
    return !!f;
  }) && await (async () => { try { const f = await (await bx.$('#sla-monitor-root iframe')).contentFrame(); await f.waitForSelector('#tabs', { timeout: 5000 }); return true; } catch { return false; } })();
  // a consulta pelo login ainda encontra a aba?
  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${id}/ui/dashboard.html`);
  await dash.waitForSelector('#btnSync', { timeout: 10000 });
  const r = await dash.evaluate(() => new Promise(ok => chrome.runtime.sendMessage({ type: 'syncNow', full: false }, ok)));
  res.sincronizacaoPeloLogin = r?.status || r?.error || 'sem resposta';
} catch (e) {
  res.erro = e.message.split('\n')[0];
} finally {
  await ctx.close(); server.kill();
}
console.log(JSON.stringify(res));
