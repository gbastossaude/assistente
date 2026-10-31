// ARQUIVO GERADO por scripts/sync-edge-shared.mjs a partir de packages/shared/src — não edite aqui.
/**
 * Constantes de domínio compartilhadas por painel, extensão, worker e Edge Functions.
 * Este arquivo não pode importar nada externo: ele é copiado para supabase/functions/_shared/vendor.
 */

/** Schema próprio no PostgreSQL (permite compartilhar o projeto Supabase com outros sistemas). */
export const DB_SCHEMA = "especialista";
/** Bucket privado dos arquivos da base de conhecimento. */
export const KNOWLEDGE_BUCKET = "especialista-conhecimento";
/** Nomes das Edge Functions (prefixados para não colidir com funções de outros sistemas no mesmo projeto). */
export const EDGE_FUNCTIONS = {
  webhook: "especialista-whatsapp-webhook",
  send: "especialista-whatsapp-send",
  adminUsers: "especialista-admin-users",
} as const;

export const PRODUCT_NAME_DEFAULT = "Especialista IA — Planos de Saúde";

/** Resposta obrigatória quando não há documento confiável (texto definido pela diretoria). */
export const FALLBACK_NO_SOURCE =
  "Não encontrei uma regra atualizada e confirmada na nossa base de conhecimento. Recomendo validar com o responsável pela operadora antes de orientar o cliente.";

export const ROLES = ["admin", "editor", "colaborador", "worker"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  editor: "Editor",
  colaborador: "Colaborador",
  worker: "Worker (máquina)",
};

export const CHANNELS = ["extension", "whatsapp", "admin"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  extension: "Extensão Chrome",
  whatsapp: "WhatsApp",
  admin: "Painel",
};

export const QUESTION_STATUSES = [
  "pendente",
  "processando",
  "respondida",
  "sem_fonte",
  "precisa_info",
  "conflito",
  "recusada",
  "erro",
  "expirada",
] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const ANSWER_OUTCOMES = ["respondida", "sem_fonte", "precisa_info", "conflito", "recusada", "erro"] as const;
export type AnswerOutcome = (typeof ANSWER_OUTCOMES)[number];

export const OUTCOME_LABELS: Record<AnswerOutcome | "pendente" | "processando" | "expirada", string> = {
  respondida: "Respondida",
  sem_fonte: "Sem fonte confiável",
  precisa_info: "Precisa de informações",
  conflito: "Conflito entre regras",
  recusada: "Fora do escopo",
  erro: "Erro",
  pendente: "Na fila",
  processando: "Processando",
  expirada: "Expirada",
};

export const JOB_TYPES = ["answer_question", "index_document", "index_faq"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
  "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
export type UF = (typeof UFS)[number];

export const UF_NAMES: Record<UF, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

/** Modalidades de contratação. */
export const CONTRACT_TYPES = ["pme", "empresarial", "mei", "adesao", "individual", "familiar", "senior"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  pme: "PME",
  empresarial: "Empresarial",
  mei: "MEI",
  adesao: "Coletivo por adesão",
  individual: "Individual",
  familiar: "Familiar",
  senior: "Sênior",
};

export const OPERATOR_KINDS = ["operadora", "seguradora", "administradora"] as const;
export type OperatorKind = (typeof OPERATOR_KINDS)[number];
export const OPERATOR_KIND_LABELS: Record<OperatorKind, string> = {
  operadora: "Operadora",
  seguradora: "Seguradora especializada em saúde",
  administradora: "Administradora de benefícios",
};

/** Natureza da regra: impede que uma negociação pontual seja tratada como regra geral. */
export const RULE_NATURES = ["regra_contratacao", "procedimento_interno", "condicao_negociada", "regulatorio"] as const;
export type RuleNature = (typeof RULE_NATURES)[number];
export const RULE_NATURE_LABELS: Record<RuleNature, string> = {
  regra_contratacao: "Regra de contratação da operadora",
  procedimento_interno: "Procedimento interno da corretora",
  condicao_negociada: "Condição negociada (exceção)",
  regulatorio: "Determinação regulatória (ANS/legislação)",
};

export const DOCUMENT_CATEGORIES = [
  "manual_comercial",
  "tabela_precos",
  "regras_elegibilidade",
  "carencias",
  "rede_credenciada",
  "documentacao",
  "reajuste",
  "movimentacao",
  "comissionamento",
  "comunicado",
  "contrato",
  "regulatorio",
  "procedimento_interno",
  "outros",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  manual_comercial: "Manual / guia comercial",
  tabela_precos: "Tabela de preços",
  regras_elegibilidade: "Regras de elegibilidade",
  carencias: "Carências e portabilidade",
  rede_credenciada: "Rede credenciada",
  documentacao: "Documentação para contratação",
  reajuste: "Reajuste",
  movimentacao: "Movimentação cadastral",
  comissionamento: "Comissionamento",
  comunicado: "Comunicado da operadora",
  contrato: "Contrato / condições gerais",
  regulatorio: "ANS / legislação",
  procedimento_interno: "Procedimento interno",
  outros: "Outros",
};

export const DOCUMENT_STATUSES = ["rascunho", "processando", "revisao", "ativo", "inativo", "erro"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  rascunho: "Rascunho",
  processando: "Indexando",
  revisao: "Aguardando revisão",
  ativo: "Ativo",
  inativo: "Inativo",
  erro: "Erro",
};

export const ACCEPTED_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/markdown": "md",
};
export const ACCEPTED_EXTENSIONS = ["pdf", "docx", "xlsx", "csv", "txt", "md"] as const;

/** Campos que uma regra de "informações obrigatórias" pode exigir. */
export const REQUIRED_FIELDS = ["operadora", "produto", "uf", "cidade", "modalidade", "vidas", "tempo_cnpj"] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];
export const REQUIRED_FIELD_LABELS: Record<RequiredField, string> = {
  operadora: "operadora",
  produto: "produto/plano",
  uf: "estado (UF)",
  cidade: "cidade",
  modalidade: "modalidade de contratação (PME, adesão, individual...)",
  vidas: "quantidade de vidas",
  tempo_cnpj: "tempo de abertura do CNPJ",
};

export const WHATSAPP_DEFAULT_MONTHLY_CAP = 900;
/** Limite técnico de texto da Cloud API. */
export const WHATSAPP_MAX_TEXT = 4096;
/** Janela de atendimento (horas) após a última mensagem do usuário. */
export const WHATSAPP_SERVICE_WINDOW_HOURS = 24;

export const HANDOFF_KEYWORDS = [
  "falar com responsavel",
  "falar com responsável",
  "falar com humano",
  "falar com atendente",
  "atendente",
  "humano",
  "responsavel",
  "responsável",
];
export const HELP_KEYWORDS = ["menu", "ajuda", "help", "oi", "olá", "ola", "bom dia", "boa tarde", "boa noite"];

export const QUESTION_MAX_LENGTH = 2000;
export const QUESTION_MIN_LENGTH = 3;
