/**
 * Carrossel para Instagram (regras puras): estrutura capa → conteúdo → CTA, paletas e cores de destaque com
 * contraste verificado, limites de texto, tamanhos de fonte que cabem no quadro 1080×1080, checklist de
 * qualidade e modelos prontos de planos de saúde (modo local). Com Claude, o serviço escreve os textos e
 * mantém esta mesma estrutura; a renderização em PNG (src/server/carousel) usa o layout calculado aqui.
 */

export const CAROUSEL_SIZE = 1080;
export const CAROUSEL_MIN_SLIDES = 3;
export const CAROUSEL_MAX_SLIDES = 10;
export const CAROUSEL_DEFAULT_SLIDES = 7;
/** Foto da capa: JPEG em data URL, reduzida no navegador para ~1080 px antes de enviar. */
export const CAROUSEL_PHOTO_MAX_CHARS = 4_000_000;

export const SLIDE_KINDS = ["capa", "conteudo", "cta"] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];
export const SLIDE_KIND_LABELS: Record<SlideKind, string> = { capa: "Capa", conteudo: "Conteúdo", cta: "CTA final" };

export const CAROUSEL_PALETTES = ["besmart", "editorial", "kraft", "neutro"] as const;
export type CarouselPalette = (typeof CAROUSEL_PALETTES)[number];
export const CAROUSEL_PALETTE_LABELS: Record<CarouselPalette, string> = {
  besmart: "BeSmart (azul-marinho)",
  editorial: "Dark editorial",
  kraft: "Kraft/bege (revista)",
  neutro: "Dark neutro",
};

export const CAROUSEL_ACCENTS = ["dourado", "coral", "azul", "verde"] as const;
export type CarouselAccent = (typeof CAROUSEL_ACCENTS)[number];
export const CAROUSEL_ACCENT_LABELS: Record<CarouselAccent, string> = { dourado: "Dourado", coral: "Coral", azul: "Azul", verde: "Verde-água" };

export interface PaletteColors {
  bg: string;
  /** Títulos. */
  text: string;
  /** Texto corrido. */
  body: string;
  /** Rodapé, handle e rótulos discretos (nunca abaixo de 4,5:1 sobre o fundo). */
  muted: string;
  /** Linhas divisórias (decorativo). */
  border: string;
  /** Caixa do CTA. */
  card: string;
  accent: string;
  dark: boolean;
}

const DARK_ACCENTS: Record<CarouselAccent, string> = { dourado: "#e8a030", coral: "#da7756", azul: "#4fc3f7", verde: "#2dd4bf" };
/** No fundo claro as cores de destaque são escurecidas para manter o contraste. */
const LIGHT_ACCENTS: Record<CarouselAccent, string> = { dourado: "#8a5a0c", coral: "#a8492a", azul: "#0b6488", verde: "#0d6b63" };

const PALETTES: Record<CarouselPalette, Omit<PaletteColors, "accent">> = {
  besmart: { bg: "#0b1f3a", text: "#f4f7fb", body: "#c9d6e6", muted: "#8ea3bf", border: "#1d3a63", card: "#12305a", dark: true },
  editorial: { bg: "#050a12", text: "#f0ece4", body: "#c8c4bc", muted: "#8593a0", border: "#13263a", card: "#0c1726", dark: true },
  kraft: { bg: "#f5eed8", text: "#0a0a0a", body: "#3a3028", muted: "#6b5d45", border: "#d8caa4", card: "#ebe0bf", dark: false },
  neutro: { bg: "#0f0e0b", text: "#f5f0e8", body: "#cfc9bf", muted: "#9a948a", border: "#2a2823", card: "#1b1a16", dark: true },
};

export function paletteColors(palette: CarouselPalette, accent: CarouselAccent): PaletteColors {
  const p = PALETTES[palette];
  return { ...p, accent: (p.dark ? DARK_ACCENTS : LIGHT_ACCENTS)[accent] };
}

/** Razão de contraste WCAG entre duas cores #rrggbb. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pares de cor usados nos slides e o contraste mínimo de cada um. */
export function paletteContrastIssues(c: PaletteColors): string[] {
  const rules: [string, string, string, number][] = [
    ["Título", c.text, c.bg, 7],
    ["Texto", c.body, c.bg, 7],
    ["Rodapé", c.muted, c.bg, 4.5],
    ["Destaque", c.accent, c.bg, 4.5],
    ["Título na caixa do CTA", c.text, c.card, 7],
    ["Texto na caixa do CTA", c.body, c.card, 4.5],
    ["Palavra-chave na caixa do CTA", c.accent, c.card, 3],
  ];
  return rules.filter(([, fg, bg, min]) => contrastRatio(fg, bg) < min).map(([label, fg, bg, min]) => `${label}: ${contrastRatio(fg, bg).toFixed(1)}:1 (mínimo ${min}:1)`);
}

export const CAROUSEL_LIMITS = {
  topic: 160,
  audience: 300,
  brand: 40,
  /** "@" + até 30 caracteres (limite do Instagram). */
  handle: 31,
  eyebrow: 40,
  title: 70,
  highlight: 60,
  body: 300,
  bullet: 110,
  bullets: 5,
  keyword: 20,
  caption: 2200,
} as const;

export interface CarouselSlide {
  kind: SlideKind;
  /** Rótulo curto acima do título (fonte mono, caixa alta). */
  eyebrow: string;
  /** Título de impacto (Bebas Neue, caixa alta). */
  title: string;
  /** Continuação do título em itálico na cor de destaque (Playfair Display). */
  highlight: string;
  body: string;
  /** Lista do slide de conteúdo (até 5 itens). */
  bullets: string[];
  /** Só no CTA: palavra que a pessoa comenta para receber o material. */
  keyword: string;
}

export interface Carousel {
  topic: string;
  brand: string;
  handle: string;
  palette: CarouselPalette;
  accent: CarouselAccent;
  slides: CarouselSlide[];
  caption: string;
  /** Foto de fundo da capa (data URL JPEG, já reduzida no navegador). */
  photo?: string | null;
}

export interface CarouselBrief {
  topic: string;
  audience: string | null;
  slideCount: number;
  keyword: string | null;
  brand: string;
  handle: string;
  palette: CarouselPalette;
  accent: CarouselAccent;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "besmart.saude" ou "@ besmart" → "@besmart.saude" (sem espaços; vazio continua vazio). */
export function normalizeHandle(handle: string): string {
  const h = handle.trim().replace(/^@+/, "").replace(/\s+/g, "");
  return h ? `@${h}` : "";
}

/** Palavra-chave do CTA: caixa alta, sem espaços nas pontas. */
export const normalizeKeyword = (k: string) => k.trim().toLocaleUpperCase("pt-BR");

export function emptySlide(kind: SlideKind): CarouselSlide {
  return { kind, eyebrow: "", title: "", highlight: "", body: "", bullets: [], keyword: "" };
}

/** "01/07" — numeração exibida no rodapé. */
export const slideNumber = (index: number, total: number) => `${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
export const slideFileName = (index: number) => `slide_${String(index + 1).padStart(2, "0")}.png`;

/** Nome do ZIP: "carrossel-coparticipacao-vale-a-pena.zip" (ou "carrossel.zip" sem tema). */
export function carouselZipName(topic: string): string {
  const slug = norm(topic)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return slug ? `carrossel-${slug}.zip` : "carrossel.zip";
}

// ─── Layout: tamanhos de fonte que cabem no quadro ───

/** Medidas do quadro em px (1080×1080). */
export const FRAME = { size: CAROUSEL_SIZE, padX: 76, padY: 64, header: 44, footer: 40, gap: 28 } as const;
const INNER_W = FRAME.size - FRAME.padX * 2;

/** Largura média de um caractere em "em" para cada família (estimativa conservadora). */
const EM = { display: 0.43, serif: 0.5, sans: 0.53, mono: 0.6 } as const;

/** Linhas estimadas para `text` em `width` px com quebra por palavra. */
export function estimateLines(text: string, fontSize: number, width: number, emPerChar: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const charW = fontSize * emPerChar;
  const space = fontSize * 0.26;
  let lines = 1;
  let x = 0;
  for (const w of words) {
    const ww = w.length * charW;
    if (x > 0 && x + space + ww > width) {
      lines++;
      x = 0;
    }
    if (x === 0 && ww > width) {
      lines += Math.ceil(ww / width) - 1;
      x = ww % width;
    } else x += (x > 0 ? space : 0) + ww;
  }
  return lines;
}

export interface SlideLayout {
  title: number;
  highlight: number;
  body: number;
  bullet: number;
  keyword: number;
  /** Altura estimada do conteúdo e espaço disponível (px). */
  height: number;
  available: number;
  fits: boolean;
}

const BASE: Record<SlideKind, { title: number; highlight: number; body: number; bullet: number; keyword: number }> = {
  capa: { title: 190, highlight: 96, body: 42, bullet: 40, keyword: 0 },
  conteudo: { title: 140, highlight: 82, body: 44, bullet: 42, keyword: 0 },
  cta: { title: 130, highlight: 76, body: 38, bullet: 36, keyword: 160 },
};
/** Largura interna da caixa do CTA (padding 44 + borda 2 de cada lado). */
const CTA_BOX_W = INNER_W - 2 * 46;

/** Maior fonte em que a palavra mais longa cabe numa linha (o Satori não quebra palavras). */
function wordCap(text: string, width: number, em: number): number {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
  return longest ? Math.floor(width / (longest * em)) : Infinity;
}
const MIN_SCALE = 0.5;

function blockHeight(slide: CarouselSlide, s: Omit<SlideLayout, "height" | "available" | "fits">): number {
  const parts: number[] = [];
  // no conteúdo, o número do slide fica na mesma linha do rótulo (sempre presente)
  if (slide.kind === "conteudo") parts.push(56);
  else if (slide.eyebrow.trim()) parts.push(34);
  if (slide.title.trim()) parts.push(estimateLines(slide.title.toLocaleUpperCase("pt-BR"), s.title, INNER_W, EM.display) * s.title * 0.95);
  if (slide.highlight.trim()) parts.push(estimateLines(slide.highlight, s.highlight, INNER_W, EM.serif) * s.highlight * 1.12);
  if (slide.kind === "cta") {
    // caixa: rótulo + palavra-chave + texto, com respiro interno
    const boxW = CTA_BOX_W;
    const kw = slide.keyword.trim() ? estimateLines(slide.keyword, s.keyword, boxW, EM.display) * s.keyword * 0.95 : 0;
    const sub = slide.body.trim() ? estimateLines(slide.body, s.body, boxW, EM.sans) * s.body * 1.3 + 12 : 0;
    parts.push(2 * 40 + 30 + 10 + kw + sub);
  } else if (slide.body.trim()) parts.push(estimateLines(slide.body, s.body, INNER_W, EM.sans) * s.body * 1.35);
  const bullets = slide.kind === "cta" ? [] : slide.bullets.filter((b) => b.trim());
  if (bullets.length) {
    const w = INNER_W - 72;
    parts.push(bullets.reduce((h, b) => h + estimateLines(b, s.bullet, w, EM.sans) * s.bullet * 1.3, 0) + (bullets.length - 1) * 18);
  }
  return parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * FRAME.gap;
}

/** Espaço vertical para o bloco de texto (descontando cabeçalho, rodapé e, na capa com foto, a área do rosto). */
export function availableHeight(kind: SlideKind, hasPhoto = false): number {
  const base = FRAME.size - 2 * FRAME.padY - FRAME.header - FRAME.footer - 2 * FRAME.gap;
  if (kind === "conteudo") return base - 2 - FRAME.gap; // linha divisória
  if (kind === "capa" && hasPhoto) return Math.round(base * 0.62); // deixa o topo livre para o rosto
  return base;
}

/** Maior escala de fonte (100% → 50%) em que o texto do slide cabe; `fits=false` se nem no mínimo couber. */
export function slideLayout(slide: CarouselSlide, hasPhoto = false): SlideLayout {
  const base = BASE[slide.kind];
  const available = availableHeight(slide.kind, hasPhoto);
  let last: SlideLayout | null = null;
  for (let scale = 1; scale >= MIN_SCALE - 1e-9; scale -= 0.05) {
    const sizes = {
      title: Math.min(Math.round(base.title * scale), wordCap(slide.title, INNER_W, EM.display)),
      highlight: Math.min(Math.round(base.highlight * scale), wordCap(slide.highlight, INNER_W, EM.serif)),
      // texto corrido encolhe menos que o título para continuar legível no celular
      body: Math.round(base.body * Math.max(0.74, Math.sqrt(scale))),
      bullet: Math.round(base.bullet * Math.max(0.74, Math.sqrt(scale))),
      keyword: Math.min(Math.round(base.keyword * scale), wordCap(slide.keyword, CTA_BOX_W, EM.display)),
    };
    const height = Math.round(blockHeight(slide, sizes));
    last = { ...sizes, height, available, fits: height <= available };
    if (last.fits) return last;
  }
  return last!;
}

// ─── Checklist de qualidade (antes de exportar) ───

export interface ChecklistItem {
  ok: boolean;
  label: string;
  detail?: string;
}

const PLACEHOLDER = /\[[^\]]*\]/;
const slideText = (s: CarouselSlide) => [s.eyebrow, s.title, s.highlight, s.body, s.keyword, ...s.bullets].join(" ");

export function carouselChecklist(c: Carousel): ChecklistItem[] {
  const n = c.slides.length;
  const list = (idx: number[]) => idx.map((i) => String(i + 1).padStart(2, "0")).join(", ");
  const tooLong = c.slides.map((s, i) => (slideLayout(s, s.kind === "capa" && Boolean(c.photo)).fits ? -1 : i)).filter((i) => i >= 0);
  const empty = c.slides.map((s, i) => (s.title.trim() && (s.kind !== "conteudo" || s.body.trim() || s.bullets.some((b) => b.trim())) ? -1 : i)).filter((i) => i >= 0);
  const placeholders = c.slides.map((s, i) => (PLACEHOLDER.test(slideText(s)) ? i : -1)).filter((i) => i >= 0);
  const cta = c.slides[n - 1];
  const keyword = cta?.kind === "cta" ? cta.keyword.trim() : "";
  const contrast = paletteContrastIssues(paletteColors(c.palette, c.accent));
  return [
    { ok: n >= CAROUSEL_MIN_SLIDES && n <= CAROUSEL_MAX_SLIDES, label: `Entre ${CAROUSEL_MIN_SLIDES} e ${CAROUSEL_MAX_SLIDES} slides`, detail: `${n} slide(s)` },
    {
      ok: c.slides[0]?.kind === "capa" && cta?.kind === "cta" && c.slides.slice(1, -1).every((s) => s.kind === "conteudo"),
      label: "Capa no início, CTA no final e conteúdo no meio",
    },
    { ok: empty.length === 0, label: "Todo slide tem título (e o de conteúdo, texto ou lista)", detail: empty.length ? `Slides ${list(empty)}` : undefined },
    { ok: tooLong.length === 0, label: "Nenhum texto cortado no quadro 1080×1080", detail: tooLong.length ? `Encurte os slides ${list(tooLong)}` : undefined },
    { ok: placeholders.length === 0, label: "Sem texto de exemplo entre colchetes", detail: placeholders.length ? `Slides ${list(placeholders)}` : undefined },
    { ok: /^@[\w.]{1,30}$/.test(c.handle), label: "Handle @ no rodapé", detail: c.handle ? undefined : "Informe o @ do perfil" },
    { ok: Boolean(keyword) && !/\s/.test(keyword), label: "CTA com palavra-chave clara (uma palavra)", detail: keyword || "Defina a palavra-chave no último slide" },
    { ok: contrast.length === 0, label: "Contraste adequado em todos os textos", detail: contrast.join(" · ") || undefined },
    {
      ok: c.caption.trim().length > 0 && c.caption.length <= CAROUSEL_LIMITS.caption,
      label: "Legenda pronta (até 2.200 caracteres)",
      detail: `${c.caption.length} caracteres`,
    },
  ];
}

// ─── Modelos prontos (modo local) ───

type SlideSeed = Partial<Omit<CarouselSlide, "kind">>;
interface CarouselTemplate {
  id: string;
  label: string;
  match: RegExp;
  cover: SlideSeed;
  content: SlideSeed[];
  cta: SlideSeed;
  caption: string;
  hashtags: string;
}

const NOTE = "As condições variam conforme operadora, contrato, região e análise.";

const TEMPLATES: CarouselTemplate[] = [
  {
    id: "coparticipacao",
    label: "Coparticipação vale a pena?",
    match: /copart/,
    cover: { eyebrow: "Plano de saúde", title: "Coparticipação", highlight: "vale a pena?", body: "Quando ela reduz o custo — e quando pesa no bolso." },
    content: [
      { eyebrow: "O que é", title: "Mensalidade menor", highlight: "e uma parte quando usa", body: "Na coparticipação você paga menos por mês e participa com um percentual ou valor fixo em consultas, exames e outros atendimentos." },
      {
        eyebrow: "Os modelos",
        title: "Três formatos",
        highlight: "no mercado",
        bullets: ["Total: participação em quase todos os atendimentos", "Parcial: só em itens específicos, como terapias", "Sem coparticipação: mensalidade maior e nada a pagar no uso"],
      },
      { eyebrow: "Quando vale", title: "Faz sentido", highlight: "para quem usa pouco", bullets: ["Quem vai a poucas consultas por ano", "Quem quer reduzir o custo fixo do mês", "Empresas que querem baixar o custo por vida"] },
      { eyebrow: "Atenção", title: "Pode sair caro", highlight: "para quem usa muito", body: "Terapias e tratamentos contínuos somam várias coparticipações no mês. Confira os percentuais e o teto por evento ou mensal no contrato." },
      {
        eyebrow: "Na prática",
        title: "Faça a conta",
        highlight: "antes de escolher",
        bullets: ["Liste consultas, exames e terapias do último ano", "Calcule a coparticipação de cada item", "Some à mensalidade e compare com o plano sem coparticipação"],
      },
    ],
    cta: { eyebrow: "Quer ajuda?", title: "Qual modelo", highlight: "compensa para você?", keyword: "COPART", body: "Comenta a palavra que eu te mando uma simulação no direct." },
    caption: "Coparticipação vale a pena? Depende do seu perfil de uso.\n\nNa coparticipação a mensalidade é menor e você paga uma parte quando usa. Para quem usa pouco, costuma compensar; para quem faz terapias ou tratamentos contínuos, pode sair mais caro.",
    hashtags: "#planodesaude #coparticipacao #saude #corretordeplanos",
  },
  {
    id: "carencia",
    label: "Carência: prazos e como reduzir",
    match: /carencia/,
    cover: { eyebrow: "Plano de saúde", title: "Carência", highlight: "o que ninguém te explica", body: "Os prazos máximos e como reduzir na hora de contratar." },
    content: [
      { eyebrow: "O que é", title: "Prazo para usar", highlight: "cada cobertura", body: "Carência é o tempo entre a contratação e o direito de usar determinados atendimentos. A lei define prazos máximos; a operadora pode oferecer menos." },
      {
        eyebrow: "Prazos máximos",
        title: "O que diz a regra",
        highlight: "da ANS",
        bullets: ["Urgência e emergência: 24 horas", "Parto a termo: 300 dias", "Demais coberturas: até 180 dias", "Doenças preexistentes (CPT): até 24 meses"],
      },
      {
        eyebrow: "Como reduzir",
        title: "Dá para diminuir",
        highlight: "ou até zerar",
        bullets: ["Empresarial com 30 vidas ou mais: sem carência para quem entra no prazo", "Quem já tem plano pode aproveitar carências na troca", "Campanhas de operadoras com carência reduzida"],
      },
      { eyebrow: "Atenção", title: "Declare tudo", highlight: "na declaração de saúde", body: "Omitir doença preexistente pode trazer problemas na cobertura. Ser transparente é o que garante a sua segurança." },
    ],
    cta: { eyebrow: "Quer saber?", title: "Qual seria a sua carência", highlight: "no plano novo?", keyword: "CARENCIA", body: "Comenta a palavra que eu analiso o seu caso no direct." },
    caption: "Carência é o prazo entre a contratação e o direito de usar cada cobertura. A ANS define prazos máximos — e, em muitos casos, dá para reduzir.\n\nSalva para consultar antes de contratar ou trocar de plano.",
    hashtags: "#planodesaude #carencia #ans #corretordeplanos",
  },
  {
    id: "portabilidade",
    label: "Portabilidade de carências",
    match: /portabilidade|trocar de plano|mudar de plano/,
    cover: { eyebrow: "Trocar de plano", title: "Portabilidade", highlight: "sem começar do zero", body: "Como mudar de plano sem cumprir novas carências." },
    content: [
      { eyebrow: "O que é", title: "Leve suas carências", highlight: "para o novo plano", body: "A portabilidade permite trocar de plano de saúde aproveitando as carências já cumpridas, seguindo as regras da ANS." },
      {
        eyebrow: "Requisitos",
        title: "O que é preciso",
        highlight: "em regra",
        bullets: ["Plano atual ativo e mensalidades em dia", "Na 1ª portabilidade: 2 anos no plano (3 se cumpriu CPT)", "Nas seguintes: 1 ano no plano", "Plano de destino compatível (consulte o Guia ANS)"],
      },
      {
        eyebrow: "Passo a passo",
        title: "Como fazer",
        highlight: "na prática",
        bullets: ["Consulte os planos compatíveis no Guia ANS", "Separe comprovantes de pagamento e de permanência", "Solicite na operadora do novo plano", "Cancele o antigo em até 5 dias após o início do novo"],
      },
      { eyebrow: "Atenção", title: "Nem toda troca", highlight: "é portabilidade", body: "Trocar por conta própria, sem seguir o processo, pode significar cumprir carências de novo. Por isso vale analisar antes." },
    ],
    cta: { eyebrow: "Quer saber?", title: "Você pode fazer", highlight: "portabilidade?", keyword: "PORTAR", body: "Comenta a palavra que eu verifico o seu caso no direct." },
    caption: "Dá para trocar de plano de saúde sem cumprir carência de novo: é a portabilidade de carências.\n\nVeja os requisitos e o passo a passo e salve para quando precisar.",
    hashtags: "#planodesaude #portabilidade #ans #corretordeplanos",
  },
  {
    id: "pme",
    label: "Plano PME: seu CNPJ pode baratear o plano",
    match: /\bpme\b|\bmei\b|cnpj|empresarial|empresa/,
    cover: { eyebrow: "Tem CNPJ?", title: "Seu CNPJ pode", highlight: "baratear o plano", body: "Como funciona o plano empresarial PME — inclusive para MEI." },
    content: [
      { eyebrow: "O que é", title: "Plano PME", highlight: "a partir de 2 vidas", body: "Empresas com CNPJ ativo podem contratar plano empresarial, muitas vezes com valor menor que o individual para o mesmo perfil." },
      { eyebrow: "Quem entra", title: "Quem pode", highlight: "ser incluído", bullets: ["Sócios e funcionários registrados", "Estagiários, conforme a operadora", "Dependentes, conforme as regras do contrato"] },
      {
        eyebrow: "Requisitos",
        title: "O que costuma",
        highlight: "ser pedido",
        bullets: ["CNPJ ativo (MEI: em geral, 6 meses de abertura)", "Mínimo de 2 ou 3 vidas, conforme a operadora", "Documentos da empresa e dos beneficiários"],
      },
      { eyebrow: "Atenção", title: "Leia o contrato", highlight: "antes de assinar", body: "Reajuste, carência e regras de cancelamento do empresarial são diferentes das do individual. Compare tudo, não só o preço." },
    ],
    cta: { eyebrow: "Quer saber?", title: "Quanto sua empresa", highlight: "pagaria?", keyword: "PME", body: "Comenta a palavra que eu te mando uma cotação comparativa." },
    caption: "Quem tem CNPJ — até MEI — pode ter acesso a planos empresariais com valores menores que os do individual.\n\nVeja quem pode entrar, o que costuma ser pedido e o que conferir antes de assinar.",
    hashtags: "#planodesaude #planoempresarial #mei #pme #corretordeplanos",
  },
  {
    id: "reajuste",
    label: "Reajuste: anual e por faixa etária",
    match: /reajuste|faixa etaria|aumento/,
    cover: { eyebrow: "Entenda", title: "Reajuste do plano", highlight: "por que sobe tanto?", body: "Os dois tipos de reajuste e o que esperar na renovação." },
    content: [
      { eyebrow: "Tipo 1", title: "Reajuste anual", highlight: "no aniversário", body: "Aplicado uma vez por ano, na data de aniversário do contrato, para acompanhar a variação de custos e de uso." },
      { eyebrow: "Tipo 2", title: "Faixa etária", highlight: "quando a idade muda", body: "Acontece na mudança de faixa etária. A última faixa começa aos 59 anos: depois disso não há reajuste por idade." },
      {
        eyebrow: "Quem define",
        title: "Cada modalidade",
        highlight: "tem uma regra",
        bullets: ["Individual/familiar: limite definido pela ANS", "Empresarial até 29 vidas: índice único do agrupamento", "Empresarial maior: negociado conforme a utilização", "Adesão: definido no contrato coletivo"],
      },
      { eyebrow: "O que fazer", title: "Antes de renovar", highlight: "compare", bullets: ["Peça o demonstrativo do reajuste", "Compare com outras operadoras do mesmo perfil", "Avalie portabilidade ou mudança de modalidade"] },
    ],
    cta: { eyebrow: "Teve aumento?", title: "Seu plano teve", highlight: "reajuste alto?", keyword: "REAJUSTE", body: "Comenta a palavra que eu analiso se dá para pagar menos." },
    caption: "Reajuste anual e reajuste por faixa etária são coisas diferentes — e cada modalidade de plano tem a sua regra.\n\nEntenda o que esperar na renovação e o que fazer antes de aceitar o aumento.",
    hashtags: "#planodesaude #reajuste #ans #corretordeplanos",
  },
  {
    id: "erros",
    label: "5 erros ao escolher plano de saúde",
    match: /\berros?\b|escolher|contratar/,
    cover: { eyebrow: "Antes de contratar", title: "5 erros", highlight: "ao escolher plano de saúde", body: "Evite pagar caro por um plano que não atende você." },
    content: [
      { eyebrow: "Erro 1", title: "Olhar só o preço", body: "O plano mais barato pode não ter o hospital ou o médico que você usa. Compare rede, carência e reajuste junto com o valor." },
      { eyebrow: "Erro 2", title: "Não checar a rede", body: "Hospital no material de venda não significa cobertura no seu produto. Confira a rede por plano, acomodação e região." },
      { eyebrow: "Erro 3", title: "Ignorar a coparticipação", body: "Mensalidade baixa com coparticipação alta pode sair caro para quem usa muito. Faça a conta pelo seu perfil." },
      { eyebrow: "Erro 4", title: "Omitir doenças", body: "A declaração de saúde é obrigatória. Omitir doença preexistente traz risco para a cobertura." },
      { eyebrow: "Erro 5", title: "Esquecer o CNPJ", body: "Quem tem CNPJ, até MEI, pode ter acesso a planos empresariais com valores menores." },
    ],
    cta: { eyebrow: "Quer ajuda?", title: "Quer escolher", highlight: "sem erro?", keyword: "PLANO", body: "Comenta a palavra que eu te mando um comparativo no direct." },
    caption: "Escolher plano de saúde só pelo preço costuma sair caro depois.\n\nSeparei os 5 erros mais comuns para você evitar — salve e compartilhe com quem está contratando.",
    hashtags: "#planodesaude #dicas #saude #corretordeplanos",
  },
  {
    id: "acomodacao",
    label: "Enfermaria ou apartamento?",
    match: /enfermaria|apartamento|acomodacao|quarto/,
    cover: { eyebrow: "Acomodação", title: "Enfermaria ou apartamento", highlight: "qual escolher?", body: "O que muda no preço e na internação." },
    content: [
      { eyebrow: "Enfermaria", title: "Quarto coletivo", highlight: "na internação", body: "Na internação, o quarto é dividido com outros pacientes. A mensalidade costuma ser menor." },
      { eyebrow: "Apartamento", title: "Quarto privativo", highlight: "mais conforto", body: "Na internação, o quarto é individual, com banheiro privativo. Mais privacidade, com mensalidade maior." },
      { eyebrow: "O que muda", title: "Só a internação", highlight: "muda de quarto", body: "Consultas e exames seguem a rede do plano. Confira se algum hospital da sua preferência atende só apartamento." },
      {
        eyebrow: "Como decidir",
        title: "Escolha pelo",
        highlight: "seu perfil",
        bullets: ["Quer pagar menos e aceita dividir o quarto: enfermaria", "Valoriza privacidade e conforto: apartamento", "Hospital preferido só atende apartamento: apartamento"],
      },
    ],
    cta: { eyebrow: "Quer comparar?", title: "Quer ver os dois", highlight: "lado a lado?", keyword: "QUARTO", body: "Comenta a palavra que eu te mando os valores no direct." },
    caption: "Enfermaria ou apartamento? A acomodação muda o quarto na internação e o valor da mensalidade.\n\nVeja as diferenças e como escolher pelo seu perfil.",
    hashtags: "#planodesaude #enfermaria #apartamento #corretordeplanos",
  },
];

export const CAROUSEL_TEMPLATES = TEMPLATES.map((t) => ({ id: t.id, label: t.label }));

/** Modelo pronto que corresponde ao tema (por id ou palavras do tema). */
export function findTemplate(topic: string): CarouselTemplate | null {
  const t = norm(topic);
  return TEMPLATES.find((tpl) => tpl.id === t || norm(tpl.label) === t) ?? TEMPLATES.find((tpl) => tpl.match.test(t)) ?? null;
}

const GENERIC: SlideSeed[] = [
  { eyebrow: "O que é", title: "O que é", highlight: "na prática", body: "[Explique o tema em 2 ou 3 frases simples, sem termos técnicos.]" },
  { eyebrow: "Por que importa", title: "Por que isso", highlight: "importa para você", bullets: ["[Benefício ou risco 1]", "[Benefício ou risco 2]", "[Benefício ou risco 3]"] },
  { eyebrow: "Como funciona", title: "Como funciona", highlight: "passo a passo", bullets: ["[Passo 1]", "[Passo 2]", "[Passo 3]"] },
  { eyebrow: "Erros comuns", title: "Erros que", highlight: "custam caro", bullets: ["[Erro 1]", "[Erro 2]", "[Erro 3]"] },
  { eyebrow: "Dica pro", title: "Dica de", highlight: "especialista", body: "[Uma dica avançada que só quem é do ramo conhece.]" },
  { eyebrow: "Checklist", title: "Antes de decidir", highlight: "confira", bullets: ["[Item 1]", "[Item 2]", "[Item 3]"] },
  { eyebrow: "Exemplo", title: "Um exemplo", highlight: "ilustrativo", body: "[Mostre um caso simples, sem dados de clientes e sem prometer resultados.]" },
  { eyebrow: "Resumo", title: "Resumindo", highlight: "em 3 pontos", bullets: ["[Ponto 1]", "[Ponto 2]", "[Ponto 3]"] },
];

const seed = (kind: SlideKind, s: SlideSeed): CarouselSlide => ({ ...emptySlide(kind), ...s, bullets: [...(s.bullets ?? [])] });

/**
 * Monta o carrossel no modo local: modelo pronto quando o tema corresponde (até a quantidade de slides do
 * modelo); senão, estrutura com textos entre colchetes para completar.
 */
export function buildCarousel(brief: CarouselBrief): Carousel {
  const count = Math.min(CAROUSEL_MAX_SLIDES, Math.max(CAROUSEL_MIN_SLIDES, Math.round(brief.slideCount)));
  const tpl = findTemplate(brief.topic);
  // o modelo pronto não ganha slides "a completar": fica com no máximo o conteúdo que tem
  const middle = tpl ? Math.min(count - 2, tpl.content.length) : count - 2;
  const content: SlideSeed[] = tpl ? tpl.content.slice(0, middle) : [];
  for (let i = 0; content.length < middle; i++) content.push(GENERIC[i % GENERIC.length]);
  const topic = brief.topic.trim();
  const cover = tpl?.cover ?? { eyebrow: "Guia rápido", title: topic.slice(0, CAROUSEL_LIMITS.title), highlight: "o que você precisa saber", body: "Arraste para o lado e salve para consultar depois." };
  const keyword = normalizeKeyword(brief.keyword ?? "") || tpl?.cta.keyword || "QUERO";
  const cta: SlideSeed = { ...(tpl?.cta ?? { eyebrow: "Ficou com dúvida?", title: "Quer ajuda", highlight: "com o seu caso?", body: "Comenta a palavra que eu te respondo no direct." }), keyword };
  const handle = normalizeHandle(brief.handle);
  const intro = tpl?.caption ?? `${topic}\n\nArraste para o lado e salve este post para consultar depois.`;
  const caption = [intro, `Comenta ${keyword} que eu te mando mais detalhes no direct.`, NOTE, [handle, tpl?.hashtags ?? "#planodesaude #saude"].filter(Boolean).join(" ")].join("\n\n");
  return {
    topic,
    brand: brief.brand.trim(),
    handle,
    palette: brief.palette,
    accent: brief.accent,
    slides: [seed("capa", cover), ...content.map((s) => seed("conteudo", s)), seed("cta", cta)],
    caption,
    photo: null,
  };
}

/** Roteiro em texto (para o assistente e para copiar): um bloco por slide. */
export function carouselMarkdown(c: Carousel): string {
  const lines = [`**Carrossel: ${c.topic}** · ${c.slides.length} slides${c.handle ? ` · ${c.handle}` : ""}`, ""];
  c.slides.forEach((s, i) => {
    const head = [s.title, s.highlight].filter((x) => x.trim()).join(" — ");
    lines.push(`**${slideNumber(i, c.slides.length)} · ${SLIDE_KIND_LABELS[s.kind]}**${s.eyebrow ? ` _${s.eyebrow}_` : ""}: ${head}`);
    if (s.kind === "cta" && s.keyword) lines.push(`Palavra-chave: **${s.keyword}**`);
    if (s.body.trim()) lines.push(s.body.trim());
    for (const b of s.bullets.filter((x) => x.trim())) lines.push(`- ${b.trim()}`);
    lines.push("");
  });
  lines.push("**Legenda**", c.caption);
  return lines.join("\n");
}
