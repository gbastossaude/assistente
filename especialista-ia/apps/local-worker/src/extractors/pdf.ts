import type { PageText } from "@especialista/ai-core";

/** Extrai o texto de cada página com pdf.js (JavaScript puro, sem dependências nativas). */
export async function extractPdf(data: Uint8Array): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const pages: PageText[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = "";
      let lastY: number | null = null;
      for (const item of content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5] ?? null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !text.endsWith("\n")) text += "\n";
        text += item.str;
        if (item.hasEOL) text += "\n";
        lastY = y;
      }
      pages.push({ page: i, text });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
