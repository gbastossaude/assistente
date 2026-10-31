import type { AnswerSettings, SourcePriorityWeights } from "./types.ts";

export const DEFAULT_WEIGHTS: SourcePriorityWeights = {
  operator_match: 0.3,
  product_match: 0.2,
  region_match: 0.15,
  contract_type_match: 0.1,
  lives_match: 0.1,
  recency: 0.1,
  document_priority: 0.05,
  official_faq: 0.25,
  negotiated_penalty: 0.25,
  region_mismatch_penalty: 1,
};

export const DEFAULT_ANSWER_SETTINGS: AnswerSettings = {
  embeddingModel: "bge-m3",
  temperature: 0.1,
  numCtx: 8192,
  maxContextChunks: 6,
  retrievalCandidates: 20,
  minVectorSimilarity: 0.45,
  faqDirectThreshold: 0.9,
  requestTimeoutMs: 120_000,
  nearExpiryDays: 30,
  blockPromptInjection: true,
  maxQuestionLength: 2000,
  weights: DEFAULT_WEIGHTS,
  timeZone: "America/Sao_Paulo",
};

type Json = Record<string, unknown> | null | undefined;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Converte as chaves de system_settings (ai, source_priority, security) em AnswerSettings. */
export function answerSettingsFromServer(server: { ai?: Json; source_priority?: Json; security?: Json }): AnswerSettings {
  const ai = server.ai ?? {};
  const sec = server.security ?? {};
  const sp = server.source_priority ?? {};
  const d = DEFAULT_ANSWER_SETTINGS;
  const weights = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(weights) as Array<keyof SourcePriorityWeights>) weights[k] = num(sp[k], weights[k]);
  return {
    embeddingModel: typeof ai.embedding_model === "string" ? ai.embedding_model : d.embeddingModel,
    temperature: num(ai.temperature, d.temperature),
    numCtx: num(ai.num_ctx, d.numCtx),
    maxContextChunks: num(ai.max_context_chunks, d.maxContextChunks),
    retrievalCandidates: num(ai.retrieval_candidates, d.retrievalCandidates),
    minVectorSimilarity: num(ai.min_vector_similarity, d.minVectorSimilarity),
    faqDirectThreshold: num(ai.faq_direct_threshold, d.faqDirectThreshold),
    requestTimeoutMs: num(ai.request_timeout_ms, d.requestTimeoutMs),
    nearExpiryDays: num(ai.near_expiry_days, d.nearExpiryDays),
    blockPromptInjection: sec.block_prompt_injection !== false,
    maxQuestionLength: num(sec.max_question_length, d.maxQuestionLength),
    weights,
    timeZone: d.timeZone,
  };
}
