// Teste ponta a ponta: carrega a extensão no Chromium (Playwright), roda a demonstração,
// conecta por webhook a um servidor HTTP local que imita o Bitrix24, configura funis e SLA,
// sincroniza e captura telas. Uso: node tools/e2e.mjs <pasta-de-saída>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// Cópia de teste: o diálogo de permissão de domínio do Chrome não pode ser clicado em modo headless,
// então a cópia já declara acesso a http://127.0.0.1 (servidor simulado). A extensão distribuída não declara.
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-src-'));
for (const f of ['manifest.json', 'background.js', 'src', 'ui', 'icons', 'content']) fs.cpSync(path.join(src, f), path.join(ext, f), { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
man.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man, null, 2));
const out = path.resolve(process.argv[2] || './e2e-out');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ' — ' + detail : ''}`); };

const server = spawn(process.execPath, [path.join(src, 'tools/mock-server.mjs'), '8787'], { stdio: 'pipe' });
await new Promise(r => server.stdout.once('data', r));

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
const consoleErrors = [];
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = sw.url().split('/')[2];
  check('Extensão carregada (service worker MV3 ativo)', !!extId, extId);
  sw.on('console', m => { if (m.type() === 'error') consoleErrors.push('[sw] ' + m.text()); });

  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('[page] ' + m.text()); });
  page.on('pageerror', e => consoleErrors.push('[page] ' + e.message));
  const dash = `chrome-extension://${extId}/ui/dashboard.html`;

  // 1) Estado inicial
  await page.goto(dash);
  await page.waitForSelector('text=Conecte seu Bitrix24');
  check('Tela inicial sem configuração', true);
  await page.screenshot({ path: path.join(out, '00-inicio.png') });

  // 2) Demonstração
  await page.click('text=Ver demonstração com dados fictícios');
  await page.waitForSelector('.qrow', { timeout: 30000 });
  check('Demonstração carregada', await page.isVisible('text=DEMONSTRAÇÃO · DADOS FICTÍCIOS'));
  const kpiText = await page.locator('.kpis').innerText();
  check('Indicadores exibidos', /Cards monitorados\s*24/.test(kpiText), kpiText.replace(/\s+/g, ' ').slice(0, 160));
  const rows = await page.locator('.qrow').count();
  check('Fila priorizada com cards', rows > 5, `${rows} cards na fila`);
  const firstLevel = await page.locator('.qrow').first().getAttribute('class');
  check('Primeiro da fila é crítico', firstLevel.includes('critica'));
  await page.screenshot({ path: path.join(out, '01-painel-demo.png'), fullPage: true });
  // badge
  const badge = await sw.evaluate(() => chrome.action.getBadgeText({}));
  check('Contador no ícone da extensão', /^\d+$/.test(badge) && Number(badge) > 0, `badge = ${badge}`);

  // detalhe do card
  await page.locator('.qrow .qhead').first().click();
  await page.waitForSelector('.qdetail');
  const det = await page.locator('.qdetail').first().innerText();
  check('Detalhe mostra prazo aplicado, atraso e motivo da prioridade', /Prazo\/limite aplicado/.test(det) && /Por que prioridade/.test(det));
  await page.locator('.qrow').first().screenshot({ path: path.join(out, '02-detalhe-card.png') });
  const link = await page.locator('.qrow').first().locator('a:has-text("Abrir no Bitrix")').first().getAttribute('href');
  check('Link direto para o card no Bitrix', /\/crm\/(deal|lead|type\/\d+)\/details\/\d+\/$/.test(link), link);

  // filtro
  await page.selectOption('[data-filter="level"]', 'critica');
  const crit = await page.locator('.qrow').count();
  check('Filtro por gravidade', crit > 0 && crit < rows, `${crit} críticos`);
  await page.selectOption('[data-filter="level"]', '');
  await page.fill('[data-filter="q"]', 'Metal Forte');
  check('Busca por texto', (await page.locator('.qrow').count()) === 1);
  await page.click('text=limpar filtros');

  // silenciar
  const before = Number(await sw.evaluate(() => chrome.action.getBadgeText({})));
  if (!(await page.locator('.qrow').first().locator('.qdetail').count())) await page.locator('.qrow .qhead').first().click();
  await page.locator('.qdetail button:has-text("Silenciar todos deste card por 1 dia")').first().click();
  await page.waitForTimeout(800);
  const after = Number(await sw.evaluate(() => chrome.action.getBadgeText({})));
  check('Silenciar reduz o contador do ícone', after === before - 1, `${before} → ${after}`);

  // central de alertas, análises, configurações
  await page.click('#tabs button[data-tab="alertas"]');
  await page.waitForSelector('text=Em atraso');
  await page.screenshot({ path: path.join(out, '03-central-alertas.png'), fullPage: true });
  check('Central de alertas', await page.isVisible('h2:has-text("Silenciados")'));
  await page.click('#tabs button[data-tab="analises"]');
  await page.waitForSelector('text=Cobertura dos dados');
  await page.screenshot({ path: path.join(out, '04-analises.png'), fullPage: true });
  check('Análises com cobertura dos dados', true);
  await page.click('#tabs button[data-tab="config"]');
  await page.click('.cfgnav button:has-text("Regras de SLA")');
  await page.waitForSelector('text=SLA total do processo');
  await page.screenshot({ path: path.join(out, '05-config-sla.png'), fullPage: true });
  check('Tela de regras de SLA', true);

  // popup
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 380, height: 600 });
  await pop.goto(`chrome-extension://${extId}/ui/popup.html`);
  await pop.waitForSelector('.item');
  await pop.screenshot({ path: path.join(out, '06-popup.png'), fullPage: true });
  check('Popup com prioridades', (await pop.locator('.item').count()) > 0);
  await pop.close();

  // mobile
  await page.setViewportSize({ width: 390, height: 900 });
  await page.click('#tabs button[data-tab="painel"]');
  await page.waitForSelector('.qrow');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('Layout responsivo sem rolagem horizontal (390px)', overflow <= 1, `excesso ${overflow}px`);
  await page.screenshot({ path: path.join(out, '07-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 3) Sair da demonstração e conectar por webhook (servidor HTTP local imitando Bitrix24)
  await page.click('text=Sair da demonstração');
  await page.waitForSelector('text=Conecte seu Bitrix24');
  check('Demonstração separada: sair limpa os dados fictícios', !(await page.isVisible('.qrow')));
  await page.click('text=Outras formas de conexão');
  check('Endereço do portal pré-preenchido', (await page.inputValue('#portalAddr')) === 'https://crm.hub-bnk.com');
  await page.fill('#whUrl', 'http://127.0.0.1:8787/rest/1/teste123/');
  await page.click('button:has-text("Conectar e testar")');
  check('Webhook de outro endereço é recusado antes de qualquer chamada', /mas o portal informado é https:\/\/crm\.hub-bnk\.com/.test(await page.locator('#connResult').innerText()));
  await page.fill('#portalAddr', 'http://127.0.0.1:8787/stream/');
  await page.fill('#whUrl', 'http://127.0.0.1:8787/rest/1/errado/');
  // Em teste automatizado o diálogo de permissão não aparece; concedemos via API da extensão no contexto do SW.
  await page.click('button:has-text("Conectar e testar")');
  await page.waitForSelector('#connResult:has-text("Falha")', { timeout: 15000 });
  check('Webhook inválido é recusado com mensagem clara', /autenticação/i.test(await page.locator('#connResult').innerText()),
    (await page.locator('#connResult').innerText()).slice(0, 120));

  await page.fill('#whUrl', 'http://127.0.0.1:8787/rest/1/teste123/');
  await page.click('button:has-text("Conectar e testar")');
  await page.waitForSelector('text=O que representa um "card"', { timeout: 15000 });
  check('Com foco ativo e processo não identificado, nenhum funil é listado (nem leads)', !(await page.locator('h2', { hasText: /^Leads$/ }).count()) && !(await page.locator('input[data-act="toggle-cat"]').count()));
  await page.click('button:has-text("Remover foco")');
  await page.waitForSelector('input[data-act="toggle-cat"]', { timeout: 10000 });
  check('Leads não aparecem nem sem foco', !(await page.locator('h2', { hasText: /^Leads$/ }).count()));
  check('Conexão por webhook e leitura de funis/etapas', await page.isVisible('text=Pós-venda e Assessoria'));
  await page.screenshot({ path: path.join(out, '08-funis-reais-simulados.png'), fullPage: true });

  // adiciona processo de espaço digital pelo link de um card
  await page.fill('#cardUrl', 'http://127.0.0.1:8787/page/besmart/seguros/type/1036/details/901/');
  await page.click('button:has-text("Adicionar processo")');
  await page.waitForSelector('td.mono:has-text("/page/besmart/seguros/type/1036/details/{id}/")', { timeout: 15000 });
  check('Processo de espaço digital adicionado pelo link de um card', true);
  // seleciona funil Comercial PME
  await page.locator('input[data-act="toggle-cat"][data-etid="2"][data-cid="0"]').check();
  await page.click('.cfgnav button:has-text("Regras de SLA")');
  // define SLA da etapa "Em cotação": 1 dia útil
  await page.locator('tr:has-text("Em cotação") button:has-text("Definir SLA da etapa")').click();
  await page.locator('tr:has-text("Em cotação") input[data-bind$=".duration.value"]').fill('1');
  await page.click('.cfgnav button:has-text("Expediente e feriados")');
  await page.locator('input[data-bind="calendar.confirmed"]').check();
  await page.click('#savebar button:has-text("Salvar configurações")');
  await page.waitForTimeout(500);
  await page.click('#tabs button[data-tab="painel"]');
  await page.waitForSelector('.qrow', { timeout: 30000 });
  const realKpi = await page.locator('.kpis').innerText();
  check('Sincronização via HTTP com o portal simulado', /Cards monitorados\s*13/.test(realKpi), realKpi.replace(/\s+/g, ' ').slice(0, 120));
  check('Modo real não mostra selo de demonstração', !(await page.isVisible('text=DEMONSTRAÇÃO · DADOS FICTÍCIOS')));
  await page.screenshot({ path: path.join(out, '09-painel-conexao-http.png'), fullPage: true });

  // credencial não aparece no armazenamento local (modo sessão) nem na exportação
  const localDump = await sw.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)));
  check('Webhook não gravado no armazenamento local (modo sessão)', !localDump.includes('teste123'));
  const sessDump = await sw.evaluate(async () => JSON.stringify(await chrome.storage.session.get('webhook')));
  check('Webhook mantido apenas na sessão', sessDump.includes('teste123'));

  // somente leitura no servidor
  const logRes = await (await fetch('http://127.0.0.1:8787/__log')).json();
  const methods = [...new Set(logRes.log.map(l => l.method))];
  check('Servidor recebeu apenas métodos de leitura', logRes.writeAttempts === 0 && methods.every(m => !/(add|update|delete|set)$/.test(m)), methods.join(', '));

  // perda de credencial (simula reinício do Chrome com credencial em sessão)
  await sw.evaluate(() => chrome.storage.session.clear());
  await page.click('#btnSync');
  await page.waitForSelector('.banner.err', { timeout: 15000 });
  const errText = await page.locator('.banner.err').first().innerText();
  check('Sem credencial: painel diferencia "não foi possível consultar"', /Não foi possível consultar/.test(errText), errText.slice(0, 120));
  const badge2 = await sw.evaluate(() => chrome.action.getBadgeText({}));
  check('Ícone sinaliza reconexão necessária', badge2 === '!');
  await page.screenshot({ path: path.join(out, '10-erro-credencial.png') });

  // limpar e desconectar
  await page.click('#tabs button[data-tab="config"]');
  await page.click('.cfgnav button:has-text("Dados e privacidade")');
  page.once('dialog', d => d.accept());
  await page.click('button:has-text("Apagar tudo e desconectar")');
  await page.waitForTimeout(800);
  const wiped = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
  check('Apagar tudo remove dados locais', !wiped.some(k => /^(ds_|an_)/.test(k)), wiped.join(','));
} catch (e) {
  check('Execução sem exceção', false, e.message);
  try { let i = 0; for (const pg of ctx.pages()) { await pg.screenshot({ path: path.join(out, `erro-${i++}.png`), fullPage: true }); console.log('texto:', (await pg.locator('body').innerText()).slice(0, 600)); } } catch { /* */ }
} finally {
  check('Sem erros de console', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(out, 'resultado-e2e.json'), JSON.stringify({ at: new Date().toISOString(), results, consoleErrors }, null, 2));
  await ctx.close();
  server.kill();
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} verificações OK`);
  process.exit(fails ? 1 : 0);
}
