import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { ChecklistStatus, ProcessType } from "@/lib/domain/constants";
import { computeCompleteness, nextItemState, type ChecklistContext } from "@/lib/domain/checklist-engine";
import { db, type DbOrTx } from "../db";
import {
  checklistTemplates,
  currentContractPlans,
  currentContracts,
  lifeImports,
  quotationChecklistItems,
  quotationCnpjs,
  quotationDocuments,
  quotations,
  specialCaseEntries,
  specialCases,
} from "../db/schema";
import { NotFoundError } from "../errors";

/** Copia os itens ativos do modelo NEW/RENEW para a cotação (idempotente por item_key). */
export async function generateChecklist(quotationId: string, processType: ProcessType, tx: DbOrTx = db) {
  const templates = await tx
    .select()
    .from(checklistTemplates)
    .where(and(eq(checklistTemplates.processType, processType), eq(checklistTemplates.active, true)))
    .orderBy(asc(checklistTemplates.sortOrder));
  if (templates.length === 0) return 0;
  const rows = templates.map((t) => ({
    quotationId,
    itemKey: t.itemKey,
    label: t.label,
    category: t.category,
    required: t.required,
    condition: t.condition,
    autoSource: t.autoSource,
    documentType: t.documentType,
    requestText: t.requestText,
    sortOrder: t.sortOrder,
  }));
  const inserted = await tx
    .insert(quotationChecklistItems)
    .values(rows)
    .onConflictDoNothing({ target: [quotationChecklistItems.quotationId, quotationChecklistItems.itemKey] })
    .returning({ id: quotationChecklistItems.id });
  return inserted.length;
}

export async function buildChecklistContext(quotationId: string, tx: DbOrTx = db): Promise<ChecklistContext> {
  const [q] = await tx.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!q) throw new NotFoundError("Cotação");
  // Sequencial: consultas concorrentes na mesma conexão/transação não são suportadas pelo pg@9.
  const cnpjs = await tx.select({ id: quotationCnpjs.id }).from(quotationCnpjs).where(eq(quotationCnpjs.quotationId, quotationId));
  const contracts = await tx
    .select()
    .from(currentContracts)
    .where(and(eq(currentContracts.companyId, q.companyId), isNull(currentContracts.deletedAt), eq(currentContracts.active, true)));
  const docs = await tx
    .select({ docType: quotationDocuments.docType, status: quotationDocuments.status })
    .from(quotationDocuments)
    .where(and(eq(quotationDocuments.quotationId, quotationId), isNull(quotationDocuments.deletedAt)));
  const imports = await tx
    .select({ id: lifeImports.id })
    .from(lifeImports)
    .where(and(eq(lifeImports.quotationId, quotationId), eq(lifeImports.active, true)));
  const summaries = await tx.select().from(specialCases).where(eq(specialCases.quotationId, quotationId));
  const entries = await tx.select().from(specialCaseEntries).where(eq(specialCaseEntries.quotationId, quotationId));
  const plans = contracts.length
    ? await tx
        .select()
        .from(currentContractPlans)
        .where(
          inArray(
            currentContractPlans.contractId,
            contracts.map((c) => c.id),
          ),
        )
    : [];
  return {
    stipulantName: q.stipulantName,
    cnpjCount: cnpjs.length,
    reason: q.reason,
    modality: q.modality,
    takeover: q.takeover,
    fgts100: q.fgts100,
    paymentMethod: q.paymentMethod,
    remission: q.remission,
    adjustmentIndex: q.adjustmentIndex,
    breakEven: q.breakEven,
    upgradeDowngradeRules: q.upgradeDowngradeRules,
    commissionPct: q.commissionPct,
    designChange: q.designChange,
    hasCopay: q.hasCopay,
    copayPct: q.copayPct,
    employeeContributionValue: q.employeeContributionValue,
    renewalDate: q.renewalDate,
    contracts: contracts.map((c) => ({
      insurerName: c.insurerName,
      startDate: c.startDate,
      endDate: c.endDate,
      anniversaryDate: c.anniversaryDate,
      plans: plans
        .filter((p) => p.contractId === c.id)
        .map((p) => ({
          planName: p.planName,
          lives: p.lives,
          monthlyCost: p.monthlyCost,
          costPerLife: p.costPerLife,
          consultationReimbursement: p.consultationReimbursement,
        })),
    })),
    documents: docs,
    hasConfirmedLives: imports.length > 0,
    specialSummaries: summaries.map((s) => ({ kind: s.kind, has: s.has, quantity: s.quantity })),
    specialEntries: entries.map((e) => ({ kind: e.kind, data: e.data })),
  };
}

/** Reavalia aplicabilidade e preenchimento automático de todos os itens. Retorna a completude. */
export async function syncChecklist(quotationId: string, tx: DbOrTx = db) {
  const ctx = await buildChecklistContext(quotationId, tx);
  const items = await tx.select().from(quotationChecklistItems).where(eq(quotationChecklistItems.quotationId, quotationId));
  const now = new Date();
  for (const item of items) {
    const next = nextItemState({ status: item.status, autoFilled: item.autoFilled, applicable: item.applicable }, item, ctx);
    if (next.status !== item.status || next.autoFilled !== item.autoFilled || next.applicable !== item.applicable) {
      await tx
        .update(quotationChecklistItems)
        .set({
          status: next.status,
          autoFilled: next.autoFilled,
          applicable: next.applicable,
          receivedAt: next.status === "recebido" || next.status === "validado" ? (item.receivedAt ?? now) : next.status === "pendente" ? null : item.receivedAt,
        })
        .where(eq(quotationChecklistItems.id, item.id));
      item.status = next.status;
      item.applicable = next.applicable;
    }
  }
  return computeCompleteness(items);
}

export async function getChecklist(quotationId: string, tx: DbOrTx = db) {
  return tx
    .select()
    .from(quotationChecklistItems)
    .where(eq(quotationChecklistItems.quotationId, quotationId))
    .orderBy(asc(quotationChecklistItems.sortOrder), asc(quotationChecklistItems.label));
}

export async function getCompleteness(quotationId: string, tx: DbOrTx = db) {
  return computeCompleteness(await getChecklist(quotationId, tx));
}

export const RESOLVED_FOR_DISPLAY: ChecklistStatus[] = ["recebido", "em_validacao", "validado", "dispensado"];
