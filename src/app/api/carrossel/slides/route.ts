import { NextResponse } from "next/server";
import { apiHandler } from "@/server/api-utils";
import { readCarouselRequest, renderSlides } from "@/server/carousel/export";

export const runtime = "nodejs";

/** Prévia: PNGs 1080×1080 dos slides pedidos, como data URLs (a tela só pede os slides que mudaram). */
export async function POST(req: Request) {
  return apiHandler(
    "content:write",
    async () => {
      const { carousel, indexes } = await readCarouselRequest(req);
      const slides = await renderSlides(carousel, indexes);
      return NextResponse.json(
        { slides: slides.map(({ index, png }) => ({ index, png: `data:image/png;base64,${png.toString("base64")}` })) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    },
    "carousel-slides",
  );
}
