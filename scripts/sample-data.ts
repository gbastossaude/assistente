/** Geração de dados sintéticos (somente desenvolvimento/testes). Nenhum dado real. */
import ExcelJS from "exceljs";
import JSZip from "jszip";

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const dv = (base: string, w: number[]) => {
  const r = base.split("").reduce((a, c, i) => a + (c.charCodeAt(0) - 48) * w[i], 0) % 11;
  return r < 2 ? 0 : 11 - r;
};
/** CNPJ sintético válido a partir de uma semente. */
export function syntheticCnpj(seed: number, branch = 1) {
  const base = String(10_000_000 + ((seed * 7919) % 89_999_999)).padStart(8, "0") + String(branch).padStart(4, "0");
  const d1 = dv(base, W1);
  return base + d1 + dv(base + d1, W2);
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const CITIES: [string, string][] = [
  ["São Paulo", "SP"],
  ["Campinas", "SP"],
  ["Santos", "SP"],
  ["Rio de Janeiro", "RJ"],
  ["Belo Horizonte", "MG"],
  ["Curitiba", "PR"],
];

export interface SampleOpts {
  companyName: string;
  cnpjs: string[];
  insurer: string;
  plans: string[];
  rows: number;
  seed?: number;
  withErrors?: boolean;
}

export function sampleLivesRows(o: SampleOpts): unknown[][] {
  const r = rng(o.seed ?? 42);
  const out: unknown[][] = [];
  while (out.length < o.rows) {
    const cnpj = o.cnpjs[Math.floor(r() * o.cnpjs.length)];
    const [city, uf] = CITIES[Math.floor(r() * CITIES.length)];
    const plan = o.plans[Math.floor(r() * o.plans.length)];
    const age = 19 + Math.floor(r() * 45);
    const birth = new Date(Date.UTC(2026 - age, Math.floor(r() * 12), 1 + Math.floor(r() * 27)));
    const situation = r() < 0.03 ? "AFASTADO" : r() < 0.02 ? "GESTANTE" : "ATIVO";
    const sex = situation === "GESTANTE" || r() < 0.48 ? "F" : "M";
    out.push([o.companyName, cnpj, birth, "", "", "TITULAR", "", situation, situation === "AFASTADO" ? "M54.5" : "", city, uf, o.insurer, plan, sex]);
    const deps = r() < 0.55 ? 1 + Math.floor(r() * 2) : 0;
    for (let d = 0; d < deps && out.length < o.rows; d++) {
      const child = r() < 0.6;
      const dAge = child ? Math.floor(r() * 18) : 18 + Math.floor(r() * 45);
      const dBirth = new Date(Date.UTC(2026 - dAge - 1, Math.floor(r() * 12), 1 + Math.floor(r() * 27)));
      out.push([o.companyName, cnpj, dBirth, "", "", "DEPENDENTE", child ? "FILHO(A)" : "CÔNJUGE", "ATIVO", "", city, uf, o.insurer, plan, child ? (r() < 0.5 ? "F" : "M") : sex === "F" ? "M" : "F"]);
    }
    if (r() < 0.02 && out.length < o.rows) out.push([o.companyName, cnpj, new Date(Date.UTC(1950, 3, 3)), "", "", "AGREGADO", "PAI", "AGREGADO", "", city, uf, o.insurer, plan, "M"]);
  }
  if (o.withErrors) {
    out.push([o.companyName, "12.345.678/0001-00", "31/02/1980", "", "", "TITULAR", "", "ATIVO", "", "São Paulo", "SP", o.insurer, o.plans[0], "M"]);
    out.push([o.companyName, o.cnpjs[0], "10/10/1990", "40", "19 a 23", "DEP", "", "ATIVO", "", "", "XX", o.insurer, "", "Z"]);
    out.push(["", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  }
  return out;
}

export const HEADER = ["EMPRESA", "CNPJ", "DATA DE NASCIMENTO", "IDADE", "FAIXA ETÁRIA", "TITULARIDADE", "GRAU DE PARENTESCO", "SITUAÇÃO", "CID", "CIDADE", "UF", "SEGURADORA ATUAL", "PLANO ATUAL", "SEXO"];

export async function buildBaseWorkbook(rows: unknown[][], xlsm = true): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet("INSTRUÇÕES");
  info.addRow(["Planilha SINTÉTICA gerada para testes — layout da aba BASE SAÚDE (13 colunas + SEXO, recomendada)."]);
  const ws = wb.addWorksheet("BASE SAÚDE");
  const h = ws.addRow(HEADER);
  h.font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.getColumn(3).numFmt = "dd/mm/yyyy";
  ws.columns.forEach((c) => (c.width = 18));
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  if (!xlsm) return buf;
  const zip = await JSZip.loadAsync(buf);
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    ct.replace("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", "application/vnd.ms-excel.sheet.macroEnabled.main+xml"),
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
