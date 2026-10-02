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

describe("roteador — Playbook Be Smart", () => {
  const tool = (q: string) => ("tool" in r(q) ? (r(q) as { tool: string }).tool : "clarify");
  it("dúvidas de produto e abordagem comercial vão para o playbook", () => {
    expect(r("Como funciona a carência no plano PME?")).toEqual({ tool: "consultar_playbook", input: { pergunta: "Como funciona a carência no plano PME?" } });
    expect(tool("Me dê um gancho para objeção de preço")).toBe("consultar_playbook");
    expect(tool("Qual a regra de reajuste do plano por adesão?")).toBe("consultar_playbook");
    expect(tool("script SPIN de implicação")).toBe("consultar_playbook");
    expect(tool("o que é coparticipação parcial")).toBe("consultar_playbook");
  });
  it("perguntas sobre dados de cotações continuam nas ferramentas operacionais", () => {
    expect(tool("O que está pendente na cotação da Empresa Horizonte?")).toBe("pendencias");
    expect(tool("Quais renovações vencem nos próximos 60 dias?")).toBe("renovacoes");
    expect(tool("Resuma a COT-2026-0001")).toBe("resumo_cotacao");
  });
  it("WhatsApp da cadência D3 usa o modelo do playbook", () => {
    expect(r("Gere o WhatsApp de follow-up D3 para a empresa Horizonte")).toEqual({ tool: "gerar_mensagem", input: { cotacao: "Horizonte", modelo: "cliente_cadencia_d3", operadora: "" } });
  });
});

describe("roteador — comandos comerciais (CRM, reuniões, campanhas)", () => {
  it("comandos internos do prompt mestre", () => {
    expect(r("Criar mensagem de follow-up para o cliente Construtora Alfa.")).toEqual({ tool: "mensagem_followup_cliente", input: { cliente: "Construtora Alfa" } });
    expect(r("Criar mensagem de follow-up para este cliente.")).toHaveProperty("clarify");
    expect(r("Resumir esta reunião.")).toEqual({ tool: "resumir_reuniao", input: { reuniao: "" } });
    expect(r("Criar roteiro para reunião com o cliente Construtora Alfa.")).toEqual({ tool: "roteiro_reuniao", input: { cliente: "Construtora Alfa" } });
    expect(r("Gerar mensagem pedindo documentos para o cliente Construtora Alfa")).toEqual({ tool: "checklist_documentos", input: { cliente: "Construtora Alfa", produto: "", vidas: 0, mensagem: true } });
    expect(r("Mostrar vendas com follow-up atrasado.")).toEqual({ tool: "listar_oportunidades", input: { etapa: "", followup: "atrasado", produto: "" } });
    expect(r("Criar campanha para planos empresariais este mês.")).toEqual({ tool: "propor_campanha", input: { produto: "plano_saude", mes: "2026-10", foco: "empresarial" } });
    expect(r("Sugira uma campanha de plano dental para PME em dezembro")).toEqual({ tool: "propor_campanha", input: { produto: "dental", mes: "2026-12", foco: "pme" } });
  });
  it("resumos e relatórios", () => {
    expect(r("Resumo do dia")).toEqual({ tool: "resumo_diario", input: {} });
    expect(r("Gere o resumo semanal")).toEqual({ tool: "resumo_semanal", input: {} });
    expect(r("Relatório de vendas do mês")).toEqual({ tool: "relatorio_vendas", input: { de: "2026-10-01", ate: "" } });
    expect(r("Quais os próximos passos para o cliente Construtora Alfa?")).toEqual({ tool: "resumo_oportunidade", input: { cliente: "Construtora Alfa" } });
    expect(r("Liste as oportunidades em negociação")).toMatchObject({ tool: "listar_oportunidades", input: { etapa: "em_negociacao" } });
  });
  it("checklist de documentos sem mensagem", () => {
    expect(r("Criar checklist de documentos para plano dental com 12 vidas")).toEqual({ tool: "checklist_documentos", input: { cliente: "", produto: "dental", vidas: 12, mensagem: false } });
  });
});
