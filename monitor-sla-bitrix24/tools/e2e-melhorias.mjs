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

  // --- assessor e comercial em colunas próprias; comercial pelo e-mail do especialista
  const cols = await page.locator('.qcols').innerText();
  check('Fila tem colunas separadas de Assessor e Comercial', /Assessor/.test(cols) && /Comercial/.test(cols) && !/Responsável/.test(cols), cols.replace(/\s+/g, ' '));
  const rowsInfo = await page.locator('.qrow .qhead').evaluateAll(rows => rows.map(r => ({
    assessor: r.querySelector('.c-resp div')?.textContent, com: r.querySelector('.c-com div')?.textContent, origem: r.querySelector('.c-com .sub')?.textContent })));
  const viaEmail = rowsInfo.filter(r => /@/.test(r.origem || ''));
  check('Comercial com e-mail do especialista mostra nome e sobrenome tirados do e-mail',
    viaEmail.length > 3 && viaEmail.every(r => {
      const [local] = r.origem.split('@');
      const esperado = local.split(/[._-]+/).map((p, i) => (i && ['da', 'de', 'do', 'das', 'dos', 'e'].includes(p) ? p : p[0].toUpperCase() + p.slice(1))).join(' ');
      return r.com === esperado;
    }), viaEmail.slice(0, 2).map(r => `${r.origem} → ${r.com}`).join(' | '));
  check('Sem e-mail do especialista, o comercial é quem abriu o card', rowsInfo.some(r => r.origem === 'abriu o card'), `${rowsInfo.filter(r => r.origem === 'abriu o card').length} card(s)`);
  check('Assessor e comercial podem ser pessoas diferentes', rowsInfo.some(r => r.assessor !== r.com));
  check('Coluna do comercial visível na largura da gaveta (1040 px)', await page.locator('.qrow .c-com').first().isVisible());

  // --- pós-venda e expediente fora
  const allText = await page.locator('#main').innerText();
  check('Funil "Pós-venda" excluído (nenhum card dele aparece)', !/Pós-venda — Empresa Fictícia F/.test(allText));
  check('Sem horário comercial: nenhum tempo em "úteis"', !/úteis/.test(allText));
  check('Sem aviso de confirmação de expediente', !/Confirme o expediente/.test(allText));

  // --- data de criação, ordem padrão por criação e inversão
  const created = await page.locator('.qrow .sub.created').allInnerTexts();
  check('Cada card mostra data de criação e há quantos dias foi criado',
    created.length === rowsInfo.length && created.every(t => /^Criado em \d{2}\/\d{2}\/\d{4} · (criado hoje|há 1 dia|há \d+ dias)$/.test(t.trim())), created[0]);
  const hotel = await page.locator('.qrow', { hasText: 'Hotel Mirante' }).locator('.sub.created').innerText();
  check('Idade calculada corretamente (Hotel Mirante criado há 30 dias)', /há 30 dias/.test(hotel), hotel);
  const idades = async () => (await page.locator('.qrow .sub.created b').allInnerTexts()).map(t => /hoje/.test(t) ? 0 : Number((t.match(/\d+/) || [0])[0]));
  const a1 = await idades();
  check('Ordem padrão: data de criação, mais antigos primeiro', a1.every((v, i) => i === 0 || a1[i - 1] >= v) && a1[0] > a1[a1.length - 1], a1.slice(0, 6).join(', '));
  await page.click('button[data-act="ordem"]');
  const a2 = await idades();
  check('Botão inverte: mais recentes primeiro', a2.every((v, i) => i === 0 || a2[i - 1] <= v), a2.slice(0, 6).join(', '));
  await page.reload();
  await page.waitForSelector('.qrow');
  const a3 = await idades();
  check('A ordem escolhida é lembrada ao reabrir o painel', a3[0] <= a3[a3.length - 1] && /Mais recentes primeiro/.test(await page.locator('button[data-act="ordem"]').innerText()));
  await page.click('button[data-act="ordem"]'); // volta para mais antigos primeiro
  await page.locator('.qrow .qhead').first().click();
  const det = await page.locator('.qdetail').first().innerText();
  check('Detalhe do card traz "Criado em", assessor e comercial', /Criado em/.test(det) && /Assessor/.test(det) && /Comercial/.test(det));
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
  check('Tabela da etapa tem Assessor, Comercial, Criado em e Valor', ['Assessor', 'Comercial', 'Criado em', 'Valor'].every(h => head.includes(h)), head.replace(/\s+/g, ' '));
  const datas = await stage.locator('td[data-l="Criado em"]').evaluateAll(tds => tds.map(td => td.firstChild.textContent.trim().split('/').reverse().join('')));
  check('Cards de cada etapa em ordem de criação', datas.every((d, i) => i === 0 || datas[i - 1] <= d), datas.join(' '));
  const etapasTxt = await page.locator('#main').innerText();
  check('Etapas não mostram o funil Pós-venda', !/Solicitação de pós-venda/.test(etapasTxt));
  await page.screenshot({ path: path.join(out, 'M2-etapas-valores.png') });

  // --- ranking de reuniões
  await page.click('#tabs button[data-tab="reunioes"]');
  await page.waitForSelector('table.rank');
  await page.click('button[data-act="mt-period"][data-v="30d"]');
  const rank = await page.locator('table.rank tbody tr').evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim())));
  const soma = rank.reduce((n, r) => n + Number(r[2]), 0);
  const rafael = rank.find(r => r[1] === 'Rafael Dias');
  check('Ranking por comercial usa o nome tirado do e-mail do especialista', /1º/.test(rank[0][0]) && rafael && Number(rafael[2]) >= 2 && soma === 10,
    rank.map(r => `${r[0]} ${r[1]} ${r[2]}`).join(' | '));
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

  // --- estudo de concluídos e cancelados
  await page.click('#tabs button[data-tab="painel"]');
  await page.waitForSelector('.qrow');
  const mini = (await page.locator('.panel', { hasText: 'Encerrados · últimos 30 dias' }).innerText()).replace(/\s+/g, ' ');
  check('Painel mostra concluídos e cancelados dos últimos 30 dias', /5 concluídos 6 cancelados 45% taxa de conclusão/.test(mini), mini.slice(0, 120));
  await page.click('#tabs button[data-tab="encerrados"]');
  await page.click('button[data-act="cs-period"][data-v="180d"]');
  const ck = (await page.locator('.kpis').innerText()).replace(/\s+/g, ' ');
  check('Estudo (180 dias): 6 concluídos, 7 cancelados, taxa 46%', /Concluídos 6/.test(ck) && /Cancelados 7/.test(ck) && /Taxa de conclusão 46%/.test(ck), ck.slice(0, 160));
  const onde = await page.locator('.panel', { hasText: 'Onde os cards foram cancelados' }).innerText();
  const motivos = await page.locator('.panel', { hasText: 'Motivos dos cancelamentos' }).innerText();
  check('Mostra em que etapa os cards foram cancelados e os motivos', /Aguardando retorno da operadora\s*2/.test(onde) && /Preço/.test(motivos) && /Rede credenciada/.test(motivos));
  const linhas = await page.locator('section.panel:has(h2:has-text("Cards encerrados")) tbody tr').count();
  await page.selectOption('select[data-act="cs-type"]', 'cancelado');
  const soCanc = await page.locator('section.panel:has(h2:has-text("Cards encerrados")) tbody tr').count();
  check('Lista dos encerrados com filtro por situação', linhas === 13 && soCanc === 7, `${linhas} encerrados, ${soCanc} cancelados`);
  const resumo = await page.locator('.summary').first().innerText();
  check('Resumo do estudo com fatos calculados', /13 cards encerrados: 6 concluídos e 7 cancelados/.test(resumo), resumo.split('\n')[0]);
  await page.screenshot({ path: path.join(out, 'M5-concluidos-cancelados.png'), fullPage: true });
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="cs-csv"]')]);
  const csv2Path = path.join(out, 'concluidos-cancelados.csv');
  await dl2.saveAs(csv2Path);
  const csv2 = fs.readFileSync(csv2Path, 'utf8').split('\r\n').filter(Boolean);
  check('Exportação CSV dos encerrados', csv2.length === 8 && csv2[0].startsWith('\uFEFFID;Card;Situação') && csv2.slice(1).every(l => /;Cancelado;/.test(l)), csv2[1]?.slice(0, 90));
  const enc = async () => (await page.locator('section.panel:has(h2:has-text("Cards encerrados")) tbody tr td:nth-child(8)').allInnerTexts()).map(d => d.split('/').reverse().join(''));
  const e1 = await enc();
  await page.click('button[data-act="ordem"]');
  const e2 = await enc();
  check('Lista de encerrados segue o botão inverter (antigos ↔ recentes)', e1.every((d, i) => !i || e1[i - 1] <= d) && e2.every((d, i) => !i || e2[i - 1] >= d), `${e1[0]} … / ${e2[0]} …`);
  await page.click('button[data-act="ordem"]');
  await page.selectOption('select[data-act="cs-type"]', '');

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
