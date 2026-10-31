import { describe, expect, it } from "vitest";
import {
  assessExtractionQuality,
  chunkPages,
  citedIndices,
  parseModelAnswer,
  ungroundedNumbers,
  validateAnswer,
} from "../../packages/ai-core/src/index.ts";

describe("chunkPages", () => {
  it("divide preservando páginas, seções e sobreposição", () => {
    const para = (n: number) => `Parágrafo ${n}: ` + "regra de elegibilidade para contratação PME. ".repeat(8);
    const pages = [
      { page: 1, text: `ELEGIBILIDADE\n\n${para(1)}\n\n${para(2)}` },
      { page: 2, text: `${para(3)}\n\n${para(4)}\n\nCARÊNCIAS\n\n${para(5)}` },
    ];
    const chunks = chunkPages(pages, { chunkSize: 800, overlap: 150 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].pageFrom).toBe(1);
    expect(chunks[0].section).toBe("ELEGIBILIDADE");
    expect(chunks.at(-1)!.pageTo).toBe(2);
    expect(chunks.every((c) => c.content.length <= 800 + 400)).toBe(true);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    expect(chunks.some((c) => c.section === "CARÊNCIAS")).toBe(true);
  });

  it("lida com documento curto e com página vazia", () => {
    const chunks = chunkPages([{ page: 1, text: "Texto curto." }, { page: 2, text: "" }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Texto curto.");
  });
});

describe("assessExtractionQuality", () => {
  it("sinaliza PDF digitalizado (páginas sem texto)", () => {
    const q = assessExtractionQuality([{ page: 1, text: "" }, { page: 2, text: "x" }, { page: 3, text: "Conteúdo normal ".repeat(10) }]);
    expect(q.needsReview).toBe(true);
    expect(q.emptyPages).toEqual([1]);
    expect(q.lowTextPages).toEqual([2]);
  });
  it("capa curta não exige revisão; pouca densidade exige", () => {
    expect(assessExtractionQuality([{ page: 1, text: "Manual 2026" }, { page: 2, text: "Conteúdo normal e legível. ".repeat(10) }]).needsReview).toBe(false);
    expect(assessExtractionQuality([{ page: 1, text: "abc" }, { page: 2, text: "def" }]).needsReview).toBe(true);
  });
  it("aprova extração boa", () => {
    expect(assessExtractionQuality([{ page: 1, text: "Conteúdo normal e legível. ".repeat(10) }]).needsReview).toBe(false);
  });
});

describe("validação da saída do modelo", () => {
  it("interpreta JSON, inclusive cercado por ```", () => {
    const a = parseModelAnswer('```json\n{"status":"respondida","resposta":"Sim [1].","fontes":[1]}\n```');
    expect(a?.status).toBe("respondida");
    expect(a?.fontes).toEqual([1]);
    expect(parseModelAnswer("não é json")).toBeNull();
    expect(parseModelAnswer('{"status":"inventado","resposta":"x","fontes":[]}')).toBeNull();
  });

  it("extrai citações e detecta números sem respaldo", () => {
    expect(citedIndices("Regra A [1] e regra B [2, 3].")).toEqual([1, 2, 3]);
    expect(ungroundedNumbers("Mínimo de 3 vidas [1] e carência de 300 dias.", ["mínimo de 3 vidas", "carência de 180 dias"])).toEqual(["300"]);
    expect(ungroundedNumbers("1. Mínimo de 2 vidas [1]", ["mínimo de 2 vidas"])).toEqual([]);
    expect(ungroundedNumbers("Valor de R$ 1.500,00", ["R$ 1500,00"])).toEqual([]);
  });

  it("reprova resposta sem citação ou com trecho inexistente", () => {
    const ctx = ["A operadora aceita a partir de 2 vidas."];
    expect(validateAnswer({ status: "respondida", resposta: "Aceita a partir de 2 vidas.", fontes: [], informacoes_faltantes: [], conflito: "" }, ctx, "q")
      .map((i) => i.code)).toContain("sem_citacao");
    expect(validateAnswer({ status: "respondida", resposta: "Aceita [4].", fontes: [4], informacoes_faltantes: [], conflito: "" }, ctx, "q")
      .map((i) => i.code)).toContain("citacao_invalida");
    expect(validateAnswer({ status: "respondida", resposta: "Aceita a partir de 2 vidas [1].", fontes: [1], informacoes_faltantes: [], conflito: "" }, ctx, "q"))
      .toEqual([]);
  });
});
