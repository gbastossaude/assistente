/**
 * Score de prontidão documental (seção 28). Indicador de apoio — não substitui o julgamento humano.
 * Componentes exibidos separadamente para explicar por que o processo está incompleto.
 */
import type { ReadinessWeights } from "./settings-defaults";
import { isResolved, type ChecklistItemLike } from "./checklist-engine";
import { evaluateSpecialCase, SPECIAL_CASE_KINDS, type SpecialCaseKind } from "./special-cases";

export interface ReadinessInput {
  checklist: (ChecklistItemLike & { category: string })[];
  lives: { imported: boolean; total: number; incomplete: number };
  commercial: Record<string, unknown>;
  specialSummaries: { kind: SpecialCaseKind; has: boolean | null; quantity: number | null }[];
  specialEntries: { kind: SpecialCaseKind; data: Record<string, unknown> }[];
}

export interface ReadinessComponent {
  key: keyof ReadinessWeights;
  label: string;
  weight: number;
  ratio: number;
  points: number;
  detail: string;
}

export interface Readiness {
  score: number;
  components: ReadinessComponent[];
}

const COMMERCIAL_FIELDS: Record<string, string> = {
  modality: "modalidade",
  paymentMethod: "forma de pagamento",
  commissionPct: "comissão",
  employeeContributionValue: "contribuição do funcionário",
  hasCopay: "coparticipação",
  reason: "motivo",
  targetDate: "data-alvo",
  fgts100: "FGTS 100%",
  designChange: "alteração de desenho",
};

export function computeReadiness(input: ReadinessInput, weights: ReadinessWeights): Readiness {
  const docItems = input.checklist.filter(
    (i) => i.applicable && i.required && i.category !== "base_vidas" && i.category !== "situacoes_especiais",
  );
  const docResolved = docItems.filter((i) => isResolved(i.status)).length;
  const docRatio = docItems.length ? docResolved / docItems.length : 1;

  let livesRatio = 0;
  let livesDetail = "Base de vidas não importada";
  if (input.lives.imported && input.lives.total > 0) {
    livesRatio = 1 - input.lives.incomplete / input.lives.total;
    livesDetail = `${input.lives.total} vidas, ${input.lives.incomplete} registro(s) com erro`;
  }

  const commercialKeys = Object.keys(COMMERCIAL_FIELDS);
  const missingCommercial = commercialKeys.filter((k) => {
    const v = input.commercial[k];
    return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  });
  const commercialRatio = (commercialKeys.length - missingCommercial.length) / commercialKeys.length;

  const kinds = SPECIAL_CASE_KINDS.map((kind) => {
    const s = input.specialSummaries.find((x) => x.kind === kind) ?? { kind, has: null, quantity: null };
    return evaluateSpecialCase(s, input.specialEntries).length === 0;
  });
  const specialRatio = kinds.filter(Boolean).length / kinds.length;

  const comp = (key: keyof ReadinessWeights, label: string, ratio: number, detail: string): ReadinessComponent => ({
    key,
    label,
    weight: weights[key],
    ratio,
    points: Math.round(ratio * weights[key] * 10) / 10,
    detail,
  });

  const components = [
    comp("documentacao", "Documentação obrigatória", docRatio, `${docResolved}/${docItems.length} itens obrigatórios resolvidos`),
    comp("base_vidas", "Base de vidas válida", livesRatio, livesDetail),
    comp(
      "comercial",
      "Dados comerciais",
      commercialRatio,
      missingCommercial.length ? `Faltam: ${missingCommercial.map((k) => COMMERCIAL_FIELDS[k]).join(", ")}` : "Completos",
    ),
    comp("casos_especiais", "Casos especiais tratados", specialRatio, `${kinds.filter(Boolean).length}/${kinds.length} tipos sem pendência`),
  ];
  const totalWeight = components.reduce((a, c) => a + c.weight, 0) || 1;
  const score = Math.round((components.reduce((a, c) => a + c.ratio * c.weight, 0) / totalWeight) * 100);
  return { score, components };
}
