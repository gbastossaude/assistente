import type { AnswerOutcome, Channel, EntityCatalog, QuestionContext, RequiredField } from "@especialista/shared";

/** Mensagem no formato de chat usado pelos provedores. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  /** JSON Schema para saída estruturada (Ollama `format`). */
  jsonSchema?: Record<string, unknown>;
  numCtx?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  model: string;
  durationMs: number;
  promptTokens?: number;
  outputTokens?: number;
}

/** Abstração de provedor de geração — Ollama hoje; outros provedores podem ser adicionados sem reescrever o motor. */
export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  /** Verdadeiro quando a inferência roda no próprio computador (sem envio a terceiros). */
  readonly local: boolean;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly local: boolean;
  readonly dimensions: number;
  embed(texts: string[], kind: "query" | "document", options?: { timeoutMs?: number }): Promise<number[][]>;
}

/** Trecho retornado pela busca híbrida (public.search_chunks). */
export interface RetrievedChunk {
  chunk_id: number;
  document_id: string;
  version_id: string;
  content: string;
  page_from: number | null;
  page_to: number | null;
  section: string | null;
  title: string;
  operator_id: string | null;
  operator_name: string | null;
  product_id: string | null;
  product_name: string | null;
  category: string;
  rule_nature: string;
  contract_types: string[];
  is_national: boolean;
  states: string[];
  cities: string[];
  lives_min: number | null;
  lives_max: number | null;
  published_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  doc_priority: number;
  doc_updated_at: string | null;
  vector_similarity: number | null;
  text_rank: number | null;
  rrf_score: number;
}

/** FAQ oficial retornada por public.search_faq. */
export interface RetrievedFaq {
  faq_id: string;
  question: string;
  answer: string;
  operator_id: string | null;
  operator_name: string | null;
  product_id: string | null;
  topic: string | null;
  contract_types: string[];
  states: string[];
  lives_min: number | null;
  lives_max: number | null;
  valid_until: string | null;
  rule_nature: string;
  source_document_id: string | null;
  priority: number;
  updated_at: string | null;
  vector_similarity: number | null;
  text_rank: number | null;
  rrf_score: number;
}

export interface SearchParams {
  embedding: number[] | null;
  text: string;
  embeddingModel: string;
  operatorIds: string[] | null;
  includeGeneral: boolean;
  limit: number;
}

export interface Retriever {
  searchChunks(params: SearchParams): Promise<RetrievedChunk[]>;
  searchFaq(params: SearchParams): Promise<RetrievedFaq[]>;
}

export interface RequiredInfoRule {
  id: string;
  name: string;
  topic: string | null;
  operator_id: string | null;
  required_fields: RequiredField[];
  message: string | null;
  active: boolean;
}

export interface SourcePriorityWeights {
  operator_match: number;
  product_match: number;
  region_match: number;
  contract_type_match: number;
  lives_match: number;
  recency: number;
  document_priority: number;
  official_faq: number;
  negotiated_penalty: number;
  region_mismatch_penalty: number;
}

export interface AnswerSettings {
  embeddingModel: string;
  temperature: number;
  numCtx: number;
  maxContextChunks: number;
  retrievalCandidates: number;
  minVectorSimilarity: number;
  faqDirectThreshold: number;
  requestTimeoutMs: number;
  nearExpiryDays: number;
  blockPromptInjection: boolean;
  maxQuestionLength: number;
  weights: SourcePriorityWeights;
  timeZone: string;
}

export interface AnswerInput {
  text: string;
  channel: Channel;
  context?: QuestionContext;
  /** Pergunta original quando esta mensagem é um complemento pedido pelo sistema. */
  parentText?: string | null;
}

export interface SourceRef {
  rank: number;
  kind: "documento" | "faq";
  document_id: string | null;
  version_id: string | null;
  chunk_id: number | null;
  faq_id: string | null;
  title: string;
  operator_name: string | null;
  page_from: number | null;
  page_to: number | null;
  excerpt: string;
  score: number;
  valid_until: string | null;
  rule_nature: string;
  expired?: boolean;
}

export interface DetectedInfo {
  operator_id: string | null;
  operator_ids: string[];
  product_id: string | null;
  uf: string | null;
  city: string | null;
  lives: number | null;
  contract_type: string | null;
  cnpj_months: number | null;
  topic: string | null;
  topics: string[];
}

export interface AnswerResult {
  outcome: AnswerOutcome;
  content: string;
  sources: SourceRef[];
  warnings: string[];
  missing_fields: string[];
  detected: DetectedInfo;
  injection_flag: boolean;
  pii_redacted: boolean;
  conflict_document_ids: string[];
  conflict_description: string | null;
  confidence: number | null;
  provider: string | null;
  model: string | null;
  retrieval_ms: number;
  generation_ms: number;
  total_ms: number;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface AnswerDeps {
  chat: ChatProvider;
  embedder: EmbeddingProvider;
  retriever: Retriever;
  catalog: EntityCatalog;
  rules: RequiredInfoRule[];
  settings: AnswerSettings;
  now?: () => Date;
  logger?: Logger;
}

/** IA local indisponível (Ollama parado, modelo ausente, tempo esgotado): a tarefa deve ser reprocessada. */
export class AiUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Configuração bloqueada pelo modo gratuito (ex.: provedor pago selecionado). */
export class FreeModeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreeModeViolationError";
  }
}
