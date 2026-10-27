// Mede o desempenho no navegador (Chromium + extensão carregada) com um volume grande de cards FICTÍCIOS.
// Serve para comparar versões: node tools/bench-ui.mjs <pasta-da-extensão> <rótulo> [cards=1500] [saída.json]
// Mede: tamanho e tempo do estado entregue ao painel, abertura do painel, troca para a aba Etapas e o custo,
// no painel e numa aba do Bitrix aberta, de um recálculo (o mesmo que acontece ao fim de toda sincronização).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { buildLargeDataset } from './large-dataset.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const srcExt = path.resolve(process.argv[2] || path.join(here, '..'));
const label = process.argv[3] || 'atual';
const N = Number(process.argv[4]) || 1500;
const outFile = process.argv[5] || null;
const PORT = 8795 + Math.floor(Math.random() * 100);
const P = `http://127.0.0.1:${PORT}`;

// cópia de teste: o portal real é trocado pelo servidor simulado local
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-bench-'));
for (const f of ['manifest.json', 'background.js', 'src', 'ui', 'icons', 'content']) fs.cpSync(path.join(srcExt, f), path.join(ext, f), { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
man.host_permissions = ['http://127.0.0.1/*'];
for (const cs of man.content_scripts) cs.matches = ['http://127.0.0.1/*'];
man.web_accessible_resources[0].matches = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man, null, 2));

const server = await new Promise(r => {
  const p = spawn(process.execPath, [path.join(here, 'mock-server.mjs'), String(PORT)], { stdio: 'pipe' });
  p.stdout.once('data', () => r(p));
});
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'prof-bench-')), {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 950 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--enable-precise-memory-info']
});
const median = a => { const s = a.slice().sort((x, y) => x - y); return Math.round(s[Math.floor(s.length / 2)] * 10) / 10; };
const res = { versao: label, cards: N };
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  const { ds, config } = buildLargeDataset(N, Date.now());
  config.portalOrigin = P; config.portalAddress = P; config.authMode = 'login';
  await sw.evaluate(async ({ ds, config }) => {
    // alarme já no período configurado: evita a sincronização automática durante a medição
    await chrome.alarms.create('sync', { periodInMinutes: Number(config.sync.intervalMinutes) || 15, delayInMinutes: 120 });
    await chrome.storage.local.set({ mode: 'real', config_real: config, ds_real: ds });
  }, { ds, config });
  res.datasetKB = Math.round(JSON.stringify(ds).length / 1024);

  // recálculo inicial (gera a análise guardada)
  const helper = await ctx.newPage();
  await helper.goto(`chrome-extension://${id}/ui/popup.html`);
  const recompute = () => helper.evaluate(cfg => new Promise(r => chrome.runtime.sendMessage({ type: 'saveConfig', config: cfg }, r)), config);
  await recompute();
  res.analiseKB = await sw.evaluate(async () => Math.round(JSON.stringify((await chrome.storage.local.get('an_real')).an_real).length / 1024));

  // 1) estado entregue ao painel
  const sizes = [], times = [];
  for (let i = 0; i < 5; i++) {
    const r = await helper.evaluate(async () => {
      const t0 = performance.now();
      const s = await new Promise(ok => chrome.runtime.sendMessage({ type: 'getState' }, ok));
      return { ms: performance.now() - t0, kb: JSON.stringify(s).length / 1024 };
    });
    times.push(r.ms); sizes.push(r.kb);
  }
  res.getStateMs = median(times);
  res.getStateKB = Math.round(median(sizes));
  // o que o painel lê para se atualizar: na 1.8, estado leve + análise direto do armazenamento; antes, o estado completo
  const pt = [], pk = [];
  for (let i = 0; i < 5; i++) {
    const r = await helper.evaluate(async () => {
      const t0 = performance.now();
      const s = await new Promise(ok => chrome.runtime.sendMessage({ type: 'getState', lite: true }, ok));
      let kb = JSON.stringify(s).length / 1024;
      if (!('analysis' in s)) { const a = await chrome.storage.local.get(s.mode === 'demo' ? 'an_demo' : 'an_real'); kb += JSON.stringify(a).length / 1024; }
      return { ms: performance.now() - t0, kb };
    });
    pt.push(r.ms); pk.push(r.kb);
  }
  res.leituraPainelMs = median(pt);
  res.leituraPainelKB = Math.round(median(pk));

  // 2) abertura do painel até a fila aparecer
  const opens = [];
  for (let i = 0; i < 3; i++) {
    const pg = await ctx.newPage();
    const t0 = Date.now();
    await pg.goto(`chrome-extension://${id}/ui/dashboard.html`);
    await pg.waitForSelector('.qrow', { timeout: 60000 });
    opens.push(Date.now() - t0);
    await pg.close();
  }
  res.aberturaPainelMs = median(opens);

  // 3) troca para a aba Etapas (montagem + layout, síncrono no clique)
  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${id}/ui/dashboard.html`);
  await dash.waitForSelector('.qrow', { timeout: 60000 });
  const et = [];
  for (let i = 0; i < 3; i++) {
    et.push(await dash.evaluate(() => {
      document.querySelector('#tabs [data-tab="painel"]').click();
      const t0 = performance.now();
      document.querySelector('#tabs [data-tab="etapas"]').click();
      void document.body.offsetHeight;
      return performance.now() - t0;
    }));
  }
  res.abaEtapasMs = median(et);
  res.etapasLinhas = await dash.evaluate(() => document.querySelectorAll('details.stage tbody tr').length);
  await dash.evaluate(() => document.querySelector('#tabs [data-tab="painel"]').click());
  const heap = async pg => { const c = await pg.context().newCDPSession(pg); await c.send('HeapProfiler.collectGarbage'); await c.detach(); return pg.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10); };
  res.painelHeapMB = await heap(dash);

  // 4) custo de um recálculo para quem está com o painel aberto e para a aba do Bitrix
  const bx = await ctx.newPage();
  await bx.goto(`${P}/login`);
  await bx.locator('#sla-monitor-root').waitFor({ state: 'attached', timeout: 15000 });
  // amostrador de bloqueio da thread principal: soma os atrasos acima de 50 ms de um temporizador de 10 ms
  const probe = () => {
    window.__lt = { n: 0, ms: 0 };
    let last = performance.now();
    const tick = () => { const t = performance.now(), gap = t - last; if (gap > 50) { window.__lt.n++; window.__lt.ms += gap - 10; } last = t; setTimeout(tick, 10); };
    setTimeout(tick, 10);
  };
  await dash.evaluate(probe);
  await bx.evaluate(probe);
  await dash.waitForTimeout(1500);
  await dash.evaluate(() => { window.__lt = { n: 0, ms: 0 }; });
  await bx.evaluate(() => { window.__lt = { n: 0, ms: 0 }; });
  const rec = [];
  for (let i = 0; i < 3; i++) { const t0 = Date.now(); await recompute(); rec.push(Date.now() - t0); await dash.waitForTimeout(4500); }
  res.recalculoMs = median(rec);
  const d = await dash.evaluate(() => window.__lt), b = await bx.evaluate(() => window.__lt);
  res.painelBloqueadoMsPorRecalculo = Math.round(d.ms / 3);
  res.bitrixBloqueadoMsPorRecalculo = Math.round(b.ms / 3);
  res.bitrixHeapMB = await heap(bx);
} finally {
  await ctx.close();
  server.kill();
}
console.log(JSON.stringify(res));
if (outFile) fs.writeFileSync(outFile, JSON.stringify(res, null, 2));
