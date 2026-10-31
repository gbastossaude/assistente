import { daysBetween, type ExtractedEntities } from "@especialista/shared";
import type { RetrievedChunk, RetrievedFaq, SourcePriorityWeights } from "./types.ts";

/** Grupos de modalidades compatíveis (ex.: um documento PME vale para MEI/empresarial). */
const CONTRACT_GROUPS: string[][] = [["pme", "empresarial", "mei"], ["individual", "familiar", "senior"], ["adesao"]];

function contractCompatible(a: string, list: string[]): boolean {
  if (list.includes(a)) return true;
  const group = CONTRACT_GROUPS.find((g) => g.includes(a));
  return !!group && list.some((x) => group.includes(x));
}

export interface Candidate {
  kind: "documento" | "faq";
  key: string;
  document_id: string | null;
  version_id: string | null;
  chunk_id: number | null;
  faq_id: string | null;
  title: string;
  content: string;
  page_from: number | null;
  page_to: number | null;
  operator_id: string | null;
  operator_name: string | null;
  product_id: string | null;
  product_name: string | null;
  category: string | null;
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
  vector_similarity: number | null;
  text_rank: number | null;
  rrf_score: number;
  priority: number;
  /** Pontuação final após a priorização de fontes. */
  score: number;
  flags: {
    expired: boolean;
    notYetValid: boolean;
    regionMismatch: boolean;
    regional: boolean;
    scopeUnknown: boolean;
    negotiated: boolean;
    nearExpiry: boolean;
    operatorMatch: boolean;
    otherOperator: boolean;
  };
}

export interface RankingResult {
  usable: Candidate[];
  expired: Candidate[];
  future: Candidate[];
  regionExcluded: Candidate[];
  irrelevant: Candidate[];
}

export interface RankingOptions {
  entities: ExtractedEntities;
  weights: SourcePriorityWeights;
  today: string;
  minVectorSimilarity: number;
  nearExpiryDays: number;
}

/** Datas chegam como string (PostgREST) ou Date (driver pg): normaliza para AAAA-MM-DD. */
export function isoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function chunkToCandidate(c: RetrievedChunk): Candidate {
  return {
    kind: "documento",
    key: `c${c.chunk_id}`,
    document_id: c.document_id,
    version_id: c.version_id,
    chunk_id: c.chunk_id,
    faq_id: null,
    title: c.title,
    content: c.content,
    page_from: c.page_from,
    page_to: c.page_to,
    operator_id: c.operator_id,
    operator_name: c.operator_name,
    product_id: c.product_id,
    product_name: c.product_name,
    category: c.category,
    rule_nature: c.rule_nature,
    contract_types: c.contract_types ?? [],
    is_national: c.is_national,
    states: c.states ?? [],
    cities: c.cities ?? [],
    lives_min: c.lives_min,
    lives_max: c.lives_max,
    published_at: isoDate(c.published_at) ?? isoDate(c.doc_updated_at),
    valid_from: isoDate(c.valid_from),
    valid_until: isoDate(c.valid_until),
    vector_similarity: num(c.vector_similarity),
    text_rank: num(c.text_rank),
    rrf_score: Number(c.rrf_score) || 0,
    priority: Number(c.doc_priority ?? 0),
    score: 0,
    flags: emptyFlags(),
  };
}

export function faqToCandidate(f: RetrievedFaq): Candidate {
  return {
    kind: "faq",
    key: `f${f.faq_id}`,
    document_id: f.source_document_id,
    version_id: null,
    chunk_id: null,
    faq_id: f.faq_id,
    title: `FAQ oficial: ${f.question}`,
    content: `Pergunta: ${f.question}\nResposta oficial: ${f.answer}`,
    page_from: null,
    page_to: null,
    operator_id: f.operator_id,
    operator_name: f.operator_name,
    product_id: f.product_id,
    product_name: null,
    category: f.topic,
    rule_nature: f.rule_nature,
    contract_types: f.contract_types ?? [],
    is_national: false,
    states: f.states ?? [],
    cities: [],
    lives_min: f.lives_min,
    lives_max: f.lives_max,
    published_at: isoDate(f.updated_at),
    valid_from: null,
    valid_until: isoDate(f.valid_until),
    vector_similarity: num(f.vector_similarity),
    text_rank: num(f.text_rank),
    rrf_score: Number(f.rrf_score) || 0,
    priority: Number(f.priority ?? 0),
    score: 0,
    flags: emptyFlags(),
  };
}

function emptyFlags(): Candidate["flags"] {
  return {
    expired: false, notYetValid: false, regionMismatch: false, regional: false, scopeUnknown: false,
    negotiated: false, nearExpiry: false, operatorMatch: false, otherOperator: false,
  };
}

function isRelevant(c: Candidate, minSim: number): boolean {
  if (c.vector_similarity !== null && c.vector_similarity !== undefined) {
    // Similaridade semântica é o critério principal; a busca textual só "salva" trechos quase no limite.
    return c.vector_similarity >= minSim || (c.vector_similarity >= minSim - 0.08 && (c.text_rank ?? 0) > 0);
  }
  return (c.text_rank ?? 0) > 0;
}

/**
 * Prioriza as fontes por vigência, operadora, produto, região, modalidade, vidas e atualização.
 * Documentos vencidos, ainda não vigentes ou de outra região são separados — nunca usados como regra atual.
 */
export function rankCandidates(chunks: RetrievedChunk[], faqs: RetrievedFaq[], opts: RankingOptions): RankingResult {
  const { entities, weights: w, today } = opts;
  const all = [...chunks.map(chunkToCandidate), ...faqs.map(faqToCandidate)];
  const maxRrf = Math.max(1e-9, ...all.map((c) => c.rrf_score || 0));
  const result: RankingResult = { usable: [], expired: [], future: [], regionExcluded: [], irrelevant: [] };

  for (const c of all) {
    const f = c.flags;
    f.expired = !!c.valid_until && c.valid_until < today;
    f.notYetValid = !!c.valid_from && c.valid_from > today;
    f.nearExpiry = !!c.valid_until && !f.expired && daysBetween(today, c.valid_until) <= opts.nearExpiryDays;
    f.regional = c.states.length > 0;
    f.scopeUnknown = !c.is_national && c.states.length === 0 && c.kind === "documento";
    f.regionMismatch = !!entities.uf && c.states.length > 0 && !c.states.includes(entities.uf);
    f.negotiated = c.rule_nature === "condicao_negociada";
    f.operatorMatch = !!c.operator_id && entities.operatorIds.includes(c.operator_id);
    f.otherOperator = !!c.operator_id && entities.operatorIds.length > 0 && !f.operatorMatch;

    let score = (c.rrf_score || 0) / maxRrf;
    if (c.vector_similarity !== null) score += c.vector_similarity * 0.5;
    if (c.lives_min !== null) c.lives_min = Number(c.lives_min);
    if (c.lives_max !== null) c.lives_max = Number(c.lives_max);
    if (f.operatorMatch) score += w.operator_match;
    if (f.otherOperator) score -= w.operator_match * 2;
    if (c.product_id && entities.productIds.includes(c.product_id)) score += w.product_match;
    if (entities.uf && c.states.includes(entities.uf)) score += w.region_match;
    if (entities.city && c.cities.some((x) => x.toLowerCase() === entities.city!.toLowerCase())) score += w.region_match / 2;
    if (entities.contractType && c.contract_types.length > 0) {
      score += contractCompatible(entities.contractType, c.contract_types) ? w.contract_type_match : -w.contract_type_match;
    }
    if (entities.lives !== null && (c.lives_min !== null || c.lives_max !== null)) {
      const inRange = (c.lives_min === null || entities.lives >= c.lives_min) && (c.lives_max === null || entities.lives <= c.lives_max);
      if (inRange) score += w.lives_match;
    }
    if (c.published_at) {
      const age = daysBetween(c.published_at, today);
      if (age >= 0) score += w.recency * Math.max(0, 1 - age / 730);
    }
    score += (c.priority / 10) * w.document_priority;
    if (c.kind === "faq") score += w.official_faq;
    if (f.negotiated) score -= w.negotiated_penalty;
    c.score = Math.round(score * 1000) / 1000;

    if (!isRelevant(c, opts.minVectorSimilarity)) result.irrelevant.push(c);
    else if (f.expired) result.expired.push(c);
    else if (f.notYetValid) result.future.push(c);
    else if (f.regionMismatch) result.regionExcluded.push(c);
    else if (f.otherOperator && c.kind === "documento") result.irrelevant.push(c);
    else result.usable.push(c);
  }
  const byScore = (a: Candidate, b: Candidate) => b.score - a.score;
  result.usable.sort(byScore);
  result.expired.sort(byScore);
  result.future.sort(byScore);
  result.regionExcluded.sort(byScore);
  return result;
}

/** Seleciona os melhores trechos limitando a quantidade por documento (diversidade de fontes). */
export function selectContext(usable: Candidate[], max: number, perDocument = 3): Candidate[] {
  const out: Candidate[] = [];
  const perDoc = new Map<string, number>();
  for (const c of usable) {
    const k = c.document_id ?? c.key;
    const n = perDoc.get(k) ?? 0;
    if (n >= perDocument) continue;
    perDoc.set(k, n + 1);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** Pares de documentos diferentes, da mesma operadora e categoria, que podem trazer regras divergentes. */
export function potentialConflictPairs(selected: Candidate[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i];
      const b = selected[j];
      if (!a.document_id || !b.document_id || a.document_id === b.document_id) continue;
      if (a.kind !== "documento" || b.kind !== "documento") continue;
      if (a.operator_id && a.operator_id === b.operator_id && a.category === b.category && a.rule_nature === b.rule_nature) {
        pairs.push([i + 1, j + 1]);
      }
    }
  }
  return pairs;
}
