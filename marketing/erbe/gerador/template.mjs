// Template visual das artes da ERBE (identidade oficial): cada slide vira um HTML de
// 1080 px de largura, renderizado em JPG pelo gerar.mjs.

export const HANDLE = '@erbeprotecao';

// Cada pilar tem sua cor de "capa" (hero), como no material da marca:
// Seguros → off-white, Plano de Saúde → verde, Consórcio → preto.
export const PILARES = {
  seguros: { num: '01', label: 'Seguros', icone: 'shield', hero: 'light', stmt: 'dark', cta: 'light' },
  saude: { num: '02', label: 'Plano de Saúde', icone: 'pulse', hero: 'green', stmt: 'green', cta: 'green' },
  consorcio: { num: '03', label: 'Consórcio', icone: 'key', hero: 'dark', stmt: 'dark', cta: 'dark' },
  inst: { num: '', label: 'ERBE', icone: 'logo', hero: 'dark', stmt: 'dark', cta: 'light' },
};

const AVISO_CONSORCIO =
  'Administradoras autorizadas e fiscalizadas pelo Banco Central do Brasil. A ERBE atua como representante.';

const I = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  pulse: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/><path d="M6.5 12.5h3l1.3-2.3 2 4 1.3-1.7h3.4"/>',
  key: '<circle cx="15.5" cy="8.5" r="4.5"/><path d="M12.3 11.7L4 20M6.5 17.5l2 2M8.5 15.5l2 2"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  car: '<path d="M3 16v-4l2.2-5h13.6L21 12v4"/><path d="M3 12h18"/><path d="M3 16h18"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  building: '<path d="M5 21V3h10v18"/><path d="M15 9h4v12"/><path d="M3 21h18"/><path d="M8 7h4M8 11h4M8 15h4"/>',
  truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h5l3 3v4h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6l1-9z"/>',
  fire: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 3-5.6 3.6-9.3 2.6 1.5 3.6 3.6 3.6 5.6 1-.6 1.6-1.8 1.8-3 2.3 2 4 4.3 4 6.7 0 3.5-2.5 6.2-6.5 6.2z"/>',
  chat: '<path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h7"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c3 .2 5.5 2.4 5.5 5.8"/>',
};

export const icon = (n, size = 40, sw = 1.7) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

// Escudo da marca com o "E" vazado (recriação; trocar pelo arquivo oficial quando houver).
const ESCUDO = 'M201 0L403 61V247C403 382 300 457 201 499C102 457 0 382 0 247V61Z';
const VAZADO = '<rect x="118" y="144" width="320" height="36" fill="#000"/><rect x="325" y="144" width="120" height="176" fill="#000"/><rect x="118" y="284" width="320" height="36" fill="#000"/>';
const largura = (h) => Math.round((h * 403) / 499);
let uid = 0;
// Escudo oficial da ERBE com o "E" vazado (desenho em marca/logo-erbe-escudo-*.svg).
export function logoMark(cor, h = 46) {
  const id = `m${uid++}`;
  return `<svg width="${largura(h)}" height="${h}" viewBox="0 0 403 499"><defs><mask id="${id}"><rect x="-10" y="-10" width="460" height="520" fill="#fff"/>${VAZADO}</mask></defs>
    <path d="${ESCUDO}" fill="${cor}" mask="url(#${id})"/></svg>`;
}

// Versão em faixas do escudo, usada nas capas de cada pilar: topo, faixa do "E" e base em tons diferentes.
const FAIXAS = {
  light: ['#1A6A51', '#8CC7AE', '#E2E1DA'],
  green: ['#FFFFFF', 'rgba(255,255,255,.55)', 'rgba(255,255,255,.25)'],
  dark: ['#2A302D', '#F4F3EE', '#7DCBA7'],
};
function escudoFaixas(tema, h = 150) {
  const [a, b, c] = FAIXAS[tema];
  const m = `m${uid++}`;
  const cl = `c${uid++}`;
  return `<svg width="${largura(h)}" height="${h}" viewBox="0 0 403 499"><defs>
    <mask id="${m}"><rect x="-10" y="-10" width="460" height="520" fill="#fff"/>${VAZADO}</mask><clipPath id="${cl}"><path d="${ESCUDO}"/></clipPath></defs>
    <g clip-path="url(#${cl})" mask="url(#${m})"><rect width="403" height="499" fill="${c}"/><rect width="403" height="144" fill="${a}"/><rect y="144" width="403" height="176" fill="${b}"/></g></svg>`;
}

function css(fontsCss, w, h) {
  return `${fontsCss}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
.s{width:${w}px;height:${h}px;position:relative;overflow:hidden;display:flex;flex-direction:column;
  padding:84px 96px 72px;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.s.tall{padding:150px 96px 200px}
.light{background:#F4F3EE;color:#111513;--k:#1A6A51;--em:#1A6A51;--sub:#5E6460;--line:rgba(17,21,19,.13);--logo:#1A6A51;--dot:#111513;--tile:#DCEEE5;--tileic:#1A6A51;--btn:#EFC862;--btntx:#111513}
.dark{background:#0E1311;color:#F4F3EE;--k:#EFC862;--em:#7DCBA7;--sub:#A3AAA6;--line:rgba(244,243,238,.14);--logo:#F4F3EE;--dot:#EFC862;--tile:rgba(244,243,238,.07);--tileic:#7DCBA7;--btn:#EFC862;--btntx:#111513}
.green{background:#1A6A51;color:#FFFFFF;--k:#BFE6D3;--em:#BFE6D3;--sub:rgba(255,255,255,.8);--line:rgba(255,255,255,.2);--logo:#FFFFFF;--dot:#FFFFFF;--tile:rgba(255,255,255,.12);--tileic:#FFFFFF;--btn:#FFFFFF;--btntx:#111513}
.pink{--k:#C46A8A;--em:#C46A8A}
em{font-style:normal;color:var(--em)}
.hd{display:flex;justify-content:space-between;align-items:center}
.lg{display:flex;align-items:center;gap:16px;font-family:'Plus Jakarta Sans';font-weight:800;font-size:31px;letter-spacing:.2em}
.handle{font-size:25px;color:var(--sub);font-weight:500}
.main{flex:1;min-height:0;display:flex;flex-direction:column;padding-top:70px}
.main.center{justify-content:center;padding-top:0}
.fit{transform-origin:left top}
.ft{display:flex;justify-content:space-between;align-items:center;border-top:1.5px solid var(--line);padding-top:30px;font-size:24px;color:var(--sub);font-weight:500}
.dots{display:flex;align-items:center;gap:10px}
.dots i{width:9px;height:9px;border-radius:50%;background:var(--sub);opacity:.45}
.dots i.on{background:var(--dot);opacity:1}
.dots .ic{margin-left:22px;color:currentColor}
.pil{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:60px}
.pil .l{display:flex;align-items:center;gap:26px}
.tile{width:104px;height:104px;border-radius:24px;background:var(--tile);color:var(--tileic);display:grid;place-items:center}
.tile .ic{width:54px;height:54px}
.pil small{display:block;font-weight:700;font-size:22px;letter-spacing:.2em;color:var(--k);margin-bottom:6px}
.pil b{font-family:'Plus Jakarta Sans';font-weight:700;font-size:44px;letter-spacing:-.01em}
.k{font-weight:700;font-size:23px;letter-spacing:.2em;text-transform:uppercase;color:var(--k);margin-bottom:26px}
h1,h2{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;letter-spacing:-.035em;margin:0}
h1{font-size:100px;line-height:1.02}
h2{font-size:80px;line-height:1.06}
.body{font-size:39px;line-height:1.45;color:var(--sub);margin:34px 0 0;font-weight:400}
.note{font-size:24px;line-height:1.45;color:var(--sub);margin-top:30px}
.items{margin-top:50px;display:grid;grid-template-columns:1fr;column-gap:36px;border-top:1.5px solid var(--line)}
.items.cols{grid-template-columns:1fr 1fr}
.items div{display:flex;align-items:center;gap:20px;padding:26px 0;border-bottom:1.5px solid var(--line);font-size:34px;font-weight:500;line-height:1.3}
.items .ic{flex:none;color:var(--em);width:34px;height:34px}
.items .n{flex:none;font-family:'Plus Jakarta Sans';font-weight:700;color:var(--em);font-size:30px;width:44px}
.items .ic.x{color:#C0573E}
.dark .items .ic.x,.green .items .ic.x{color:#F09A82}
.facts{margin-top:46px;border-top:1.5px solid var(--line)}
.fact{display:flex;align-items:baseline;gap:30px;padding:30px 0;border-bottom:1.5px solid var(--line)}
.fact b{font-family:'Plus Jakarta Sans';font-weight:800;font-size:92px;line-height:1;color:var(--em);min-width:350px;letter-spacing:-.04em}
.fact span{font-size:34px;font-weight:500}
.myth{font-family:'Plus Jakarta Sans';font-weight:700;font-size:62px;line-height:1.1;letter-spacing:-.03em;color:var(--sub);opacity:.75;text-decoration:line-through;text-decoration-thickness:4px}
.tag{display:inline-block;font-weight:700;font-size:21px;letter-spacing:.2em;padding:12px 22px;border-radius:999px;background:var(--k);color:#fff;margin:56px 0 26px}
.dark .tag{color:#111513}
.truth{font-size:42px;line-height:1.4;font-weight:500}
table.cmp{width:100%;border-collapse:collapse;margin-top:46px;font-size:30px}
.cmp th{text-align:left;padding:0 20px 20px 0;font-weight:700;font-size:21px;letter-spacing:.18em;text-transform:uppercase;color:var(--k)}
.cmp td{padding:28px 20px 28px 0;border-top:1.5px solid var(--line);vertical-align:top;font-weight:600;line-height:1.3}
.cmp td:first-child{color:var(--sub);font-weight:400;width:30%}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:46px}
.card{border:1.5px solid var(--line);border-radius:24px;padding:34px}
.card.on{border-color:var(--em);border-width:2.5px}
.card b{display:block;font-family:'Plus Jakarta Sans';font-weight:700;font-size:38px;margin-bottom:12px}
.card p{margin:0;font-size:29px;line-height:1.4;color:var(--sub)}
.big{font-family:'Plus Jakarta Sans';font-weight:800;font-size:200px;line-height:.9;letter-spacing:-.05em;color:var(--em);margin-bottom:46px}
.steps{display:flex;gap:10px;margin-top:56px}
.steps i{height:6px;flex:1;border-radius:3px;background:var(--line)}
.steps i.on{background:var(--em)}
.box{display:flex;align-items:center;gap:22px;background:var(--btn);color:var(--btntx);border-radius:22px;padding:34px 38px;font-weight:700;font-size:34px;line-height:1.3;margin-top:56px}
.box .ic{flex:none;width:42px;height:42px}
.pill{display:flex;align-items:center;gap:30px;margin-top:56px}
.pill span{display:inline-flex;align-items:center;gap:16px;background:#EFC862;color:#111513;font-weight:700;font-size:33px;padding:26px 38px;border-radius:16px}
.pill small{font-size:27px;color:var(--sub);font-weight:500}
.pill .ic{width:34px;height:34px}
.aviso{font-size:21px;line-height:1.45;color:var(--sub);margin-top:30px;max-width:900px}
.icons{display:flex;gap:20px;margin-top:50px}
.icons span{width:96px;height:96px;border-radius:22px;background:var(--tile);color:var(--tileic);display:grid;place-items:center}
.icons .ic{width:48px;height:48px}
.line{margin-top:46px;padding-top:32px;border-top:1.5px solid var(--line);font-size:30px;font-weight:600;color:var(--em);display:flex;align-items:center;gap:16px}
.offers{display:flex;gap:24px;margin-top:52px}
.offer{flex:1;border-radius:24px;padding:36px 34px;border:1.5px solid var(--line)}
.offer.on{border:2.5px solid #EFC862}
.offer small{display:block;font-weight:700;font-size:21px;letter-spacing:.2em;color:var(--k);margin-bottom:24px;text-transform:uppercase}
.offer p{margin:0 0 12px;font-size:30px;font-weight:600}
.offer p span{color:var(--sub);font-weight:400}
.hero-shield{margin:10px 0 56px}
.wm{position:absolute;right:-110px;bottom:-70px;pointer-events:none;z-index:0}
.hd,.main,.ft{position:relative;z-index:1}
.tall h1{font-size:104px}
.tall .body{font-size:40px}
`;
}

const itens = (s) => {
  if (!s.items) return '';
  const mk = (i) =>
    s.marker === 'num' ? `<span class="n">${String(i + 1).padStart(2, '0')}</span>`
    : s.marker === 'x' ? icon('x', 34, 2.2).replace('class="ic"', 'class="ic x"')
    : icon(s.marker && I[s.marker] ? s.marker : 'check', 34, 2);
  return `<div class="items${s.cols ? ' cols' : ''}">${s.items.map((t, i) => `<div>${mk(i)}<span>${t}</span></div>`).join('')}</div>`;
};
const k = (t) => (t ? `<div class="k">${t}</div>` : '');
const p = (t, c = 'body') => (t ? `<p class="${c}">${t}</p>` : '');

function chamada(s) {
  if (s.box) return `<div class="box">${icon('chat', 42, 2)}<span>${s.box}</span></div>`;
  return `<div class="pill"><span>${s.button || 'Fale com a ERBE'} ${icon('arrow', 34, 2.2)}</span><small>${s.note ?? 'Link na bio'}</small></div>`;
}

function linhaPilar(post, tema) {
  const pil = PILARES[post.pilar];
  if (post.pilar === 'inst') return '';
  return `<div class="pil"><div class="l"><div class="tile">${icon(pil.icone, 54, 1.6)}</div><div><small>PILAR ${pil.num}</small><b>${pil.label}</b></div></div>${escudoFaixas(tema, 150)}</div>`;
}

function corpo(post, s, tema) {
  const aviso = post.pilar === 'consorcio' && ['cta', 'poster', 'reel'].includes(s.t) ? p(AVISO_CONSORCIO, 'aviso') : '';
  switch (s.t) {
    case 'cover':
      return `${post.pilar === 'inst' ? `<div class="hero-shield">${logoMark(tema === 'light' ? '#1A6A51' : '#F4F3EE', 170)}</div>` : linhaPilar(post, tema)}${k(s.kicker)}<h1>${s.title}</h1>${p(s.sub)}`;
    case 'reel':
      return `<div class="hero-shield">${post.pilar === 'inst' ? logoMark('#F4F3EE', 200) : escudoFaixas(tema, 190)}</div>
        ${k(s.kicker || (post.pilar === 'inst' ? 'ERBE' : `Pilar ${PILARES[post.pilar].num} · ${PILARES[post.pilar].label}`))}<h1>${s.title}</h1>${p(s.sub)}${aviso}`;
    case 'text':
    case 'list':
      return `${k(s.kicker)}<h2>${s.title}</h2>${p(s.body)}${itens(s)}${p(s.note, 'note')}`;
    case 'facts':
      return `${k(s.kicker)}<h2>${s.title}</h2><div class="facts">${s.facts.map(([n, l]) => `<div class="fact"><b>${n}</b><span>${l}</span></div>`).join('')}</div>${p(s.note, 'note')}`;
    case 'myth':
      return `${k(s.kicker)}<div class="myth">${s.myth}</div><div><span class="tag">VERDADE</span></div><div class="truth">${s.truth}</div>`;
    case 'compare':
      return `${k(s.kicker)}<h2>${s.title}</h2><table class="cmp"><tr><th></th><th>${s.heads[0]}</th><th>${s.heads[1]}</th></tr>${s.rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table>${p(s.note, 'note')}`;
    case 'cards':
      return `${k(s.kicker)}<h2>${s.title}</h2><div class="cards">${s.cards.map((c, i) => `<div class="card${i === 1 ? ' on' : ''}"><b>${c[0]}</b><p>${c[1]}</p></div>`).join('')}</div>${p(s.note, 'note')}`;
    case 'step':
      return `<div class="big">${String(s.n).padStart(2, '0')}</div>${k(s.kicker)}<h2>${s.title}</h2>${p(s.body)}<div class="steps">${Array.from({ length: s.total }, (_, i) => `<i class="${i < s.n ? 'on' : ''}"></i>`).join('')}</div>`;
    case 'statement':
      return `${k(s.kicker)}<h1 style="font-size:${s.big ? 96 : 86}px">${s.title}</h1>${p(s.body)}`;
    case 'cta':
      return `${k(s.kicker || 'Próximo passo')}<h1 style="font-size:90px">${s.title}</h1>${p(s.body)}${chamada(s)}${aviso}`;
    case 'poster':
      return `${linhaPilar(post, tema)}${k(s.kicker)}<h1 style="font-size:${s.size || 92}px">${s.title}</h1>${p(s.body)}
        ${s.icons ? `<div class="icons">${s.icons.map((n) => `<span>${icon(n, 48, 1.6)}</span>`).join('')}</div>` : ''}
        ${s.line ? `<div class="line">${icon('arrow', 32, 2)}<span>${s.line}</span></div>` : ''}${aviso}`;
    case 'offers':
      return `${linhaPilar(post, tema)}${k(s.kicker)}<h1 style="font-size:84px">${s.title}</h1>
        <div class="offers">${s.offers.map((o, i) => `<div class="offer${i === 1 ? ' on' : ''}"><small>${o.h}</small>${o.l.map((x) => `<p>${x}</p>`).join('')}</div>`).join('')}</div>${p(s.body)}
        ${s.line ? `<div class="line">${icon('arrow', 32, 2)}<span>${s.line}</span></div>` : ''}`;
    case 'story':
      return `${k(s.kicker)}<h1 style="font-size:${s.size || 100}px">${s.title}</h1>${p(s.body)}${itens(s)}
        ${s.icons ? `<div class="icons">${s.icons.map((n) => `<span>${icon(n, 48, 1.6)}</span>`).join('')}</div>` : ''}`;
    default:
      throw new Error('tipo de slide desconhecido: ' + s.t);
  }
}

function temaDo(post, s) {
  if (s.theme) return s.theme;
  const pil = PILARES[post.pilar];
  if (['cover', 'reel', 'poster', 'offers'].includes(s.t)) return pil.hero;
  if (s.t === 'statement') return pil.stmt;
  if (s.t === 'cta') return pil.cta;
  return 'light';
}

export function html(post, s, idx, total, fontsCss) {
  const tall = post.formato === 'Reels' || post.formato === 'Story';
  const w = 1080;
  const h = tall ? 1920 : 1350;
  const tema = temaDo(post, s);
  const ultimo = idx === total - 1;
  const frase = s.rodape || (total === 1 || ultimo ? 'Proteger o que continua.' : idx === 0 ? 'Arraste para continuar' : 'A gente estuda antes de indicar.');
  const pontos = total > 1
    ? `<div class="dots">${Array.from({ length: total }, (_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}${ultimo ? '' : icon('arrow', 30, 2)}</div>`
    : '';
  const centro = !tall && !['cover', 'poster', 'offers'].includes(s.t);
  const wmCor = tema === 'light' ? '#1A6A51' : tema === 'green' ? '#FFFFFF' : '#F4F3EE';
  const wmOp = tema === 'light' ? 0.035 : tema === 'green' ? 0.07 : 0.045;
  const marca = `<div class="wm" style="opacity:${wmOp}">${logoMark(wmCor, tall ? 820 : 640)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(fontsCss, w, h)}</style></head><body>
<div class="s ${tema} ${tall ? 'tall' : ''} ${s.pink ? 'pink' : ''}">
${s.t === 'story' ? '' : marca}
<div class="hd"><div class="lg">${logoMark(tema === 'light' ? '#1A6A51' : tema === 'green' ? '#FFFFFF' : '#F4F3EE', 46)}ERBE</div><div class="handle">${HANDLE}</div></div>
<div class="main${centro ? ' center' : ''}"><div class="fit">${corpo(post, s, tema)}</div></div>
${tall ? '' : `<div class="ft"><span>${frase}</span>${pontos}</div>`}
</div></body></html>`;
}
