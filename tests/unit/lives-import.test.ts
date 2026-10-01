import { describe, expect, it } from "vitest";
import { DEFAULT_ANS_AGE_BANDS } from "@/lib/domain/age";
import { autoMapColumns } from "@/lib/lives-import/normalize";
import { summarizeLives } from "@/lib/lives-import/summary";
import { hasErrors, validateLifeRows } from "@/lib/lives-import/validate";
import { parseWorkbook, WorkbookError } from "@/server/lives-import/parse-workbook";
import { buildWorkbook, HEADER, toXlsm } from "../helpers/workbook";

const REF = "2026-10-01";
const CNPJ = "11.222.333/0001-81";
const opts = { referenceDate: REF, ageBands: DEFAULT_ANS_AGE_BANDS, firstRowNumber: 2 };

const valid = [
  ["ACME", CNPJ, new Date(Date.UTC(1985, 4, 10)), 41, "39 a 43", "TITULAR", "", "ATIVO", "", "São Paulo", "SP", "Operadora X", "Plano A"],
  ["ACME", CNPJ, "10/05/2015", "", "", "DEPENDENTE", "FILHO", "ATIVO", "", "São Paulo", "SP", "Operadora X", "Plano A"],
  ["ACME", CNPJ, "1950-01-01", "", "", "AGREGADO", "PAI", "AFASTADO", "M54.5", "Campinas", "SP", "Operadora X", "Plano B"],
];

describe("mapeamento de colunas", () => {
  it("reconhece as 13 colunas do layout BASE SAÚDE", () => {
    const m = autoMapColumns(HEADER);
    expect(Object.values(m).every((v) => v !== null)).toBe(true);
    expect(m.cnpj).toBe(1);
    expect(m.plano_atual).toBe(12);
  });
  it("aceita sinônimos e ordem diferente", () => {
    const m = autoMapColumns(["Plano", "Operadora", "UF", "Município", "Data Nasc", "Tipo Beneficiário", "Parentesco", "CNPJ"]);
    expect(m.plano_atual).toBe(0);
    expect(m.seguradora_atual).toBe(1);
    expect(m.cidade).toBe(3);
    expect(m.data_nascimento).toBe(4);
    expect(m.titularidade).toBe(5);
    expect(m.empresa).toBe(null);
  });
});

describe("leitura de planilha", () => {
  it("lê XLSM e reconhece a aba BASE SAÚDE mesmo com outras abas e linhas de título", async () => {
    const xlsx = await buildWorkbook(valid, { extraSheets: ["INSTRUÇÕES"], preRows: [["Base de vidas — modelo"], []] });
    const parsed = await parseWorkbook(await toXlsm(xlsx));
    expect(parsed.sheetName).toBe("BASE SAÚDE");
    expect(parsed.sheetNames).toEqual(["INSTRUÇÕES", "BASE SAÚDE"]);
    expect(parsed.headerRowNumber).toBe(3);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.autoMapping.cnpj).toBe(1);
  });
  it("escolhe a aba pelo cabeçalho quando o nome difere", async () => {
    const parsed = await parseWorkbook(await buildWorkbook(valid, { sheetName: "Planilha1", extraSheets: ["Capa"] }));
    expect(parsed.sheetName).toBe("Planilha1");
  });
  it("rejeita arquivo que não é planilha", async () => {
    await expect(parseWorkbook(Buffer.from("not a zip"))).rejects.toBeInstanceOf(WorkbookError);
  });
});

describe("validação linha a linha", () => {
  it("importação válida: calcula idade e faixa quando ausentes", async () => {
    const parsed = await parseWorkbook(await buildWorkbook(valid));
    const r = validateLifeRows(parsed.rows, parsed.autoMapping, opts);
    expect(r.lives).toHaveLength(3);
    expect(r.lives.filter(hasErrors)).toHaveLength(0);
    expect(r.lives[0].birthDate).toBe("1985-05-10");
    expect(r.lives[1]).toMatchObject({ age: 11, ageBand: "00 a 18", birthDate: "2015-05-10", holderType: "DEPENDENTE" });
    expect(r.lives[2]).toMatchObject({ age: 76, ageBand: "59 ou mais", cid: "M54.5", situation: "AFASTADO" });
    expect(r.lives[0].cnpj).toBe("11222333000181");
  });

  it("importação inválida: aponta cada erro com linha e campo", () => {
    const rows = [
      ["ACME", "123", "31/02/1990", "", "", "TITULAR", "", "", "", "São Paulo", "SP", "Op", "Plano"],
      ["ACME", CNPJ, "01/01/1990", "20", "19 a 23", "FILHO", "", "", "", "", "XX", "", ""],
      ["ACME", CNPJ, "01/01/2000", "", "", "DEPENDENTE", "", "ESTAGIARIO", "123", "Rio", "RJ", "Op", "Plano"],
      ["", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["ACME", CNPJ, "01/01/2030", "", "", "TITULAR", "", "", "", "Rio", "RJ", "Op", "Plano"],
    ];
    const r = validateLifeRows(rows, autoMapColumns(HEADER), opts);
    expect(r.skippedEmpty).toBe(1);
    expect(r.lives).toHaveLength(4);
    const [a, b, c, d] = r.lives;
    expect(a.rowNumber).toBe(2);
    expect(a.issues.map((i) => i.field)).toEqual(expect.arrayContaining(["cnpj", "data_nascimento"]));
    expect(b.issues.filter((i) => i.level === "error").map((i) => i.field)).toEqual(
      expect.arrayContaining(["titularidade", "cidade", "uf", "seguradora_atual", "plano_atual"]),
    );
    expect(b.issues.find((i) => i.field === "idade")?.level).toBe("warning");
    expect(b.issues.find((i) => i.field === "faixa_etaria")?.level).toBe("warning");
    expect(c.issues.find((i) => i.field === "grau_parentesco")?.level).toBe("error");
    expect(c.issues.find((i) => i.field === "situacao")?.level).toBe("warning");
    expect(c.issues.find((i) => i.field === "cid")?.level).toBe("warning");
    expect(d.rowNumber).toBe(6);
    expect(d.issues.find((i) => i.field === "data_nascimento")?.message).toMatch(/futuro/);
  });

  it("detecta duplicidade", () => {
    const r = validateLifeRows([valid[1], valid[1]], autoMapColumns(HEADER), opts);
    expect(r.lives[1].issues.some((i) => /duplicada/.test(i.message))).toBe(true);
  });

  it("aceita CNPJ numérico sem zeros à esquerda (célula numérica)", () => {
    const row = [...valid[0]];
    row[1] = 6990590000123;
    const r = validateLifeRows([row], autoMapColumns(HEADER), opts);
    expect(r.lives[0].cnpj).toBe("06990590000123");
    expect(hasErrors(r.lives[0])).toBe(false);
  });
});

describe("resumo da população", () => {
  it("totaliza por titularidade, faixa, plano, CNPJ, UF e situações", async () => {
    const parsed = await parseWorkbook(await buildWorkbook(valid));
    const r = validateLifeRows(parsed.rows, parsed.autoMapping, opts);
    const s = summarizeLives(r.lives, DEFAULT_ANS_AGE_BANDS);
    expect(s).toMatchObject({ total: 3, titulares: 1, dependentes: 1, agregados: 1, withCid: 1, specialSituations: 1, incomplete: 0 });
    expect(s.byPlan).toEqual([
      { key: "Plano A", count: 2 },
      { key: "Plano B", count: 1 },
    ]);
    expect(s.byAgeBand.map((b) => b.key)).toEqual(["00 a 18", "39 a 43", "59 ou mais"]);
    expect(s.byUf).toEqual([{ key: "SP", count: 3 }]);
    expect(s.byCity[0]).toEqual({ key: "São Paulo/SP", count: 2 });
  });
});
