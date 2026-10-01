import ExcelJS from "exceljs";
import JSZip from "jszip";

export const HEADER = [
  "EMPRESA",
  "CNPJ",
  "DATA DE NASCIMENTO",
  "IDADE",
  "FAIXA ETÁRIA",
  "TITULARIDADE",
  "GRAU DE PARENTESCO",
  "SITUAÇÃO",
  "CID",
  "CIDADE",
  "UF",
  "SEGURADORA ATUAL",
  "PLANO ATUAL",
];

export async function buildWorkbook(rows: unknown[][], opts: { sheetName?: string; header?: string[]; preRows?: unknown[][]; extraSheets?: string[] } = {}) {
  const wb = new ExcelJS.Workbook();
  for (const s of opts.extraSheets ?? []) wb.addWorksheet(s).addRow(["instruções"]);
  const ws = wb.addWorksheet(opts.sheetName ?? "BASE SAÚDE");
  for (const r of opts.preRows ?? []) ws.addRow(r);
  ws.addRow(opts.header ?? HEADER);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Converte um .xlsx em .xlsm (content-type macroEnabled + vbaProject.bin fictício). */
export async function toXlsm(xlsx: Buffer) {
  const zip = await JSZip.loadAsync(xlsx);
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    ct
      .replace("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", "application/vnd.ms-excel.sheet.macroEnabled.main+xml")
      .replace("</Types>", '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>'),
  );
  zip.file("xl/vbaProject.bin", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]));
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
