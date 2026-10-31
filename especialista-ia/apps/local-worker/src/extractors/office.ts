import ExcelJS from "exceljs";
import mammoth from "mammoth";
import Papa from "papaparse";
import type { PageText } from "@especialista/ai-core";

const ROWS_PER_BLOCK = 25;

export async function extractDocx(data: Uint8Array): Promise<PageText[]> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
  // DOCX não tem páginas fixas: divide em blocos de ~3.000 caracteres numerados como "seções".
  const parts = value.split(/\n{2,}/);
  const pages: PageText[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + "\n\n" + p).length > 3000 && cur) {
      pages.push({ page: pages.length + 1, text: cur });
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur.trim()) pages.push({ page: pages.length + 1, text: cur });
  return pages;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return v.result === undefined || v.result === null ? "" : String(v.result);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

/** Tabelas viram linhas "Coluna: valor" (o cabeçalho acompanha cada bloco para manter o contexto). */
function rowsToBlocks(sheet: string, header: string[], rows: string[][]): string[] {
  const blocks: string[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_BLOCK) {
    const lines = rows.slice(i, i + ROWS_PER_BLOCK).map((r) =>
      r.map((v, c) => (v ? `${header[c] || `Coluna ${c + 1}`}: ${v}` : "")).filter(Boolean).join(" | "),
    );
    blocks.push(`Planilha "${sheet}" — linhas ${i + 2} a ${Math.min(i + ROWS_PER_BLOCK, rows.length) + 1}\n${lines.filter(Boolean).join("\n")}`);
  }
  return blocks;
}

export async function extractXlsx(data: Uint8Array): Promise<PageText[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
  const pages: PageText[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
      if (values.some(Boolean)) rows.push(values);
    });
    if (rows.length === 0) return;
    const [header, ...body] = rows;
    for (const block of rowsToBlocks(ws.name, header, body.length ? body : [header])) pages.push({ page: pages.length + 1, text: block });
  });
  return pages;
}

export function extractCsv(text: string): PageText[] {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true, delimiter: "" });
  const rows = parsed.data.map((r) => r.map((v) => String(v ?? "").trim()));
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return rowsToBlocks("CSV", header, body.length ? body : [header]).map((text, i) => ({ page: i + 1, text }));
}

export function decodeText(data: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(data);
  // Arquivos salvos em Windows-1252 geram caracteres de substituição em UTF-8.
  if ((utf8.match(/�/g) ?? []).length > 3) return new TextDecoder("windows-1252").decode(data);
  return utf8;
}

export function extractPlainText(data: Uint8Array): PageText[] {
  const text = decodeText(data).replace(/^﻿/, "");
  const parts = text.split(/\f/);
  return parts.map((t, i) => ({ page: i + 1, text: t }));
}
