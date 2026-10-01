import { describe, expect, it } from "vitest";
import { sanitizeFileName, validateUpload } from "@/server/storage";

describe("validação de upload", () => {
  it("sanitiza nomes de arquivo (path traversal, acentos, caracteres especiais)", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\temp\\Relatório <médico>.PDF")).toBe("Relatorio _medico_.pdf");
    expect(sanitizeFileName("...")).toBe("arquivo");
  });
  it("bloqueia extensão não permitida e conteúdo incompatível", () => {
    expect(() => validateUpload("script.exe", Buffer.from("MZ"))).toThrow(/não permitido/);
    expect(() => validateUpload("falso.pdf", Buffer.from("<html>"))).toThrow(/não corresponde/);
    expect(() => validateUpload("vazio.pdf", Buffer.alloc(0))).toThrow(/vazio/);
  });
  it("aceita PDF válido e calcula hash", () => {
    const v = validateUpload("ok.pdf", Buffer.from("%PDF-1.4 x"));
    expect(v.mimeType).toBe("application/pdf");
    expect(v.sha256).toHaveLength(64);
  });
});
