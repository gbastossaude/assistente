import { describe, expect, it } from "vitest";
import { CHECKLIST_CATALOG } from "@/lib/domain/checklist-catalog";
import {
  canMarkReadyForMarket,
  computeCompleteness,
  evaluateAutoSource,
  isApplicable,
  nextItemState,
  type ChecklistContext,
} from "@/lib/domain/checklist-engine";
import { SPECIAL_CASE_KINDS } from "@/lib/domain/special-cases";

function ctx(over: Partial<ChecklistContext> = {}): ChecklistContext {
  return {
    stipulantName: null,
    cnpjCount: 0,
    reason: null,
    modality: null,
    takeover: null,
    fgts100: null,
    paymentMethod: null,
    remission: null,
    adjustmentIndex: null,
    breakEven: null,
    upgradeDowngradeRules: null,
    commissionPct: null,
    designChange: null,
    hasCopay: null,
    copayPct: null,
    employeeContributionValue: null,
    renewalDate: null,
    contracts: [],
    documents: [],
    hasConfirmedLives: false,
    specialSummaries: [],
    specialEntries: [],
    ...over,
  };
}

describe("catálogo NEW x RENEW", () => {
  it("RENEW exige conjunto mais amplo que NEW (sinistralidade e evolução)", () => {
    const reqNew = CHECKLIST_CATALOG.filter((i) => i.requiredNew).length;
    const reqRenew = CHECKLIST_CATALOG.filter((i) => i.requiredRenew).length;
    expect(reqRenew).toBeGreaterThan(reqNew);
    const sin = CHECKLIST_CATALOG.find((i) => i.key === "sinistralidade")!;
    expect(sin.requiredRenew).toBe(true);
    expect(sin.requiredNew).toBe(false);
  });
  it("chaves únicas", () => {
    const keys = CHECKLIST_CATALOG.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("condições de aplicabilidade", () => {
  it("itens de afastados só se aplicam quando há afastados", () => {
    expect(isApplicable("special:afastados", ctx())).toBe(false);
    expect(isApplicable("special:afastados", ctx({ specialSummaries: [{ kind: "afastados", has: true, quantity: 1 }] }))).toBe(true);
  });
  it("encampação só para contratação opcional", () => {
    expect(isApplicable("modality:opcional", ctx({ modality: "compulsorio" }))).toBe(false);
    expect(isApplicable("modality:opcional", ctx({ modality: "opcional" }))).toBe(true);
  });
});

describe("preenchimento automático", () => {
  it("detecta dados já informados", () => {
    expect(evaluateAutoSource("field:cnpjs", ctx({ cnpjCount: 2 }))).toBe("satisfied");
    expect(evaluateAutoSource("field:cnpjs", ctx())).toBe("missing");
    expect(evaluateAutoSource("field:copay_model", ctx({ hasCopay: false }))).toBe("satisfied");
    expect(evaluateAutoSource("field:copay_model", ctx({ hasCopay: true }))).toBe("missing");
  });
  it("documento recebido x validado x inválido", () => {
    expect(evaluateAutoSource("doc:fatura", ctx({ documents: [{ docType: "fatura", status: "recebido" }] }))).toBe("satisfied");
    expect(evaluateAutoSource("doc:fatura", ctx({ documents: [{ docType: "fatura", status: "validado" }] }))).toBe("validated");
    expect(evaluateAutoSource("doc:fatura", ctx({ documents: [{ docType: "fatura", status: "invalido" }] }))).toBe("missing");
  });
  it("situações especiais declaradas exigem Sim/Não em todos os tipos", () => {
    const all = SPECIAL_CASE_KINDS.map((k) => ({ kind: k, has: false, quantity: null }));
    expect(evaluateAutoSource("special:declared", ctx({ specialSummaries: all }))).toBe("satisfied");
    expect(evaluateAutoSource("special:declared", ctx({ specialSummaries: all.slice(1) }))).toBe("missing");
  });
  it("Home Care sem relatório não é atendido", () => {
    const c = ctx({
      specialSummaries: [{ kind: "home_care", has: true, quantity: 1 }],
      specialEntries: [{ kind: "home_care", data: { identificacao: "AB", gasto_mensal: 1000, protocolo: "x" } }],
    });
    expect(evaluateAutoSource("special:home_care", c)).toBe("missing");
  });
});

describe("transição de estado do item", () => {
  const def = { itemKey: "cnpj", condition: "always", autoSource: "field:cnpjs" };
  it("promove para recebido automaticamente e volta se o dado sumir", () => {
    const s1 = nextItemState({ status: "pendente", autoFilled: false, applicable: true }, def, ctx({ cnpjCount: 1 }));
    expect(s1).toEqual({ status: "recebido", autoFilled: true, applicable: true });
    const s2 = nextItemState(s1, def, ctx());
    expect(s2.status).toBe("pendente");
  });
  it("nunca sobrescreve status manual", () => {
    const s = nextItemState({ status: "validado", autoFilled: false, applicable: true }, def, ctx());
    expect(s.status).toBe("validado");
  });
  it("item não aplicável fica dispensado", () => {
    const s = nextItemState(
      { status: "pendente", autoFilled: false, applicable: true },
      { itemKey: "x", condition: "special:afastados", autoSource: null },
      ctx(),
    );
    expect(s).toEqual({ status: "dispensado", autoFilled: true, applicable: false });
  });
});

describe("completude e bloqueio de pronta para mercado", () => {
  const items = [
    { required: true, applicable: true, status: "validado" as const },
    { required: true, applicable: true, status: "pendente" as const },
    { required: false, applicable: true, status: "pendente" as const },
    { required: true, applicable: false, status: "dispensado" as const },
  ];
  it("percentual considera obrigatórios aplicáveis", () => {
    const c = computeCompleteness(items);
    expect(c.pct).toBe(50);
    expect(c.label).toBe("Em preparação");
    expect(c.pendingRequired).toBe(1);
    expect(c.optionalTotal).toBe(1);
  });
  it("faixas de completude", () => {
    expect(computeCompleteness([{ required: true, applicable: true, status: "pendente" }]).label).toBe("Incompleta");
    expect(computeCompleteness([{ required: true, applicable: true, status: "recebido" }]).label).toBe("Pronta para envio ao mercado");
  });
  it("bloqueia sem override e libera com justificativa", () => {
    expect(canMarkReadyForMarket(items).allowed).toBe(false);
    expect(canMarkReadyForMarket(items, "curta").allowed).toBe(false);
    expect(canMarkReadyForMarket(items, "Cliente autorizou envio parcial por e-mail").allowed).toBe(true);
    expect(canMarkReadyForMarket(items.filter((i) => i.status !== "pendente")).needsOverride).toBe(false);
  });
});
