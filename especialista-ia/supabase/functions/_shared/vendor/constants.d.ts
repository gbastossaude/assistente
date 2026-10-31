/**
 * Constantes de domínio compartilhadas por painel, extensão, worker e Edge Functions.
 * Este arquivo não pode importar nada externo: ele é copiado para supabase/functions/_shared/vendor.
 */
export declare const PRODUCT_NAME_DEFAULT = "Especialista IA \u2014 Planos de Sa\u00FAde";
/** Resposta obrigatória quando não há documento confiável (texto definido pela diretoria). */
export declare const FALLBACK_NO_SOURCE = "N\u00E3o encontrei uma regra atualizada e confirmada na nossa base de conhecimento. Recomendo validar com o respons\u00E1vel pela operadora antes de orientar o cliente.";
export declare const ROLES: readonly ["admin", "editor", "colaborador", "worker"];
export type Role = (typeof ROLES)[number];
export declare const ROLE_LABELS: Record<Role, string>;
export declare const CHANNELS: readonly ["extension", "whatsapp", "admin"];
export type Channel = (typeof CHANNELS)[number];
export declare const CHANNEL_LABELS: Record<Channel, string>;
export declare const QUESTION_STATUSES: readonly ["pendente", "processando", "respondida", "sem_fonte", "precisa_info", "conflito", "recusada", "erro", "expirada"];
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export declare const ANSWER_OUTCOMES: readonly ["respondida", "sem_fonte", "precisa_info", "conflito", "recusada", "erro"];
export type AnswerOutcome = (typeof ANSWER_OUTCOMES)[number];
export declare const OUTCOME_LABELS: Record<AnswerOutcome | "pendente" | "processando" | "expirada", string>;
export declare const JOB_TYPES: readonly ["answer_question", "index_document", "index_faq"];
export type JobType = (typeof JOB_TYPES)[number];
export declare const UFS: readonly ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
export type UF = (typeof UFS)[number];
export declare const UF_NAMES: Record<UF, string>;
/** Modalidades de contratação. */
export declare const CONTRACT_TYPES: readonly ["pme", "empresarial", "mei", "adesao", "individual", "familiar", "senior"];
export type ContractType = (typeof CONTRACT_TYPES)[number];
export declare const CONTRACT_TYPE_LABELS: Record<ContractType, string>;
export declare const OPERATOR_KINDS: readonly ["operadora", "seguradora", "administradora"];
export type OperatorKind = (typeof OPERATOR_KINDS)[number];
export declare const OPERATOR_KIND_LABELS: Record<OperatorKind, string>;
/** Natureza da regra: impede que uma negociação pontual seja tratada como regra geral. */
export declare const RULE_NATURES: readonly ["regra_contratacao", "procedimento_interno", "condicao_negociada", "regulatorio"];
export type RuleNature = (typeof RULE_NATURES)[number];
export declare const RULE_NATURE_LABELS: Record<RuleNature, string>;
export declare const DOCUMENT_CATEGORIES: readonly ["manual_comercial", "tabela_precos", "regras_elegibilidade", "carencias", "rede_credenciada", "documentacao", "reajuste", "movimentacao", "comissionamento", "comunicado", "contrato", "regulatorio", "procedimento_interno", "outros"];
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export declare const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string>;
export declare const DOCUMENT_STATUSES: readonly ["rascunho", "processando", "revisao", "ativo", "inativo", "erro"];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export declare const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string>;
export declare const ACCEPTED_FILE_TYPES: Record<string, string>;
export declare const ACCEPTED_EXTENSIONS: readonly ["pdf", "docx", "xlsx", "csv", "txt", "md"];
/** Campos que uma regra de "informações obrigatórias" pode exigir. */
export declare const REQUIRED_FIELDS: readonly ["operadora", "produto", "uf", "cidade", "modalidade", "vidas", "tempo_cnpj"];
export type RequiredField = (typeof REQUIRED_FIELDS)[number];
export declare const REQUIRED_FIELD_LABELS: Record<RequiredField, string>;
export declare const WHATSAPP_DEFAULT_MONTHLY_CAP = 900;
/** Limite técnico de texto da Cloud API. */
export declare const WHATSAPP_MAX_TEXT = 4096;
/** Janela de atendimento (horas) após a última mensagem do usuário. */
export declare const WHATSAPP_SERVICE_WINDOW_HOURS = 24;
export declare const HANDOFF_KEYWORDS: string[];
export declare const HELP_KEYWORDS: string[];
export declare const QUESTION_MAX_LENGTH = 2000;
export declare const QUESTION_MIN_LENGTH = 3;
