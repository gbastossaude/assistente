"use server";
import { z } from "zod";
import { SPECIAL_CASE_KINDS } from "@/lib/domain/special-cases";
import {
  checklistItemUpdateSchema,
  quotationHeaderSchema,
  quotationStep1Schema,
  quotationStep2Schema,
  quotationStep3Schema,
  specialCaseSummarySchema,
  statusChangeSchema,
} from "@/lib/validation/schemas";
import { reqCnpj } from "@/lib/validation/fields";
import { and, eq } from "drizzle-orm";
import { parseInput, runAction } from "../action-utils";
import { effectiveOwner, guardChecklistItem, guardCompany, guardQuotation, guardSpecialEntry } from "../access";
import { audit } from "../audit";
import { db } from "../db";
import { quotationChecklistItems } from "../db/schema";
import { NotFoundError } from "../errors";
import { addTimeline } from "../timeline";
import { CHECKLIST_STATUS_LABELS } from "@/lib/domain/constants";
import { changeQuotationStatus, createQuotation, setQuotationCnpjs, softDeleteQuotation, updateQuotationHeader, updateQuotationStep2, updateQuotationStep3 } from "../services/quotations";
import { afterQuotationChange } from "../services/quotation-sync";
import { declareRemainingAsNo, deleteSpecialEntry, saveSpecialEntry, saveSpecialSummary } from "../services/special-cases";
import { applyTemplateToQuotation } from "../services/admin";
import { generateMessage } from "../services/messages";

export async function createQuotationAction(input: unknown) {
  return runAction("quotation:write", async (u) => {
    const d = parseInput(quotationStep1Schema, input);
    await guardCompany(u, d.companyId);
    return (await createQuotation({ ...d, ownerId: await effectiveOwner(u, d.ownerId) }, u)).id;
  }, { message: "Cotação aberta — checklist gerado" });
}
export async function updateStep2Action(id: string, input: unknown) {
  return runAction("quotation:write", async (u) => (await guardQuotation(u, id), updateQuotationStep2(id, parseInput(quotationStep2Schema, input), u)), { message: "Contrato atual salvo" });
}
export async function updateStep3Action(id: string, input: unknown) {
  return runAction("quotation:write", async (u) => (await guardQuotation(u, id), updateQuotationStep3(id, parseInput(quotationStep3Schema, input), u)), { message: "Contribuição e coparticipação salvas" });
}
export async function updateHeaderAction(id: string, input: unknown) {
  return runAction("quotation:write", async (u) => {
    await guardQuotation(u, id);
    const d = parseInput(quotationHeaderSchema, input);
    return updateQuotationHeader(id, { ...d, ownerId: await effectiveOwner(u, d.ownerId) }, u);
  }, { message: "Cotação atualizada" });
}
export async function setCnpjsAction(id: string, cnpjs: unknown) {
  return runAction("quotation:write", async (u) => (await guardQuotation(u, id), setQuotationCnpjs(id, parseInput(z.array(reqCnpj()).max(200), cnpjs), u)), { message: "CNPJs atualizados" });
}
export async function changeStatusAction(input: unknown) {
  return runAction("quotation:write", async (u) => {
    const d = parseInput(statusChangeSchema, input);
    await guardQuotation(u, d.quotationId);
    return changeQuotationStatus(d, u);
  }, { message: "Status atualizado" });
}
export async function deleteQuotationAction(id: string) {
  return runAction("delete", async (u) => (await guardQuotation(u, id), softDeleteQuotation(id, u)), { message: "Cotação excluída" });
}

export async function updateChecklistItemAction(input: unknown) {
  return runAction(
    "quotation:write",
    async (u) => {
      const d = parseInput(checklistItemUpdateSchema, input);
      await guardChecklistItem(u, d.id);
      const [item] = await db.select().from(quotationChecklistItems).where(eq(quotationChecklistItems.id, d.id));
      if (!item) throw new NotFoundError("Item");
      await db.transaction(async (tx) => {
        await tx
          .update(quotationChecklistItems)
          .set({
            status: d.status,
            autoFilled: false, // decisão manual prevalece sobre o motor
            sentBy: d.sentBy,
            notes: d.notes,
            documentId: d.documentId,
            requestedAt: d.requestedAt ? new Date(`${d.requestedAt}T12:00:00Z`) : item.requestedAt,
            requestedBy: d.requestedAt && !item.requestedBy ? u.id : item.requestedBy,
            receivedAt: d.receivedAt ? new Date(`${d.receivedAt}T12:00:00Z`) : ["recebido", "validado"].includes(d.status) ? (item.receivedAt ?? new Date()) : item.receivedAt,
            updatedBy: u.id,
          })
          .where(eq(quotationChecklistItems.id, d.id));
        if (item.status !== d.status) {
          await audit({ userId: u.id, action: "checklist_change", entityType: "quotation", entityId: item.quotationId, summary: `Checklist "${item.label}": ${CHECKLIST_STATUS_LABELS[item.status]} → ${CHECKLIST_STATUS_LABELS[d.status]}${d.notes ? ` (${d.notes})` : ""}` }, tx);
          await addTimeline({ type: "sistema", description: `Checklist: ${item.label} → ${CHECKLIST_STATUS_LABELS[d.status]}`, userId: u.id, quotationId: item.quotationId }, tx);
        }
        await afterQuotationChange(item.quotationId, tx);
      });
    },
    { message: "Item atualizado" },
  );
}

/** Marca itens pendentes como "solicitados" ao cliente (registra quem e quando). */
export async function markRequestedAction(quotationId: string) {
  return runAction(
    "quotation:write",
    async (u) => {
      await guardQuotation(u, quotationId);
      const now = new Date();
      const rows = await db
        .update(quotationChecklistItems)
        .set({ requestedAt: now, requestedBy: u.id })
        .where(and(eq(quotationChecklistItems.quotationId, quotationId), eq(quotationChecklistItems.status, "pendente"), eq(quotationChecklistItems.applicable, true)))
        .returning({ id: quotationChecklistItems.id });
      await addTimeline({ type: "cobranca", description: `Solicitação de ${rows.length} item(ns) pendente(s) enviada ao cliente`, userId: u.id, quotationId });
      return rows.length;
    },
    { message: "Solicitação registrada" },
  );
}

export async function applyTemplateAction(quotationId: string) {
  return runAction("quotation:write", async (u) => (await guardQuotation(u, quotationId), applyTemplateToQuotation(quotationId, u)), { message: "Modelo de checklist reaplicado" });
}

export async function saveSpecialSummaryAction(input: unknown) {
  return runAction("quotation:write", async (u) => {
    const d = parseInput(specialCaseSummarySchema, input);
    await guardQuotation(u, d.quotationId);
    return saveSpecialSummary(d, u);
  }, { message: "Situação especial salva" });
}
export async function declareRemainingNoAction(quotationId: string) {
  return runAction("quotation:write", async (u) => (await guardQuotation(u, quotationId), declareRemainingAsNo(quotationId, u)), { message: "Demais situações declaradas como Não" });
}
const entryInput = z.object({ id: z.string().uuid().nullable().optional(), quotationId: z.string().uuid(), kind: z.enum(SPECIAL_CASE_KINDS), data: z.record(z.string(), z.unknown()) });
export async function saveSpecialEntryAction(input: unknown) {
  return runAction("quotation:write", async (u) => {
    const d = parseInput(entryInput, input);
    await guardQuotation(u, d.quotationId);
    if (d.id) await guardSpecialEntry(u, d.id);
    return saveSpecialEntry(d, u);
  }, { message: "Registro salvo" });
}
export async function deleteSpecialEntryAction(id: string) {
  return runAction("quotation:write", async (u) => (await guardSpecialEntry(u, id), deleteSpecialEntry(id, u)), { message: "Registro removido" });
}

export async function generateMessageAction(input: { quotationId: string; templateKey: string; quotationInsurerId?: string | null; includeOptional?: boolean }) {
  return runAction("read", async (u) => (await guardQuotation(u, input.quotationId), generateMessage(input, u.name)), { revalidate: [] });
}

export async function logMessageSentAction(input: { quotationId: string; channel: string; summary: string }) {
  return runAction(
    "read",
    async (u) => {
      await guardQuotation(u, input.quotationId);
      await addTimeline({ type: input.channel === "whatsapp" ? "whatsapp" : "email", description: `Mensagem preparada/enviada pelo usuário: ${input.summary.slice(0, 300)}`, userId: u.id, quotationId: input.quotationId });
    },
    { message: "Registrado na timeline" },
  );
}
