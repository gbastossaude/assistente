// Template visual das artes da ERBE: cada slide vira um HTML de 1080 px de largura,
// renderizado em PNG pelo gerar.mjs.

export const PILARES = {
  saude: { label: 'Planos de Saúde', cor: '#7FA99B' },
  seguros: { label: 'Seguros', cor: '#6F93C9' },
  consorcio: { label: 'Consórcio', cor: '#C9A96E' },
  inst: { label: 'ERBE', cor: '#C9A96E' },
};

const I = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  car: '<path d="M3 16v-4l2.2-5h13.6L21 12v4"/><path d="M3 12h18"/><path d="M3 16h18"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  building: '<path d="M5 21V3h10v18"/><path d="M15 9h4v12"/><path d="M3 21h18"/><path d="M8 7h4M8 11h4M8 15h4"/>',
  truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h5l3 3v4h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
  bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6l1-9z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  ribbon: '<path d="M12 3.5c-2 0-3.4 1.5-3.4 3.4 0 2.3 3.4 6.6 3.4 6.6s3.4-4.3 3.4-6.6c0-1.9-1.4-3.4-3.4-3.4z"/><path d="M10 10.5L6 21l3-1.6 1.7 2.6 2.3-7.6"/><path d="M14 10.5l4 10.5-3-1.6-1.7 2.6-2.3-7.6"/>',
  fire: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 3-5.6 3.6-9.3 2.6 1.5 3.6 3.6 3.6 5.6 1-.6 1.6-1.8 1.8-3 2.3 2 4 4.3 4 6.7 0 3.5-2.5 6.2-6.5 6.2z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h7"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c3 .2 5.5 2.4 5.5 5.8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
};

export const icon = (n, size = 44) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

const esc = (s = '') => String(s); // os textos do conteudo.mjs já vêm com o HTML desejado (<em>, <br>)

function css(fontsCss, w, h) {
  return `${fontsCss}
:root{--navy:#0E1B2E;--navy2:#16294A;--off:#F6F3EE;--gold:#C9A96E;--gold-d:#9C7A3F;--ink:#2B2F36;--muted:#5A5F68}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#000}
.s{width:${w}px;height:${h}px;position:relative;overflow:hidden;display:flex;flex-direction:column;
  padding:84px 92px 76px;font-family:Manrope,sans-serif;-webkit-font-smoothing:antialiased}
.s.tall{padding:230px 96px 250px}
.dark{background:radial-gradient(120% 85% at 88% 6%,#1B3157 0%,#0E1B2E 52%,#091321 100%);color:var(--off);--acc:var(--gold);--sub:rgba(246,243,238,.74);--line:rgba(246,243,238,.14);--card:rgba(255,255,255,.05)}
.light{background:var(--off);color:var(--ink);--acc:var(--gold-d);--sub:var(--muted);--line:rgba(14,27,46,.12);--card:#fff}
.light h1,.light h2,.light h3{color:var(--navy)}
.pink{--acc:#E7A3B8}
em{font-style:normal;color:var(--acc)}
.arc{position:absolute;pointer-events:none;z-index:0}
.top,.main,.foot{position:relative;z-index:1}
.top{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:21px;letter-spacing:.16em;text-transform:uppercase}
.tag{display:flex;align-items:center;gap:14px}
.tag i{width:14px;height:14px;border-radius:50%;background:var(--pc)}
.count{color:var(--sub);font-variant-numeric:tabular-nums;margin-left:10px;padding-left:24px;border-left:1.5px solid var(--line)}
.main{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
.fit{transform-origin:left center}
.foot{display:flex;justify-content:space-between;align-items:flex-end}
.brand{font-family:Fraunces,serif;font-weight:600;font-size:32px;letter-spacing:.2em;line-height:1}
.brand small{display:block;font-family:Manrope;font-size:13px;letter-spacing:.3em;font-weight:700;color:var(--sub);margin-top:9px}
.swipe{display:flex;align-items:center;gap:12px;font-weight:700;font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc)}
h1{font-family:Fraunces,serif;font-weight:600;font-size:98px;line-height:1.04;letter-spacing:-.02em;margin:0}
h2{font-family:Fraunces,serif;font-weight:600;font-size:70px;line-height:1.08;letter-spacing:-.015em;margin:0}
h3{font-family:Fraunces,serif;font-weight:600;font-size:46px;line-height:1.15;margin:0}
.sub{font-size:34px;line-height:1.4;font-weight:500;color:var(--sub);margin-top:40px;max-width:820px}
.kicker{display:flex;align-items:center;gap:18px;font-weight:800;font-size:21px;letter-spacing:.18em;text-transform:uppercase;color:var(--acc);margin-bottom:34px}
.kicker:before{content:"";width:52px;height:2px;background:var(--acc)}
.body{font-size:38px;line-height:1.46;font-weight:500;color:var(--sub);margin:36px 0 0}
.note{font-size:26px;line-height:1.4;color:var(--sub);margin-top:30px;font-weight:500}
ul.items{list-style:none;padding:0;margin:44px 0 0;display:flex;flex-direction:column;gap:20px}
ul.items li{display:flex;gap:26px;align-items:center;font-weight:600;font-size:36px;line-height:1.3;padding:28px 32px;background:var(--card);border:1px solid var(--line);border-radius:22px}
ul.items.cols{display:grid;grid-template-columns:1fr 1fr}
ul.items.cols li{font-size:32px}
.mk{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--navy);color:var(--gold);font-family:Fraunces;font-weight:600;font-size:26px}
.dark .mk{background:var(--gold);color:var(--navy)}
.mk.x{background:#E9E2D6;color:#8A5A44}
.mk .ic{width:30px;height:30px;stroke-width:2.2}
.facts{margin-top:40px;display:flex;flex-direction:column}
.fact{display:flex;align-items:baseline;gap:36px;padding:30px 0;border-top:1px solid var(--line)}
.fact:last-child{border-bottom:1px solid var(--line)}
.fact b{font-family:Fraunces;font-weight:600;font-size:96px;line-height:1;color:var(--acc);min-width:330px;letter-spacing:-.02em}
.fact span{font-size:34px;font-weight:600;line-height:1.3}
.lbl{display:inline-block;font-weight:800;font-size:21px;letter-spacing:.2em;text-transform:uppercase;padding:12px 22px;border-radius:999px;margin-bottom:26px}
.lbl.m{background:rgba(14,27,46,.08);color:var(--muted)}
.lbl.v{background:var(--navy);color:var(--gold)}
.dark .lbl.m{background:rgba(255,255,255,.08);color:var(--sub)}
.dark .lbl.v{background:var(--gold);color:var(--navy)}
.myth{font-family:Fraunces;font-weight:600;font-size:60px;line-height:1.14;color:#8C9098;text-decoration:line-through;text-decoration-thickness:3px;text-decoration-color:rgba(140,144,152,.7)}
.sep{height:1px;background:var(--line);margin:52px 0}
.truth{font-size:40px;line-height:1.42;font-weight:600;color:var(--navy)}
table.cmp{width:100%;border-collapse:collapse;margin-top:44px;font-size:30px}
.cmp th{text-align:left;padding:0 22px 22px 0;font-weight:800;font-size:21px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc)}
.cmp td{padding:30px 22px 30px 0;border-top:1px solid var(--line);vertical-align:top;font-weight:600;line-height:1.3}
.cmp td:first-child{color:var(--sub);font-weight:500;width:28%}
.cmp td.hl{color:var(--navy)}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:44px}
.card{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:34px}
.card h3{font-size:40px;margin-bottom:14px}
.card p{margin:0;font-size:30px;line-height:1.4;color:var(--sub);font-weight:500}
.card.on{border:2px solid var(--acc)}
.bignum{font-family:Fraunces;font-weight:600;font-size:230px;line-height:.9;color:transparent;-webkit-text-stroke:2px var(--acc);margin-bottom:40px;letter-spacing:-.03em}
.dots{display:flex;gap:12px;margin-top:56px}
.dots i{width:44px;height:6px;border-radius:3px;background:var(--line)}
.dots i.on{background:var(--acc)}
.btn{display:inline-flex;align-items:center;gap:20px;align-self:flex-start;margin-top:56px;background:var(--gold);color:var(--navy);font-weight:800;font-size:34px;padding:30px 46px;border-radius:999px}
.btn .ic{width:40px;height:40px;stroke-width:2}
.icons{display:flex;gap:22px;margin-top:52px}
.icons span{width:104px;height:104px;border-radius:50%;border:1.5px solid var(--acc);display:grid;place-items:center;color:var(--acc)}
.icons .ic{width:50px;height:50px}
.line{margin-top:48px;padding-top:34px;border-top:1px solid var(--line);font-size:30px;font-weight:700;color:var(--acc);display:flex;align-items:center;gap:16px}
.offer{flex:1;border-radius:26px;padding:38px 34px;border:1px solid var(--line);background:var(--card)}
.offer .lbl{margin-bottom:28px}
.offer p{margin:0 0 14px;font-size:30px;font-weight:600;line-height:1.35}
.offer p span{color:var(--sub);font-weight:500}
.offer.on{border:2px solid var(--gold);background:rgba(201,169,110,.08)}
.offers{display:flex;gap:24px;margin-top:52px}
.center{text-align:left}
.tall h1{font-size:104px}
.tall .body{font-size:40px}
.gap{flex:none}
`;
}

function arcs(kind, w, h, tall) {
  // O arco fica sempre no canto superior direito, onde não há texto; em Reels/Stories
  // um segundo arco ocupa o canto inferior direito, livre na área segura.
  const g = 'var(--acc)';
  const big = kind !== 'soft';
  const r = big ? 420 : 250;
  let svg = `<circle cx="${w + 60}" cy="-60" r="${r}" fill="none" stroke="${g}" stroke-width="${big ? 2.2 : 1.6}" opacity="${big ? 0.85 : 0.45}"/>`;
  if (big) svg += `<circle cx="${w + 60}" cy="-60" r="${r + 50}" fill="none" stroke="${g}" stroke-width="1.2" opacity=".3"/>`;
  if (tall) svg += `<circle cx="${w + 80}" cy="${h + 80}" r="400" fill="none" stroke="${g}" stroke-width="1.6" opacity="${big ? 0.6 : 0.4}"/>`;
  return `<svg class="arc" width="${w}" height="${h}" style="left:0;top:0">${svg}</svg>`;
}

const marker = (m, i) => {
  if (m === 'num') return `<span class="mk">${i + 1}</span>`;
  if (m === 'x') return `<span class="mk x">${icon('x')}</span>`;
  if (m && I[m]) return `<span class="mk">${icon(m)}</span>`;
  return `<span class="mk">${icon('check')}</span>`;
};

const items = (s) =>
  s.items
    ? `<ul class="items${s.cols ? ' cols' : ''}">${s.items.map((t, i) => `<li>${marker(s.marker, i)}<span>${esc(t)}</span></li>`).join('')}</ul>`
    : '';

const kicker = (k) => (k ? `<div class="kicker">${esc(k)}</div>` : '');
const p = (t, cls = 'body') => (t ? `<p class="${cls}">${esc(t)}</p>` : '');

function corpo(s) {
  switch (s.t) {
    case 'cover':
    case 'reel':
      return `${kicker(s.kicker)}<h1>${esc(s.title)}</h1>${p(s.sub, 'sub')}`;
    case 'text':
      return `${kicker(s.kicker)}<h2>${esc(s.title)}</h2>${p(s.body)}${items(s)}${p(s.note, 'note')}`;
    case 'list':
      return `${kicker(s.kicker)}<h2>${esc(s.title)}</h2>${p(s.body)}${items(s)}${p(s.note, 'note')}`;
    case 'facts':
      return `${kicker(s.kicker)}<h2>${esc(s.title)}</h2><div class="facts">${s.facts
        .map(([n, l]) => `<div class="fact"><b>${n}</b><span>${l}</span></div>`)
        .join('')}</div>${p(s.note, 'note')}`;
    case 'myth':
      return `${kicker(s.kicker)}<div class="myth">${esc(s.myth)}</div>
        <div class="sep"></div><div><span class="lbl v">Verdade</span></div><div class="truth">${esc(s.truth)}</div>`;
    case 'compare':
      return `${kicker(s.kicker)}<h2>${esc(s.title)}</h2><table class="cmp"><tr><th></th><th>${s.heads[0]}</th><th>${s.heads[1]}</th></tr>${s.rows
        .map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="hl">${r[2]}</td></tr>`)
        .join('')}</table>${p(s.note, 'note')}`;
    case 'cards':
      return `${kicker(s.kicker)}<h2>${esc(s.title)}</h2><div class="cards">${s.cards
        .map((c, i) => `<div class="card${i === 1 ? ' on' : ''}"><h3>${c[0]}</h3><p>${c[1]}</p></div>`)
        .join('')}</div>${p(s.note, 'note')}`;
    case 'step':
      return `<div class="bignum">${String(s.n).padStart(2, '0')}</div>${kicker(s.kicker)}<h2>${esc(s.title)}</h2>${p(s.body)}
        <div class="dots">${Array.from({ length: s.total }, (_, i) => `<i class="${i < s.n ? 'on' : ''}"></i>`).join('')}</div>`;
    case 'statement':
      return `${kicker(s.kicker)}<h2 style="font-size:${s.big ? 84 : 76}px">${esc(s.title)}</h2>${p(s.body)}`;
    case 'cta':
      return `${kicker(s.kicker || 'Próximo passo')}<h2 style="font-size:80px">${esc(s.title)}</h2>${p(s.body)}
        <div class="btn">${icon('chat')}<span>${esc(s.button)}</span></div>${p(s.note, 'note')}`;
    case 'poster':
      return `${kicker(s.kicker)}<h1 style="font-size:${s.size || 92}px">${esc(s.title)}</h1>${p(s.body)}
        ${s.icons ? `<div class="icons">${s.icons.map((n) => `<span>${icon(n)}</span>`).join('')}</div>` : ''}
        ${s.line ? `<div class="line">${icon('arrow', 34)}<span>${esc(s.line)}</span></div>` : ''}`;
    case 'offers':
      return `${kicker(s.kicker)}<h1 style="font-size:88px">${esc(s.title)}</h1>
        <div class="offers">${s.offers
          .map((o, i) => `<div class="offer${i === 1 ? ' on' : ''}"><span class="lbl ${i === 1 ? 'v' : 'm'}">${o.h}</span>${o.l
            .map((x) => `<p>${x}</p>`)
            .join('')}</div>`)
          .join('')}</div>${p(s.body)}
        ${s.line ? `<div class="line">${icon('arrow', 34)}<span>${esc(s.line)}</span></div>` : ''}`;
    case 'story':
      return `${kicker(s.kicker)}<h1 style="font-size:${s.size || 92}px">${esc(s.title)}</h1>${p(s.body)}${items(s)}
        ${s.icons ? `<div class="icons">${s.icons.map((n) => `<span>${icon(n)}</span>`).join('')}</div>` : ''}
        ${s.sticker ? `<div class="gap" style="height:${s.sticker}px"></div>` : ''}`;
    default:
      throw new Error('tipo de slide desconhecido: ' + s.t);
  }
}

export function html(post, s, idx, total, fontsCss) {
  const tall = post.formato === 'Reels' || post.formato === 'Story';
  const w = 1080;
  const h = tall ? 1920 : 1350;
  const dark = s.theme ? s.theme === 'dark' : ['cover', 'reel', 'cta', 'statement', 'poster', 'offers'].includes(s.t);
  const pil = PILARES[post.pilar];
  const arcKind = dark ? 'big' : 'soft';
  const showCount = total > 1;
  const swipe = s.t === 'cover' && post.formato === 'Carrossel';
  const tagLabel = s.tag || pil.label;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(fontsCss, w, h)}</style></head><body>
<div class="s ${dark ? 'dark' : 'light'} ${tall ? 'tall' : ''} ${s.pink ? 'pink' : ''}" style="--pc:${pil.cor}">
${arcs(arcKind, w, h, tall)}
<div class="top"><div class="tag"><i></i>${tagLabel}${showCount ? `<span class="count">${String(idx + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}</span>` : ''}</div></div>
<div class="main"><div class="fit">${corpo(s)}</div></div>
<div class="foot"><div class="brand">ERBE<small>PROTEÇÃO E PATRIMÔNIO</small></div>${swipe ? `<div class="swipe">Arraste ${icon('arrow', 30)}</div>` : ''}</div>
</div></body></html>`;
}
