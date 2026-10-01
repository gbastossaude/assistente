import "server-only";
import { QI_ID } from "../db/qualified";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { INSURER_QUOTE_STATUS_LABELS, type InsurerQuoteStatus } from "@/lib/domain/constants";
import { formatDateBR, todayISO } from "@/lib/domain/dates";
import type { followupSchema, insurerSchema, proposalSchema, quotationInsurerSchema, sendToInsurerSchema } from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import type { CurrentUser } from "../auth";
import { db, type DbOrTx } from "../db";
import {
  companies,
  currentContractPlans,
  currentContracts,
  insurerFollowups,
  insurers,
  proposalPlans,
  proposals,
  quotationDocuments,
  quotationInsurers,
  quotations,
  users,
} from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { addTimeline } from "../timeline";
import { onFollowupRegistered, onInsurerSent, onProposalReceived } from "../automation/engine";
import { syncPendencies } from "./pendencies";

// ─── Cadastro de operadoras ───
export async function saveInsurer(id: string | null, input: z.output<typeof insurerSchema>, user: CurrentUser) {
  const [dup] = await db.select({ id: insurers.id }).from(insurers).where(sql`lower(${insurers.name}) = lower(${input.name})`);
  if (dup && dup.id !== id) throw new BusinessError("Já existe operadora com este nome.", { name: ["Duplicado"] });
  if (id) {
    await db.update(insurers).set(input).where(eq(insurers.id, id));
    await audit({ userId: user.id, action: "update", entityType: "insurer", entityId: id, summary: `Operadora atualizada: ${input.name}` });
    return id;
  }
  const [row] = await db.insert(insurers).values(input).returning({ id: insurers.id });
  await audit({ userId: user.id, action: "create", entityType: "insurer", entityId: row.id, summary: `Operadora cadastrada: ${input.name}` });
  return row.id;
}

export async function softDeleteInsurer(id: string, user: CurrentUser) {
  const [row] = await db.update(insurers).set({ deletedAt: new Date(), active: false }).where(eq(insurers.id, id)).returning();
  if (!row) throw new NotFoundError("Operadora");
  await audit({ userId: user.id, action: "delete", entityType: "insurer", entityId: id, summary: `Operadora excluída (lógica): ${row.name}` });
}

// Coluna qualificada: em SELECT de tabela única o Drizzle omite o nome da tabela, o que tornaria "id" ambíguo nas subconsultas.
const INS_ID = sql.raw(`"insurers"."id"`);

export async function listInsurers(opts: { q?: string | null; includeInactive?: boolean } = {}) {
  return db
    .select({
      i: insurers,
      activeQuotes: sql<number>`(select count(*)::int from ${quotationInsurers} qi join ${quotations} q on q.id = qi.quotation_id where qi.insurer_id = ${INS_ID} and q.deleted_at is null and qi.status in ('enviada','recebida_operadora','em_analise','pendencia','cotacao_recebida','em_negociacao','finalista'))`,
      awaiting: sql<number>`(select count(*)::int from ${quotationInsurers} qi join ${quotations} q on q.id = qi.quotation_id where qi.insurer_id = ${INS_ID} and q.deleted_at is null and qi.status in ('enviada','recebida_operadora','em_analise','pendencia'))`,
      avgResponseDays: sql<number | null>`(select round(avg(extract(epoch from (qi.first_response_at - qi.sent_at)) / 86400)::numeric, 1)::float from ${quotationInsurers} qi where qi.insurer_id = ${INS_ID} and qi.first_response_at is not null and qi.sent_at is not null)`,
      totalSent: sql<number>`(select count(*)::int from ${quotationInsurers} qi where qi.insurer_id = ${INS_ID} and qi.sent_at is not null)`,
      declined: sql<number>`(select count(*)::int from ${quotationInsurers} qi where qi.insurer_id = ${INS_ID} and qi.status = 'declinada')`,
    })
    .from(insurers)
    .where(
      and(
        isNull(insurers.deletedAt),
        opts.includeInactive ? undefined : eq(insurers.active, true),
        opts.q ? sql`${insurers.name} ilike ${"%" + opts.q + "%"}` : undefined,
      ),
    )
    .orderBy(asc(insurers.name));
}

export async function insurerOptions() {
  return db
    .select({ id: insurers.id, name: insurers.name })
    .from(insurers)
    .where(and(isNull(insurers.deletedAt), eq(insurers.active, true)))
    .orderBy(asc(insurers.name));
}

export async function getInsurerDetail(id: string) {
  const [i] = await db.select().from(insurers).where(eq(insurers.id, id));
  if (!i) return null;
  const quotes = await db
    .select({ qi: quotationInsurers, code: quotations.code, quotationId: quotations.id, companyName: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`, lives: quotations.estimatedLives })
    .from(quotationInsurers)
    .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(and(eq(quotationInsurers.insurerId, id), isNull(quotations.deletedAt)))
    .orderBy(desc(quotationInsurers.updatedAt));
  return { insurer: i, quotes };
}

// ─── Distribuição da cotação ───
async function loadQI(id: string, tx: DbOrTx = db) {
  const [row] = await tx
    .select({ qi: quotationInsurers, insurerName: insurers.name, q: quotations })
    .from(quotationInsurers)
    .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
    .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
    .where(eq(quotationInsurers.id, id));
  if (!row || row.q.deletedAt) throw new NotFoundError("Operadora da cotação");
  return row;
}

export async function addInsurersToQuotation(quotationId: string, insurerIds: string[], user: CurrentUser) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!q || q.deletedAt) throw new NotFoundError("Cotação");
  if (!insurerIds.length) throw new BusinessError("Selecione ao menos uma operadora.");
  const rows = await db.select().from(insurers).where(inArray(insurers.id, insurerIds));
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(quotationInsurers)
      .values(rows.map((i) => ({ quotationId, insurerId: i.id, insurerContact: i.contactName, insurerEmail: i.email, createdBy: user.id })))
      .onConflictDoNothing()
      .returning({ id: quotationInsurers.id });
    if (!inserted.length) throw new BusinessError("As operadoras selecionadas já estão nesta cotação.");
    await audit({ userId: user.id, action: "create", entityType: "quotation_insurer", entityId: quotationId, summary: `${q.code}: ${inserted.length} operadora(s) selecionada(s)` }, tx);
    await addTimeline({ type: "sistema", description: `Operadoras selecionadas: ${rows.map((r) => r.name).join(", ")}`, userId: user.id, quotationId }, tx);
  });
}

export async function removeInsurerFromQuotation(id: string, user: CurrentUser) {
  const row = await loadQI(id);
  if (row.qi.status !== "nao_enviada") throw new BusinessError("Só é possível remover operadoras ainda não acionadas. Use o status 'Encerrada'.");
  await db.delete(quotationInsurers).where(eq(quotationInsurers.id, id));
  await audit({ userId: user.id, action: "delete", entityType: "quotation_insurer", entityId: id, summary: `${row.q.code}: ${row.insurerName} removida da cotação` });
  await addTimeline({ type: "sistema", description: `Operadora removida: ${row.insurerName}`, userId: user.id, quotationId: row.q.id });
}

const RESPONSE_STATUSES: InsurerQuoteStatus[] = ["recebida_operadora", "em_analise", "pendencia", "declinada", "cotacao_recebida"];

export async function updateQuotationInsurer(input: z.output<typeof quotationInsurerSchema>, user: CurrentUser) {
  const row = await loadQI(input.id);
  if (input.status === "declinada" && !input.declineReason) throw new BusinessError("Informe o motivo da declinação.", { declineReason: ["Obrigatório"] });
  const { id, ...data } = input;
  await db.transaction(async (tx) => {
    const statusChanged = row.qi.status !== input.status;
    await tx
      .update(quotationInsurers)
      .set({
        ...data,
        ...(statusChanged ? { statusChangedAt: new Date() } : {}),
        ...(statusChanged && RESPONSE_STATUSES.includes(input.status) && !row.qi.firstResponseAt ? { firstResponseAt: new Date() } : {}),
      })
      .where(eq(quotationInsurers.id, id));
    const changes = diff(row.qi as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
    if (Object.keys(changes).length) {
      await audit(
        {
          userId: user.id,
          action: statusChanged ? "status_change" : "update",
          entityType: "quotation_insurer",
          entityId: id,
          summary: `${row.q.code} / ${row.insurerName}: ${statusChanged ? `${INSURER_QUOTE_STATUS_LABELS[row.qi.status]} → ${INSURER_QUOTE_STATUS_LABELS[input.status]}` : "dados atualizados"}`,
          changes,
        },
        tx,
      );
    }
    if (statusChanged) {
      await addTimeline(
        {
          type: "status",
          description: `${row.insurerName}: ${INSURER_QUOTE_STATUS_LABELS[row.qi.status]} → ${INSURER_QUOTE_STATUS_LABELS[input.status]}${input.status === "declinada" ? ` (${input.declineReason})` : ""}`,
          userId: user.id,
          quotationId: row.q.id,
        },
        tx,
      );
      if (["declinada", "encerrada", "cotacao_recebida"].includes(input.status)) await onFollowupRegistered(id, null, user.id, tx);
    }
    if (input.nextFollowupAt && input.nextFollowupAt !== row.qi.nextFollowupAt && !["declinada", "encerrada"].includes(input.status)) {
      await onFollowupRegistered(id, input.nextFollowupAt, user.id, tx);
    }
    await syncPendencies(row.q.id, tx);
  });
}

export async function sendToInsurer(input: z.output<typeof sendToInsurerSchema>, user: CurrentUser) {
  const row = await loadQI(input.id);
  await db.transaction(async (tx) => {
    await tx
      .update(quotationInsurers)
      .set({
        status: row.qi.status === "nao_enviada" ? "enviada" : row.qi.status,
        statusChangedAt: new Date(),
        sentAt: new Date(`${input.sentAt}T12:00:00Z`),
        protocol: input.protocol ?? row.qi.protocol,
        expectedReturnAt: input.expectedReturnAt,
        filesSent: input.filesSent,
      })
      .where(eq(quotationInsurers.id, input.id));
    const next = await onInsurerSent(input.id, input.sentAt, user.id, tx);
    await addTimeline(
      {
        type: "email",
        description: `Estudo enviado para ${row.insurerName} em ${formatDateBR(input.sentAt)}${input.protocol ? ` — protocolo ${input.protocol}` : ""}${input.expectedReturnAt ? `; retorno previsto ${formatDateBR(input.expectedReturnAt)}` : ""}`,
        userId: user.id,
        quotationId: row.q.id,
        nextAction: next ? `Follow-up ${row.insurerName}` : null,
        nextActionAt: next,
      },
      tx,
    );
    await audit({ userId: user.id, action: "update", entityType: "quotation_insurer", entityId: input.id, summary: `${row.q.code}: envio para ${row.insurerName}` }, tx);
    await syncPendencies(row.q.id, tx);
  });
}

export async function registerFollowup(input: z.output<typeof followupSchema>, user: CurrentUser) {
  const row = await loadQI(input.quotationInsurerId);
  await db.transaction(async (tx) => {
    await tx.insert(insurerFollowups).values({ ...input, userId: user.id });
    await tx
      .update(quotationInsurers)
      .set({ lastFollowupAt: new Date(), nextFollowupAt: input.nextFollowupAt })
      .where(eq(quotationInsurers.id, row.qi.id));
    await onFollowupRegistered(row.qi.id, input.nextFollowupAt, user.id, tx);
    await addTimeline(
      {
        type: "cobranca",
        description: `Follow-up com ${row.insurerName} (${input.channel})${input.notes ? `: ${input.notes}` : ""}`,
        userId: user.id,
        quotationId: row.q.id,
        nextAction: input.nextFollowupAt ? `Novo follow-up ${row.insurerName}` : null,
        nextActionAt: input.nextFollowupAt,
      },
      tx,
    );
    await syncPendencies(row.q.id, tx);
  });
}

export async function listFollowups(quotationInsurerId: string) {
  return db
    .select({ f: insurerFollowups, userName: users.name })
    .from(insurerFollowups)
    .leftJoin(users, eq(users.id, insurerFollowups.userId))
    .where(eq(insurerFollowups.quotationInsurerId, quotationInsurerId))
    .orderBy(desc(insurerFollowups.occurredAt));
}

export async function listQuotationInsurers(quotationId: string) {
  const rows = await db
    .select({
      qi: quotationInsurers,
      insurer: insurers,
      proposalCount: sql<number>`(select count(*)::int from ${proposals} p where p.quotation_insurer_id = ${QI_ID} and p.deleted_at is null)`,
    })
    .from(quotationInsurers)
    .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
    .where(eq(quotationInsurers.quotationId, quotationId))
    .orderBy(asc(insurers.name));
  const ids = rows.map((r) => r.qi.id);
  const fus = ids.length
    ? await db
        .select({ f: insurerFollowups, userName: users.name })
        .from(insurerFollowups)
        .leftJoin(users, eq(users.id, insurerFollowups.userId))
        .where(inArray(insurerFollowups.quotationInsurerId, ids))
        .orderBy(desc(insurerFollowups.occurredAt))
    : [];
  return rows.map((r) => ({ ...r, followups: fus.filter((f) => f.f.quotationInsurerId === r.qi.id) }));
}
export type QuotationInsurerRow = Awaited<ReturnType<typeof listQuotationInsurers>>[number];

// ─── Propostas ───
export async function saveProposal(input: z.output<typeof proposalSchema>, user: CurrentUser) {
  const row = await loadQI(input.quotationInsurerId);
  if (input.documentId) {
    const [d] = await db.select({ q: quotationDocuments.quotationId }).from(quotationDocuments).where(eq(quotationDocuments.id, input.documentId));
    if (!d || d.q !== row.q.id) throw new BusinessError("Documento não pertence a esta cotação.");
  }
  const { plans, id, ...data } = input;
  return db.transaction(async (tx) => {
    let proposalId = id;
    if (proposalId) {
      await tx.update(proposals).set(data).where(eq(proposals.id, proposalId));
      await tx.delete(proposalPlans).where(eq(proposalPlans.proposalId, proposalId));
    } else {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(proposals)
        .where(eq(proposals.quotationInsurerId, row.qi.id));
      const [p] = await tx
        .insert(proposals)
        .values({ ...data, quotationId: row.q.id, version: n + 1, createdBy: user.id })
        .returning();
      proposalId = p.id;
      // Primeira proposta: status da operadora → cotação recebida; cancela cobranças
      const newStatus: InsurerQuoteStatus = ["nao_enviada", "enviada", "recebida_operadora", "em_analise", "pendencia"].includes(row.qi.status) ? "cotacao_recebida" : row.qi.status;
      await tx
        .update(quotationInsurers)
        .set({
          status: newStatus,
          statusChangedAt: newStatus !== row.qi.status ? new Date() : row.qi.statusChangedAt,
          firstResponseAt: row.qi.firstResponseAt ?? new Date(),
          commissionPct: data.commissionPct ?? row.qi.commissionPct,
          adminFeePct: data.adminFeePct ?? row.qi.adminFeePct,
        })
        .where(eq(quotationInsurers.id, row.qi.id));
      const cancelled = await onProposalReceived(row.qi.id, user.id, tx);
      await addTimeline(
        {
          type: "proposta",
          description: `Proposta recebida de ${row.insurerName} (v${n + 1}, ${plans.length} produto(s))${data.validUntil ? `, válida até ${formatDateBR(data.validUntil)}` : ""}${cancelled ? ` — ${cancelled} cobrança(s) cancelada(s)` : ""}`,
          userId: user.id,
          quotationId: row.q.id,
        },
        tx,
      );
    }
    await tx.insert(proposalPlans).values(plans.map((p) => ({ ...p, proposalId: proposalId! })));
    await audit({ userId: user.id, action: id ? "update" : "create", entityType: "proposal", entityId: proposalId, summary: `${row.q.code}: proposta ${row.insurerName} ${id ? "atualizada" : "registrada"}` }, tx);
    await syncPendencies(row.q.id, tx);
    return proposalId!;
  });
}

export async function deleteProposal(id: string, user: CurrentUser) {
  const [p] = await db.update(proposals).set({ deletedAt: new Date() }).where(eq(proposals.id, id)).returning();
  if (!p) throw new NotFoundError("Proposta");
  await audit({ userId: user.id, action: "delete", entityType: "proposal", entityId: id, summary: "Proposta excluída (lógica)" });
  await addTimeline({ type: "sistema", description: "Proposta excluída", userId: user.id, quotationId: p.quotationId });
  await syncPendencies(p.quotationId);
}

/** Destaque para apresentação — decisão do usuário; o sistema não elege "a melhor". */
export async function toggleProposalHighlight(id: string, user: CurrentUser) {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, id));
  if (!p) throw new NotFoundError("Proposta");
  await db.update(proposals).set({ selectedForPresentation: !p.selectedForPresentation }).where(eq(proposals.id, id));
  await addTimeline({ type: "sistema", description: `Proposta ${p.selectedForPresentation ? "removida do" : "destacada para"} apresentação`, userId: user.id, quotationId: p.quotationId });
}

export async function getComparison(quotationId: string) {
  const rows = await db
    .select({ p: proposals, insurerName: insurers.name, qiStatus: quotationInsurers.status })
    .from(proposals)
    .innerJoin(quotationInsurers, eq(quotationInsurers.id, proposals.quotationInsurerId))
    .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
    .where(and(eq(proposals.quotationId, quotationId), isNull(proposals.deletedAt)))
    .orderBy(asc(insurers.name), desc(proposals.version));
  const plans = rows.length
    ? await db
        .select()
        .from(proposalPlans)
        .where(
          inArray(
            proposalPlans.proposalId,
            rows.map((r) => r.p.id),
          ),
        )
        .orderBy(asc(proposalPlans.productName))
    : [];
  // Custo atual de referência: soma dos custos mensais dos contratos atuais da empresa
  const [q] = await db.select({ companyId: quotations.companyId }).from(quotations).where(eq(quotations.id, quotationId));
  const [cur] = q
    ? await db
        .select({
          total: sql<number | null>`sum(coalesce(${currentContractPlans.monthlyCost}, ${currentContractPlans.costPerLife} * ${currentContractPlans.lives}))::float`,
        })
        .from(currentContractPlans)
        .innerJoin(currentContracts, eq(currentContracts.id, currentContractPlans.contractId))
        .where(and(eq(currentContracts.companyId, q.companyId), isNull(currentContracts.deletedAt)))
    : [{ total: null }];
  const today = todayISO();
  return {
    currentMonthlyCost: cur?.total ?? null,
    proposals: rows.map((r) => {
      const ps = plans.filter((p) => p.proposalId === r.p.id);
      const total = ps.reduce((a, p) => a + (p.monthlyValue ?? 0), 0);
      const currentRef = ps.some((p) => p.currentCost !== null) ? ps.reduce((a, p) => a + (p.currentCost ?? 0), 0) : (cur?.total ?? null);
      return {
        ...r,
        plans: ps.map((p) => ({
          ...p,
          variation: p.monthlyValue !== null && p.currentCost ? p.monthlyValue - p.currentCost : null,
          variationPct: p.monthlyValue !== null && p.currentCost ? ((p.monthlyValue - p.currentCost) / p.currentCost) * 100 : null,
        })),
        totalMonthly: ps.some((p) => p.monthlyValue !== null) ? total : null,
        currentRef,
        variationPct: currentRef && ps.some((p) => p.monthlyValue !== null) ? ((total - currentRef) / currentRef) * 100 : null,
        expired: !!r.p.validUntil && r.p.validUntil < today,
      };
    }),
  };
}
export type Comparison = Awaited<ReturnType<typeof getComparison>>;
