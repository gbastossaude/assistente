import { describe, expect, it } from "vitest";
import { carouselTopic, routeIntent } from "@/lib/assistant/router";
import {
  availableHeight,
  buildCarousel,
  CAROUSEL_ACCENTS,
  CAROUSEL_PALETTES,
  CAROUSEL_TEMPLATES,
  carouselChecklist,
  carouselMarkdown,
  carouselZipName,
  contrastRatio,
  emptySlide,
  estimateLines,
  findTemplate,
  normalizeHandle,
  paletteColors,
  paletteContrastIssues,
  slideFileName,
  slideLayout,
  slideNumber,
  type CarouselBrief,
  type CarouselSlide,
} from "@/lib/domain/instagram-carousel";
import { carouselBriefSchema, carouselSchema } from "@/lib/validation/schemas";

const brief: CarouselBrief = { topic: "Coparticipação vale a pena?", audience: null, slideCount: 7, keyword: null, brand: "BeSmart", handle: "@besmart.saude", palette: "besmart", accent: "dourado" };
const slide = (patch: Partial<CarouselSlide>): CarouselSlide => ({ ...emptySlide("conteudo"), ...patch });
const failing = (c: ReturnType<typeof buildCarousel>) => carouselChecklist(c).filter((i) => !i.ok).map((i) => i.label);

describe("carrossel — cores e utilitários", () => {
  it("todas as paletas e cores de destaque passam no contraste mínimo", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    for (const p of CAROUSEL_PALETTES) for (const a of CAROUSEL_ACCENTS) expect(paletteContrastIssues(paletteColors(p, a)), `${p}/${a}`).toEqual([]);
  });
  it("aponta contraste insuficiente", () => {
    expect(paletteContrastIssues({ ...paletteColors("editorial", "azul"), muted: "#1e1e1e" })).toEqual([expect.stringMatching(/^Rodapé: 1\.\d:1/)]);
  });
  it("normaliza @, numeração, arquivos e nome do ZIP", () => {
    expect(normalizeHandle(" besmart.saude ")).toBe("@besmart.saude");
    expect(normalizeHandle("@@ be smart")).toBe("@besmart");
    expect(normalizeHandle("  ")).toBe("");
    expect(slideNumber(1, 7)).toBe("02/07");
    expect(slideFileName(9)).toBe("slide_10.png");
    expect(carouselZipName("Coparticipação vale a pena?")).toBe("carrossel-coparticipacao-vale-a-pena.zip");
    expect(carouselZipName("???")).toBe("carrossel.zip");
  });
});

describe("carrossel — layout no quadro 1080×1080", () => {
  it("estima linhas com quebra por palavra", () => {
    expect(estimateLines("", 40, 900, 0.5)).toBe(0);
    expect(estimateLines("uma linha curta", 40, 900, 0.5)).toBe(1);
    expect(estimateLines("palavra ".repeat(40), 40, 900, 0.5)).toBeGreaterThan(3);
  });
  it("texto curto usa o tamanho cheio; longo encolhe; exagerado não cabe", () => {
    const short = slideLayout(slide({ title: "Plano PME", body: "Texto curto." }));
    expect(short).toMatchObject({ title: 140, fits: true });
    const long = slideLayout(slide({ title: "Um título bem comprido que ocupa várias linhas", body: "Frase média de exemplo. ".repeat(10), bullets: ["Item de lista com algum texto", "Outro item de lista com texto", "Mais um item"] }));
    expect(long.fits).toBe(true);
    expect(long.title).toBeLessThan(140);
    const huge = slideLayout(slide({ title: "Título ".repeat(10), highlight: "destaque ".repeat(6), body: "texto ".repeat(50), bullets: Array(5).fill("item comprido de lista ".repeat(4)) }));
    expect(huge.fits).toBe(false);
  });
  it("palavra longa reduz o título para não estourar a largura", () => {
    const l = slideLayout({ ...emptySlide("capa"), title: "Coparticipação" });
    expect(l.title).toBeLessThan(190);
    expect(14 * l.title * 0.43).toBeLessThanOrEqual(1080 - 2 * 76);
  });
  it("capa com foto reserva o topo para o rosto", () => {
    expect(availableHeight("capa", true)).toBeLessThan(availableHeight("capa", false));
  });
});

describe("carrossel — modelos prontos (modo local)", () => {
  it("encontra o modelo pelo tema", () => {
    expect(findTemplate("Quero falar de portabilidade")?.id).toBe("portabilidade");
    expect(findTemplate("Reajuste por faixa etária")?.id).toBe("reajuste");
    expect(findTemplate("5 erros ao contratar")?.id).toBe("erros");
    expect(findTemplate("Plano de saúde para MEI")?.id).toBe("pme");
    expect(findTemplate("Dicas de saúde mental")).toBeNull();
  });
  it("monta capa, conteúdo e CTA com palavra-chave e legenda", () => {
    const c = buildCarousel(brief);
    expect(c.slides.map((s) => s.kind)).toEqual(["capa", "conteudo", "conteudo", "conteudo", "conteudo", "conteudo", "cta"]);
    expect(c.slides[6].keyword).toBe("COPART");
    expect(c.caption).toContain("Comenta COPART");
    expect(c.caption).toContain("@besmart.saude");
    expect(c.caption).toMatch(/variam conforme operadora/);
    expect(failing(c)).toEqual([]);
  });
  it("respeita a quantidade pedida sem criar slides a completar no modelo pronto", () => {
    expect(buildCarousel({ ...brief, slideCount: 4 }).slides).toHaveLength(4);
    const carencia = buildCarousel({ ...brief, topic: "carência", slideCount: 10 });
    expect(carencia.slides).toHaveLength(6);
    expect(failing(carencia)).toEqual([]);
    expect(buildCarousel({ ...brief, slideCount: 1 }).slides).toHaveLength(3);
  });
  it("palavra-chave do usuário prevalece", () => {
    const c = buildCarousel({ ...brief, keyword: "quero" });
    expect(c.slides.at(-1)?.keyword).toBe("QUERO");
    expect(c.caption).toContain("Comenta QUERO");
  });
  it("todos os modelos cabem no quadro e passam no checklist", () => {
    for (const t of CAROUSEL_TEMPLATES) {
      const c = buildCarousel({ ...brief, topic: t.label, slideCount: 10 });
      expect(findTemplate(t.label)?.id, t.label).toBe(t.id);
      expect(failing(c), t.label).toEqual([]);
      expect(failing({ ...c, photo: "data:image/jpeg;base64,AAAA" }), `${t.label} com foto`).toEqual([]);
    }
  });
  it("tema sem modelo vira estrutura com textos a completar", () => {
    const c = buildCarousel({ ...brief, topic: "Saúde mental no trabalho", slideCount: 5 });
    expect(c.slides).toHaveLength(5);
    expect(c.slides[0].title).toBe("Saúde mental no trabalho");
    expect(c.slides.at(-1)?.keyword).toBe("QUERO");
    expect(failing(c)).toEqual(["Sem texto de exemplo entre colchetes"]);
  });
});

describe("carrossel — checklist e roteiro", () => {
  it("aponta estrutura, @, palavra-chave e texto longo", () => {
    const c = buildCarousel(brief);
    const broken = {
      ...c,
      handle: "",
      slides: [c.slides[1], { ...c.slides[2], title: "", body: "", bullets: [] }, { ...c.slides[3], body: "texto ".repeat(200) }, { ...c.slides[6], keyword: "DUAS PALAVRAS" }],
    };
    expect(failing(broken)).toEqual([
      "Capa no início, CTA no final e conteúdo no meio",
      "Todo slide tem título (e o de conteúdo, texto ou lista)",
      "Nenhum texto cortado no quadro 1080×1080",
      "Handle @ no rodapé",
      "CTA com palavra-chave clara (uma palavra)",
    ]);
  });
  it("gera o roteiro em texto", () => {
    const md = carouselMarkdown(buildCarousel(brief));
    expect(md).toContain("**Carrossel: Coparticipação vale a pena?** · 7 slides · @besmart.saude");
    expect(md).toContain("**07/07 · CTA final**");
    expect(md).toContain("Palavra-chave: **COPART**");
    expect(md).toContain("**Legenda**");
  });
});

describe("carrossel — validação", () => {
  const form = { topic: "Carência", audience: "", slideCount: "6", keyword: " copart ", brand: "BeSmart", handle: "besmart.saude", palette: "kraft", accent: "coral" };
  it("valida o briefing", () => {
    const r = carouselBriefSchema.safeParse(form);
    expect(r.success && r.data).toMatchObject({ slideCount: 6, keyword: "COPART", handle: "@besmart.saude", audience: null });
    expect(carouselBriefSchema.safeParse({ ...form, slideCount: "" }).data?.slideCount).toBe(7);
    expect(carouselBriefSchema.safeParse({ ...form, slideCount: "11" }).success).toBe(false);
    expect(carouselBriefSchema.safeParse({ ...form, keyword: "duas palavras" }).success).toBe(false);
    expect(carouselBriefSchema.safeParse({ ...form, handle: "@com espaço/invalido!" }).success).toBe(false);
    expect(carouselBriefSchema.safeParse({ ...form, palette: "neon" }).success).toBe(false);
    expect(carouselBriefSchema.safeParse({ ...form, topic: " " }).success).toBe(false);
  });
  it("valida o carrossel enviado para renderizar", () => {
    const c = buildCarousel(brief);
    const ok = carouselSchema.safeParse({ ...c, slides: c.slides.map((s, i) => (i === 1 ? { ...s, bullets: ["  um ", "", "dois"] } : s)) });
    expect(ok.success && ok.data.slides[1].bullets).toEqual(["um", "dois"]);
    expect(carouselSchema.safeParse({ ...c, photo: "data:image/jpeg;base64,/9j/4AAQ" }).success).toBe(true);
    expect(carouselSchema.safeParse({ ...c, photo: "https://exemplo.com/foto.jpg" }).success).toBe(false);
    expect(carouselSchema.safeParse({ ...c, photo: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
    expect(carouselSchema.safeParse({ ...c, slides: c.slides.slice(0, 2) }).success).toBe(false);
    expect(carouselSchema.safeParse({ ...c, slides: [...c.slides, ...c.slides] }).success).toBe(false);
    expect(carouselSchema.safeParse({ ...c, slides: [{ ...c.slides[0], title: "x".repeat(71) }, ...c.slides.slice(1)] }).success).toBe(false);
  });
});

describe("carrossel — assistente", () => {
  it("extrai o tema do pedido", () => {
    expect(carouselTopic("Crie um carrossel sobre portabilidade de carências com 6 slides")).toBe("portabilidade de carências");
    expect(carouselTopic("Monte um carrossel para o Instagram de 5 slides sobre coparticipação?")).toBe("coparticipação");
    expect(carouselTopic("carrossel de carência")).toBe("carência");
    expect(carouselTopic("faça um carrossel")).toBe("");
  });
  it("roteador local reconhece o pedido de carrossel", () => {
    expect(routeIntent("Crie um carrossel sobre portabilidade de carências com 6 slides", "2026-10-06")).toEqual({
      tool: "carrossel_instagram",
      input: { tema: "portabilidade de carências", slides: 6, palavra_chave: "" },
    });
    expect(routeIntent("Monte um carrossel de cinco slides sobre reajuste", "2026-10-06")).toMatchObject({ tool: "carrossel_instagram", input: { tema: "reajuste", slides: 5 } });
    expect(routeIntent("Quero um carrossel", "2026-10-06")).toMatchObject({ tool: "carrossel_instagram", input: { tema: "", slides: 0 } });
  });
});
