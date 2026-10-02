/**
 * CSV para Excel pt-BR: separador ";", BOM UTF-8 e aspas quando necessário.
 * Proteção contra injeção de fórmula: valores iniciados por = + - @ (ou tab/CR) recebem um apóstrofo.
 */
export type CsvValue = string | number | boolean | null | undefined | Date;

function cell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "number") s = Number.isFinite(v) ? String(v).replace(".", ",") : "";
  else if (typeof v === "boolean") s = v ? "Sim" : "Não";
  else s = v;
  if (/^[=+\-@\t\r]/.test(s) && !(typeof v === "number")) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}
