/**
 * Leitura de XLSX/XLSM (ExcelJS). Macros (vbaProject.bin) são ignoradas — nunca executadas.
 * O buffer original não é alterado.
 */
import ExcelJS from "exceljs";
import { SHEET_NAME_CANDIDATES, type ColumnMapping } from "@/lib/lives-import/fields";
import { autoMapColumns, cellToString, findHeaderRow, mappingScore, normalizeText } from "@/lib/lives-import/normalize";

export interface ParsedSheet {
  sheetNames: string[];
  sheetName: string;
  headerRowNumber: number; // 1-based (como no Excel)
  headers: string[];
  rows: unknown[][];
  autoMapping: ColumnMapping;
}

export class WorkbookError extends Error {}

const MAX_ROWS = 50_000;

function rowValues(row: ExcelJS.Row, width: number): unknown[] {
  const out: unknown[] = [];
  for (let c = 1; c <= width; c++) {
    const v = row.getCell(c).value;
    out.push(v === undefined ? null : v);
  }
  return out;
}

export async function parseWorkbook(buffer: Buffer | ArrayBuffer, preferredSheet?: string | null): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS aceita Buffer/ArrayBuffer; o tipo declarado é mais estreito do que o suportado.
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new WorkbookError("Não foi possível ler o arquivo. Envie uma planilha .xlsx ou .xlsm válida.");
  }
  const sheets = wb.worksheets.filter((s) => s.state !== "veryHidden");
  if (sheets.length === 0) throw new WorkbookError("A planilha não possui abas.");
  const sheetNames = sheets.map((s) => s.name);

  let sheet: ExcelJS.Worksheet | undefined;
  if (preferredSheet) {
    sheet = sheets.find((s) => s.name === preferredSheet);
    if (!sheet) throw new WorkbookError(`Aba "${preferredSheet}" não encontrada.`);
  } else {
    const candidates = SHEET_NAME_CANDIDATES.map(normalizeText);
    sheet = sheets.find((s) => candidates.includes(normalizeText(s.name)));
  }

  const read = (ws: ExcelJS.Worksheet) => {
    const width = Math.max(ws.columnCount, 13);
    const all: unknown[][] = [];
    const last = Math.min(ws.rowCount, MAX_ROWS + 20);
    for (let r = 1; r <= last; r++) all.push(rowValues(ws.getRow(r), width));
    return all;
  };

  // Sem aba padrão: escolhe a aba cujo cabeçalho melhor casa com o layout.
  let rows: unknown[][] = [];
  let header: { index: number; mapping: ColumnMapping } | null = null;
  if (sheet) {
    rows = read(sheet);
    header = findHeaderRow(rows);
  } else {
    let best = -1;
    for (const ws of sheets) {
      const r = read(ws);
      const h = findHeaderRow(r);
      const score = h ? mappingScore(h.mapping) : 0;
      if (score > best) {
        best = score;
        sheet = ws;
        rows = r;
        header = h;
      }
    }
  }
  if (!sheet) throw new WorkbookError("Nenhuma aba encontrada.");

  const headerIndex = header?.index ?? 0;
  const headerRow = rows[headerIndex] ?? [];
  const lastNonEmpty = headerRow.reduce<number>((acc, v, i) => (cellToString(v) ? i : acc), -1);
  const headers = headerRow.slice(0, Math.max(lastNonEmpty + 1, 1)).map((v) => cellToString(v));
  const data = rows.slice(headerIndex + 1);
  // remove linhas vazias do fim (rowCount do Excel costuma incluir formatação residual)
  while (data.length && data[data.length - 1].every((v) => cellToString(v) === "")) data.pop();
  if (data.length > MAX_ROWS) throw new WorkbookError(`A planilha excede o limite de ${MAX_ROWS} linhas.`);

  return {
    sheetNames,
    sheetName: sheet.name,
    headerRowNumber: headerIndex + 1,
    headers,
    rows: data.map((r) => r.slice(0, headers.length)),
    autoMapping: header?.mapping ?? autoMapColumns(headers),
  };
}
