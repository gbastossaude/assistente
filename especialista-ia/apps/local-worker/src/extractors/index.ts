import { extractCsv, extractDocx, extractPlainText, extractXlsx, decodeText } from "./office.ts";
import { extractPdf } from "./pdf.ts";
import { type ExtractionResult, UnsupportedFileError } from "./types.ts";

export { ocrAvailable, ocrPdf } from "./ocr.ts";
export * from "./types.ts";

export function detectFormat(fileName: string, mime: string): ExtractionResult["format"] {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || mime.includes("wordprocessingml")) return "docx";
  if (ext === "xlsx" || mime.includes("spreadsheetml")) return "xlsx";
  if (ext === "csv" || mime === "text/csv") return "csv";
  if (["txt", "md"].includes(ext) || mime.startsWith("text/")) return "txt";
  throw new UnsupportedFileError(`Formato não suportado: ${fileName} (${mime}). Use PDF, DOCX, XLSX, CSV ou TXT.`);
}

/** Verifica a assinatura binária para não processar um arquivo renomeado. */
export function checkMagicBytes(format: ExtractionResult["format"], data: Uint8Array): boolean {
  const head = Array.from(data.slice(0, 4));
  if (format === "pdf") return String.fromCharCode(...head) === "%PDF";
  if (format === "docx" || format === "xlsx") return head[0] === 0x50 && head[1] === 0x4b; // ZIP
  return !data.slice(0, 2048).includes(0);
}

export async function extractDocument(fileName: string, mime: string, data: Uint8Array): Promise<ExtractionResult> {
  const format = detectFormat(fileName, mime);
  if (!checkMagicBytes(format, data)) {
    throw new UnsupportedFileError(`O conteúdo do arquivo não corresponde ao formato ${format.toUpperCase()}.`);
  }
  switch (format) {
    case "pdf": return { format, pages: await extractPdf(data), ocrUsed: false, notes: [] };
    case "docx": return { format, pages: await extractDocx(data), ocrUsed: false, notes: ["DOCX dividido em seções de ~3.000 caracteres (sem paginação)."] };
    case "xlsx": return { format, pages: await extractXlsx(data), ocrUsed: false, notes: ["Planilha convertida em linhas 'coluna: valor'."] };
    case "csv": return { format, pages: extractCsv(decodeText(data)), ocrUsed: false, notes: [] };
    case "txt": return { format, pages: extractPlainText(data), ocrUsed: false, notes: [] };
  }
}
