import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCarousel } from "@/lib/domain/instagram-carousel";
import { buildCarouselZip, readCarouselRequest, renderSlides } from "@/server/carousel/export";
import { renderSlidePng } from "@/server/carousel/render";
import { BusinessError } from "@/server/errors";
import { generateCarousel } from "@/server/services/carousel";

const carousel = buildCarousel({ topic: "portabilidade", audience: null, slideCount: 4, keyword: null, brand: "BeSmart", handle: "@besmart.saude", palette: "editorial", accent: "azul" });

/** Largura e altura lidas do cabeçalho IHDR do PNG. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** JPEG mínimo válido (1×1) para a foto da capa. */
const JPEG_1PX =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

describe("carrossel — renderização PNG", () => {
  it("gera PNG 1080×1080 para capa (com e sem foto), conteúdo e CTA", async () => {
    for (const c of [carousel, { ...carousel, photo: `data:image/jpeg;base64,${JPEG_1PX}`, palette: "kraft" as const }]) {
      const slides = await renderSlides(c);
      expect(slides.map((s) => s.index)).toEqual([0, 1, 2, 3]);
      for (const s of slides) expect(pngSize(s.png)).toEqual({ width: 1080, height: 1080 });
    }
  });
  it("renderiza só os slides pedidos e recusa índice inexistente", async () => {
    expect((await renderSlides(carousel, [3, 1, 3, 9])).map((s) => s.index)).toEqual([1, 3]);
    await expect(renderSlidePng(carousel, 9)).rejects.toThrow(RangeError);
  });
  it("monta o ZIP com os PNGs e a legenda", async () => {
    const { fileName, data } = await buildCarouselZip(carousel);
    expect(fileName).toBe("carrossel-portabilidade.zip");
    const zip = await JSZip.loadAsync(data);
    expect(Object.keys(zip.files).sort()).toEqual(["legenda.txt", "slide_01.png", "slide_02.png", "slide_03.png", "slide_04.png"]);
    expect(pngSize(await zip.file("slide_04.png")!.async("nodebuffer"))).toEqual({ width: 1080, height: 1080 });
    expect(await zip.file("legenda.txt")!.async("string")).toContain("Comenta PORTAR");
  });
});

describe("carrossel — leitura da requisição", () => {
  const req = (body: string, headers: Record<string, string> = {}) => new Request("http://localhost/api/carrossel/zip", { method: "POST", body, headers });
  it("aceita o carrossel válido e normaliza os campos", async () => {
    const parsed = await readCarouselRequest(req(JSON.stringify({ carousel: { ...carousel, handle: "besmart.saude" }, indexes: [0] })));
    expect(parsed.carousel.handle).toBe("@besmart.saude");
    expect(parsed.indexes).toEqual([0]);
  });
  it("recusa JSON inválido, dados inválidos e corpo grande demais", async () => {
    await expect(readCarouselRequest(req("{"))).rejects.toThrow(BusinessError);
    await expect(readCarouselRequest(req(JSON.stringify({ carousel: { ...carousel, palette: "neon" } })))).rejects.toThrow("Paleta inválido");
    await expect(readCarouselRequest(req("{}", { "content-length": String(10_000_000) }))).rejects.toThrow(/grande demais/);
  });
});

describe("carrossel — geração sem Claude", () => {
  it("usa o modelo local e avisa quando o modelo pronto tem menos slides que o pedido", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const brief = { topic: "Carência", audience: null, keyword: null, brand: "BeSmart", handle: "", palette: "besmart", accent: "verde" } as const;
      const capped = await generateCarousel({ ...brief, slideCount: 8 });
      expect(capped).toMatchObject({ mode: "local", note: expect.stringMatching(/tem 6 slides/) });
      expect(capped.carousel.slides).toHaveLength(6);
      expect((await generateCarousel({ ...brief, slideCount: 6 })).note).toBeUndefined();
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
