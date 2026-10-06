import "server-only";
import JSZip from "jszip";
import { CAROUSEL_PHOTO_MAX_CHARS, carouselZipName, slideFileName, type Carousel } from "@/lib/domain/instagram-carousel";
import { carouselRenderSchema } from "@/lib/validation/schemas";
import { parseInput } from "../action-utils";
import { BusinessError } from "../errors";
import { renderSlidePng } from "./render";

/** Limite do corpo da requisição: textos dos slides + foto da capa (já reduzida no navegador). */
const MAX_BODY_CHARS = CAROUSEL_PHOTO_MAX_CHARS + 200_000;

/** Lê e valida `{ carousel, indexes? }` do corpo JSON. */
export async function readCarouselRequest(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) throw new BusinessError("Conteúdo grande demais — use uma foto menor na capa.");
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) throw new BusinessError("Conteúdo grande demais — use uma foto menor na capa.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new BusinessError("Dados do carrossel inválidos.");
  }
  return parseInput(carouselRenderSchema, json);
}

/** Renderiza os slides pedidos (em sequência: a renderização usa CPU e não ganha com paralelismo). */
export async function renderSlides(carousel: Carousel, indexes?: number[]): Promise<{ index: number; png: Buffer }[]> {
  const wanted = [...new Set(indexes ?? carousel.slides.map((_, i) => i))].filter((i) => i < carousel.slides.length).sort((a, b) => a - b);
  const out: { index: number; png: Buffer }[] = [];
  for (const index of wanted) out.push({ index, png: await renderSlidePng(carousel, index) });
  return out;
}

/** ZIP com slide_01.png … slide_NN.png (1080×1080) e a legenda em texto. */
export async function buildCarouselZip(carousel: Carousel): Promise<{ fileName: string; data: Buffer }> {
  const zip = new JSZip();
  for (const { index, png } of await renderSlides(carousel)) zip.file(slideFileName(index), png);
  if (carousel.caption.trim()) zip.file("legenda.txt", `${carousel.caption.trim()}\n`);
  // PNG já é comprimido: STORE evita gastar CPU à toa
  const data = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  return { fileName: carouselZipName(carousel.topic), data };
}
