/** Pipeline de cotações: grupos visuais do Kanban, cores e regras de transição. */
import { CLOSED_STATUSES, MARKET_STATUSES, QUOTATION_STATUSES, type QuotationStatus } from "./constants";

export const STATUS_TONE: Record<QuotationStatus, string> = {
  oportunidade: "slate",
  coleta_informacoes: "sky",
  aguardando_cliente: "amber",
  validando_documentacao: "sky",
  pendencia_documental: "red",
  base_vidas_validacao: "sky",
  pronta_para_mercado: "emerald",
  enviada_operadoras: "indigo",
  em_analise_operadoras: "indigo",
  pendencia_operadora: "red",
  propostas_recebidas: "violet",
  montando_comparativo: "violet",
  apresentacao_cliente: "violet",
  negociacao: "fuchsia",
  finalista: "fuchsia",
  fechada_ganha: "emerald",
  fechada_perdida: "zinc",
  implantacao: "teal",
  concluida: "emerald",
  cancelada: "zinc",
};

export const PIPELINE_PHASES: { key: string; label: string; statuses: QuotationStatus[] }[] = [
  { key: "preparacao", label: "Preparação", statuses: ["oportunidade", "coleta_informacoes", "aguardando_cliente", "validando_documentacao", "pendencia_documental", "base_vidas_validacao"] },
  { key: "mercado", label: "Mercado", statuses: ["pronta_para_mercado", "enviada_operadoras", "em_analise_operadoras", "pendencia_operadora"] },
  { key: "decisao", label: "Decisão", statuses: ["propostas_recebidas", "montando_comparativo", "apresentacao_cliente", "negociacao", "finalista"] },
  { key: "fechamento", label: "Fechamento", statuses: ["fechada_ganha", "fechada_perdida", "implantacao", "concluida", "cancelada"] },
];

export function statusIndex(s: QuotationStatus) {
  return QUOTATION_STATUSES.indexOf(s);
}

export function isClosed(s: QuotationStatus) {
  return CLOSED_STATUSES.includes(s);
}

/**
 * Indica se a mudança para `to` exige prontidão documental (entrar nos status de mercado
 * vindo da preparação). Voltar status é permitido e mantém histórico.
 */
export function requiresReadiness(from: QuotationStatus, to: QuotationStatus): boolean {
  return MARKET_STATUSES.includes(to) && !MARKET_STATUSES.includes(from) && !isClosed(from);
}

export function requiresLostReason(to: QuotationStatus) {
  return to === "fechada_perdida";
}
