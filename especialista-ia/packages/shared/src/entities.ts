import { CONTRACT_TYPES, type ContractType, UF_NAMES, UFS, type UF } from "./constants.ts";
import { containsTerm, normalizeText } from "./text.ts";
import { classifyTopics, type TopicId } from "./topics.ts";

/** Item do catálogo (operadoras/produtos) cadastrado no painel. */
export interface CatalogEntry {
  id: string;
  name: string;
  aliases?: string[] | null;
}
export interface ProductCatalogEntry extends CatalogEntry {
  operator_id: string;
}
export interface EntityCatalog {
  operators: CatalogEntry[];
  products?: ProductCatalogEntry[];
  cities?: string[];
}

export interface ExtractedEntities {
  operatorIds: string[];
  productIds: string[];
  uf: UF | null;
  city: string | null;
  lives: number | null;
  contractType: ContractType | null;
  cnpjMonths: number | null;
  topics: TopicId[];
}

/** Contexto explícito informado pelo usuário (campos da extensão ou complemento no WhatsApp). */
export interface QuestionContext {
  operator_id?: string | null;
  product_id?: string | null;
  uf?: string | null;
  city?: string | null;
  lives?: number | null;
  contract_type?: string | null;
  cnpj_months?: number | null;
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cem: 100,
};

/** Siglas que, em minúsculas, raramente são palavras comuns em português. */
const SAFE_LOWER_UFS = new Set(["sp", "rj", "mg", "df", "pr", "sc", "rs", "ba", "mt", "ms", "rn", "pb", "es"]);

const CONTRACT_KEYWORDS: Array<[ContractType, string[]]> = [
  ["mei", ["mei", "microempreendedor"]],
  ["adesao", ["adesao", "coletivo por adesao", "por adesao", "entidade de classe"]],
  ["pme", ["pme", "pequena empresa", "pequenas empresas"]],
  ["empresarial", ["empresarial", "coletivo empresarial", "empresa", "cnpj"]],
  ["individual", ["individual", "pessoa fisica", "cpf"]],
  ["familiar", ["familiar", "familia"]],
  ["senior", ["senior", "terceira idade", "60+", "idosos"]],
];

function parseNumberToken(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

export function extractUf(original: string): UF | null {
  for (const uf of UFS) {
    if (new RegExp(`(^|[^A-Za-z])${uf}([^A-Za-z]|$)`).test(original)) return uf;
  }
  const norm = normalizeText(original);
  // Nomes completos primeiro (do mais longo ao mais curto, para "Mato Grosso do Sul" antes de "Mato Grosso").
  const byName = (Object.entries(UF_NAMES) as Array<[UF, string]>).sort((a, b) => b[1].length - a[1].length);
  for (const [uf, name] of byName) if (containsTerm(norm, name)) return uf;
  for (const uf of UFS) {
    const low = uf.toLowerCase();
    if (SAFE_LOWER_UFS.has(low) && new RegExp(`(^|[^a-z])(em|no|na|de|do|da|para|pra)\\s+${low}([^a-z]|$)`).test(norm)) return uf;
  }
  return null;
}

export function extractLives(norm: string): number | null {
  const m = /(\d{1,5}|[a-z]+)\s+(vidas?|pessoas|beneficiarios|titulares|funcionarios|colaboradores|socios)\b/.exec(norm);
  if (m) {
    const n = parseNumberToken(m[1]);
    if (n !== null) return n;
  }
  const m2 = /\bvidas?\s*[:=]\s*(\d{1,5})/.exec(norm);
  return m2 ? Number(m2[1]) : null;
}

export function extractCnpjMonths(norm: string): number | null {
  const patterns = [
    /cnpj\s+(?:com|de|ha|tem)?\s*(\d{1,3}|[a-z]+)\s+(mes|meses|ano|anos)/,
    /(\d{1,3}|[a-z]+)\s+(mes|meses|ano|anos)\s+de\s+(?:cnpj|abertura|empresa|existencia)/,
    /(?:aberta|aberto|abertura)\s+(?:ha|a)\s+(\d{1,3}|[a-z]+)\s+(mes|meses|ano|anos)/,
  ];
  for (const p of patterns) {
    const m = p.exec(norm);
    if (m) {
      const n = parseNumberToken(m[1]);
      if (n !== null) return m[2].startsWith("ano") ? n * 12 : n;
    }
  }
  return null;
}

export function extractContractType(norm: string): ContractType | null {
  for (const [type, keys] of CONTRACT_KEYWORDS) if (keys.some((k) => containsTerm(norm, k))) return type;
  return null;
}

function matchCatalog<T extends CatalogEntry>(norm: string, entries: T[]): T[] {
  return entries.filter((e) => [e.name, ...(e.aliases ?? [])].some((alias) => alias && containsTerm(norm, alias)));
}

export function extractEntities(text: string, catalog: EntityCatalog, context: QuestionContext = {}): ExtractedEntities {
  const norm = normalizeText(text);
  const operators = matchCatalog(norm, catalog.operators).map((o) => o.id);
  if (context.operator_id && !operators.includes(context.operator_id)) operators.unshift(context.operator_id);

  const productPool = (catalog.products ?? []).filter((p) => operators.length === 0 || operators.includes(p.operator_id));
  const products = matchCatalog(norm, productPool).map((p) => p.id);
  if (context.product_id && !products.includes(context.product_id)) products.unshift(context.product_id);

  const city =
    context.city ?? (catalog.cities ?? []).sort((a, b) => b.length - a.length).find((c) => containsTerm(norm, c)) ?? null;
  const ctxUf = context.uf && (UFS as readonly string[]).includes(context.uf.toUpperCase()) ? (context.uf.toUpperCase() as UF) : null;
  const ctxContract =
    context.contract_type && (CONTRACT_TYPES as readonly string[]).includes(context.contract_type)
      ? (context.contract_type as ContractType)
      : null;

  return {
    operatorIds: operators,
    productIds: products,
    uf: ctxUf ?? extractUf(text),
    city,
    lives: context.lives ?? extractLives(norm),
    contractType: ctxContract ?? extractContractType(norm),
    cnpjMonths: context.cnpj_months ?? extractCnpjMonths(norm),
    topics: classifyTopics(text),
  };
}
