import { describe, expect, it } from "vitest";
import { computeScope, inScope } from "@/lib/auth/scope";
import { can } from "@/lib/auth/permissions";
import { campaignMilestones, campaignProgress, currentMilestone, milestoneMessage, suggestCampaign } from "@/lib/domain/campaigns";
import { MESSAGE_CATEGORIES, ANSWER_TOPICS, OPEN_STAGES } from "@/lib/domain/commercial";
import { conversionRate, documentChecklist, followupState, opportunityFollowupMessage, stageChangeError, suggestNextSteps } from "@/lib/domain/crm";
import { extractVariables, fillVariables, normalizeSearch } from "@/lib/domain/library";
import { DEFAULT_ANSWERS, DEFAULT_MESSAGES, DISCLAIMER } from "@/lib/domain/library-content";
import { buildMeetingOutputs, defaultQuestions, meetingPendencies } from "@/lib/domain/meetings";
import { quotationDataGaps, type QuotationGapInput } from "@/lib/domain/quotation-gaps";

const T = "2026-10-02";

describe("CRM", () => {
  it("situação do follow-up", () => {
    expect(followupState(null, T)).toBe("sem_data");
    expect(followupState("2026-10-01", T)).toBe("atrasado");
    expect(followupState(T, T)).toBe("hoje");
    expect(followupState("2026-10-04", T)).toBe("proximo");
    expect(followupState("2026-10-20", T)).toBe("futuro");
    expect(followupState("2026-09-01", T, "fechado")).toBe("futuro");
  });
  it("taxa de conversão = ganhas ÷ decididas", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(3, 1)).toBe(75);
    expect(conversionRate(1, 2)).toBe(33.3);
  });
  it("perder exige motivo", () => {
    expect(stageChangeError("perdido", "")).toMatch(/motivo/);
    expect(stageChangeError("perdido", "preço")).toBeNull();
    expect(stageChangeError("lead_novo", null)).toBeNull();
  });
  it("etapas abertas excluem ganhas e perdidas", () => {
    expect(OPEN_STAGES).not.toContain("fechado");
    expect(OPEN_STAGES).not.toContain("perdido");
    expect(OPEN_STAGES).toContain("em_negociacao");
  });
  it("próximos passos destacam follow-up atrasado e respeitam a etapa", () => {
    const s = suggestNextSteps({ clientName: "ACME", product: "plano_saude", stage: "proposta_enviada", nextFollowupAt: "2026-09-28" }, T);
    expect(s[0]).toMatch(/atrasado/);
    expect(s.join(" ")).toMatch(/check-in/);
    const big = suggestNextSteps({ clientName: "ACME", product: "plano_saude", stage: "cotacao_em_andamento", lives: 250, nextFollowupAt: "2026-10-10", quotedInsurers: ["Amil"] }, T);
    expect(big.join(" ")).toMatch(/\+99/);
  });
  it("checklist de documentos por produto e porte", () => {
    expect(documentChecklist("plano_saude", 150)).toEqual(expect.arrayContaining(["Cartão CNPJ", "Carta de nomeação da corretora"]));
    expect(documentChecklist("plano_saude", 1).join(" ")).toMatch(/CPF do titular/);
    expect(documentChecklist("consorcio", 1)).toContain("Comprovante de renda");
  });
  it("mensagem de follow-up usa a etapa e não inventa dados", () => {
    const m = opportunityFollowupMessage({ clientName: "ACME", contactName: "Maria Souza", product: "plano_saude", stage: "documentos_pendentes", lives: 10 }, "Helena");
    expect(m).toMatch(/^Olá, Maria!/);
    expect(m).toMatch(/Cartão CNPJ/);
    expect(m).toMatch(/Helena$/);
  });
});

describe("Reuniões", () => {
  it("roteiro padrão tem as 17 perguntas", () => {
    expect(defaultQuestions()).toHaveLength(17);
  });
  it("gera ata, pendências, próximos passos, WhatsApp e tarefa de retorno", () => {
    const questions = defaultQuestions();
    questions[2] = { ...questions[2], asked: true, status: "recebida", answer: "Bradesco" };
    questions[3] = { ...questions[3], asked: true, status: "pendente", note: "RH vai confirmar" };
    const out = buildMeetingOutputs(
      {
        title: "Diagnóstico",
        clientName: "Maria Souza",
        companyName: "ACME",
        advisorName: "Ana",
        salesRepName: "Carlos",
        date: T,
        startTime: "10:00:00",
        endTime: "11:00:00",
        participants: "Maria (RH)",
        location: "Teams",
        objective: "Reduzir custo",
        summary: "Cliente insatisfeito com reajuste",
        questions,
        actions: [{ text: "Enviar fatura", owner: "Maria", dueDate: "2026-10-05", done: false }],
      },
      { consultant: "Helena", today: T },
    );
    expect(out.minutes).toMatch(/ATA DE REUNIÃO — Diagnóstico/);
    expect(out.minutes).toMatch(/Qual a operadora atual\? Bradesco/);
    expect(out.minutes).toMatch(/10:00–11:00/);
    expect(out.pendencies[0]).toMatch(/Aguardando resposta: Qual o valor pago/);
    expect(out.nextSteps[0]).toMatch(/Enviar fatura — responsável: Maria — prazo: 05\/10\/2026/);
    expect(out.whatsapp).toMatch(/^Olá, Maria!/);
    expect(out.whatsapp).toMatch(/Qual o valor pago atualmente\?/);
    expect(out.followupTask).toEqual({ title: "Retorno pós-reunião — ACME", dueDate: "2026-10-04" });
  });
  it("pendências incluem perguntas não feitas e ações em aberto, não as concluídas", () => {
    const qs = defaultQuestions().map((q) => ({ ...q, asked: true, status: "recebida" as const, answer: "ok" }));
    const p = meetingPendencies({ questions: qs, actions: [{ text: "A", owner: "", dueDate: null, done: true }, { text: "B", owner: "", dueDate: null, done: false }] });
    expect(p).toEqual(["Ação em aberto: B"]);
  });
});

describe("Campanhas", () => {
  it("marcos de lembrete: início, meio, reta final e encerramento", () => {
    expect(campaignMilestones("2026-10-01", "2026-10-31")).toEqual([
      { key: "inicio", date: "2026-10-01" },
      { key: "meio", date: "2026-10-16" },
      { key: "reta_final", date: "2026-10-28" },
      { key: "encerramento", date: "2026-10-31" },
    ]);
    expect(campaignMilestones("2026-10-01", "2026-10-01").map((m) => m.key)).toEqual(["inicio", "encerramento"]);
  });
  it("marco atual e progresso", () => {
    expect(currentMilestone("2026-10-01", "2026-10-31", "2026-09-30")).toBeNull();
    expect(currentMilestone("2026-10-01", "2026-10-31", "2026-10-20")?.key).toBe("meio");
    expect(currentMilestone("2026-10-01", "2026-10-31", "2026-11-05")?.key).toBe("encerramento");
    expect(campaignProgress("2026-10-01", "2026-10-31", "2026-10-16")).toBe(50);
    expect(campaignProgress("2026-10-01", "2026-10-31", "2026-09-01")).toBe(0);
  });
  it("mensagens de marco trazem leads e follow-ups", () => {
    expect(milestoneMessage("meio", { name: "X", endDate: "2026-10-31" }, { leads: 4, pendingFollowups: 2, goalLeads: 20 }).body).toMatch(/4 de 20 lead/);
  });
  it("sugestão de campanha cobre o mês inteiro", () => {
    const s = suggestCampaign("plano_saude", "2026-02", "empresarial");
    expect(s.startDate).toBe("2026-02-01");
    expect(s.endDate).toBe("2026-02-28");
    expect(s.name).toMatch(/fevereiro\/2026/);
  });
});

describe("Biblioteca", () => {
  it("extrai e preenche variáveis, mantendo as ausentes", () => {
    expect(extractVariables("Olá {{cliente}}, {{ empresa }} {{cliente}}")).toEqual(["cliente", "empresa"]);
    const r = fillVariables("Olá {{cliente}} da {{empresa}}", { cliente: "Ana", empresa: " " });
    expect(r.text).toBe("Olá Ana da {{empresa}}");
    expect(r.missing).toEqual(["empresa"]);
  });
  it("busca sem acento", () => {
    expect(normalizeSearch("Carência")).toBe("carencia");
  });
  it("conteúdo padrão cobre todas as categorias e tópicos, com aviso nas respostas", () => {
    for (const c of MESSAGE_CATEGORIES) expect(DEFAULT_MESSAGES.some((m) => m.category === c)).toBe(true);
    for (const t of ANSWER_TOPICS) expect(DEFAULT_ANSWERS.some((a) => a.category === t)).toBe(true);
    for (const a of DEFAULT_ANSWERS) expect(a.body).toContain(DISCLAIMER);
    const keys = [...DEFAULT_MESSAGES, ...DEFAULT_ANSWERS].map((m) => m.sourceKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("Pendências de dados da cotação", () => {
  const base: QuotationGapInput = {
    stipulantName: "ACME",
    estimatedLives: 150,
    holdersCount: 100,
    dependentsCount: 50,
    livesImported: 150,
    modality: "compulsorio",
    hasCopay: false,
    accommodation: "apartamento",
    coverageArea: "nacional",
    employeeContributionType: "percentual",
    desiredStartDate: "2026-12-01",
    targetDate: "2026-11-01",
    clientDeadline: null,
    quotationCnpjs: 1,
    company: { legalName: "ACME S.A.", tradeName: "ACME", mainCnpj: "11222333000181", segment: "Indústria", address: "Rua A, 1", city: "Campinas", uf: "SP" },
    primaryContact: { name: "Maria", phone: "1", email: "m@x.com" },
    currentContract: { insurer: "Amil", plans: 1, monthlyCost: 1000, startDate: "2024-01-01", anniversaryDate: null },
    documents: ["contrato_social", "fatura", "comprovante_endereco"],
  };
  it("cotação completa não tem pendências", () => {
    expect(quotationDataGaps(base)).toEqual([]);
  });
  it("lista o que falta, por grupo", () => {
    const g = quotationDataGaps({ ...base, accommodation: null, company: { ...base.company, address: null }, currentContract: null, documents: [], livesImported: 0, holdersCount: null });
    const fields = g.map((x) => x.field);
    expect(fields).toEqual(expect.arrayContaining(["Acomodação (enfermaria/apartamento)", "Endereço", "Relação de vidas", "Fatura atual"]));
    expect(g.find((x) => x.group === "Contrato atual")).toBeTruthy();
  });
});

describe("Hierarquia e escopo", () => {
  it("corretor vê só a própria carteira; supervisor, a equipe; head, tudo", () => {
    const c = computeScope("corretor", "u1");
    expect(inScope(c, "u1")).toBe(true);
    expect(inScope(c, "u2")).toBe(false);
    expect(inScope(c, null)).toBe(false);
    const s = computeScope("supervisor", "s1", ["u1", "u2"]);
    expect(inScope(s, "u2")).toBe(true);
    expect(inScope(s, "u3")).toBe(false);
    expect(computeScope("head", "h").all).toBe(true);
  });
  it("papéis com escopo não acessam telas de visão global nem dados sensíveis", () => {
    for (const r of ["corretor", "supervisor"] as const) {
      expect(can(r, "operations:read")).toBe(false);
      expect(can(r, "sensitive:read")).toBe(false);
      expect(can(r, "crm:write")).toBe(true);
    }
    expect(can("assistente", "task:write")).toBe(true);
    expect(can("assistente", "delete")).toBe(false);
    expect(can("assistente", "settings:manage")).toBe(false);
    expect(can("head", "lgpd:manage")).toBe(true);
    expect(can("corretor", "lgpd:manage")).toBe(false);
  });
});

describe("CSV", () => {
  it("usa ; com BOM, escapa aspas e neutraliza fórmulas", async () => {
    const { toCsv } = await import("@/lib/csv");
    const out = toCsv(["a", "b"], [["x;y", 'diz "oi"'], ["=SOMA(1)", 1.5], [null, true], [-3, "-teste"]]);
    expect(out.startsWith("﻿a;b\r\n")).toBe(true);
    expect(out).toContain('"x;y";"diz ""oi"""');
    expect(out).toContain("'=SOMA(1);1,5");
    expect(out).toContain(";Sim");
    expect(out).toContain("-3;'-teste");
  });
});
