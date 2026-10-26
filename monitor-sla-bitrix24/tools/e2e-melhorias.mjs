// Teste ponta a ponta das melhorias da versão 1.5 (extensão carregada no Chromium, demonstração com
// dados FICTÍCIOS): comercial em coluna própria (quem abriu o card), data de criação e idade, valores nas
// etapas e ranking automático de reuniões. Uso: node tools/e2e-melhorias.mjs <pasta-de-saída>
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || './e2e-out');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ' — ' + detail : ''}`); };
const brl = t => Number(String(t).replace(/[^\d,]/g, '').replace(',', '.')) || 0;

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'ext-')), {
  channel: 'chromium', headless: true, viewport: { width: 1040, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  acceptDownloads: true, args: [`--disable-extensions-except=${src}`, `--load-extension=${src}`]
});
const errors = [];
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // 1040 px = largura da gaveta dentro do Bitrix
  await page.goto(`chrome-extension://${id}/ui/dashboard.html?embed=1`);
  await page.click('text=Ver demonstração com dados fictícios');
  await page.waitForSelector('.qrow', { timeout: 30000 });

  // --- comercial em coluna própria
  const cols = await page.locator('.qcols').innerText();
  check('Fila tem colunas separadas de Responsável e Comercial (abriu o card)', /Responsável/.test(cols) && /Comercial \(abriu o card\)/.test(cols), cols.replace(/\s+/g, ' '));
  const pairs = await page.locator('.qrow .qhead').evaluateAll(rows => rows.map(r => [r.querySelector('.c-resp div')?.textContent, r.querySelector('.c-com div')?.textContent]));
  check('Cada card mostra o comercial (quem abriu o card)', pairs.length > 5 && pairs.every(([, c]) => c && c !== 'Sem comercial'), `${pairs.length} cards`);
  check('Responsável e comercial podem ser pessoas diferentes', pairs.some(([r, c]) => r !== c), pairs.find(([r, c]) => r !== c)?.join(' × '));
  const comVisible = await page.locator('.qrow .c-com').first().isVisible();
  check('Coluna do comercial visível na largura da gaveta (1040 px)', comVisible);

  // --- data de criação e idade
  const created = await page.locator('.qrow .sub.created').allInnerTexts();
  check('Cada card mostra data de criação e há quantos dias foi criado',
    created.length === pairs.length && created.every(t => /^Criado em \d{2}\/\d{2}\/\d{4} · (criado hoje|há 1 dia|há \d+ dias)$/.test(t.trim())), created[0]);
  const hotel = await page.locator('.qrow', { hasText: 'Hotel Mirante' }).locator('.sub.created').innerText();
  check('Idade calculada corretamente (Hotel Mirante criado há 30 dias)', /há 30 dias/.test(hotel), hotel);
  await page.selectOption('[data-sort]', 'antigos');
  const firstAges = (await page.locator('.qrow .sub.created b').allInnerTexts()).map(t => (t.match(/\d+/) || [0])[0] * 1);
  check('Ordenar por "criados há mais tempo"', firstAges.every((v, i) => i === 0 || firstAges[i - 1] >= v), firstAges.slice(0, 6).join(', '));
  await page.selectOption('[data-sort]', 'prioridade');
  await page.locator('.qrow .qhead').first().click();
  const det = await page.locator('.qdetail').first().innerText();
  check('Detalhe do card traz "Criado em" e o comercial', /Criado em/.test(det) && /quem abriu o card/.test(det));
  await page.screenshot({ path: path.join(out, 'M1-fila-comercial-criacao.png') });

  // --- mini ranking no painel
  check('Painel mostra o ranking de reuniões do mês', await page.isVisible('h2:has-text("Ranking de reuniões")'));

  // --- valores nas etapas
  await page.click('#tabs button[data-tab="etapas"]');
  await page.waitForSelector('.flow');
  const steps = await page.locator('.flowstep').evaluateAll(els => els.map(e => [e.querySelector('.fname').textContent, e.querySelector('.fnum').textContent, e.querySelector('.fval')?.textContent]));
  check('Fluxo das etapas mostra o valor de cada etapa', steps.every(s => /R\$|sem valor/.test(s[2] || '')) && steps.filter(s => /R\$\s?[1-9]/.test(s[2])).length >= 5,
    steps.map(s => s.join(' ')).join(' | '));
  const stage = page.locator('details.stage', { hasText: 'Em cotação' }).first();
  const pill = await stage.locator('summary .pill', { hasText: 'Valor:' }).innerText();
  const cells = await stage.locator('td[data-l="Valor"]').allInnerTexts();
  const sum = cells.reduce((a, t) => a + brl(t), 0);
  check('Valor da etapa = soma dos valores dos cards dela', Math.abs(brl(pill.split('·')[0]) - sum) < 1, `${pill} = ${sum}`);
  const head = await stage.locator('thead').innerText();
  check('Tabela da etapa tem Responsável, Comercial, Criado em e Valor', ['Responsável', 'Comercial', 'Criado em', 'Valor'].every(h => head.includes(h)), head.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(out, 'M2-etapas-valores.png') });

  // --- ranking de reuniões
  await page.click('#tabs button[data-tab="reunioes"]');
  await page.waitForSelector('table.rank');
  await page.click('button[data-act="mt-period"][data-v="30d"]');
  const first = await page.locator('table.rank tbody tr').first().innerText();
  check('Ranking (últimos 30 dias) liderado por quem mais realizou reuniões', /1º/.test(first) && /Bruno Teixeira/.test(first) && /\b5\b/.test(first), first.replace(/\s+/g, ' '));
  const kpis = (await page.locator('.kpis').innerText()).replace(/\s+/g, ' ');
  check('Totais do período: realizadas, agendadas e pendentes', /Reuniões realizadas 10/.test(kpis) && /Pendentes 1/.test(kpis), kpis.slice(0, 120));
  await page.screenshot({ path: path.join(out, 'M3-ranking-reunioes.png'), fullPage: true });
  await page.selectOption('select[data-act="mt-group"]', 'responsavel_reuniao');
  const byResp = await page.locator('table.rank tbody tr').first().innerText();
  check('Agrupar por responsável pela reunião', /Bruno Teixeira/.test(byResp) && /\b4\b/.test(byResp), byResp.replace(/\s+/g, ' '));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="mt-csv"]')]);
  const csvPath = path.join(out, 'ranking-reunioes.csv');
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  check('Exportação CSV do ranking (sem células de fórmula)', csv.startsWith('﻿Posição;') && csv.split('\r\n').slice(1).every(l => l.split(';').every(c => !/^[=+\-@]/.test(c))), csv.split('\r\n')[1]);

  // --- configuração: sem cards encerrados o total muda (recalculado sem nova consulta)
  await page.click('#tabs button[data-tab="config"]');
  await page.click('button[data-cfg="reunioes"]');
  await page.uncheck('input[data-bind="meetings.includeClosed"]');
  await page.click('.savebar button[data-act="save"]');
  await page.waitForTimeout(1200);
  await page.click('#tabs button[data-tab="reunioes"]');
  await page.click('button[data-act="mt-period"][data-v="30d"]');
  const k2 = (await page.locator('.kpis').innerText()).replace(/\s+/g, ' ');
  check('Configuração "contar cards ganhos/perdidos" altera o ranking', /Reuniões realizadas 7/.test(k2), k2.slice(0, 60));
  await page.screenshot({ path: path.join(out, 'M4-config-reunioes.png') });

  check('Sem erros de console', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Execução sem exceções', false, e.message.split('\n')[0]);
} finally {
  await ctx.close();
}
const ok = results.filter(r => r.ok).length;
console.log(`\n${ok}/${results.length} verificações OK`);
fs.writeFileSync(path.join(out, 'resultado-e2e-melhorias.json'), JSON.stringify(results, null, 2));
process.exit(ok === results.length ? 0 : 1);
