/**
 * Vocabulário do módulo comercial (CRM, reuniões, campanhas, biblioteca de mensagens e respostas rápidas).
 * Fonte única para valores, rótulos e cores — banco, validação e UI importam daqui.
 */

// ─── CRM: produtos, etapas e origens ───
export const PRODUCTS = ["plano_saude", "dental", "vida", "seguro", "consorcio", "beneficios"] as const;
export type Product = (typeof PRODUCTS)[number];
export const PRODUCT_LABELS: Record<Product, string> = {
  plano_saude: "Plano de saúde",
  dental: "Plano dental",
  vida: "Seguro de vida",
  seguro: "Seguro (outros ramos)",
  consorcio: "Consórcio",
  beneficios: "Benefícios",
};

export const OPPORTUNITY_STAGES = [
  "lead_novo",
  "primeiro_contato",
  "diagnostico",
  "documentos_pendentes",
  "cotacao_em_andamento",
  "proposta_enviada",
  "em_negociacao",
  "aprovado",
  "fechado",
  "implantado",
  "perdido",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  lead_novo: "Lead novo",
  primeiro_contato: "Primeiro contato",
  diagnostico: "Diagnóstico realizado",
  documentos_pendentes: "Documentos pendentes",
  cotacao_em_andamento: "Cotação em andamento",
  proposta_enviada: "Proposta enviada",
  em_negociacao: "Em negociação",
  aprovado: "Aprovado",
  fechado: "Fechado",
  implantado: "Implantado",
  perdido: "Perdido",
};
export const OPPORTUNITY_STAGE_TONE: Record<OpportunityStage, string> = {
  lead_novo: "slate",
  primeiro_contato: "sky",
  diagnostico: "blue",
  documentos_pendentes: "amber",
  cotacao_em_andamento: "indigo",
  proposta_enviada: "violet",
  em_negociacao: "fuchsia",
  aprovado: "teal",
  fechado: "emerald",
  implantado: "green",
  perdido: "zinc",
};
/** Etapas de venda ganha (contam como "venda fechada"). */
export const WON_STAGES: OpportunityStage[] = ["fechado", "implantado"];
export const LOST_STAGES: OpportunityStage[] = ["perdido"];
/** Etapas em que a oportunidade ainda está em aberto (pipeline ativo). */
export const OPEN_STAGES: OpportunityStage[] = OPPORTUNITY_STAGES.filter((s) => !WON_STAGES.includes(s) && !LOST_STAGES.includes(s));
/** Etapas que entram no "valor em negociação". */
export const NEGOTIATION_STAGES: OpportunityStage[] = ["cotacao_em_andamento", "proposta_enviada", "em_negociacao", "aprovado"];

export const LEAD_SOURCES = ["indicacao", "carteira", "site", "redes_sociais", "campanha", "prospeccao_ativa", "parceiro", "evento", "renovacao", "outro"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  indicacao: "Indicação",
  carteira: "Carteira atual",
  site: "Site / formulário",
  redes_sociais: "Redes sociais",
  campanha: "Campanha",
  prospeccao_ativa: "Prospecção ativa",
  parceiro: "Parceiro",
  evento: "Evento",
  renovacao: "Renovação",
  outro: "Outro",
};

export const LOST_REASONS = ["preco", "rede", "concorrente", "sem_retorno", "desistiu", "documentacao", "operadora_recusou", "outro"] as const;
export const LOST_REASON_LABELS: Record<(typeof LOST_REASONS)[number], string> = {
  preco: "Preço",
  rede: "Rede credenciada",
  concorrente: "Fechou com concorrente",
  sem_retorno: "Cliente sem retorno",
  desistiu: "Desistiu de contratar",
  documentacao: "Documentação não enviada",
  operadora_recusou: "Operadora recusou o risco",
  outro: "Outro",
};

// ─── Reuniões ───
export const MEETING_STATUSES = ["agendada", "realizada", "remarcada", "cancelada"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  remarcada: "Remarcada",
  cancelada: "Cancelada",
};
export const MEETING_STATUS_TONE: Record<MeetingStatus, string> = { agendada: "sky", realizada: "emerald", remarcada: "amber", cancelada: "zinc" };

/** Estado da resposta de cada pergunta do roteiro. */
export const ANSWER_STATUSES = ["nao_marcada", "recebida", "pendente"] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];
export const ANSWER_STATUS_LABELS: Record<AnswerStatus, string> = { nao_marcada: "—", recebida: "Resposta recebida", pendente: "Resposta pendente" };

// ─── Campanhas ───
export const CAMPAIGN_STATUSES = ["planejada", "ativa", "pausada", "finalizada"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = { planejada: "Planejada", ativa: "Ativa", pausada: "Pausada", finalizada: "Finalizada" };
export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, string> = { planejada: "slate", ativa: "emerald", pausada: "amber", finalizada: "zinc" };

export const CHANNELS = ["whatsapp", "email", "telefone", "instagram", "linkedin", "site", "evento", "indicacao", "presencial"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  telefone: "Telefone",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  site: "Site",
  evento: "Evento",
  indicacao: "Indicação",
  presencial: "Presencial",
};

// ─── Biblioteca: mensagens prontas e respostas rápidas ───
export const LIBRARY_KINDS = ["mensagem", "resposta"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const MESSAGE_CATEGORIES = [
  "primeiro_contato",
  "agendamento",
  "confirmacao_reuniao",
  "pedido_documentos",
  "envio_cotacao",
  "followup_proposta",
  "objecao",
  "fechamento",
  "pos_venda",
  "reativacao",
  "campanha",
] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];
export const MESSAGE_CATEGORY_LABELS: Record<MessageCategory, string> = {
  primeiro_contato: "Primeiro contato",
  agendamento: "Agendamento de reunião",
  confirmacao_reuniao: "Confirmação de reunião",
  pedido_documentos: "Pedido de documentos",
  envio_cotacao: "Envio de cotação",
  followup_proposta: "Follow-up de proposta",
  objecao: "Quebra de objeção",
  fechamento: "Fechamento de venda",
  pos_venda: "Pós-venda",
  reativacao: "Reativação de cliente",
  campanha: "Campanha do mês",
};

export const ANSWER_TOPICS = [
  "carencia",
  "coparticipacao",
  "acomodacao",
  "rede",
  "reembolso",
  "pme",
  "empresarial",
  "individual",
  "familiar",
  "reducao_custo",
  "portabilidade",
  "vigencia",
  "documentos",
  "dependentes",
  "cancelamento",
  "implantacao",
] as const;
export type AnswerTopic = (typeof ANSWER_TOPICS)[number];
export const ANSWER_TOPIC_LABELS: Record<AnswerTopic, string> = {
  carencia: "Carência",
  coparticipacao: "Coparticipação",
  acomodacao: "Acomodação",
  rede: "Rede credenciada",
  reembolso: "Reembolso",
  pme: "Plano PME",
  empresarial: "Plano empresarial",
  individual: "Plano individual",
  familiar: "Plano familiar",
  reducao_custo: "Redução de custo",
  portabilidade: "Portabilidade",
  vigencia: "Vigência",
  documentos: "Documentos necessários",
  dependentes: "Inclusão de dependentes",
  cancelamento: "Cancelamento",
  implantacao: "Implantação",
};

export const MESSAGE_CHANNELS = ["whatsapp", "email", "geral"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = { whatsapp: "WhatsApp", email: "E-mail", geral: "Geral" };

/** Variáveis dinâmicas aceitas nas mensagens da biblioteca. */
export const LIBRARY_VARIABLES: Record<string, string> = {
  cliente: "Nome do cliente/contato",
  empresa: "Empresa",
  operadora: "Operadora",
  produto: "Produto",
  vidas: "Quantidade de vidas",
  valor: "Valor (R$)",
  data: "Data",
  horario: "Horário",
  link: "Link da reunião",
  documentos: "Lista de documentos",
  campanha: "Nome da campanha",
  consultor: "Seu nome (consultor)",
};

/** Aviso LGPD exibido em campos de texto livre (seção 13). */
export const LGPD_FREE_TEXT_WARNING =
  "LGPD: não registre informações médicas sensíveis (diagnósticos, CID, exames, tratamentos) sem base legal e consentimento. Use apenas o necessário para a negociação.";
