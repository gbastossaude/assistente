/**
 * Regras puras do CRM comercial: próximos passos sugeridos por etapa, situação do follow-up,
 * taxa de conversão, validação de mudança de etapa e checklist de documentos por produto.
 */
import { LOST_STAGES, OPPORTUNITY_STAGE_LABELS, PRODUCT_LABELS, WON_STAGES, type OpportunityStage, type Product } from "./commercial";
import { diffDays, formatDateBR } from "./dates";

export type FollowupState = "sem_data" | "atrasado" | "hoje" | "proximo" | "futuro";

/** Situação do próximo follow-up em relação a hoje ("proximo" = nos próximos 3 dias). */
export function followupState(nextFollowupAt: string | null, today: string, stage?: OpportunityStage): FollowupState {
  if (stage && (WON_STAGES.includes(stage) || LOST_STAGES.includes(stage))) return "futuro";
  if (!nextFollowupAt) return "sem_data";
  const d = diffDays(today, nextFollowupAt);
  if (d < 0) return "atrasado";
  if (d === 0) return "hoje";
  if (d <= 3) return "proximo";
  return "futuro";
}

/** Vendas ganhas ÷ oportunidades decididas (ganhas + perdidas), em %. Null quando não há decisão. */
export function conversionRate(won: number, lost: number): number | null {
  const total = won + lost;
  return total === 0 ? null : Math.round((won / total) * 1000) / 10;
}

/** Validação de mudança de etapa: perder exige motivo; voltar etapa é permitido (registrado no histórico). */
export function stageChangeError(to: OpportunityStage, lostReason: string | null | undefined): string | null {
  if (to === "perdido" && !lostReason?.trim()) return "Informe o motivo da perda.";
  return null;
}

export interface OpportunityLike {
  clientName: string;
  contactName?: string | null;
  product: Product;
  stage: OpportunityStage;
  lives?: number | null;
  estimatedValue?: number | null;
  currentInsurer?: string | null;
  quotedInsurers?: string[];
  nextStep?: string | null;
  nextFollowupAt?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Próximos passos recomendados para a etapa atual (assistente de follow-up). */
export function suggestNextSteps(o: OpportunityLike, today: string): string[] {
  const out: string[] = [];
  const fu = followupState(o.nextFollowupAt ?? null, today, o.stage);
  if (fu === "atrasado") out.push(`Follow-up atrasado desde ${formatDateBR(o.nextFollowupAt!)} — retomar contato hoje.`);
  if (fu === "sem_data" && !WON_STAGES.includes(o.stage) && !LOST_STAGES.includes(o.stage)) out.push("Definir a data do próximo follow-up.");
  switch (o.stage) {
    case "lead_novo":
      out.push("Fazer o primeiro contato em até 24 h (WhatsApp ou ligação).", "Qualificar: produto, nº de vidas, operadora atual e prazo de decisão.");
      if (!o.phone && !o.email) out.push("Registrar telefone ou e-mail do contato.");
      break;
    case "primeiro_contato":
      out.push("Agendar reunião de diagnóstico (use o roteiro de perguntas em Reuniões).", "Enviar mensagem de agendamento da biblioteca.");
      break;
    case "diagnostico":
      out.push("Enviar a lista de documentos necessários para a cotação.", "Registrar operadoras a cotar conforme rede/região desejada.");
      break;
    case "documentos_pendentes":
      out.push("Cobrar os documentos pendentes (mensagem “Pedido de documentos”).", "Conferir CNPJ/CPF, relação de vidas e fatura atual antes de enviar às operadoras.");
      break;
    case "cotacao_em_andamento":
      out.push("Acompanhar o retorno das operadoras e registrar prazos.", (o.lives ?? 0) >= 100 ? "Grande conta: conduzir pelo módulo Cotações +99 (checklist e base de vidas)." : "Montar o comparativo assim que as cotações chegarem.");
      if (!o.quotedInsurers?.length) out.push("Informar quais operadoras estão sendo cotadas.");
      break;
    case "proposta_enviada":
      out.push("Fazer follow-up da proposta em 1–2 dias (check-in).", "Agendar apresentação/alinhamento com o decisor.");
      break;
    case "em_negociacao":
      out.push("Mapear a objeção principal (preço, rede ou carência) e responder com a biblioteca de objeções.", "Negociar condições com a operadora (isenção de carência, desconto, coparticipação).");
      break;
    case "aprovado":
      out.push("Coletar assinaturas e documentos de implantação.", "Confirmar data de início de vigência com a operadora.");
      break;
    case "fechado":
      out.push("Acompanhar a implantação (cadastro de vidas, carteirinhas e primeira fatura).", "Oferecer produtos complementares (dental, vida, benefícios).");
      break;
    case "implantado":
      out.push("Pós-venda: contato de boas-vindas em 30 dias.", "Programar acompanhamento de renovação/reajuste.");
      break;
    case "perdido":
      out.push("Registrar aprendizado no motivo da perda.", "Agendar reativação para a próxima janela de renovação.");
      break;
  }
  if (o.nextStep?.trim() && !WON_STAGES.includes(o.stage) && o.stage !== "perdido") out.unshift(`Próximo passo registrado: ${o.nextStep.trim()}`);
  return out;
}

/** Checklist de documentos por produto/perfil (ponto de partida — confirmar com a operadora). */
export function documentChecklist(product: Product, lives: number | null | undefined): string[] {
  const pj = lives === null || lives === undefined || lives >= 2;
  if (product === "consorcio") return ["Documento de identidade (RG/CNH) e CPF", "Comprovante de residência", "Comprovante de renda", "Dados bancários"];
  if (product === "vida" || product === "seguro") {
    return pj
      ? ["Cartão CNPJ", "Contrato social e últimas alterações", "Relação de vidas/segurados (nome, CPF, data de nascimento)", "Capital segurado desejado", "Apólice atual (se houver)"]
      : ["Documento de identidade e CPF", "Comprovante de residência", "Capital segurado desejado", "Beneficiários"];
  }
  if (!pj) {
    return ["Documento de identidade (RG/CNH) e CPF do titular", "Documentos dos dependentes (certidão de nascimento/casamento)", "Comprovante de residência", "Carteirinha e últimos 3 boletos do plano atual (para portabilidade/redução de carência)"];
  }
  const base = [
    "Cartão CNPJ",
    "Contrato social e últimas alterações",
    "Relação de vidas (nome, data de nascimento, titular/dependente, parentesco)",
    "Comprovante de endereço da empresa",
    "Documento do representante legal",
  ];
  if (product === "plano_saude" || product === "dental") {
    base.push("Fatura atual do plano (se houver)", "Carteirinhas e tempo de plano (para redução de carência)");
    if ((lives ?? 0) >= 30) base.push("Relatório de sinistralidade dos últimos 12 meses (quando houver)");
    if ((lives ?? 0) >= 100) base.push("Carta de nomeação da corretora", "Evolução de vidas mês a mês");
  }
  return base;
}

const firstName = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] ?? "";

/** Mensagem de follow-up (WhatsApp) contextual à etapa da oportunidade. */
export function opportunityFollowupMessage(o: OpportunityLike, consultant: string): string {
  const hi = `Olá${firstName(o.contactName) ? `, ${firstName(o.contactName)}` : ""}! Tudo bem?`;
  const prod = PRODUCT_LABELS[o.product].toLowerCase();
  const who = o.clientName;
  const sign = `\n\n${consultant}`;
  switch (o.stage) {
    case "lead_novo":
    case "primeiro_contato":
      return `${hi} Aqui é ${consultant}. Estou entrando em contato sobre o ${prod} para ${who}. Podemos agendar 20 minutos para eu entender o que é mais importante para vocês (rede, valor e prazos)?`;
    case "diagnostico":
    case "documentos_pendentes":
      return `${hi} Para seguirmos com a cotação do ${prod} de ${who}, preciso dos documentos abaixo:\n${documentChecklist(o.product, o.lives)
        .map((d) => `• ${d}`)
        .join("\n")}\nPode me enviar por aqui mesmo?${sign}`;
    case "cotacao_em_andamento":
      return `${hi} Passando para atualizar: a cotação de ${who} está em andamento${o.quotedInsurers?.length ? ` com ${o.quotedInsurers.join(", ")}` : ""}. Assim que as operadoras retornarem, te apresento o comparativo.${sign}`;
    case "proposta_enviada":
      return `${hi} Conseguiu analisar a proposta de ${prod} que enviei para ${who}? Se quiser, faço uma ligação rápida para tirar dúvidas e ajustar o que for necessário.${sign}`;
    case "em_negociacao":
      return `${hi} Sobre a proposta de ${who}: o que ainda está pesando na decisão — valor, rede ou algum detalhe do contrato? Consigo buscar ajustes com a operadora.${sign}`;
    case "aprovado":
      return `${hi} Que ótimo que aprovamos! Para darmos andamento à implantação de ${who}, vou te enviar a lista final de documentos e assinaturas.${sign}`;
    case "fechado":
    case "implantado":
      return `${hi} Passando para saber como está a experiência com o novo ${prod} de ${who}. Qualquer necessidade (inclusões, carteirinhas, rede), conte comigo!${sign}`;
    case "perdido":
      return `${hi} Tudo certo por aí? Gostaria de retomar a conversa sobre o ${prod} de ${who} — muitas condições mudaram e posso trazer uma nova análise sem compromisso.${sign}`;
  }
}

export function stageLabel(s: OpportunityStage) {
  return OPPORTUNITY_STAGE_LABELS[s];
}
