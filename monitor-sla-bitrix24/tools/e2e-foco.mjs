// Teste ponta a ponta: foco em uma página de espaço digital (/page/besmart/besmart_saude/).
// A extensão identifica o processo pelos links dos cards e monitora SOMENTE ele.
// Uso: node tools/e2e-foco.mjs <pasta-de-saída>
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

const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-foco-'));
for (const f of ['manifest.json', 'background.js', 'src', 'ui', 'icons', 'content']) fs.cpSync(path.join(src, f), path.join(ext, f), { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
man.host_permissions = ['http://127.0.0.1/*'];
for (const cs of man.content_scripts) cs.matches = ['http://127.0.0.1/*'];
man.web_accessible_resources[0].matches = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man, null, 2));

const server = await new Promise(r => { const p = spawn(process.execPath, [path.join(src, 'tools/mock-server.mjs'), '8792'], { stdio: 'pipe' }); p.stdout.once('data', () => r(p)); });
const P = 'http://127.0.0.1:8792';
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
  await bx.goto(`${P}/login`);
  await bx.goto(`${P}/page/besmart/besmart_saude/`);
  await bx.waitForSelector('#kanban a', { timeout: 10000 });
  await bx.waitForTimeout(2500);
  const det = await sw.evaluate(() => chrome.storage.session.get('lastPageTypes'));
  check('Processo da página identificado pelos links dos cards', det.lastPageTypes?.types?.[0]?.entityTypeId === 1036, JSON.stringify(det.lastPageTypes?.types?.[0] || null));

  await bx.locator('#sla-monitor-root .tab').click();
  const fr = await (await bx.waitForSelector('#sla-monitor-root iframe')).contentFrame();
  await fr.click('text=Analisar com meu login do Bitrix');
  await fr.waitForSelector('text=Regras de SLA por funil e etapa', { timeout: 20000 });
  const cfg = (await sw.evaluate(() => chrome.storage.local.get('config_real'))).config_real;
  check('Monitoramento restrito ao processo da página', cfg.monitored.length === 1 && cfg.monitored[0].entityTypeId === 1036 && cfg.focusEntityTypeId === 1036,
    JSON.stringify(cfg.monitored));
  const tables = await fr.locator('.panel h2').allInnerTexts();
  check('Regras de SLA mostram só os funis desse processo', tables.filter(t => t.includes('›')).every(t => t.startsWith('be.smart Saúde')), tables.filter(t => t.includes('›')).join(' | '));

  // um SLA de exemplo e análise
  await fr.locator('tr:has-text("Aguardando operadora") button:has-text("Definir SLA da etapa")').click();
  await fr.locator('tr:has-text("Aguardando operadora") input[data-bind$=".duration.value"]').fill('2');
  await fr.click('#savebar button:has-text("Salvar configurações")');
  await fr.waitForTimeout(800);
  await fr.click('#tabs button[data-tab="painel"]');
  await fr.waitForSelector('.qrow', { timeout: 40000 });
  const kpi = (await fr.locator('.kpis').innerText()).replace(/\s+/g, ' ');
  check('Somente as oportunidades da página foram analisadas', /Cards monitorados 4\b/.test(kpi), kpi.slice(0, 90));
  const links = await fr.locator('.qrow a:has-text("Abrir no Bitrix")').evaluateAll(as => as.map(a => a.getAttribute('href')));
  check('Links abrem o card dentro da página be.smart Saúde', links.length > 0 && links.every(h => /\/page\/besmart\/besmart_saude\/type\/1036\/details\/\d+\/$/.test(h)), links[0]);
  const deal = await fr.locator('text=Negócios').count();
  check('Negócios e outros tipos não aparecem no painel', deal === 0);
  await bx.screenshot({ path: path.join(out, 'F1-foco-besmart-saude.png') });
  await fr.click('#tabs button[data-tab="etapas"]');
  await fr.waitForSelector('.flow', { timeout: 10000 });
  const flow = (await fr.locator('.flow').first().innerText()).replace(/\s+/g, ' ');
  const rows = await fr.locator('details.stage tbody tr').count();
  check('Visão Etapas mostra o fluxo e os 4 cards abertos com tempo na etapa', rows === 4 && /Aguardando operadora/.test(flow), flow.slice(0, 120));
  await bx.screenshot({ path: path.join(out, 'F3-etapas.png') });
  const stageText = await fr.locator('details.stage').first().innerText();
  const comCells = await fr.locator('details.stage td[data-l="Comercial"]').allInnerTexts();
  check('Etapas mostram o comercial em coluna própria, separado do assessor',
    /Assessor/.test(stageText) && /Comercial/.test(stageText) && comCells.length > 0 && comCells.every(t => /(Ana|Bruno|Carla|Joana|Rafael|Maria)/.test(t)), comCells.join(' | ').replace(/\s+/g, ' '));
  await fr.click('#tabs button[data-tab="painel"]');
  await fr.waitForSelector('.qrow');
  const comQueue = await fr.locator('.qrow .c-com').allTextContents();
  check('Fila mostra o comercial em coluna própria e permite filtrar por ele', comQueue.length > 0 && comQueue.every(t => /(Ana|Bruno|Carla|Joana|Rafael|Maria)/.test(t)) &&
    (await fr.locator('select[data-filter="com"]').count()) === 1, comQueue.slice(0, 2).join(' | ').replace(/\s+/g, ' '));
  check('Painel tem distribuição "Por comercial"', await fr.isVisible('h2:has-text("Por comercial")'));
  await bx.screenshot({ path: path.join(out, 'F4-comercial.png') });
  await fr.click('#tabs button[data-tab="etapas"]');
  check('Leads não aparecem em nenhuma tela', (await fr.locator('text=/\\bLeads\\b/').count()) === 0);
  await fr.click('#tabs button[data-tab="config"]');
  await fr.click('.cfgnav button:has-text("Funis e etapas")');
  await fr.waitForSelector('text=monitorando somente');
  await bx.screenshot({ path: path.join(out, 'F2-escopo.png') });
  check('Tela de escopo indica o foco', true);

  // Página cujos links usam o formato genérico /crm/type/N/details/ (variação do Bitrix)
  await fr.fill('#focusPage', `${P}/page/besmart/generico/`);
  await fr.click('button[data-act="set-focus"]');
  await fr.waitForTimeout(500);
  const cfg2 = (await sw.evaluate(() => chrome.storage.local.get('config_real'))).config_real;
  check('Trocar a página de foco sem identificar o processo suspende o monitoramento', cfg2.focusPage === '/page/besmart/generico/' && !cfg2.focusEntityTypeId, JSON.stringify({ fp: cfg2.focusPage, et: cfg2.focusEntityTypeId }));
  const bx3 = await ctx.newPage();
  await bx3.goto(`${P}/page/besmart/generico/`);
  await bx3.waitForSelector('#kanban a', { timeout: 10000 });
  await bx3.waitForTimeout(3000);
  const cfg3 = (await sw.evaluate(() => chrome.storage.local.get('config_real'))).config_real;
  check('Identifica o processo também com links no formato /crm/type/N/details/', cfg3.focusEntityTypeId === 1036 && cfg3.cardTypes['1036'].linkPath === '/crm/type/1036/details/{id}/', JSON.stringify(cfg3.cardTypes['1036']));
} catch (e) {
  check('Execução sem exceção', false, e.message.split('\n')[0]);
  try { let i = 0; for (const p of ctx.pages()) await p.screenshot({ path: path.join(out, `F-erro-${i++}.png`) }); } catch { /* */ }
} finally {
  check('Sem erros de script', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(out, 'resultado-e2e-foco.json'), JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2));
  await ctx.close(); server.kill();
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} verificações OK`);
  process.exit(fails ? 1 : 0);
}
