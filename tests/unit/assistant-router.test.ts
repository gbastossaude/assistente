import { describe, expect, it } from "vitest";
import { extractEntity, routeIntent } from "@/lib/assistant/router";

const T = "2026-10-01";
const r = (q: string) => routeIntent(q, T);

describe("roteador local do assistente (perguntas da especificação)", () => {
  it("o que está pendente na cotação da Empresa X", () => {
    expect(r("O que está pendente na cotação da Empresa Horizonte?")).toEqual({ tool: "pendencias", input: { cotacao: "Horizonte" } });
  });
  it("renovações nos próximos 60 dias", () => {
    expect(r("Quais renovações vencem nos próximos 60 dias?")).toEqual({ tool: "renovacoes", input: { dias: 60, mes: "" } });
  });
  it("empresas que renovam em novembro", () => {
    expect(r("Quais empresas renovam em novembro?")).toEqual({ tool: "renovacoes", input: { dias: 0, mes: "2026-11" } });
    expect(r("Quem renova em março?")).toMatchObject({ input: { mes: "2027-03" } });
  });
  it("operadoras que ainda não responderam a cotação da Empresa Y", () => {
    expect(r("Quais operadoras ainda não responderam a cotação da Empresa Sol Nascente?")).toEqual({ tool: "operadoras_sem_resposta", input: { dias: 0, cotacao: "Sol Nascente" } });
  });
  it("cotações sem retorno há mais de cinco dias", () => {
    expect(r("Quais cotações estão sem retorno há mais de cinco dias?")).toEqual({ tool: "operadoras_sem_resposta", input: { dias: 5, cotacao: "" } });
  });
  it("e-mail cobrando documentos pendentes", () => {
    expect(r("Crie um e-mail cobrando os documentos pendentes da empresa Horizonte")).toEqual({ tool: "gerar_mensagem", input: { cotacao: "Horizonte", modelo: "cliente_cobranca_formal_email", operadora: "" } });
  });
  it("WhatsApp pedindo pendências exige empresa", () => {
    expect(r("Gere uma mensagem de WhatsApp pedindo as pendências")).toHaveProperty("clarify");
    expect(r("Gere uma mensagem de WhatsApp para a empresa Horizonte pedindo as pendências")).toMatchObject({ tool: "gerar_mensagem", input: { modelo: "cliente_cobranca_whatsapp" } });
  });
  it("cotações acima de 200 vidas em negociação", () => {
    expect(r("Mostre as cotações acima de 200 vidas em negociação.")).toEqual({ tool: "listar_cotacoes", input: { status: "negociacao", min_vidas: 200, sem_movimentacao_dias: 0, tipo: "" } });
  });
  it("criar tarefas para operadoras que não responderam (proposta, não execução)", () => {
    expect(r("Crie tarefas para todas as operadoras que não responderam")).toEqual({ tool: "propor_tarefas_operadoras_sem_resposta", input: { dias: 5, prazo_dias: 0 } });
  });
  it("histórico, resumo e reunião de hoje", () => {
    expect(r("Mostre o histórico da negociação da Empresa Horizonte.")).toEqual({ tool: "historico", input: { cotacao: "Horizonte" } });
    expect(r("Resuma a cotação da Empresa Horizonte.")).toEqual({ tool: "resumo_cotacao", input: { cotacao: "Horizonte" } });
    expect(r("Prepare um resumo executivo para minha reunião de hoje.")).toEqual({ tool: "agenda_do_dia", input: {} });
  });
  it("extrai código de cotação", () => {
    expect(extractEntity("status da COT-2026-0001")).toBe("COT-2026-0001");
  });
});
