// Gera as artes (PNG) e as legendas dos posts da ERBE.
// Uso: node gerar.mjs            -> todos os posts
//      node gerar.mjs 02 15      -> apenas os posts informados
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { posts } from './conteudo.mjs';
import { html } from './template.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const saida = join(aqui, '..', 'artes');

function carregarPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const global = execSync('npm root -g').toString().trim();
    return createRequire(join(global, 'noop.js'))('playwright');
  }
}

// Fontes embutidas em base64 para a renderização não depender de rede.
const fontesDir = join(aqui, 'fonts');
const fontsCss = readFileSync(join(fontesDir, 'local.css'), 'utf8').replace(/url\(([^)]+\.woff2)\)/g, (_, f) =>
  `url(data:font/woff2;base64,${readFileSync(join(fontesDir, f)).toString('base64')})`,
);

const filtro = process.argv.slice(2);
const alvo = filtro.length ? posts.filter((p) => filtro.includes(p.n)) : posts;

const { chromium } = carregarPlaywright();
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ deviceScaleFactor: 1 });
const avisos = [];

for (const post of alvo) {
  const pasta = join(saida, `${post.n}-${post.slug}`);
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });
  const tall = post.formato === 'Reels' || post.formato === 'Story';
  await page.setViewportSize({ width: 1080, height: tall ? 1920 : 1350 });

  for (const [i, s] of post.slides.entries()) {
    await page.setContent(html(post, s, i, post.slides.length, fontsCss), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Reduz o conteúdo proporcionalmente se ele não couber na área útil.
    const zoom = await page.evaluate(() => {
      const main = document.querySelector('.main');
      const fit = document.querySelector('.fit');
      let z = 1;
      const cabe = () =>
        fit.getBoundingClientRect().height <= main.clientHeight + 1 && fit.scrollWidth <= main.clientWidth / z + 1;
      while (!cabe() && z > 0.6) {
        z -= 0.02;
        fit.style.zoom = z;
      }
      return z;
    });
    if (zoom < 0.9) avisos.push(`${post.n} slide ${i + 1}: texto reduzido para ${Math.round(zoom * 100)}%`);
    const nome = post.slides.length === 1 ? (post.formato === 'Reels' ? 'capa-reels.jpg' : 'arte.jpg')
      : post.formato === 'Story' ? `story-${String(i + 1).padStart(2, '0')}.jpg`
      : `slide-${String(i + 1).padStart(2, '0')}.jpg`;
    await page.screenshot({ path: join(pasta, nome), type: 'jpeg', quality: 95 });
  }
  writeFileSync(join(pasta, 'legenda.txt'), textoLegenda(post));
  console.log(`✓ ${post.n} ${post.slug} (${post.slides.length})`);
}
await browser.close();

if (!filtro.length) writeFileSync(join(aqui, '..', '02-legendas-outubro-2026.md'), markdownLegendas(posts));
if (avisos.length) console.log('\nAvisos:\n' + avisos.join('\n'));

function textoLegenda(p) {
  const partes = [];
  if (p.legenda) partes.push(p.legenda.trim(), '', p.hashtags.join(' '));
  if (p.telas) partes.push('', '---', 'TEXTO NA TELA (Reels):', ...p.telas.map((t, i) => `${i + 1}. ${t}`));
  if (p.stickers) partes.push(...(p.legenda ? ['', '---'] : []), 'STICKERS (Stories):', ...p.stickers.map((t) => `• ${t}`));
  return partes.join('\n') + '\n';
}

function markdownLegendas(lista) {
  const linhas = [
    '# ERBE — Artes e legendas · outubro de 2026',
    '',
    'Artes em JPG de alta qualidade em `artes/<nº>-<tema>/` (feed 1080×1350, Reels e Stories 1080×1920). Cada pasta tem um `legenda.txt` pronto para copiar.',
    'Para alterar um texto, edite `gerador/conteudo.mjs` e rode `node gerador/gerar.mjs <nº>`.',
    '',
  ];
  for (const p of lista) {
    const pasta = `artes/${p.n}-${p.slug}`;
    linhas.push(`## ${p.n} · ${p.data} · ${p.titulo}`, '', `**${p.formato}** · ${p.pilarNome} · Funil: ${p.funil} · Pasta: \`${pasta}/\``, '');
    const prim = p.slides.length === 1 ? (p.formato === 'Reels' ? 'capa-reels.jpg' : 'arte.jpg') : p.formato === 'Story' ? 'story-01.jpg' : 'slide-01.jpg';
    linhas.push(`![${p.titulo}](${pasta}/${prim})`, '');
    if (p.legenda) linhas.push('**Legenda:**', '', '```', p.legenda.trim(), '', p.hashtags.join(' '), '```', '');
    if (p.telas) linhas.push('**Texto na tela (Reels):**', '', ...p.telas.map((t, i) => `${i + 1}. ${t}`), '');
    if (p.stickers) linhas.push('**Stickers (Stories):**', '', ...p.stickers.map((t) => `- ${t}`), '');
  }
  return linhas.join('\n');
}
