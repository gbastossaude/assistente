// Testes de estabilidade e das novidades da 1.8, no Chromium com a extensão carregada e um portal Bitrix24
// SIMULADO (dados fictícios): atualização da extensão sem recarregar a página, várias abas, queda do portal,
// serviço indisponível (503), sem internet, reinício do navegador, navegação interna, progresso preso,
// painel fora de vista, atalhos, busca global, tema, "Meus cards", diagnóstico e etapas com muitos cards.
// Uso: node tools/e2e-v18.mjs <pasta-de-saída>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { buildLargeDataset } from './large-dataset.mjs';

const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || './e2e-out');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ' — ' + detail : ''}`); };
const t0 = Date.now();

// cópia de teste: o portal real é trocado pelo servidor simulado local
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-v18-'));
for (const f of ['manifest.json', 'background.js', 'src', 'ui', 'icons', 'content']) fs.cpSync(path.join(src, f), path.join(ext, f), { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
man.host_permissions = ['http://127.0.0.1/*'];
for (const cs of man.content_scripts) cs.matches = ['http://127.0.0.1/*'];
man.web_accessible_resources[0].matches = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man, null, 2));

const PORT = 8793;
const P = `http://127.0.0.1:${PORT}`;
const startServer = () => new Promise(r => {
  const p = spawn(process.execPath, [path.join(src, 'tools/mock-server.mjs'), String(PORT)], { stdio: 'pipe' });
  p.stdout.once('data', () => r(p));
});
let server = await startServer();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'prof-v18-'));
const launch = () => chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 950 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
let ctx = await launch();
const errors = [];
const watch = pg => pg.on('pageerror', e => errors.push(`[${pg.url().slice(0, 40)}] ${e.message}`));
const swOf = async c => c.serviceWorkers()[0] || c.waitForEvent('serviceworker', { timeout: 15000 });
let sw = await swOf(ctx);
const EXT_ID = sw.url().split('/')[2];
const DASH = `chrome-extension://${EXT_ID}/ui/dashboard.html`;
const roots = pg => pg.evaluate(() => document.querySelectorAll('#sla-monitor-root').length);
const instance = pg => pg.evaluate(() => document.getElementById('sla-monitor-root')?.dataset.instance || null);
const dsSync = () => sw.evaluate(async () => (await chrome.storage.local.get('ds_real')).ds_real?.sync || null);
const waitFor = async (fn, ms = 20000, step = 250) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await new Promise(r => setTimeout(r, step)); } };
async function openDrawer(pg) {
  await pg.locator('#sla-monitor-root .tab').click();
  const el = await pg.waitForSelector('#sla-monitor-root iframe', { timeout: 10000 });
  return el.contentFrame();
}

try {
  // ------------------------------------------------------------ preparação: conectar pelo login e escolher um funil
  const bx = await ctx.newPage(); watch(bx);
  await bx.goto(`${P}/login`);
  await bx.waitForSelector('text=Bitrix24 simulado');
  await bx.locator('#sla-monitor-root').waitFor({ state: 'attached', timeout: 10000 });
  let fr = await openDrawer(bx);
  await fr.waitForSelector('text=Analisar com meu login do Bitrix', { timeout: 15000 });
  await fr.click('text=Analisar com meu login do Bitrix');
  await fr.waitForSelector('text=O que representa um "card"', { timeout: 20000 });
  await fr.click('button:has-text("Remover foco")');
  await fr.waitForSelector('input[data-act="toggle-cat"]', { timeout: 10000 });
  await fr.locator('input[data-act="toggle-cat"][data-etid="2"][data-cid="0"]').check();
  await fr.click('.cfgnav button:has-text("Regras de SLA")');
  await fr.locator('tr:has-text("Em cotação") button:has-text("Definir SLA da etapa")').click();
  await fr.locator('tr:has-text("Em cotação") input[data-bind$=".duration.value"]').fill('1');
  await fr.click('#savebar button:has-text("Salvar configurações")');
  await fr.waitForTimeout(800);
  await fr.click('#tabs button[data-tab="painel"]');
  await fr.waitForSelector('.qrow', { timeout: 40000 });
  check('Preparação: análise pelo login do Bitrix simulado', /Cards monitorados\s*13/.test(await fr.locator('.kpis').innerText()));

  // ------------------------------------------------------------ 1) "Meus cards" (usuário logado no Bitrix)
  const me = await waitFor(() => sw.evaluate(async () => (await chrome.storage.local.get('me_real')).me_real));
  check('Usuário logado identificado só pelo número (Meus cards)', me?.id === '11' && Object.keys(me).sort().join() === 'id,origin', JSON.stringify(me));
  await fr.evaluate(() => location.reload());
  await fr.waitForSelector('.qrow', { timeout: 20000 });
  const total = await fr.locator('.qrow').count();
  const chipMe = fr.locator('button.qchip[data-k="me"]');
  check('Atalho "Meus cards" aparece na fila', await chipMe.count() === 1);
  await chipMe.click();
  await fr.waitForTimeout(200);
  const mine = await fr.locator('.qrow').count();
  const mineOk = await fr.evaluate(async () => {
    const an = (await chrome.storage.local.get('an_real')).an_real;
    const byKey = Object.fromEntries(an.cards.map(c => [c.key, c]));
    return [...document.querySelectorAll('.qrow')].every(r => { const c = byKey[r.dataset.key]; return c && (String(c.responsibleId) === '11' || (c.commercialIds || []).includes('11')); });
  });
  check('"Meus cards" filtra a fila', mine > 0 && mine < total && mineOk, `${mine} de ${total}`);
  await chipMe.click();
  await bx.screenshot({ path: path.join(out, 'V1-gaveta-meus-cards.png') });

  // ------------------------------------------------------------ 2) navegação interna do Bitrix (sem recarregar)
  await bx.evaluate(() => history.pushState({}, '', '/crm/deal/details/503/'));
  const navUrl = await waitFor(() => sw.evaluate(async () => (await chrome.storage.session.get('lastBitrixUrl')).lastBitrixUrl).then(u => (u && u.includes('/details/503/') ? u : null)), 5000);
  check('Navegação interna percebida por evento (Navigation API, sem consulta periódica)', !!navUrl, navUrl || 'não recebido');
  await bx.evaluate(() => history.back());

  // ------------------------------------------------------------ 3) leitura protegida: batch com escrita é recusado
  const tabId = await sw.evaluate(async origin => (await chrome.tabs.query({ url: `${origin}/*` }))[0]?.id, P);
  const denied = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'slaRest', method: 'batch', params: { halt: 0, cmd: { a: 'crm.item.list?entityTypeId=2', b: 'crm.item.update?entityTypeId=2&id=501&fields[title]=x' } } }), tabId);
  const allowed = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'slaRest', method: 'batch', params: { halt: 0, cmd: { a: 'crm.item.list?entityTypeId=2' } } }), tabId);
  check('Lote (batch) com um comando de escrita é bloqueado no script da página', denied?.status === 403 && /METHOD_NOT_ALLOWED/.test(denied.text) && allowed?.status === 200,
    `escrita: ${denied?.status}, leitura: ${allowed?.status}`);

  // atalho de teclado do Chrome (Alt+Shift+S): o service worker pede à aba ativa para abrir/fechar a gaveta
  const tg1 = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'slaToggleDrawer' }), tabId);
  const tg2 = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'slaToggleDrawer' }), tabId);
  check('Comando de teclado abre e fecha a gaveta dentro do Bitrix', tg1?.ok && tg2?.ok && tg1.open !== tg2.open, `${tg1?.open} → ${tg2?.open}`);

  // ------------------------------------------------------------ 4) atualização da extensão com o Bitrix aberto
  const inst0 = await instance(bx);
  const cdp = await ctx.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: ext }); // equivale a "Atualizar" em chrome://extensions
  const inst1 = await waitFor(async () => { const i = await instance(bx).catch(() => null); return i && i !== inst0 ? i : null; }, 15000);
  check('Após atualizar a extensão, a aba do Bitrix é religada sem recarregar a página', !!inst1 && await roots(bx) === 1, `instância ${inst0?.slice(0, 6)} → ${inst1?.slice(0, 6)}, ${await roots(bx)} aba(s) SLA`);
  sw = await waitFor(async () => ctx.serviceWorkers().find(w => w.url().includes(EXT_ID)), 10000);
  const reinj = await waitFor(() => sw.evaluate(async () => (await chrome.storage.session.get('reinjected')).reinjected), 10000);
  check('Service worker registra quantas abas foram religadas', reinj?.tabs >= 1 && reinj.reason === 'update', JSON.stringify(reinj));
  fr = await openDrawer(bx);
  await fr.waitForSelector('.qrow', { timeout: 20000 });
  check('Gaveta abre normalmente depois da atualização', true);
  const before = (await dsSync())?.lastSuccess;
  await bx.locator('#sla-monitor-root .bar button[data-a="sync"]').click();
  const after = await waitFor(async () => { const s = await dsSync(); return s?.lastSuccess > before ? s : null; }, 30000);
  check('Consulta pelo login funciona depois da atualização, sem recarregar o Bitrix', after?.status === 'ok', after ? `status ${after.status}` : 'sem nova sincronização');
  await bx.screenshot({ path: path.join(out, 'V2-apos-atualizacao.png') });

  // ------------------------------------------------------------ 5) várias abas do Bitrix
  const bx2 = await ctx.newPage(); watch(bx2);
  await bx2.goto(`${P}/page/besmart/seguros/`);
  await bx2.locator('#sla-monitor-root').waitFor({ state: 'attached', timeout: 10000 });
  check('Segunda aba do Bitrix também tem uma única aba "SLA"', await roots(bx2) === 1 && await roots(bx) === 1);
  await bx.close();
  const s0 = (await dsSync()).lastSuccess;
  const dash = await ctx.newPage(); watch(dash);
  await dash.goto(DASH);
  await dash.waitForSelector('.qrow', { timeout: 20000 });
  await dash.click('#btnSync');
  const s1 = await waitFor(async () => { const s = await dsSync(); return s.lastSuccess > s0 ? s : null; }, 30000);
  check('Fechando a aba usada, a consulta segue pela outra aba aberta', s1?.status === 'ok', s1 ? s1.status : 'sem nova sincronização');

  // ------------------------------------------------------------ 6) contador da aba "SLA" chega por mensagem
  await sw.evaluate(async () => { await chrome.storage.local.set({ inpage: null }); });
  await dash.click('#btnSync');
  const badgeTxt = await waitFor(() => bx2.evaluate(() => document.getElementById('sla-monitor-root')?.shadowRoot.querySelector('.n')?.textContent || ''), 20000);
  check('Contador da aba "SLA" atualizado por mensagem (o script da página não escuta o armazenamento)', /^\d+$/.test(badgeTxt), badgeTxt);

  // ------------------------------------------------------------ 7) painel fora de vista não redesenha
  fr = await openDrawer(bx2);
  await fr.waitForSelector('.qrow', { timeout: 20000 });
  await fr.evaluate(() => { window.__renders = 0; new MutationObserver(() => window.__renders++).observe(document.querySelector('#main'), { childList: true }); });
  await bx2.locator('#sla-monitor-root .bar button[data-a="close"]').click();
  const s2 = (await dsSync()).lastSuccess;
  await dash.click('#btnSync');
  await waitFor(async () => (await dsSync()).lastSuccess > s2, 30000);
  await bx2.waitForTimeout(800);
  const hiddenRenders = await fr.evaluate(() => window.__renders);
  await bx2.locator('#sla-monitor-root .tab').click();
  const shownRenders = await waitFor(() => fr.evaluate(() => window.__renders || 0), 5000);
  check('Gaveta fechada não redesenha a cada sincronização; atualiza ao abrir', hiddenRenders === 0 && shownRenders >= 1, `fechada: ${hiddenRenders}, ao abrir: ${shownRenders}`);
  await bx2.locator('#sla-monitor-root .bar button[data-a="close"]').click();

  // ------------------------------------------------------------ 8) portal fora do ar e volta
  await dash.bringToFront();
  server.kill();
  await new Promise(r => setTimeout(r, 300));
  const s3 = (await dsSync()).lastSuccess;
  await dash.click('#btnSync');
  await dash.waitForSelector('.banner.err', { timeout: 90000 });
  const errBanner = await dash.locator('.banner.err').first().innerText();
  const keptRows = await dash.locator('.qrow').count();
  check('Portal fora do ar: aviso de falha e últimos dados mantidos', /falhou/i.test(errBanner) && keptRows > 0, `${errBanner.replace(/\s+/g, ' ').slice(0, 90)} · ${keptRows} cards`);
  check('Botão de sincronizar volta a funcionar após a falha', !(await dash.locator('#btnSync').isDisabled()));
  await dash.screenshot({ path: path.join(out, 'V3-portal-fora-do-ar.png') });
  server = await startServer();
  await bx2.reload();
  await bx2.locator('#sla-monitor-root').waitFor({ state: 'attached', timeout: 10000 });
  await dash.click('#btnSync');
  const s4 = await waitFor(async () => { const s = await dsSync(); return s.lastSuccess > s3 && s.status === 'ok' ? s : null; }, 30000);
  await dash.waitForTimeout(500);
  check('Portal de volta: sincronização se recupera e o aviso some', !!s4 && !(await dash.isVisible('.banner.err')));

  // ------------------------------------------------------------ 9) serviço indisponível (503)
  await ctx.route(`${P}/rest/**`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QUERY_LIMIT_EXCEEDED', error_description: 'Too many requests' }) }));
  await dash.click('#btnSync');
  await dash.waitForSelector('.banner.err', { timeout: 90000 });
  const retry = await sw.evaluate(() => chrome.alarms.get('retry'));
  const s5 = await dsSync();
  check('Serviço indisponível (503): para de insistir e agenda nova tentativa', !!retry && s5.status === 'erro' && /limite|requisi|tente/i.test(s5.errors?.[0]?.message || ''),
    `${s5.status} · ${(s5.errors?.[0]?.message || '').slice(0, 80)} · nova tentativa ${retry ? new Date(retry.scheduledTime).toISOString().slice(11, 16) : '—'}`);
  await ctx.unroute(`${P}/rest/**`);

  // ------------------------------------------------------------ 10) sem internet
  await ctx.setOffline(true);
  const offlineSw = await sw.evaluate(() => navigator.onLine);
  await dash.click('#btnSync');
  await dash.waitForTimeout(1500);
  const s6 = await dsSync();
  if (offlineSw === false) check('Sem internet: não insiste e mostra "sem conexão"', s6.status === 'sem_conexao' && await dash.isVisible('text=Sem conexão com a internet'), s6.status);
  else check('Sem internet: emulação de rede não chega ao service worker neste Chromium (verificação manual)', true, 'navigator.onLine continuou true no service worker');
  await ctx.setOffline(false);

  // ------------------------------------------------------------ 11) diagnóstico
  await dash.click('#tabs button[data-tab="config"]');
  await dash.click('.cfgnav button:has-text("Dados e privacidade")');
  await dash.waitForSelector('#diagErrors table', { timeout: 10000 });
  const diagText = await dash.locator('#diagErrors').innerText();
  const diagRaw = await sw.evaluate(async () => JSON.stringify((await chrome.storage.local.get('diag')).diag));
  check('Diagnóstico mostra os erros recentes', /sincronizacao/.test(diagText), diagText.replace(/\s+/g, ' ').slice(0, 120));
  check('Diagnóstico sem credenciais nem sessid', !/sess123|sessid=(?!\*)/.test(diagRaw));
  await dash.click('#tabs button[data-tab="analises"]');
  await dash.waitForSelector('#diagSyncs table', { timeout: 10000 });
  const nSyncs = await dash.locator('#diagSyncs tbody tr').count();
  check('Histórico de sincronizações com duração, requisições e resultado', nSyncs >= 5, `${nSyncs} registros`);
  await dash.screenshot({ path: path.join(out, 'V4-historico-sincronizacoes.png'), fullPage: true });

  // ------------------------------------------------------------ 12) progresso preso não trava a tela
  await sw.evaluate(() => chrome.storage.session.set({ syncProgress: { step: 'atividades', at: Date.now() - 3600000 } }));
  const st = await dash.evaluate(() => new Promise(r => chrome.runtime.sendMessage({ type: 'getState', lite: true }, r)));
  check('Progresso gravado sem sincronização em andamento é ignorado', st.syncing === false && st.progress === null);
  await dash.reload();
  await dash.waitForSelector('#syncinfo .dot', { timeout: 10000 });
  check('Painel não fica em "Sincronizando…" por um progresso antigo', !/Sincronizando/.test(await dash.locator('#syncinfo').innerText()));

  // edição não salva sobrevive a atualizações em segundo plano (e a busca digitada também)
  await dash.click('#tabs button[data-tab="config"]');
  await dash.click('.cfgnav button:has-text("Notificações e sincronização")');
  await dash.fill('input[data-bind="sync.intervalMinutes"]', '37');
  await sw.evaluate(() => chrome.storage.session.set({ uiRev: { at: Date.now(), n: Math.random(), reasons: ['analysis', 'view', 'config'] } }));
  await dash.waitForTimeout(900);
  const kept = await dash.inputValue('input[data-bind="sync.intervalMinutes"]');
  check('Atualização em segundo plano não apaga edição não salva', kept === '37' && await dash.isVisible('#savebar'), `valor ${kept}`);
  await dash.click('#savebar button:has-text("Descartar")');

  // ------------------------------------------------------------ 13) atalhos, busca global e tema
  await dash.click('#tabs button[data-tab="painel"]');
  await dash.waitForSelector('.qrow');
  await dash.keyboard.press('2');
  check('Atalho 2 abre Etapas', await dash.locator('#tabs button[data-tab="etapas"].on').count() === 1);
  await dash.keyboard.press('/');
  check('Atalho / foca a busca', await dash.evaluate(() => document.activeElement?.id === 'gq'));
  await dash.keyboard.type('padaria');
  await dash.waitForSelector('#gresults .gr-item', { timeout: 5000 });
  await dash.keyboard.press('Enter');
  await dash.waitForSelector('.qrow.hl', { timeout: 5000 });
  check('Busca global leva ao card na fila e abre o detalhe', await dash.locator('.qrow').count() === 1 && await dash.isVisible('.qdetail') && /Padaria/.test(await dash.locator('.qrow.hl .title').innerText()));
  await dash.screenshot({ path: path.join(out, 'V5-busca-global.png') });
  await dash.keyboard.press('?');
  check('Atalho ? mostra a lista de atalhos', await dash.isVisible('.dialog:has-text("Atalhos de teclado")'));
  await dash.keyboard.press('Escape');
  const th0 = await dash.evaluate(() => document.documentElement.dataset.theme || 'auto');
  await dash.keyboard.press('t');
  const th1 = await dash.evaluate(() => document.documentElement.dataset.theme || 'auto');
  await dash.keyboard.press('t');
  const th2 = await dash.evaluate(() => document.documentElement.dataset.theme || 'auto');
  const saved = await sw.evaluate(async () => (await chrome.storage.local.get('uiTheme')).uiTheme);
  check('Tema alterna automático → claro → escuro e fica salvo', th0 === 'auto' && th1 === 'light' && th2 === 'dark' && saved === 'escuro', `${th0} → ${th1} → ${th2} (${saved})`);
  await dash.waitForTimeout(300);
  await dash.screenshot({ path: path.join(out, 'V6-tema-escuro.png') });
  await dash.keyboard.press('t'); // volta ao automático

  // ------------------------------------------------------------ 14) popup leve
  const pop = await ctx.newPage(); watch(pop);
  const tp = Date.now();
  await pop.goto(`chrome-extension://${EXT_ID}/ui/popup.html`);
  await pop.waitForSelector('.item', { timeout: 10000 });
  const popMs = Date.now() - tp;
  const popState = await pop.evaluate(() => new Promise(r => chrome.runtime.sendMessage({ type: 'getSummary' }, r)));
  check('Popup abre com o resumo gravado (sem ler todos os dados)', popState.summary?.top?.length > 0 && !('cards' in popState.summary), `${popMs} ms, ${Math.round(JSON.stringify(popState).length / 1024)} KB`);
  await pop.setViewportSize({ width: 392, height: 600 });
  await pop.screenshot({ path: path.join(out, 'V7-popup.png') });
  await pop.close();

  // ------------------------------------------------------------ 15) reinício do navegador
  await ctx.close();
  ctx = await launch();
  sw = await swOf(ctx);
  const d2 = await ctx.newPage(); watch(d2);
  await d2.goto(DASH);
  await d2.waitForSelector('.qrow', { timeout: 20000 });
  check('Depois de reiniciar o navegador, o painel abre com a última análise', await d2.locator('.qrow').count() > 0);
  const bx3 = await ctx.newPage(); watch(bx3);
  await bx3.goto(`${P}/stream/`);
  await bx3.locator('#sla-monitor-root').waitFor({ state: 'attached', timeout: 10000 });
  check('Aba "SLA" volta sozinha no Bitrix após reiniciar', await roots(bx3) === 1);

  // ------------------------------------------------------------ 16) muitos cards: etapas paginadas e busca rápida
  const big = buildLargeDataset(1500, Date.now());
  big.config.portalOrigin = P; big.config.portalAddress = P; big.config.authMode = 'login';
  await sw.evaluate(async ({ ds, config }) => {
    await chrome.alarms.create('sync', { periodInMinutes: Number(config.sync.intervalMinutes) || 15, delayInMinutes: 120 });
    await chrome.storage.local.set({ mode: 'real', config_real: config, ds_real: ds });
  }, big);
  await d2.evaluate(cfg => new Promise(r => chrome.runtime.sendMessage({ type: 'saveConfig', config: cfg }, r)), big.config);
  await d2.reload();
  await d2.waitForSelector('.qrow', { timeout: 30000 });
  await d2.click('#tabs button[data-tab="etapas"]');
  const rows0 = await d2.locator('details.stage tbody tr').count();
  await d2.locator('button[data-act="st-more"]').first().click();
  const rows1 = await d2.locator('details.stage tbody tr').count();
  check('Etapas com 1.500 cards: desenha 40 por etapa e carrega mais sob demanda', rows0 <= 5 * 40 && rows1 > rows0, `${rows0} → ${rows1} linhas`);
  const ts = await d2.evaluate(async () => {
    const q = document.getElementById('gq'); q.focus(); q.value = 'Card fictício 1499';
    const t = performance.now(); q.dispatchEvent(new Event('input'));
    await new Promise(r => { const iv = setInterval(() => { if (document.querySelector('#gresults .gr-item')) { clearInterval(iv); r(); } }, 5); });
    return Math.round(performance.now() - t);
  });
  check('Busca global em 1.500 cards responde rápido', ts < 400, `${ts} ms (inclui 80 ms de espera entre teclas)`);
} catch (e) {
  check('Execução sem exceção', false, e.message.split('\n')[0]);
  try { let i = 0; for (const p of ctx.pages()) await p.screenshot({ path: path.join(out, `V-erro-${i++}.png`) }); } catch { /* */ }
} finally {
  check('Sem erros de script nas páginas', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(out, 'resultado-e2e-v18.json'), JSON.stringify({ at: new Date().toISOString(), segundos: Math.round((Date.now() - t0) / 1000), results, errors }, null, 2));
  await ctx.close().catch(() => {});
  server.kill();
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} verificações OK`);
  process.exit(fails ? 1 : 0);
}
