/**
 * Vocabulário de domínio compartilhado entre banco, validação e UI.
 * Fonte única para status, rótulos e cores — não duplicar em componentes.
 */

export const ROLES = ["admin", "head", "analista", "comercial", "leitura"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  head: "Head",
  analista: "Analista",
  comercial: "Comercial",
  leitura: "Somente leitura",
};

export const PROCESS_TYPES = ["NEW", "RENEW"] as const;
export type ProcessType = (typeof PROCESS_TYPES)[number];

export const PRIORITIES = ["baixa", "media", "alta", "critica"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};
export const PRIORITY_WEIGHT: Record<Priority, number> = { baixa: 1, media: 2, alta: 3, critica: 4 };

export const QUOTATION_STATUSES = [
  "oportunidade",
  "coleta_informacoes",
  "aguardando_cliente",
  "validando_documentacao",
  "pendencia_documental",
  "base_vidas_validacao",
  "pronta_para_mercado",
  "enviada_operadoras",
  "em_analise_operadoras",
  "pendencia_operadora",
  "propostas_recebidas",
  "montando_comparativo",
  "apresentacao_cliente",
  "negociacao",
  "finalista",
  "fechada_ganha",
  "fechada_perdida",
  "implantacao",
  "concluida",
  "cancelada",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  oportunidade: "Oportunidade identificada",
  coleta_informacoes: "Coleta de informações",
  aguardando_cliente: "Aguardando cliente",
  validando_documentacao: "Validando documentação",
  pendencia_documental: "Pendência documental",
  base_vidas_validacao: "Base de vidas em validação",
  pronta_para_mercado: "Pronta para mercado",
  enviada_operadoras: "Enviada às operadoras",
  em_analise_operadoras: "Em análise pelas operadoras",
  pendencia_operadora: "Pendência da operadora",
  propostas_recebidas: "Propostas recebidas",
  montando_comparativo: "Montando comparativo",
  apresentacao_cliente: "Apresentação ao cliente",
  negociacao: "Negociação",
  finalista: "Finalista",
  fechada_ganha: "Fechada — Ganha",
  fechada_perdida: "Fechada — Perdida",
  implantacao: "Implantação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
/** Status a partir dos quais a cotação já foi ao mercado — exigem prontidão. */
export const MARKET_STATUSES: QuotationStatus[] = [
  "pronta_para_mercado",
  "enviada_operadoras",
  "em_analise_operadoras",
  "pendencia_operadora",
  "propostas_recebidas",
  "montando_comparativo",
  "apresentacao_cliente",
  "negociacao",
  "finalista",
];
export const CLOSED_STATUSES: QuotationStatus[] = ["fechada_ganha", "fechada_perdida", "concluida", "cancelada"];
export const CLIENT_PENDING_STATUSES: QuotationStatus[] = ["aguardando_cliente", "pendencia_documental"];
export const INSURER_WAITING_STATUSES: QuotationStatus[] = [
  "enviada_operadoras",
  "em_analise_operadoras",
  "pendencia_operadora",
];

export const INSURER_QUOTE_STATUSES = [
  "nao_enviada",
  "enviada",
  "recebida_operadora",
  "em_analise",
  "pendencia",
  "declinada",
  "cotacao_recebida",
  "em_negociacao",
  "finalista",
  "encerrada",
] as const;
export type InsurerQuoteStatus = (typeof INSURER_QUOTE_STATUSES)[number];
export const INSURER_QUOTE_STATUS_LABELS: Record<InsurerQuoteStatus, string> = {
  nao_enviada: "Não enviada",
  enviada: "Enviada",
  recebida_operadora: "Recebida pela operadora",
  em_analise: "Em análise",
  pendencia: "Pendência",
  declinada: "Declinada",
  cotacao_recebida: "Cotação recebida",
  em_negociacao: "Em negociação",
  finalista: "Finalista",
  encerrada: "Encerrada",
};
/** Status em que ainda aguardamos retorno da operadora (gera follow-up). */
export const INSURER_AWAITING_STATUSES: InsurerQuoteStatus[] = ["enviada", "recebida_operadora", "em_analise", "pendencia"];

export const CHECKLIST_STATUSES = ["pendente", "recebido", "em_validacao", "validado", "dispensado"] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];
export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  em_validacao: "Em validação",
  validado: "Validado",
  dispensado: "Dispensado",
};

export const DOCUMENT_STATUSES = ["recebido", "pendente", "invalido", "desatualizado", "validado"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  recebido: "Recebido",
  pendente: "Pendente",
  invalido: "Inválido",
  desatualizado: "Desatualizado",
  validado: "Validado",
};

export const DOCUMENT_TYPES = [
  "base_vidas",
  "fatura",
  "sinistralidade",
  "evolucao_vidas",
  "maiores_usuarios",
  "picos_sinistralidade",
  "relatorio_medico",
  "liminar",
  "relatorio_home_care",
  "protocolo_medico",
  "contrato_atual",
  "proposta_atual",
  "proposta_operadora",
  "outros",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  base_vidas: "Base de vidas",
  fatura: "Fatura atual",
  sinistralidade: "Sinistralidade completa e atualizada",
  evolucao_vidas: "Evolução de vidas mês a mês",
  maiores_usuarios: "Relatório de maiores usuários",
  picos_sinistralidade: "Detalhamento dos picos de sinistralidade",
  relatorio_medico: "Relatório médico",
  liminar: "Liminar",
  relatorio_home_care: "Relatório de Home Care",
  protocolo_medico: "Protocolo médico",
  contrato_atual: "Contrato atual",
  proposta_atual: "Proposta atual",
  proposta_operadora: "Proposta de operadora",
  outros: "Outros documentos",
};
/** Documentos que contêm dado de saúde — acesso restrito e auditado. */
export const SENSITIVE_DOCUMENT_TYPES: DocumentType[] = [
  "base_vidas",
  "sinistralidade",
  "maiores_usuarios",
  "picos_sinistralidade",
  "relatorio_medico",
  "liminar",
  "relatorio_home_care",
  "protocolo_medico",
];

export const TASK_STATUSES = ["a_fazer", "em_andamento", "aguardando_terceiro", "concluida", "cancelada"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  aguardando_terceiro: "Aguardando terceiro",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export const OPEN_TASK_STATUSES: TaskStatus[] = ["a_fazer", "em_andamento", "aguardando_terceiro"];

export const TASK_CATEGORIES = [
  "follow_up",
  "documentacao",
  "cotacao",
  "operadora",
  "reuniao",
  "renovacao",
  "implantacao",
  "interna",
  "outro",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  follow_up: "Follow-up",
  documentacao: "Documentação",
  cotacao: "Cotação",
  operadora: "Operadora",
  reuniao: "Reunião",
  renovacao: "Renovação",
  implantacao: "Implantação",
  interna: "Interna",
  outro: "Outro",
};

export const RECURRENCES = ["nenhuma", "diaria", "semanal", "quinzenal", "mensal"] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  nenhuma: "Não repete",
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

export const EVENT_TYPES = [
  "reuniao_cliente",
  "reuniao_operadora",
  "follow_up",
  "apresentacao",
  "renovacao",
  "prazo_proposta",
  "implantacao",
  "tarefa_interna",
  "outro",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  reuniao_cliente: "Reunião com cliente",
  reuniao_operadora: "Reunião com operadora",
  follow_up: "Follow-up",
  apresentacao: "Apresentação",
  renovacao: "Renovação",
  prazo_proposta: "Prazo de proposta",
  implantacao: "Implantação",
  tarefa_interna: "Tarefa interna",
  outro: "Outro",
};

export const INTERACTION_TYPES = [
  "ligacao",
  "email",
  "whatsapp",
  "reuniao",
  "nota",
  "upload",
  "status",
  "tarefa",
  "documento",
  "proposta",
  "cobranca",
  "responsavel",
  "sistema",
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];
export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  ligacao: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  reuniao: "Reunião",
  nota: "Nota",
  upload: "Upload",
  status: "Alteração de status",
  tarefa: "Tarefa concluída",
  documento: "Documento",
  proposta: "Proposta recebida",
  cobranca: "Cobrança",
  responsavel: "Alteração de responsável",
  sistema: "Sistema",
};
/** Tipos que o usuário registra manualmente; os demais são gerados pelo sistema. */
export const MANUAL_INTERACTION_TYPES: InteractionType[] = ["ligacao", "email", "whatsapp", "reuniao", "nota", "cobranca"];

export const PENDENCY_CATEGORIES = ["cliente", "operadora", "documento", "base_vidas", "interna"] as const;
export type PendencyCategory = (typeof PENDENCY_CATEGORIES)[number];
export const PENDENCY_CATEGORY_LABELS: Record<PendencyCategory, string> = {
  cliente: "Cliente",
  operadora: "Operadora",
  documento: "Documento",
  base_vidas: "Base de vidas",
  interna: "Interna",
};
export const PENDENCY_STATUSES = ["aberta", "em_andamento", "resolvida", "cancelada"] as const;
export type PendencyStatus = (typeof PENDENCY_STATUSES)[number];
export const PENDENCY_STATUS_LABELS: Record<PendencyStatus, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  resolvida: "Resolvida",
  cancelada: "Cancelada",
};

export const RENEWAL_STATUSES = [
  "a_iniciar",
  "em_preparacao",
  "documentacao",
  "em_mercado",
  "negociacao",
  "renovada",
  "migrada",
  "perdida",
  "cancelada",
] as const;
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];
export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  a_iniciar: "A iniciar",
  em_preparacao: "Em preparação",
  documentacao: "Solicitando documentação",
  em_mercado: "Em mercado",
  negociacao: "Negociação final",
  renovada: "Renovada",
  migrada: "Migrada (nova operadora)",
  perdida: "Perdida",
  cancelada: "Cancelada",
};
export const CLOSED_RENEWAL_STATUSES: RenewalStatus[] = ["renovada", "migrada", "perdida", "cancelada"];

export const MODALITIES = ["opcional", "compulsorio"] as const;
export type Modality = (typeof MODALITIES)[number];
export const MODALITY_LABELS: Record<Modality, string> = { opcional: "Opcional", compulsorio: "Compulsório" };

export const CONTRIBUTION_TYPES = ["percentual", "valor"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export const COPAY_PROCEDURES = [
  "consultas",
  "procedimentos_seriados",
  "pronto_socorro",
  "procedimentos_ambulatoriais",
  "exames_tipo_a",
  "exames_tipo_b",
  "outros",
] as const;
export type CopayProcedure = (typeof COPAY_PROCEDURES)[number];
export const COPAY_PROCEDURE_LABELS: Record<CopayProcedure, string> = {
  consultas: "Consultas",
  procedimentos_seriados: "Procedimentos seriados",
  pronto_socorro: "Pronto-socorro",
  procedimentos_ambulatoriais: "Procedimentos ambulatoriais",
  exames_tipo_a: "Exames Tipo A",
  exames_tipo_b: "Exames Tipo B",
  outros: "Outros",
};

export const INSURER_KINDS = ["operadora", "seguradora"] as const;
export type InsurerKind = (typeof INSURER_KINDS)[number];

export const HOLDER_TYPES = ["TITULAR", "DEPENDENTE", "AGREGADO"] as const;
export type HolderType = (typeof HOLDER_TYPES)[number];

export const LARGE_ACCOUNT_MIN_LIVES = 100; // "+99 vidas"

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
