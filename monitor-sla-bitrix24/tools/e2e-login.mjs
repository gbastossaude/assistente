// Teste ponta a ponta do modo "entrar no Bitrix e analisar": extensão carregada no Chromium,
// portal Bitrix24 simulado (dados fictícios) com login por cookie e BX.bitrix_sessid().
// Uso: node tools/e2e-login.mjs <pasta-de-saída>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || './e2e-out');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ' — ' + detail : ''}`); };

// Cópia de teste: o portal real (crm.hub-bnk.com) é trocado pelo servidor simulado local.
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-login-'));
for (const f of ['manifest.json', 'background.js', 'src', 'ui', 'icons', 'content']) fs.cpSync(path.join(src, f), path.join(ext, f), { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
const LOCAL = 'http://127.0.0.1/*';
man.host_permissions = [LOCAL];
for (const cs of man.content_scripts) cs.matches = [LOCAL];
man.web_accessible_resources[0].matches = [LOCAL];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man, null, 2));

const start = (port, extra = []) => new Promise(r => {
  const p = spawn(process.execPath, [path.join(src, 'tools/mock-server.mjs'), String(port), ...extra], { stdio: 'pipe' });
  p.stdout.once('data', () => r(p));
});
const server = await start(8790);
const serverWrong = await start(8791, ['--wrong-auth-type']);
const P = 'http://127.0.0.1:8790';

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'prof-')), {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 950 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
const errors = [];
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  sw.on('console', m => { if (m.type() === 'error') errors.push('[sw] ' + m.text()); });
  const bx = await ctx.newPage();
  bx.on('pageerror', e => errors.push('[bitrix] ' + e.message));

  // 1) Entrar no Bitrix
  await bx.goto(`${P}/login`);
  await bx.waitForSelector('text=Bitrix24 simulado');
  const tabHost = bx.locator('#sla-monitor-root');
  await tabHost.waitFor({ state: 'attached', timeout: 10000 });
  check('Aba "SLA" aparece dentro do Bitrix ao entrar', true);
  await bx.screenshot({ path: path.join(out, 'L1-bitrix-aba-sla.png') });

  // 2) Abrir a gaveta e conectar com o login (sem webhook)
  await bx.locator('#sla-monitor-root .tab').click();
  const frameEl = await bx.waitForSelector('#sla-monitor-root iframe', { timeout: 10000 });
  const fr = await frameEl.contentFrame();
  await fr.waitForSelector('text=Analisar com meu login do Bitrix', { timeout: 15000 });
  check('Gaveta com o painel abre dentro do Bitrix', true);
  await bx.screenshot({ path: path.join(out, 'L2-gaveta-inicio.png') });
  await fr.click('text=Analisar com meu login do Bitrix');
  await fr.waitForSelector('text=O que representa um "card"', { timeout: 20000 });
  await fr.click('button:has-text("Remover foco")');
  await fr.waitForSelector('input[data-act="toggle-cat"]', { timeout: 10000 });
  check('Conexão pelo login do Bitrix (sem webhook) leu funis e etapas', await fr.isVisible('text=Comercial PME'));

  // 3) Escolher funil e um SLA de etapa, salvar → análise roda pela sessão
  await fr.locator('input[data-act="toggle-cat"][data-etid="2"][data-cid="0"]').check();
  await fr.click('.cfgnav button:has-text("Regras de SLA")');
  await fr.locator('tr:has-text("Em cotação") button:has-text("Definir SLA da etapa")').click();
  await fr.locator('tr:has-text("Em cotação") input[data-bind$=".duration.value"]').fill('1');
  await fr.click('#savebar button:has-text("Salvar configurações")');
  await fr.waitForTimeout(800);
  await fr.click('#tabs button[data-tab="painel"]');
  await fr.waitForSelector('.qrow', { timeout: 40000 });
  const kpi = (await fr.locator('.kpis').innerText()).replace(/\s+/g, ' ');
  check('Análise feita com os dados do portal pela sessão', /Cards monitorados 13/.test(kpi), kpi.slice(0, 110));
  await bx.waitForFunction(() => true);
  await bx.waitForTimeout(500);
  await bx.screenshot({ path: path.join(out, 'L3-gaveta-analise.png') });

  const log = await (await fetch(`${P}/__log`)).json();
  const auths = [...new Set(log.log.map(l => l.auth))];
  check('Consultas feitas só pela sessão, sem webhook', auths.length === 1 && auths[0] === 'session', auths.join(','));
  check('Somente leitura no portal', log.writeAttempts === 0 && log.log.every(l => !/(add|update|delete|set)$/.test(l.method)));
  const badge = await sw.evaluate(() => chrome.storage.local.get('inpage'));
  check('Contador na aba "SLA" atualizado', /^\d+$/.test(badge.inpage?.text || ''), JSON.stringify(badge.inpage));

  // link do card abre no próprio Bitrix
  const href = await fr.locator('.qrow a:has-text("Abrir no Bitrix")').first().getAttribute('href');
  const target = await fr.locator('.qrow a:has-text("Abrir no Bitrix")').first().getAttribute('target');
  check('Link do card aponta para o portal e abre na própria página', href.startsWith(P + '/crm/deal/details/') && target === '_top', `${href} (${target})`);

  // 4) Reabrir o Bitrix dispara a análise automaticamente
  const n0 = log.log.length;
  await sw.evaluate(async () => { const d = (await chrome.storage.local.get('ds_real')).ds_real; d.sync.lastSuccess -= 10 * 60000; await chrome.storage.local.set({ ds_real: d }); });
  await bx.goto(`${P}/page/besmart/seguros/`);
  await bx.waitForTimeout(6000);
  const n1 = (await (await fetch(`${P}/__log`)).json()).log.length;
  check('Ao entrar de novo no Bitrix, a análise atualiza sozinha', n1 > n0, `${n1 - n0} consultas`);

  // 5) Sessão encerrada → aviso claro, dados anteriores preservados
  await bx.goto(`${P}/logout`);
  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${sw.url().split('/')[2]}/ui/dashboard.html`);
  await dash.waitForSelector('#btnSync');
  await dash.click('#btnSync');
  await dash.waitForSelector('text=Você não está logado no Bitrix24', { timeout: 20000 });
  check('Sem login: painel avisa e mantém a última análise', await dash.isVisible('.qrow'));
  await dash.screenshot({ path: path.join(out, 'L4-sem-login.png') });

  // 6) Bitrix fechado → aviso "abra o Bitrix"
  await bx.close();
  await dash.click('#btnSync');
  await dash.waitForSelector('text=O Bitrix24 está fechado', { timeout: 20000 });
  check('Bitrix fechado: painel pede para abrir o portal', true);

  // 7) Portal que recusa consulta pela sessão → orienta usar webhook
  const bx2 = await ctx.newPage();
  await bx2.goto('http://127.0.0.1:8791/login');
  await bx2.waitForSelector('text=Bitrix24 simulado');
  await dash.bringToFront();
  await dash.click('#tabs button[data-tab="config"]');
  await dash.click('.cfgnav button:has-text("Conexão")');
  await dash.fill('#portalAddr', 'http://127.0.0.1:8791');
  await dash.click('button[data-act="connect-login"]');
  await dash.waitForSelector('#loginResult:has-text("webhook")', { timeout: 20000 });
  check('Portal que recusa a sessão (WRONG_AUTH_TYPE): orienta usar webhook', true, (await dash.locator('#loginResult').innerText()).slice(0, 140));
} catch (e) {
  check('Execução sem exceção', false, e.message.split('\n')[0]);
  try { let i = 0; for (const p of ctx.pages()) await p.screenshot({ path: path.join(out, `L-erro-${i++}.png`) }); } catch { /* */ }
} finally {
  check('Sem erros de script', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(out, 'resultado-e2e-login.json'), JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2));
  await ctx.close(); server.kill(); serverWrong.kill();
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} verificações OK`);
  process.exit(fails ? 1 : 0);
}
