import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import {
  CAROUSEL_SIZE,
  FRAME,
  paletteColors,
  slideLayout,
  slideNumber,
  type Carousel,
  type CarouselSlide,
  type PaletteColors,
  type SlideLayout,
} from "@/lib/domain/instagram-carousel";

/**
 * Renderização dos slides em PNG 1080×1080 (JSX → Satori, via next/og), com as fontes do repositório:
 * Bebas Neue (impacto), Playfair Display itálico (destaque), Space Mono (rótulos) e DM Sans (texto).
 * Cada slide é renderizado isoladamente a partir do mesmo modelo usado na tela.
 */

const FONT_DIR = path.join(process.cwd(), "src/server/carousel/fonts");
const FONT_FILES = [
  { name: "Bebas Neue", file: "BebasNeue-400.woff", weight: 400, style: "normal" },
  { name: "Playfair Display", file: "PlayfairDisplay-700-italic.woff", weight: 700, style: "italic" },
  { name: "Playfair Display", file: "PlayfairDisplay-900-italic.woff", weight: 900, style: "italic" },
  { name: "Space Mono", file: "SpaceMono-400.woff", weight: 400, style: "normal" },
  { name: "Space Mono", file: "SpaceMono-700.woff", weight: 700, style: "normal" },
  { name: "DM Sans", file: "DMSans-400.woff", weight: 400, style: "normal" },
  { name: "DM Sans", file: "DMSans-500.woff", weight: 500, style: "normal" },
  { name: "DM Sans", file: "DMSans-700.woff", weight: 700, style: "normal" },
] as const;

type Font = { name: string; data: Buffer; weight: 400 | 500 | 700 | 900; style: "normal" | "italic" };
let fontsPromise: Promise<Font[]> | null = null;

function loadFonts(): Promise<Font[]> {
  fontsPromise ??= Promise.all(FONT_FILES.map(async (f) => ({ name: f.name, data: await fs.readFile(path.join(FONT_DIR, f.file)), weight: f.weight, style: f.style }))).catch((e) => {
    fontsPromise = null;
    throw e;
  });
  return fontsPromise;
}

const PHOTO_RE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

function rgba(hex: string, alpha: number) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const upper = (s: string) => s.toLocaleUpperCase("pt-BR");
const mono = (size: number, color: string, weight: 400 | 700 = 400) => ({ fontFamily: "Space Mono", fontSize: size, fontWeight: weight, color, letterSpacing: 3 });

/** Área útil do slide (acima das camadas absolutas). */
const PAGE = { display: "flex", flexDirection: "column", width: CAROUSEL_SIZE, height: CAROUSEL_SIZE, padding: `${FRAME.padY}px ${FRAME.padX}px` } as const;

interface Ctx {
  c: PaletteColors;
  carousel: Carousel;
  index: number;
  total: number;
  layout: SlideLayout;
  photo: boolean;
}

const GRID = 80;
const GRID_LINES = Math.floor(CAROUSEL_SIZE / GRID);

/** Camadas absolutas (grade, brilho e barra de cor). Satori embrulha fragmentos em uma linha flex, por isso vêm em lista. */
function decorations(c: PaletteColors, photo: boolean) {
  const line = c.dark ? "rgba(255, 255, 255, 0.035)" : "rgba(0, 0, 0, 0.045)";
  const out = [];
  if (!photo) {
    out.push(
      // grade sutil com linhas sólidas (padrões repetidos de fundo são lentos no Satori)
      ...Array.from({ length: GRID_LINES }, (_, i) => <div key={`v${i}`} style={{ position: "absolute", top: 0, left: (i + 1) * GRID - 1, width: 2, height: CAROUSEL_SIZE, backgroundColor: line }} />),
      ...Array.from({ length: GRID_LINES }, (_, i) => <div key={`h${i}`} style={{ position: "absolute", left: 0, top: (i + 1) * GRID - 1, height: 2, width: CAROUSEL_SIZE, backgroundColor: line }} />),
      <div
        key="glow"
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          top: -200,
          right: -180,
          backgroundImage: `radial-gradient(circle, ${rgba(c.accent, c.dark ? 0.2 : 0.12)} 0%, ${rgba(c.accent, 0)} 70%)`,
        }}
      />,
    );
  }
  out.push(<div key="bar" style={{ position: "absolute", top: 0, left: 0, width: CAROUSEL_SIZE, height: 10, backgroundColor: c.accent }} />);
  return out;
}

function Header({ c, carousel }: { c: PaletteColors; carousel: Carousel }) {
  const brand = carousel.brand.trim();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: FRAME.header }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ width: 16, height: 16, backgroundColor: c.accent, marginRight: 14 }} />
        <div style={{ ...mono(22, c.text, 700) }}>{upper(brand || carousel.handle)}</div>
      </div>
      {brand && carousel.handle ? <div style={mono(22, c.muted)}>{carousel.handle}</div> : <div />}
    </div>
  );
}

function Footer({ left, right, c }: { left: ReactNode; right: ReactNode; c: PaletteColors }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: FRAME.footer, ...mono(21, c.muted) }}>
      {left}
      {right}
    </div>
  );
}

function Eyebrow({ text, c }: { text: string; c: PaletteColors }) {
  if (!text.trim()) return null;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ width: 44, height: 4, backgroundColor: c.accent, marginRight: 16 }} />
      <div style={mono(24, c.accent, 700)}>{upper(text.trim())}</div>
    </div>
  );
}

function Heading({ slide, ctx }: { slide: CarouselSlide; ctx: Ctx }) {
  const { c, layout } = ctx;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {slide.title.trim() && (
        <div style={{ fontFamily: "Bebas Neue", fontSize: layout.title, lineHeight: 0.95, color: c.text, letterSpacing: 1 }}>{upper(slide.title.trim())}</div>
      )}
      {slide.highlight.trim() && (
        <div style={{ fontFamily: "Playfair Display", fontStyle: "italic", fontWeight: 900, fontSize: layout.highlight, lineHeight: 1.12, color: c.accent, marginTop: 4 }}>
          {slide.highlight.trim()}
        </div>
      )}
    </div>
  );
}

/** Foto de fundo da capa com vinheta: topo livre (rosto) e texto legível embaixo. */
function photoLayers(src: string, c: PaletteColors) {
  return [
    // eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori, não pelo navegador
    <img key="photo" src={src} alt="" width={CAROUSEL_SIZE} height={CAROUSEL_SIZE} style={{ position: "absolute", top: 0, left: 0, width: CAROUSEL_SIZE, height: CAROUSEL_SIZE, objectFit: "cover" }} />,
    <div
      key="vignette"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: CAROUSEL_SIZE,
        height: CAROUSEL_SIZE,
        backgroundImage: `linear-gradient(180deg, ${rgba(c.bg, 0.55)} 0%, ${rgba(c.bg, 0.05)} 22%, ${rgba(c.bg, 0.15)} 40%, ${rgba(c.bg, 0.85)} 62%, ${c.bg} 80%)`,
      }}
    />,
  ];
}

function Cover({ slide, ctx }: { slide: CarouselSlide; ctx: Ctx }) {
  const { c, carousel, layout } = ctx;
  return (
    <div style={PAGE}>
      <Header c={c} carousel={carousel} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: ctx.photo ? "flex-end" : "center", flexGrow: 1, overflow: "hidden", margin: `${FRAME.gap}px 0` }}>
        <Eyebrow text={slide.eyebrow} c={c} />
        <div style={{ display: "flex", marginTop: slide.eyebrow.trim() ? FRAME.gap : 0 }}>
          <Heading slide={slide} ctx={ctx} />
        </div>
        {slide.body.trim() && <div style={{ fontFamily: "DM Sans", fontSize: layout.body, lineHeight: 1.35, color: c.body, marginTop: FRAME.gap, maxWidth: 880 }}>{slide.body.trim()}</div>}
      </div>
      <Footer c={c} left={<div style={{ color: c.text }}>SALVA ESSE POST ↓</div>} right={<div style={{ display: "flex" }}>{`ARRASTA · ${slideNumber(ctx.index, ctx.total)}`}</div>} />
    </div>
  );
}

function Content({ slide, ctx }: { slide: CarouselSlide; ctx: Ctx }) {
  const { c, carousel, layout, index, total } = ctx;
  const bullets = slide.bullets.map((b) => b.trim()).filter(Boolean);
  return (
    <div style={PAGE}>
      <Header c={c} carousel={carousel} />
      <div style={{ display: "flex", height: 2, backgroundColor: c.border, marginTop: FRAME.gap }} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, overflow: "hidden", margin: `${FRAME.gap}px 0` }}>
        <div style={{ display: "flex", alignItems: "center", height: 56 }}>
          <div style={{ display: "flex", fontFamily: "Bebas Neue", fontSize: 46, color: c.bg, backgroundColor: c.accent, padding: "4px 14px 0", borderRadius: 6, lineHeight: 1 }}>
            {String(index + 1).padStart(2, "0")}
          </div>
          {slide.eyebrow.trim() && <div style={{ ...mono(24, c.accent, 700), marginLeft: 18 }}>{upper(slide.eyebrow.trim())}</div>}
        </div>
        <div style={{ display: "flex", marginTop: FRAME.gap }}>
          <Heading slide={slide} ctx={ctx} />
        </div>
        {slide.body.trim() && <div style={{ fontFamily: "DM Sans", fontSize: layout.body, lineHeight: 1.35, color: c.body, marginTop: FRAME.gap }}>{slide.body.trim()}</div>}
        {bullets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: FRAME.gap }}>
            {bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", marginTop: i ? 18 : 0 }}>
                <div style={{ width: 16, height: 16, backgroundColor: c.accent, borderRadius: 3, marginTop: Math.round(layout.bullet * 0.42), marginRight: 26, flexShrink: 0 }} />
                <div style={{ fontFamily: "DM Sans", fontWeight: 500, fontSize: layout.bullet, lineHeight: 1.3, color: c.body, flex: 1 }}>{b}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer c={c} left={<div>{carousel.handle || upper(carousel.brand)}</div>} right={<div style={{ color: c.accent, fontWeight: 700 }}>{slideNumber(index, total)}</div>} />
    </div>
  );
}

function Cta({ slide, ctx }: { slide: CarouselSlide; ctx: Ctx }) {
  const { c, carousel, layout, index, total } = ctx;
  return (
    <div style={PAGE}>
      <Header c={c} carousel={carousel} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, overflow: "hidden", margin: `${FRAME.gap}px 0` }}>
        <Eyebrow text={slide.eyebrow} c={c} />
        <div style={{ display: "flex", marginTop: slide.eyebrow.trim() ? FRAME.gap : 0 }}>
          <Heading slide={slide} ctx={ctx} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: FRAME.gap,
            padding: "40px 44px",
            backgroundColor: c.card,
            border: `2px solid ${rgba(c.accent, 0.55)}`,
            borderRadius: 24,
          }}
        >
          <div style={{ ...mono(24, c.text, 700) }}>COMENTA AQUI ↓</div>
          {slide.keyword.trim() && <div style={{ fontFamily: "Bebas Neue", fontSize: layout.keyword, lineHeight: 0.95, color: c.accent, marginTop: 10, letterSpacing: 2 }}>{upper(slide.keyword.trim())}</div>}
          {slide.body.trim() && <div style={{ fontFamily: "DM Sans", fontSize: layout.body, lineHeight: 1.3, color: c.body, marginTop: 12 }}>{slide.body.trim()}</div>}
        </div>
      </div>
      <Footer
        c={c}
        left={
          carousel.handle ? (
            <div style={{ display: "flex" }}>
              <span style={{ marginRight: 14 }}>SIGA</span>
              <span style={{ color: c.accent, fontWeight: 700 }}>{carousel.handle}</span>
            </div>
          ) : (
            <div>{upper(carousel.brand)}</div>
          )
        }
        right={<div style={{ color: c.accent, fontWeight: 700 }}>{slideNumber(index, total)}</div>}
      />
    </div>
  );
}

export function slideElement(carousel: Carousel, index: number) {
  const slide = carousel.slides[index];
  const c = paletteColors(carousel.palette, carousel.accent);
  const photo = slide.kind === "capa" && carousel.photo && PHOTO_RE.test(carousel.photo) ? carousel.photo : null;
  const hasPhoto = Boolean(photo);
  const ctx: Ctx = { c, carousel, index, total: carousel.slides.length, layout: slideLayout(slide, hasPhoto), photo: hasPhoto };
  const Body = slide.kind === "capa" ? Cover : slide.kind === "cta" ? Cta : Content;
  return (
    <div
      style={{
        width: CAROUSEL_SIZE,
        height: CAROUSEL_SIZE,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        backgroundColor: c.bg,
        color: c.text,
        fontFamily: "DM Sans",
      }}
    >
      {photo && photoLayers(photo, c)}
      {decorations(c, hasPhoto)}
      <Body slide={slide} ctx={ctx} />
    </div>
  );
}

/** PNG 1080×1080 de um slide. */
export async function renderSlidePng(carousel: Carousel, index: number): Promise<Buffer> {
  if (!carousel.slides[index]) throw new RangeError(`Slide ${index + 1} inexistente`);
  const res = new ImageResponse(slideElement(carousel, index), { width: CAROUSEL_SIZE, height: CAROUSEL_SIZE, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}
