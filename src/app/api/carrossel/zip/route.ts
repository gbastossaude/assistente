import { NextResponse } from "next/server";
import { apiHandler } from "@/server/api-utils";
import { buildCarouselZip, readCarouselRequest } from "@/server/carousel/export";

export const runtime = "nodejs";

/** Download do carrossel: ZIP com os PNGs 1080×1080 e a legenda. */
export async function POST(req: Request) {
  return apiHandler(
    "content:write",
    async () => {
      const { carousel } = await readCarouselRequest(req);
      const { fileName, data } = await buildCarouselZip(carousel);
      return new NextResponse(new Uint8Array(data), {
        headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "private, no-store" },
      });
    },
    "carousel-zip",
  );
}
