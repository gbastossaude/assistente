// Gera a prévia em arquivo único (dist/previa-painel.html): painel + motor + dados fictícios.
// Uso: node tools/build-preview.mjs <caminho-do-esbuild>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const esbuild = process.argv[2] || 'esbuild';
const js = execFileSync(esbuild, [path.join(root, 'tools/preview/entry.js'), '--bundle', '--format=esm', '--target=es2022', '--minify'], { encoding: 'utf8', maxBuffer: 50e6 });
const css = fs.readFileSync(path.join(root, 'ui/styles.css'), 'utf8');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'icons/icon48.png')).toString('base64');
let html = fs.readFileSync(path.join(root, 'ui/dashboard.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`)
  .replace('../icons/icon48.png', icon)
  .replace('<title>Monitor de SLA – Bitrix24</title>', '<title>Monitor de SLA – Prévia</title>')
  .replace('<script type="module" src="dashboard.js"></script>', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace('<main class="wrap" id="main">', `<div class="wrap" style="padding-bottom:0"><div class="banner warn" style="margin:0"><div class="small"><b>Prévia fora do Chrome.</b> Esta página simula a extensão com os dados fictícios da demonstração para visualização. Conexão real, notificações e o contador do ícone só funcionam com a extensão instalada.</div></div></div>\n  <main class="wrap" id="main">`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/previa-painel.html'), html);
console.log('dist/previa-painel.html', Math.round(html.length / 1024), 'KB');
