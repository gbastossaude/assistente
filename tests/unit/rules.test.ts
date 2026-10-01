import { describe, expect, it } from "vitest";
import { renderTemplate, missingPlaceholders, formatPendencyList } from "@/lib/domain/messages";
import { rankPriorities } from "@/lib/domain/priorities";
import { computeReadiness } from "@/lib/domain/readiness";
import { recommendedStartDate, renewalMilestones, renewalWindow } from "@/lib/domain/renewals";
import { requiresReadiness } from "@/lib/domain/pipeline";
import { evaluateSpecialCase } from "@/lib/domain/special-cases";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings-defaults";

describe("renovações", () => {
  const offsets = { preparacao: 120, documentacao: 90, mercado: 60, negociacao: 30 };
  it("gera marcos 120/90/60/30 dias antes do aniversário", () => {
    const m = renewalMilestones("2027-03-01", offsets);
    expect(m.map((x) => x.date)).toEqual(["2026-11-01", "2026-12-01", "2026-12-31", "2027-01-30"]);
    expect(recommendedStartDate("2027-03-01", offsets)).toBe("2026-11-01");
  });
  it("prazos configuráveis", () => {
    expect(renewalMilestones("2027-03-01", { preparacao: 150 })[0].date).toBe("2026-10-02");
  });
  it("janelas", () => {
    expect(renewalWindow("2026-10-20", "2026-10-01")).toBe("30");
    expect(renewalWindow("2026-11-25", "2026-10-01")).toBe("60");
    expect(renewalWindow("2026-12-25", "2026-10-01")).toBe("90");
    expect(renewalWindow("2027-01-25", "2026-10-01")).toBe("120");
    expect(renewalWindow("2026-09-01", "2026-10-01")).toBe("vencida");
  });
});

describe("mensagens", () => {
  it("não inventa dados ausentes", () => {
    const out = renderTemplate("Olá {{contato}}, empresa {{empresa}}", { empresa: "ACME" });
    expect(out).toBe("Olá [informar nome do contato do cliente], empresa ACME");
    expect(missingPlaceholders("{{contato}} {{empresa}}", { empresa: "x" })).toEqual(["contato"]);
  });
  it("lista de pendências por canal", () => {
    expect(formatPendencyList(["A", "B"], "email")).toBe("  1. A\n  2. B");
    expect(formatPendencyList(["A"], "whatsapp")).toBe("• A");
  });
});

describe("prioridades do dia", () => {
  it("atrasado e crítico vem primeiro; vidas desempatam", () => {
    const r = rankPriorities(
      [
        { id: "1", kind: "tarefa", title: "futuro", href: "", dueDate: "2026-10-20", priority: "media" },
        { id: "2", kind: "tarefa", title: "atrasado", href: "", dueDate: "2026-09-28", priority: "alta" },
        { id: "3", kind: "cotacao", title: "hoje grande", href: "", dueDate: "2026-10-01", priority: "alta", lives: 1500 },
        { id: "4", kind: "cotacao", title: "hoje pequena", href: "", dueDate: "2026-10-01", priority: "alta", lives: 120 },
      ],
      "2026-10-01",
    );
    expect(r.map((x) => x.id)).toEqual(["2", "3", "4", "1"]);
    expect(r[0].overdueDays).toBe(3);
  });
});

describe("pipeline", () => {
  it("entrar no mercado a partir da preparação exige prontidão; voltar não", () => {
    expect(requiresReadiness("coleta_informacoes", "pronta_para_mercado")).toBe(true);
    expect(requiresReadiness("coleta_informacoes", "enviada_operadoras")).toBe(true);
    expect(requiresReadiness("enviada_operadoras", "negociacao")).toBe(false);
    expect(requiresReadiness("enviada_operadoras", "coleta_informacoes")).toBe(false);
  });
});

describe("situações especiais", () => {
  it("liminar sem documento gera pendência documental", () => {
    const issues = evaluateSpecialCase({ kind: "liminares", has: true, quantity: 1 }, [{ kind: "liminares", data: { descricao: "Proc 1" } }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("documento");
    expect(issues[0].message).toMatch(/documento da liminar/i);
  });
  it("quantidade maior que detalhados", () => {
    const issues = evaluateSpecialCase({ kind: "agregados", has: true, quantity: 3 }, [{ kind: "agregados", data: { idade: 30, parentesco: "Sobrinho" } }]);
    expect(issues[0].message).toMatch(/2 agregado/);
  });
  it("não declarado gera pendência; 'Não' encerra", () => {
    expect(evaluateSpecialCase({ kind: "gestantes", has: null, quantity: null }, [])).toHaveLength(1);
    expect(evaluateSpecialCase({ kind: "gestantes", has: false, quantity: null }, [])).toHaveLength(0);
  });
});

describe("score de prontidão", () => {
  it("compõe 50/25/15/10 e explica componentes", () => {
    const r = computeReadiness(
      {
        checklist: [
          { required: true, applicable: true, status: "validado", category: "contrato" },
          { required: true, applicable: true, status: "pendente", category: "contrato" },
        ],
        lives: { imported: true, total: 100, incomplete: 0 },
        commercial: {},
        specialSummaries: [],
        specialEntries: [],
      },
      DEFAULT_SETTINGS.readiness_weights,
    );
    expect(r.components.map((c) => c.points)).toEqual([25, 25, 0, 0]);
    expect(r.score).toBe(50);
  });
});
