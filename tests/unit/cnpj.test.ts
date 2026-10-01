import { describe, expect, it } from "vitest";
import { canonicalCnpj, formatCnpj, isValidCnpj } from "@/lib/domain/cnpj";

describe("CNPJ", () => {
  it("valida CNPJ numérico com e sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
  });
  it("rejeita sequências repetidas e tamanhos errados", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });
  it("valida CNPJ alfanumérico (IN RFB 2.229/2024)", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
  });
  it("recompõe zeros à esquerda perdidos pela planilha", () => {
    expect(canonicalCnpj("191000000000")).toBe(null);
    expect(canonicalCnpj("6990590000123")).toBe("06990590000123");
  });
  it("formata", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
