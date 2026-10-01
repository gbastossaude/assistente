import { HEADER_SYNONYMS, LIFE_FIELDS, type ColumnMapping, type LifeField } from "./fields";

export function normalizeText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[_\s]+/g, " ")
    .trim();
}

export function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToString(o.result); // fórmula
    if ("text" in o) return cellToString(o.text); // hyperlink
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join("");
    return "";
  }
  return String(v).trim();
}

/** Converte valor de célula em data ISO. Aceita Date, serial Excel, dd/mm/aaaa, aaaa-mm-dd. */
export function cellToISODate(v: unknown): string | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object" && !(v instanceof Date) && "result" in (v as object)) return cellToISODate((v as { result: unknown }).result);
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "invalid";
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    if (v < 1 || v > 80000) return "invalid";
    const ms = Math.round((v - 25569) * 86_400_000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y > 30 ? 1900 : 2000;
    return isoIfValid(y, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d+(\.\d+)?$/.test(s)) return cellToISODate(Number(s));
  return "invalid";
}

function isoIfValid(y: number, m: number, d: number): string | "invalid" {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "invalid";
  return dt.toISOString().slice(0, 10);
}

/** Mapeamento automático por sinônimos. Cada coluna é usada no máximo uma vez. */
export function autoMapColumns(headers: unknown[]): ColumnMapping {
  const normalized = headers.map(normalizeText);
  const used = new Set<number>();
  const mapping = Object.fromEntries(LIFE_FIELDS.map((f) => [f, null])) as ColumnMapping;
  // Primeiro correspondências exatas, depois por prefixo/contém (evita "CNPJ" capturar "CNPJ SUBESTIPULANTE" antes do exato).
  for (const pass of ["exact", "contains"] as const) {
    for (const field of LIFE_FIELDS) {
      if (mapping[field] !== null) continue;
      const syns = HEADER_SYNONYMS[field];
      const idx = normalized.findIndex((h, i) => {
        if (used.has(i) || !h) return false;
        return pass === "exact" ? syns.includes(h) : syns.some((s) => s.length > 3 && h.includes(s));
      });
      if (idx >= 0) {
        mapping[field] = idx;
        used.add(idx);
      }
    }
  }
  return mapping;
}

export function mappingScore(mapping: ColumnMapping): number {
  return Object.values(mapping).filter((v) => v !== null).length;
}

/** Localiza a linha de cabeçalho nas primeiras linhas (a que mais casa com os sinônimos). */
export function findHeaderRow(rows: unknown[][], maxScan = 15): { index: number; mapping: ColumnMapping } | null {
  let best: { index: number; mapping: ColumnMapping; score: number } | null = null;
  rows.slice(0, maxScan).forEach((row, index) => {
    const mapping = autoMapColumns(row);
    const score = mappingScore(mapping);
    if (score >= 4 && (!best || score > best.score)) best = { index, mapping, score };
  });
  return best ? { index: (best as { index: number }).index, mapping: (best as { mapping: ColumnMapping }).mapping } : null;
}

export function normalizeHolderType(v: string): "TITULAR" | "DEPENDENTE" | "AGREGADO" | null {
  const s = normalizeText(v);
  if (!s) return null;
  if (["TITULAR", "TIT", "T", "TITULARES"].includes(s)) return "TITULAR";
  if (["DEPENDENTE", "DEP", "D", "DEPENDENTES"].includes(s)) return "DEPENDENTE";
  if (["AGREGADO", "AGR", "A", "AGREGADOS"].includes(s)) return "AGREGADO";
  return null;
}

export function fieldValue(row: unknown[], mapping: ColumnMapping, field: LifeField): unknown {
  const idx = mapping[field];
  return idx === null || idx === undefined ? undefined : row[idx];
}
