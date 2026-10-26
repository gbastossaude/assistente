'use strict';
/*
 * Testes no Chromium com a extensão REAL carregada (--load-extension).
 * O endereço https://crm.hub-bnk.com/... é atendido localmente pelo Playwright com
 * páginas representativas (tests/fixtures/pages.js): nenhuma requisição sai para a rede.
 * Isto NÃO substitui a validação no portal real.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const pages = require('../fixtures/pages.js');

const EXT = path.resolve(__dirname, '..', '..');
const BASE = 'https://crm.hub-bnk.com';
const KANBAN = BASE + '/crm/deal/kanban/category/2/';
const evidenceDir = process.env.EVIDENCE_DIR || path.join(EXT, 'tests', 'evidencias');

let context; let page; let sw;
const requests = [];
const consoleErrors = [];

const H = '#bnka-assistente-host';
const status = () => page.locator(H).getAttribute('data-bnka-status');
async function waitAttr(name, expected, timeout = 8000) {
  await page.waitForFunction(([sel, n, v]) => {
    const el = document.querySelector(sel);
    return el && el.getAttribute(n) === v;
  }, [H, name, String(expected)], { timeout });
}
async function shot(name) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name + '.png') });
}

test.before(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bnka-e2e-'));
  context = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium', headless: true, viewport: { width: 1400, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    args: ['--enable-unsafe-extension-debugging', '--disable-extensions-except=' + EXT, '--load-extension=' + EXT]
  });
  context.on('request', (r) => requests.push(r.url()));
  await context.route('https://outro-dominio.example/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>externo</p>' }));
  await context.route(BASE + '/**', (route) => {
    const u = new URL(route.request().url());
    const map = {
      '/crm/deal/kanban/category/2/': pages.kanbanPage, '/crm/deal/list/': pages.listPage, '/crm/novo/': pages.unknownPage,
      '/auth/': pages.loginPage, '/stream/': pages.streamPage, '/crm/deal/details/101/': pages.detailsPage, '/crm/frames/': pages.framesPage
    };
    const fn = map[u.pathname];
    if (!fn) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fn() });
  });
  sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
});

test.after(async () => { if (context) await context.close(); });

test('manifesto carregado com permissões mínimas', async () => {
  const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
  assert.deepEqual(manifest.permissions.sort(), ['scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://crm.hub-bnk.com/*']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://crm.hub-bnk.com/*']);
});

test('kanban: reconhece cards, pendências nativas e encerrados', async () => {
  await page.goto(KANBAN);
  await waitAttr('data-bnka-status', 'ok');
  assert.equal(await page.locator(H).getAttribute('data-bnka-cards'), '5');
  await page.locator(H + ' .fab').click();
  await page.locator(H + ' .item').first().waitFor();
  const titles = await page.locator(H + ' .item .title').allTextContents();
  assert.ok(titles.includes('Clínica Alfa — 120 vidas'));
  assert.ok(!titles.includes('Épsilon Ltda'), 'card em etapa WON fica fora da fila');
  const chipsOf = async (t) => page.locator(H + ' .item', { hasText: t }).locator('.chip').allTextContents();
  assert.ok((await chipsOf('Clínica Alfa')).includes('Atividade vencida'));
  assert.ok((await chipsOf('Grupo Gama')).includes('Sem atividade'));
  assert.ok((await chipsOf('Delta Saúde')).includes('SLA Bitrix'));
  assert.equal(await page.locator(H + ' .item', { hasText: 'Empresa' }).count(), 0, 'comentário "sem atividades vencidas" em campo não gera alerta');
  const statusText = await page.locator(H + ' .status').textContent();
  assert.match(statusText, /cobertura parcial: 1 card/);
  assert.doesNotMatch(await page.locator(H + ' .panel').textContent(), /\b(null|undefined|NaN)\b/);
  await shot('01-kanban-fila');
});

test('conteúdo malicioso em títulos é exibido como texto e links perigosos são descartados', async () => {
  await page.locator(H + ' input[type="checkbox"]').first().check();
  const item = page.locator(H + ' .item', { hasText: 'Empresa' });
  await item.waitFor();
  assert.match(await item.locator('.title').textContent(), /<img src=x onerror=/);
  assert.equal(await page.locator(H + ' img').count(), 0);
  assert.equal(await item.locator('a.btn').getAttribute('href'), BASE + '/crm/deal/details/102/');
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.match(await item.locator('.chip').first().textContent(), /Nenhuma pendência identificada|Sem regra/);
  await page.locator(H + ' input[type="checkbox"]').first().uncheck();
});

test('configuração de SLA no painel aceita 1,25 e rejeita valores inválidos', async () => {
  await page.locator(H + ' .tabs button', { hasText: 'Configurar SLA' }).click();
  await page.locator(H + ' .suggest button', { hasText: '+ Prazo operacional' }).first().click();
  const sla = page.locator(H + ' input[aria-label="SLA em horas para Novo contato"]');
  await sla.fill('1,25');
  const stall = page.locator(H + ' input[aria-label="Limite de permanência em horas para Cotação"]');
  await stall.fill('abc');
  await page.locator(H + ' button', { hasText: 'Salvar configuração' }).click();
  await page.locator(H + ' .errors').waitFor();
  assert.match(await page.locator(H + ' .errors').textContent(), /inválido/);
  await stall.fill('0');
  await page.locator(H + ' button', { hasText: 'Salvar configuração' }).click();
  await page.locator(H + ' .okmsg').waitFor();
  await shot('02-configuracao-sla');
  const saved = await sw.evaluate(() => chrome.storage.local.get('bnka:settings'));
  const s = saved['bnka:settings'];
  assert.equal(s.rules['deal:2']['novo contato'].sla, 1.25);
  assert.deepEqual(s.deadlineLabels, ['Prazo operacional']);
  await page.locator(H + ' .tabs button', { hasText: 'Fila' }).click();
  const chips = await page.locator(H + ' .item', { hasText: 'Clínica Alfa' }).locator('.chip').allTextContents();
  assert.ok(chips.includes('Prazo vencido'));
});

test('SLA vencido com contagem parcial desde a observação local', async () => {
  // Sai da página primeiro (ela grava as observações em memória ao sair) e só então semeia o histórico.
  await page.goto('about:blank');
  await page.waitForTimeout(500);
  const now = Date.now();
  await sw.evaluate(async (t) => {
    const r = await chrome.storage.local.get('bnka:obs');
    const obs = r['bnka:obs'] || { v: 1, cards: {} };
    obs.cards['deal:101'] = { s: [{ k: 'deal:2|novo contato', f: t - 2 * 3600000, iv: [[t - 2 * 3600000, t - 60000]], br: [], g: 0 }], l: t - 60000 };
    await chrome.storage.local.set({ 'bnka:obs': obs });
  }, now);
  await page.goto(KANBAN);
  await waitAttr('data-bnka-status', 'ok');
  const item = page.locator(H + ' .item', { hasText: 'Clínica Alfa' });
  await item.waitFor();
  assert.ok((await item.locator('.chip').allTextContents()).includes('SLA vencido'));
  assert.match(await item.textContent(), /Contagem parcial desde a observação local\./);
  await item.locator('button', { hasText: 'Evidências' }).click();
  assert.match(await item.locator('.evidence').textContent(), /Não é o histórico oficial do Bitrix/);
  await shot('03-sla-vencido-evidencias');
});

test('atualização automática: novos cards e movimentação entre etapas', async () => {
  const t0 = Date.now();
  await page.evaluate(() => window.__fixture.addCard('C2:NEW', 106, 'Nova Empresa Iota'));
  await waitAttr('data-bnka-cards', '6');
  const dt = Date.now() - t0;
  assert.ok(dt < 4000, 'atualizou em ' + dt + ' ms');
  await page.evaluate(() => window.__fixture.moveCard(103, 'C2:WON'));
  await page.waitForFunction(() => {
    const host = document.querySelector('#bnka-assistente-host');
    return host && !Array.from(host.shadowRoot.querySelectorAll('.item .title')).some((e) => e.textContent === 'Grupo Gama');
  }, null, { timeout: 5000 });
});

test('localizar card na página e exportar CSV', async () => {
  await page.locator(H + ' .item', { hasText: 'Clínica Alfa' }).locator('button', { hasText: 'Localizar' }).click();
  await page.waitForFunction(() => !document.querySelector('#bnka-assistente-host').shadowRoot.querySelector('.hl').hidden);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(H + ' button', { hasText: 'Exportar CSV' }).click()]);
  const file = path.join(evidenceDir, 'exportacao.csv');
  fs.mkdirSync(evidenceDir, { recursive: true });
  await download.saveAs(file);
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.startsWith('﻿Prioridade;ID;Entidade;Nome'));
  assert.match(content, /Clínica Alfa/);
  for (const line of content.split('\r\n').slice(1)) {
    for (const cell of line.split(';')) assert.doesNotMatch(cell, /^[=+\-@]/, 'célula com fórmula: ' + cell);
  }
});

test('eventos do painel não disparam atalhos do Bitrix; a página continua recebendo cliques', async () => {
  await page.evaluate(() => {
    window.__keys = 0; window.__clicks = 0;
    document.addEventListener('keydown', () => { window.__keys++; });
    document.addEventListener('click', () => { window.__clicks++; });
  });
  await page.locator(H + ' input[type="search"]').fill('alfa');
  await page.locator(H + ' input[type="search"]').press('Enter');
  assert.equal(await page.evaluate(() => window.__keys), 0);
  assert.equal(await page.locator(H + ' .item').count(), 1);
  await page.locator(H + ' input[type="search"]').fill('');
  await page.locator(H + ' .head button', { hasText: '—' }).click(); // minimiza
  await page.locator('.main-kanban-item[data-id="104"]').click();
  assert.equal(await page.evaluate(() => window.__clicks), 1);
  assert.equal(await page.locator(H + ' .panel').isHidden(), true);
});

test('navegação interna (pushState) para a lista e leitura do grid', async () => {
  await page.evaluate((html) => window.__fixture.navigate('/crm/deal/list/', html), pages.listBody());
  await waitAttr('data-bnka-cards', '3');
  await page.locator(H + ' .fab').click();
  const chips = async (t) => page.locator(H + ' .item', { hasText: t }).locator('.chip').allTextContents();
  await page.locator(H + ' .item', { hasText: 'Hospital Zeta' }).waitFor();
  assert.ok((await chips('Hospital Zeta')).includes('Atividade vencida'));
  assert.ok((await chips('Theta Corp')).includes('Sem atividade'));
  assert.match(await page.locator(H + ' .item', { hasText: 'Theta Corp' }).textContent(), /Responsável não exibido/);
  assert.match(await page.locator(H + ' .status').textContent(), /Lista/);
  assert.doesNotMatch(await page.locator(H + ' .body').textContent(), /\b(null|undefined|NaN)\b/);
  await shot('04-lista');
});

test('sessão encerrada durante o uso', async () => {
  await page.evaluate(() => window.__fixture.showLogin());
  await waitAttr('data-bnka-status', 'login');
  assert.match(await page.locator(H + ' .status').textContent(), /Sessão do Bitrix encerrada/);
  await page.goto(BASE + '/auth/');
  await waitAttr('data-bnka-status', 'login');
});

test('layout desconhecido, fora do CRM e página de detalhes', async () => {
  await page.goto(BASE + '/crm/novo/');
  await waitAttr('data-bnka-status', 'unknown');
  if (await page.locator(H + ' .panel').isHidden()) await page.locator(H + ' .fab').click();
  assert.match(await page.locator(H + ' .status').textContent(), /Layout não reconhecido/);
  await shot('05-layout-desconhecido');
  await page.goto(BASE + '/stream/');
  await waitAttr('data-bnka-status', 'not_crm');
  await page.goto(BASE + '/crm/deal/details/101/');
  await waitAttr('data-bnka-status', 'details');
});

test('iframes: lê o do mesmo domínio e não acessa o de outro domínio', async () => {
  await page.goto(BASE + '/crm/frames/');
  await waitAttr('data-bnka-status', 'ok', 10000);
  assert.equal(await page.locator(H).count(), 1);
  await page.locator(H + ' .tabs button', { hasText: 'Cobertura' }).click();
  const txt = await page.locator(H + ' .body').textContent();
  assert.match(txt, /Iframes: 2 encontrados · 1 lidos \(mesmo domínio\) · 1 inacessíveis/);
  await shot('06-cobertura-iframes');
});

test('recuperação após atualização da extensão (reinstalação da pasta via CDP)', async () => {
  await page.goto(KANBAN);
  await waitAttr('data-bnka-status', 'ok');
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-bnka-instance'));
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: EXT }); // equivale a "Atualizar" em chrome://extensions
  await page.waitForFunction((b) => {
    const inst = document.documentElement.getAttribute('data-bnka-instance');
    const host = document.querySelectorAll('#bnka-assistente-host');
    return inst && inst !== b && host.length === 1 && host[0].getAttribute('data-bnka-status') === 'ok';
  }, before, { timeout: 15000 });
  assert.equal(await page.locator(H).count(), 1);
  await shot('07-apos-atualizacao');
});

test('painel responsivo em tela estreita e minimizável', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  if (await page.locator(H + ' .panel').isHidden()) await page.locator(H + ' .fab').click();
  await page.locator(H + ' .tabs button', { hasText: 'Fila' }).click();
  const box = await page.locator(H + ' .panel').boundingBox();
  assert.equal(Math.round(box.width), 390);
  const overflow = await page.evaluate(() => {
    const body = document.querySelector('#bnka-assistente-host').shadowRoot.querySelector('.body');
    return body.scrollWidth - body.clientWidth;
  });
  assert.ok(overflow <= 1, 'rolagem horizontal no painel: ' + overflow);
  await shot('09-celular-390px');
  await page.keyboard.press('Escape');
  await page.locator(H + ' .fab').waitFor();
  await page.setViewportSize({ width: 1400, height: 900 });
});

test('nenhuma chamada externa feita pela extensão', async () => {
  const external = requests.filter((u) => !u.startsWith(BASE + '/') && !u.startsWith('chrome-extension://') && !u.startsWith('data:') && !u.startsWith('blob:'));
  // A única exceção esperada é o iframe de outro domínio que a PRÓPRIA página de teste contém.
  assert.deepEqual([...new Set(external)], ['https://outro-dominio.example/widget']);
  const srcDir = path.join(EXT, 'src');
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
  walk(srcDir);
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|navigator\.sendBeacon|importScripts\(/, f);
    assert.doesNotMatch(code, /document\.cookie|localStorage|sessionStorage/, f);
  }
  assert.deepEqual(consoleErrors.filter((e) => /bnka|Assistente|Illegal invocation/i.test(e)), []);
});

test('extensão desativada/recarregada sem reinjeção: painel antigo avisa e para de processar', async () => {
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await waitAttr('data-bnka-status', 'invalidated', 10000);
  if (await page.locator(H + ' .panel').isHidden()) await page.locator(H + ' .fab').click();
  assert.match(await page.locator(H + ' .status').textContent(), /atualizada, recarregada ou desativada/);
  await shot('08-extensao-invalidada');
});
