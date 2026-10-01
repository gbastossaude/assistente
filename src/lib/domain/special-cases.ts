/**
 * Situações especiais do fluxo +99 vidas (Etapa 4 do wizard).
 * Cada tipo tem campos de resumo (gravados em special_cases.details) e campos por registro
 * (gravados em special_case_entries.data). A mesma definição alimenta validação, UI e pendências.
 */
import type { DocumentType } from "./constants";

export const SPECIAL_CASE_KINDS = [
  "prestadores",
  "demitidos_aposentados",
  "liminares",
  "gestantes",
  "agregados",
  "home_care",
  "afastados",
  "aposentados_invalidez",
  "cronicos",
] as const;
export type SpecialCaseKind = (typeof SPECIAL_CASE_KINDS)[number];

export type FieldType = "text" | "textarea" | "number" | "money" | "date" | "boolean" | "select" | "cnpj" | "document";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Tipo de documento a vincular (campos "document"). */
  documentType?: DocumentType;
  /** Dado de saúde: oculto para quem não tem permissão de dados sensíveis. */
  sensitive?: boolean;
  min?: number;
  max?: number;
}

export interface SpecialCaseDef {
  kind: SpecialCaseKind;
  label: string;
  description: string;
  summaryFields: FieldDef[];
  entryFields: FieldDef[];
  /** Rótulo do registro individual (ex.: "agregado"). */
  entryLabel: string;
  /** Se verdadeiro, a quantidade informada deve bater com o número de registros detalhados. */
  requiresEntryPerUnit: boolean;
}

const SEXO = [
  { value: "F", label: "Feminino" },
  { value: "M", label: "Masculino" },
];

export const SPECIAL_CASES: Record<SpecialCaseKind, SpecialCaseDef> = {
  prestadores: {
    kind: "prestadores",
    label: "Prestadores de serviço",
    description: "Empresas prestadoras incluídas no contrato.",
    entryLabel: "prestador",
    requiresEntryPerUnit: false,
    summaryFields: [],
    entryFields: [
      { key: "nome", label: "Nome / razão social", type: "text", required: true },
      { key: "cnpj", label: "CNPJ", type: "cnpj", required: true },
      { key: "quantidade", label: "Quantidade de vidas", type: "number", min: 0 },
      {
        key: "ligacao",
        label: "Ligação",
        type: "select",
        required: true,
        options: [
          { value: "estipulante", label: "Estipulante" },
          { value: "subestipulante", label: "Subestipulante" },
        ],
      },
      { key: "observacao", label: "Observação", type: "textarea" },
    ],
  },
  demitidos_aposentados: {
    kind: "demitidos_aposentados",
    label: "Demitidos e aposentados (Lei 9.656/98, arts. 30 e 31)",
    description: "Ex-empregados mantidos no plano conforme arts. 30 e 31.",
    entryLabel: "grupo",
    requiresEntryPerUnit: false,
    summaryFields: [
      { key: "forma_pagamento", label: "Forma de pagamento", type: "text" },
      { key: "custo_medio", label: "Custo médio", type: "money" },
      { key: "faixa_etaria", label: "Faixa etária predominante", type: "text" },
      { key: "operadora_emite_boleto", label: "Operadora atual emite boleto?", type: "boolean" },
      { key: "necessario_boleto", label: "Será necessária emissão de boleto?", type: "boolean" },
      { key: "quem_emite_boleto", label: "Quem emitirá o boleto?", type: "text" },
    ],
    entryFields: [
      {
        key: "tipo",
        label: "Tipo",
        type: "select",
        required: true,
        options: [
          { value: "demitido_art30", label: "Demitido (art. 30)" },
          { value: "aposentado_art31", label: "Aposentado (art. 31)" },
        ],
      },
      { key: "quantidade", label: "Quantidade", type: "number", required: true, min: 1 },
      { key: "faixa_etaria", label: "Faixa etária", type: "text" },
      { key: "custo_medio", label: "Custo médio", type: "money" },
      { key: "observacao", label: "Observação", type: "textarea" },
    ],
  },
  liminares: {
    kind: "liminares",
    label: "Liminares",
    description: "Beneficiários mantidos por decisão judicial.",
    entryLabel: "liminar",
    requiresEntryPerUnit: true,
    summaryFields: [],
    entryFields: [
      { key: "descricao", label: "Descrição / processo", type: "text", required: true },
      { key: "documento", label: "Documento da liminar", type: "document", documentType: "liminar", required: true, sensitive: true },
      { key: "observacao", label: "Observação", type: "textarea" },
    ],
  },
  gestantes: {
    kind: "gestantes",
    label: "Gestantes",
    description: "Gestantes na base atual.",
    entryLabel: "gestante",
    requiresEntryPerUnit: false,
    summaryFields: [{ key: "informacoes", label: "Informações complementares", type: "textarea" }],
    entryFields: [
      { key: "idade", label: "Idade", type: "number", min: 10, max: 60 },
      { key: "semanas", label: "Semanas de gestação", type: "number", min: 1, max: 42, sensitive: true },
      { key: "data_prevista_parto", label: "Data prevista do parto", type: "date", sensitive: true },
      { key: "plano_atual", label: "Plano atual", type: "text" },
      { key: "observacao", label: "Observação", type: "textarea" },
    ],
  },
  agregados: {
    kind: "agregados",
    label: "Agregados",
    description: "Agregados vinculados aos titulares.",
    entryLabel: "agregado",
    requiresEntryPerUnit: true,
    summaryFields: [],
    entryFields: [
      { key: "idade", label: "Idade exata", type: "number", required: true, min: 0, max: 120 },
      { key: "parentesco", label: "Grau de parentesco", type: "text", required: true },
      { key: "plano_atual", label: "Plano atual", type: "text" },
      { key: "observacao", label: "Observação", type: "textarea" },
    ],
  },
  home_care: {
    kind: "home_care",
    label: "Home Care",
    description: "Pacientes em atendimento domiciliar.",
    entryLabel: "paciente",
    requiresEntryPerUnit: true,
    summaryFields: [],
    entryFields: [
      { key: "identificacao", label: "Identificação (iniciais / matrícula)", type: "text", required: true },
      { key: "gasto_mensal", label: "Gasto mensal", type: "money", required: true },
      {
        key: "relatorio_medico",
        label: "Relatório médico atualizado",
        type: "document",
        documentType: "relatorio_home_care",
        required: true,
        sensitive: true,
      },
      { key: "protocolo", label: "Protocolo médico", type: "document", documentType: "protocolo_medico", required: true, sensitive: true },
      { key: "observacao", label: "Observações", type: "textarea", sensitive: true },
    ],
  },
  afastados: {
    kind: "afastados",
    label: "Afastados",
    description: "Beneficiários afastados (INSS/auxílio).",
    entryLabel: "afastado",
    requiresEntryPerUnit: true,
    summaryFields: [],
    entryFields: [
      { key: "cid", label: "CID", type: "text", required: true, sensitive: true },
      { key: "data_afastamento", label: "Data de afastamento", type: "date", required: true },
      { key: "idade", label: "Idade", type: "number", required: true, min: 0, max: 120 },
      { key: "sexo", label: "Sexo", type: "select", required: true, options: SEXO },
      { key: "plano_atual", label: "Plano atual", type: "text", required: true },
      { key: "localidade", label: "Localidade", type: "text", required: true },
      {
        key: "relatorio_medico",
        label: "Relatório médico",
        type: "document",
        documentType: "relatorio_medico",
        required: true,
        sensitive: true,
      },
    ],
  },
  aposentados_invalidez: {
    kind: "aposentados_invalidez",
    label: "Aposentados por invalidez",
    description: "Aposentados por invalidez mantidos no contrato.",
    entryLabel: "aposentado",
    requiresEntryPerUnit: true,
    summaryFields: [],
    entryFields: [
      { key: "cid", label: "CID", type: "text", required: true, sensitive: true },
      { key: "idade", label: "Idade", type: "number", required: true, min: 0, max: 120 },
      { key: "plano_atual", label: "Plano atual", type: "text", required: true },
      { key: "relatorio_medico", label: "Relatório médico (quando aplicável)", type: "document", documentType: "relatorio_medico", sensitive: true },
    ],
  },
  cronicos: {
    kind: "cronicos",
    label: "Casos crônicos",
    description: "Doenças crônicas de alto custo.",
    entryLabel: "caso",
    requiresEntryPerUnit: true,
    summaryFields: [],
    entryFields: [
      { key: "identificacao", label: "Identificação (iniciais / matrícula)", type: "text", required: true },
      {
        key: "relatorio_medico",
        label: "Relatório médico (obrigatório)",
        type: "document",
        documentType: "relatorio_medico",
        required: true,
        sensitive: true,
      },
      { key: "observacao", label: "Observação", type: "textarea", sensitive: true },
    ],
  },
};

export interface SpecialCaseSummary {
  kind: SpecialCaseKind;
  has: boolean | null;
  quantity: number | null;
}
export interface SpecialCaseEntryLike {
  kind: SpecialCaseKind;
  data: Record<string, unknown>;
}

export interface SpecialCaseIssue {
  kind: SpecialCaseKind;
  message: string;
  /** Categoria de pendência gerada. */
  category: "cliente" | "documento";
}

function isEmpty(v: unknown) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/**
 * Regras de tratamento das situações especiais. Retorna as pendências objetivas
 * (ex.: "Home Care sem relatório médico", "Liminar sem documento").
 */
export function evaluateSpecialCase(summary: SpecialCaseSummary, entries: SpecialCaseEntryLike[]): SpecialCaseIssue[] {
  const def = SPECIAL_CASES[summary.kind];
  const issues: SpecialCaseIssue[] = [];
  if (summary.has === null) {
    issues.push({ kind: def.kind, category: "cliente", message: `${def.label}: informar se possui (Sim/Não)` });
    return issues;
  }
  if (!summary.has) return issues;

  const own = entries.filter((e) => e.kind === def.kind);
  const qty = summary.quantity ?? 0;
  if (!summary.quantity || summary.quantity <= 0) {
    issues.push({ kind: def.kind, category: "cliente", message: `${def.label}: informar a quantidade` });
  }
  if (def.requiresEntryPerUnit && qty > own.length) {
    issues.push({
      kind: def.kind,
      category: "cliente",
      message: `${def.label}: ${qty - own.length} ${def.entryLabel}(s) sem detalhamento`,
    });
  }
  own.forEach((entry, idx) => {
    for (const f of def.entryFields) {
      if (!f.required || !isEmpty(entry.data[f.key])) continue;
      const n = own.length > 1 ? ` #${idx + 1}` : "";
      issues.push({
        kind: def.kind,
        category: f.type === "document" ? "documento" : "cliente",
        message: `${def.label}${n}: ${f.type === "document" ? `sem ${f.label.toLowerCase()}` : `falta ${f.label.toLowerCase()}`}`,
      });
    }
  });
  return issues;
}
