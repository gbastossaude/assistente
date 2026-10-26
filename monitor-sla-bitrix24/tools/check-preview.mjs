// Abre a prévia em arquivo único num Chromium comum e verifica se o painel renderiza.
import { chromium } from 'playwright';
import path from 'node:path';
const file = path.resolve(process.argv[2] || 'dist/previa-painel.html');
const out = process.argv[3];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + file);
await p.waitForSelector('.qrow', { timeout: 30000 });
console.log('cards na fila:', await p.locator('.qrow').count(), '| erros:', errs.length ? errs : 'nenhum');
if (out) await p.screenshot({ path: out });
await b.close();
