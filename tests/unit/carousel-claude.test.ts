import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CarouselBrief } from "@/lib/domain/instagram-carousel";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static APIConnectionError = APIConnectionError;
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

const { generateCarousel } = await import("@/server/services/carousel");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const brief: CarouselBrief = { topic: "Portabilidade de carências", audience: null, slideCount: 5, keyword: "trocar", brand: "BeSmart", handle: "@besmart.saude", palette: "besmart", accent: "dourado" };
const s = (title: string, extra: Record<string, unknown> = {}) => ({ eyebrow: "Rótulo", title, highlight: "destaque", body: "Texto curto.", bullets: [], keyword: "", ...extra });
const reply = (json: unknown, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text: JSON.stringify(json) }] });
const valid = {
  slides: [s("Capa", { bullets: ["não vale na capa"] }), s("Um", { body: "", bullets: ["a", "b"] }), s("Dois"), s("Três"), s("CTA", { keyword: "portar" })],
  caption: "Legenda do Claude #planodesaude",
};

const savedKey = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  create.mockReset();
});
afterAll(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

describe("carrossel — geração com Claude", () => {
  it("usa os textos do Claude na estrutura pedida", async () => {
    create.mockResolvedValue(reply(valid));
    const r = await generateCarousel(brief);
    expect(r.mode).toBe("claude");
    expect(r.carousel.slides.map((x) => [x.kind, x.title])).toEqual([
      ["capa", "Capa"],
      ["conteudo", "Um"],
      ["conteudo", "Dois"],
      ["conteudo", "Três"],
      ["cta", "CTA"],
    ]);
    expect(r.carousel.slides[0].bullets).toEqual([]);
    expect(r.carousel.slides[1].bullets).toEqual(["a", "b"]);
    // a palavra-chave do usuário prevalece sobre a do Claude
    expect(r.carousel.slides[4].keyword).toBe("TROCAR");
    expect(r.carousel).toMatchObject({ caption: "Legenda do Claude #planodesaude", handle: "@besmart.saude", palette: "besmart" });

    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({ model: expect.any(String), betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium", format: { type: "json_schema" } } });
    const prompt = params.messages[0].content as string;
    expect(prompt).toContain("Estrutura (5 slides): 1=capa, 2=conteudo, 3=conteudo, 4=conteudo, 5=cta");
    expect(prompt).toContain("Roteiro de referência"); // tema com modelo pronto vira base factual
  });

  it("sem palavra-chave do usuário, usa a do Claude normalizada", async () => {
    create.mockResolvedValue(reply(valid));
    const r = await generateCarousel({ ...brief, keyword: null });
    expect(r.carousel.slides[4].keyword).toBe("PORTAR");
  });

  it("volta ao modelo local quando a resposta não serve", async () => {
    for (const bad of [reply({ ...valid, slides: valid.slides.slice(0, 4) }), reply(valid, "refusal"), reply(valid, "max_tokens"), { stop_reason: "end_turn", content: [{ type: "text", text: "{" }] }]) {
      create.mockResolvedValueOnce(bad);
      const r = await generateCarousel(brief);
      expect(r).toMatchObject({ mode: "local", note: expect.stringMatching(/incompleta/) });
      expect(r.carousel.slides[0].title).toBe("Portabilidade");
    }
  });

  it("volta ao modelo local quando a API falha e propaga outros erros", async () => {
    create.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: "sem rede" }));
    expect(await generateCarousel(brief)).toMatchObject({ mode: "local", note: expect.stringMatching(/indisponível/) });
    create.mockRejectedValueOnce(new TypeError("bug"));
    await expect(generateCarousel(brief)).rejects.toThrow("bug");
  });
});
