import type { RetrievedChunk, RetrievedFaq, Retriever, SearchParams } from "../../packages/ai-core/src/index.ts";
import { DEFAULT_ANSWER_SETTINGS } from "../../packages/ai-core/src/index.ts";
import type { RequiredInfoRule } from "../../packages/ai-core/src/index.ts";

export const OPS = {
  bradesco: "11111111-1111-4111-8111-111111111111",
  amil: "22222222-2222-4222-8222-222222222222",
  sulamerica: "33333333-3333-4333-8333-333333333333",
};

export const catalog = {
  operators: [
    { id: OPS.bradesco, name: "Bradesco Saúde", aliases: ["Bradesco"] },
    { id: OPS.amil, name: "Amil", aliases: [] },
    { id: OPS.sulamerica, name: "SulAmérica", aliases: ["Sul America"] },
  ],
  products: [],
  cities: [],
};

export const rules: RequiredInfoRule[] = [
  { id: "r1", name: "Vidas depende da operadora", topic: "vidas", operator_id: null, required_fields: ["operadora"], message: "Qual operadora você quer consultar?", active: true },
  { id: "r2", name: "Rede", topic: "rede", operator_id: null, required_fields: ["operadora", "uf"], message: null, active: true },
];

let seq = 1;
export function chunk(p: Partial<RetrievedChunk> & { content: string }): RetrievedChunk {
  const id = seq++;
  return {
    chunk_id: id,
    document_id: p.document_id ?? `doc-${id}`,
    version_id: p.version_id ?? `ver-${id}`,
    page_from: 1,
    page_to: 1,
    section: null,
    title: `Documento ${id}`,
    operator_id: null,
    operator_name: null,
    product_id: null,
    product_name: null,
    category: "regras_elegibilidade",
    rule_nature: "regra_contratacao",
    contract_types: [],
    is_national: true,
    states: [],
    cities: [],
    lives_min: null,
    lives_max: null,
    published_at: "2026-06-01",
    valid_from: "2026-01-01",
    valid_until: "2027-12-31",
    doc_priority: 0,
    doc_updated_at: "2026-06-01T00:00:00Z",
    vector_similarity: 0.8,
    text_rank: 0.1,
    rrf_score: 0.03,
    ...p,
  };
}

export function faq(p: Partial<RetrievedFaq> & { question: string; answer: string }): RetrievedFaq {
  return {
    faq_id: `faq-${seq++}`,
    operator_id: null,
    operator_name: null,
    product_id: null,
    topic: null,
    contract_types: [],
    states: [],
    lives_min: null,
    lives_max: null,
    valid_until: null,
    rule_nature: "regra_contratacao",
    source_document_id: null,
    priority: 0,
    updated_at: "2026-06-01T00:00:00Z",
    vector_similarity: 0.95,
    text_rank: 0.2,
    rrf_score: 0.03,
    ...p,
  };
}

/** Retriever em memória que aplica o mesmo filtro de operadora da função SQL search_chunks. */
export class MemoryRetriever implements Retriever {
  calls: SearchParams[] = [];
  constructor(public chunks: RetrievedChunk[] = [], public faqs: RetrievedFaq[] = []) {}
  async searchChunks(p: SearchParams) {
    this.calls.push(p);
    return this.chunks.filter((c) => !p.operatorIds || (c.operator_id ? p.operatorIds.includes(c.operator_id) : p.includeGeneral));
  }
  async searchFaq(p: SearchParams) {
    return this.faqs.filter((f) => !p.operatorIds || !f.operator_id || p.operatorIds.includes(f.operator_id));
  }
}

export const settings = { ...DEFAULT_ANSWER_SETTINGS, embeddingModel: "mock-embed" };
export const fixedNow = () => new Date("2026-10-31T12:00:00-03:00");
