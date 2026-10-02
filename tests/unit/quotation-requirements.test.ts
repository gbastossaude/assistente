import { describe, expect, it } from "vitest";
import { QUOTATION_REQUIREMENTS, SINISTRALITY_NOTICE, requirementsAsText } from "@/lib/domain/quotation-requirements";

describe("informações necessárias para a cotação (Grandes Contas)", () => {
  it("texto para e-mail/WhatsApp traz todos os itens, o aviso de sinistralidade e a regra do compulsório", () => {
    const t = requirementsAsText();
    for (const s of QUOTATION_REQUIREMENTS) for (const it of s.items) expect(t).toContain(`• ${it.label}:`);
    expect(t).toContain(SINISTRALITY_NOTICE);
    expect(t).toContain("100% do FGTS do(s) CNPJ(s) cotado(s)");
    expect(t).toContain("BASE SAÚDE");
  });
  it("cobre os 17 itens pedidos", () => {
    expect(QUOTATION_REQUIREMENTS.flatMap((s) => s.items)).toHaveLength(17);
  });
});
