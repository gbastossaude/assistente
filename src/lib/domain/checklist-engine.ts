/**
 * Motor de checklist NEW/RENEW.
 *  - avalia a condição de aplicabilidade de cada item (ex.: só pede CID de afastados se houver afastados);
 *  - detecta itens já atendidos pelos dados do sistema (autoSource);
 *  - calcula completude (baseada nos obrigatórios) e bloqueio de "Pronta para mercado".
 * Funções puras — os serviços montam o contexto a partir do banco.
 */
import type { ChecklistStatus, DocumentStatus, DocumentType, Modality } from "./constants";
import { evaluateSpecialCase, SPECIAL_CASE_KINDS, type SpecialCaseKind } from "./special-cases";

export interface ChecklistContext {
  stipulantName: string | null;
  cnpjCount: number;
  reason: string | null;
  modality: Modality | null;
  takeover: boolean | null;
  fgts100: boolean | null;
  paymentMethod: string | null;
  remission: string | null;
  adjustmentIndex: string | null;
  breakEven: number | null;
  upgradeDowngradeRules: string | null;
  commissionPct: number | null;
  designChange: boolean | null;
  hasCopay: boolean | null;
  copayPct: number | null;
  employeeContributionValue: number | null;
  renewalDate: string | null;
  contracts: {
    insurerName: string | null;
    startDate: string | null;
    endDate: string | null;
    anniversaryDate: string | null;
    plans: { planName: string; lives: number | null; monthlyCost: number | null; costPerLife: number | null; consultationReimbursement: number | null }[];
  }[];
  documents: { docType: string; status: DocumentStatus }[];
  hasConfirmedLives: boolean;
  specialSummaries: { kind: SpecialCaseKind; has: boolean | null; quantity: number | null }[];
  specialEntries: { kind: SpecialCaseKind; data: Record<string, unknown> }[];
}

export interface ChecklistItemDef {
  itemKey: string;
  condition: string;
  autoSource: string | null;
}

export type AutoResult = "missing" | "satisfied" | "validated";

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;
const notNull = (v: unknown) => v !== null && v !== undefined;

function special(ctx: ChecklistContext, kind: SpecialCaseKind) {
  return ctx.specialSummaries.find((s) => s.kind === kind) ?? { kind, has: null, quantity: null };
}

export function isApplicable(condition: string, ctx: ChecklistContext): boolean {
  if (!condition || condition === "always") return true;
  const [type, arg] = condition.split(":");
  if (type === "special") return special(ctx, arg as SpecialCaseKind).has === true;
  if (type === "modality") return ctx.modality === arg;
  if (type === "copay") return ctx.hasCopay === true;
  return true;
}

function docState(ctx: ChecklistContext, type: string): AutoResult {
  const docs = ctx.documents.filter((d) => d.docType === type);
  if (docs.some((d) => d.status === "validado")) return "validated";
  if (docs.some((d) => d.status === "recebido")) return "satisfied";
  return "missing";
}

/** Avalia se os dados do sistema já atendem o item. */
export function evaluateAutoSource(source: string | null, ctx: ChecklistContext): AutoResult {
  if (!source) return "missing";
  const ok = (b: boolean): AutoResult => (b ? "satisfied" : "missing");
  const plans = ctx.contracts.flatMap((c) => c.plans);
  if (source.startsWith("doc:")) return docState(ctx, source.slice(4));
  if (source === "lives") return ok(ctx.hasConfirmedLives);
  if (source.startsWith("entries:")) {
    const [, kind, fieldList] = source.split(":");
    const summary = special(ctx, kind as SpecialCaseKind);
    if (summary.has !== true) return "missing";
    const entries = ctx.specialEntries.filter((e) => e.kind === kind);
    const fields = fieldList.split(",");
    if (entries.length === 0 || entries.length < (summary.quantity ?? 0)) return "missing";
    return ok(entries.every((e) => fields.every((f) => notNull(e.data[f]) && String(e.data[f]).trim() !== "")));
  }
  if (source === "special:declared") return ok(SPECIAL_CASE_KINDS.every((k) => special(ctx, k).has !== null));
  if (source.startsWith("special:")) {
    const kind = source.slice(8) as SpecialCaseKind;
    const summary = special(ctx, kind);
    return ok(summary.has !== null && evaluateSpecialCase(summary, ctx.specialEntries).length === 0);
  }
  switch (source) {
    case "field:stipulant":
      return ok(filled(ctx.stipulantName));
    case "field:cnpjs":
      return ok(ctx.cnpjCount > 0);
    case "field:current_insurer":
      return ok(ctx.contracts.length > 0 && ctx.contracts.every((c) => filled(c.insurerName)));
    case "field:contract_term":
      return ok(ctx.contracts.length > 0 && ctx.contracts.every((c) => !!c.startDate));
    case "field:anniversary":
      return ok(ctx.contracts.length > 0 ? ctx.contracts.every((c) => !!c.anniversaryDate) : !!ctx.renewalDate);
    case "field:plans":
      return ok(plans.length > 0 && plans.every((p) => filled(p.planName) && notNull(p.lives)));
    case "field:costs":
      return ok(plans.length > 0 && plans.every((p) => notNull(p.monthlyCost) || notNull(p.costPerLife)));
    case "field:reimbursement":
      return ok(plans.length > 0 && plans.every((p) => notNull(p.consultationReimbursement)));
    case "field:modality":
      return ok(!!ctx.modality);
    case "field:takeover":
      return ok(notNull(ctx.takeover));
    case "field:fgts":
      return ok(notNull(ctx.fgts100));
    case "field:payment_method":
      return ok(filled(ctx.paymentMethod));
    case "field:remission":
      return ok(filled(ctx.remission));
    case "field:copay_model":
      return ok(ctx.hasCopay === false || (ctx.hasCopay === true && notNull(ctx.copayPct)));
    case "field:contribution":
      return ok(notNull(ctx.employeeContributionValue));
    case "field:upgrade_rules":
      return ok(filled(ctx.upgradeDowngradeRules));
    case "field:adjustment_index":
      return ok(filled(ctx.adjustmentIndex));
    case "field:break_even":
      return ok(notNull(ctx.breakEven));
    case "field:reason":
      return ok(filled(ctx.reason));
    case "field:design_change":
      return ok(notNull(ctx.designChange));
    case "field:commission":
      return ok(notNull(ctx.commissionPct));
    default:
      return "missing";
  }
}

export interface ItemState {
  status: ChecklistStatus;
  autoFilled: boolean;
  applicable: boolean;
}

/**
 * Decide o novo estado de um item após reavaliação.
 * Regras:
 *  - item não aplicável → "dispensado" automático (volta a "pendente" se voltar a ser aplicável);
 *  - status definido manualmente (autoFilled=false e ≠ pendente) nunca é sobrescrito;
 *  - atendido pelos dados → "recebido" (ou "validado" se documento validado), marcado como automático;
 *  - preenchimento automático que deixou de ser atendido → volta a "pendente".
 */
export function nextItemState(current: ItemState, def: ChecklistItemDef, ctx: ChecklistContext): ItemState {
  const applicable = isApplicable(def.condition, ctx);
  if (!applicable) {
    if (current.status === "pendente" || current.autoFilled) return { status: "dispensado", autoFilled: true, applicable };
    return { ...current, applicable };
  }
  const manual = !current.autoFilled && current.status !== "pendente";
  if (manual) return { ...current, applicable };
  const auto = evaluateAutoSource(def.autoSource, ctx);
  if (auto === "validated") return { status: "validado", autoFilled: true, applicable };
  if (auto === "satisfied") return { status: "recebido", autoFilled: true, applicable };
  return { status: "pendente", autoFilled: false, applicable };
}

export interface ChecklistItemLike {
  required: boolean;
  applicable: boolean;
  status: ChecklistStatus;
}

export const RESOLVED_STATUSES: ChecklistStatus[] = ["recebido", "em_validacao", "validado", "dispensado"];

export function isResolved(status: ChecklistStatus) {
  return RESOLVED_STATUSES.includes(status);
}

export interface Completeness {
  pct: number;
  requiredTotal: number;
  requiredResolved: number;
  optionalTotal: number;
  optionalResolved: number;
  pendingRequired: number;
  label: "Incompleta" | "Em preparação" | "Quase pronta" | "Pronta para envio ao mercado";
  tone: "red" | "amber" | "blue" | "green";
}

/** Completude considerando os itens obrigatórios aplicáveis (opcionais são exibidos à parte). */
export function computeCompleteness(items: ChecklistItemLike[]): Completeness {
  const applicable = items.filter((i) => i.applicable);
  const req = applicable.filter((i) => i.required);
  const opt = applicable.filter((i) => !i.required);
  const requiredResolved = req.filter((i) => isResolved(i.status)).length;
  const optionalResolved = opt.filter((i) => isResolved(i.status)).length;
  const pct = req.length === 0 ? 100 : Math.floor((requiredResolved / req.length) * 100);
  const band = completenessBand(pct);
  return {
    pct,
    requiredTotal: req.length,
    requiredResolved,
    optionalTotal: opt.length,
    optionalResolved,
    pendingRequired: req.length - requiredResolved,
    ...band,
  };
}

export function completenessBand(pct: number): Pick<Completeness, "label" | "tone"> {
  if (pct >= 100) return { label: "Pronta para envio ao mercado", tone: "green" };
  if (pct >= 80) return { label: "Quase pronta", tone: "blue" };
  if (pct >= 50) return { label: "Em preparação", tone: "amber" };
  return { label: "Incompleta", tone: "red" };
}

export interface ReadyCheck {
  allowed: boolean;
  needsOverride: boolean;
  pendingRequired: number;
  reason?: string;
}

/** Bloqueio de "Pronta para mercado": só com obrigatórios resolvidos ou override justificado. */
export function canMarkReadyForMarket(items: ChecklistItemLike[], overrideReason?: string | null): ReadyCheck {
  const c = computeCompleteness(items);
  if (c.pendingRequired === 0) return { allowed: true, needsOverride: false, pendingRequired: 0 };
  const justified = !!overrideReason && overrideReason.trim().length >= 15;
  return {
    allowed: justified,
    needsOverride: true,
    pendingRequired: c.pendingRequired,
    reason: justified
      ? undefined
      : `Há ${c.pendingRequired} item(ns) obrigatório(s) pendente(s). Para prosseguir, registre uma justificativa de override (mín. 15 caracteres).`,
  };
}

export function documentTypeForItem(item: { documentType: string | null }): DocumentType | null {
  return (item.documentType as DocumentType) ?? null;
}
