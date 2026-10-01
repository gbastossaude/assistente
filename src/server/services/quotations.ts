import "server-only";
import { Q_ID } from "../db/qualified";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import {
  CLOSED_STATUSES,
  LARGE_ACCOUNT_MIN_LIVES,
  PRIORITY_LABELS,
  QUOTATION_STATUS_LABELS,
  type Priority,
  type ProcessType,
  type QuotationStatus,
} from "@/lib/domain/constants";
import { canMarkReadyForMarket, computeCompleteness } from "@/lib/domain/checklist-engine";
import { formatCnpj } from "@/lib/domain/cnpj";
import { formatDateBR, todayISO } from "@/lib/domain/dates";
import { isClosed, requiresLostReason, requiresReadiness } from "@/lib/domain/pipeline";
import { computeReadiness } from "@/lib/domain/readiness";
import type {
  quotationHeaderSchema,
  quotationStep1Schema,
  quotationStep2Schema,
  quotationStep3Schema,
  statusChangeSchema,
} from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "../auth";
import { db, type DbOrTx } from "../db";
import {
  companies,
  lifeImports,
  pendencies,
  quotationChecklistItems,
  quotationCnpjs,
  quotationInsurers,
  quotations,
  quotationStatusHistory,
  specialCaseEntries,
  specialCases,
  tasks,
  users,
} from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { getAllSettings, getSetting } from "../settings";
import { addTimeline } from "../timeline";
import { onQuotationCreated, onQuotationStatusChanged } from "../automation/engine";
import { generateChecklist } from "./checklist";
import { afterQuotationChange } from "./quotation-sync";

async function nextCode(tx: DbOrTx, year: number) {
  const prefix = `COT-${year}-`;
  const [r] = await tx
    .select({ max: sql<string | null>`max(${quotations.code})` })
    .from(quotations)
    .where(sql`${quotations.code} like ${prefix + "%"}`);
  const n = r?.max ? Number(r.max.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function createQuotation(input: z.output<typeof quotationStep1Schema>, user: CurrentUser) {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, input.companyId), isNull(companies.deletedAt)));
  if (!company) throw new NotFoundError("Empresa");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const code = await nextCode(tx, Number(todayISO().slice(0, 4)));
        const [q] = await tx
          .insert(quotations)
          .values({
            code,
            companyId: input.companyId,
            processType: input.processType,
            stipulantName: input.stipulantName ?? company.legalName,
            estimatedLives: input.estimatedLives,
            reason: input.reason,
            openedAt: input.openedAt,
            targetDate: input.targetDate,
            renewalDate: input.renewalDate,
            ownerId: input.ownerId ?? user.id,
            priority: input.priority,
            status: "coleta_informacoes",
            wizardStep: 2,
            createdBy: user.id,
            updatedBy: user.id,
          })
          .returning();
        const cnpjs = [...new Set(input.cnpjs.length ? input.cnpjs : company.mainCnpj ? [company.mainCnpj] : [])];
        if (cnpjs.length) await tx.insert(quotationCnpjs).values(cnpjs.map((cnpj) => ({ quotationId: q.id, cnpj })));
        await tx.insert(quotationStatusHistory).values({ quotationId: q.id, fromStatus: null, toStatus: "coleta_informacoes", changedBy: user.id, note: "Cotação aberta" });
        await generateChecklist(q.id, input.processType, tx);
        await addTimeline(
          {
            type: "sistema",
            description: `Cotação ${code} (${input.processType}) aberta — ${input.estimatedLives} vidas`,
            userId: user.id,
            companyId: q.companyId,
            quotationId: q.id,
          },
          tx,
        );
        await audit({ userId: user.id, action: "create", entityType: "quotation", entityId: q.id, summary: `Cotação ${code} criada para ${company.legalName}` }, tx);
        await afterQuotationChange(q.id, tx);
        await onQuotationCreated(q.id, user.id, tx);
        return q;
      });
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
      if (code === "23505" && attempt < 2) continue; // corrida no código sequencial
      throw e;
    }
  }
  throw new BusinessError("Não foi possível gerar o código da cotação.");
}

async function loadQuotation(id: string, tx: DbOrTx = db) {
  const [q] = await tx
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)));
  if (!q) throw new NotFoundError("Cotação");
  return q;
}

export async function updateQuotationStep2(id: string, input: z.output<typeof quotationStep2Schema>, user: CurrentUser) {
  const q = await loadQuotation(id);
  await db.transaction(async (tx) => {
    const data = { ...input, takeover: input.modality === "opcional" ? input.takeover : null, wizardStep: Math.max(q.wizardStep, 3), updatedBy: user.id };
    await tx.update(quotations).set(data).where(eq(quotations.id, id));
    const changes = diff(q as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
    if (Object.keys(changes).length) {
      await audit({ userId: user.id, action: "update", entityType: "quotation", entityId: id, summary: `${q.code}: contrato atual/condições atualizados`, changes }, tx);
      await addTimeline({ type: "sistema", description: "Dados do contrato atual e condições atualizados", userId: user.id, quotationId: id }, tx);
    }
    await afterQuotationChange(id, tx);
  });
}

export async function updateQuotationStep3(id: string, input: z.output<typeof quotationStep3Schema>, user: CurrentUser) {
  const q = await loadQuotation(id);
  const maxCopay = await getSetting("copay_max_pct");
  if (input.hasCopay && input.copayPct !== null && input.copayPct > maxCopay) {
    throw new BusinessError(`Coparticipação acima do limite configurado (${maxCopay}%).`, { copayPct: [`Máximo ${maxCopay}%`] });
  }
  const data = {
    ...input,
    copayPct: input.hasCopay ? input.copayPct : null,
    copayProcedures: input.hasCopay ? input.copayProcedures : [],
    copayOther: input.hasCopay ? input.copayOther : null,
    wizardStep: Math.max(q.wizardStep, 4),
    updatedBy: user.id,
  };
  await db.transaction(async (tx) => {
    await tx.update(quotations).set(data).where(eq(quotations.id, id));
    const changes = diff(q as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
    if (Object.keys(changes).length) {
      await audit({ userId: user.id, action: "update", entityType: "quotation", entityId: id, summary: `${q.code}: contribuição/coparticipação atualizadas`, changes }, tx);
      await addTimeline({ type: "sistema", description: "Contribuição e coparticipação atualizadas", userId: user.id, quotationId: id }, tx);
    }
    await afterQuotationChange(id, tx);
  });
}

export async function updateQuotationHeader(id: string, input: z.output<typeof quotationHeaderSchema>, user: CurrentUser) {
  const q = await loadQuotation(id);
  await db.transaction(async (tx) => {
    await tx
      .update(quotations)
      .set({ ...input, ownerId: input.ownerId ?? q.ownerId, updatedBy: user.id })
      .where(eq(quotations.id, id));
    const changes = diff(q as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
    if (!Object.keys(changes).length) return;
    const deadline = "targetDate" in changes || "renewalDate" in changes;
    await audit(
      { userId: user.id, action: deadline ? "deadline_change" : "update", entityType: "quotation", entityId: id, summary: `${q.code}: dados gerais atualizados`, changes },
      tx,
    );
    if ("ownerId" in changes && input.ownerId) {
      const [owner] = await tx.select({ name: users.name }).from(users).where(eq(users.id, input.ownerId));
      await addTimeline({ type: "responsavel", description: `Responsável alterado para ${owner?.name ?? "—"}`, userId: user.id, quotationId: id }, tx);
      await tx.update(pendencies).set({ ownerId: input.ownerId }).where(and(eq(pendencies.quotationId, id), inArray(pendencies.status, ["aberta", "em_andamento"])));
    }
    if (deadline) {
      await addTimeline(
        { type: "sistema", description: `Prazos alterados: data-alvo ${formatDateBR(input.targetDate)}, renovação ${formatDateBR(input.renewalDate)}`, userId: user.id, quotationId: id },
        tx,
      );
    }
    if ("priority" in changes) {
      await addTimeline({ type: "sistema", description: `Prioridade: ${PRIORITY_LABELS[q.priority]} → ${PRIORITY_LABELS[input.priority as Priority]}`, userId: user.id, quotationId: id }, tx);
    }
    await afterQuotationChange(id, tx);
  });
}

export async function setQuotationCnpjs(id: string, cnpjs: string[], user: CurrentUser) {
  const q = await loadQuotation(id);
  await db.transaction(async (tx) => {
    const unique = [...new Set(cnpjs)];
    await tx.delete(quotationCnpjs).where(eq(quotationCnpjs.quotationId, id));
    if (unique.length) await tx.insert(quotationCnpjs).values(unique.map((cnpj) => ({ quotationId: id, cnpj })));
    await audit({ userId: user.id, action: "update", entityType: "quotation", entityId: id, summary: `${q.code}: CNPJs participantes (${unique.length})` }, tx);
    await addTimeline({ type: "sistema", description: `CNPJs participantes atualizados: ${unique.map(formatCnpj).join(", ") || "nenhum"}`, userId: user.id, quotationId: id }, tx);
    await afterQuotationChange(id, tx);
  });
}

/**
 * Mudança de status com histórico. Entrar nos status de mercado exige checklist obrigatório completo
 * ou override justificado (permissão quotation:override_ready).
 */
export async function changeQuotationStatus(input: z.output<typeof statusChangeSchema>, user: CurrentUser) {
  const q = await loadQuotation(input.quotationId);
  const to = input.toStatus as QuotationStatus;
  if (q.status === to) throw new BusinessError("A cotação já está neste status.");
  let override: string | null = null;
  if (requiresReadiness(q.status, to)) {
    const items = await db.select().from(quotationChecklistItems).where(eq(quotationChecklistItems.quotationId, q.id));
    const check = canMarkReadyForMarket(items, input.overrideReason);
    if (check.needsOverride) {
      if (!input.overrideReason) throw new BusinessError(check.reason ?? "Checklist obrigatório incompleto.", { overrideReason: ["Justificativa necessária"] });
      if (!can(user.role, "quotation:override_ready")) throw new BusinessError("Somente Head/Administrador pode liberar com pendência obrigatória.");
      if (!check.allowed) throw new BusinessError(check.reason ?? "Justificativa insuficiente.", { overrideReason: ["Mínimo de 15 caracteres"] });
      override = input.overrideReason;
    }
  }
  if (requiresLostReason(to) && !input.lostReason) throw new BusinessError("Informe o motivo da perda.", { lostReason: ["Obrigatório"] });

  await db.transaction(async (tx) => {
    await tx
      .update(quotations)
      .set({
        status: to,
        statusChangedAt: new Date(),
        updatedBy: user.id,
        ...(override ? { readyOverrideReason: override, readyOverrideBy: user.id, readyOverrideAt: new Date() } : {}),
        ...(to === "fechada_perdida" ? { lostReason: input.lostReason } : {}),
      })
      .where(eq(quotations.id, q.id));
    const note = [input.note, override ? `Override: ${override}` : null, to === "fechada_perdida" ? `Motivo da perda: ${input.lostReason}` : null]
      .filter(Boolean)
      .join(" · ");
    await tx.insert(quotationStatusHistory).values({ quotationId: q.id, fromStatus: q.status, toStatus: to, note: note || null, changedBy: user.id });
    await addTimeline(
      {
        type: "status",
        description: `Status: ${QUOTATION_STATUS_LABELS[q.status]} → ${QUOTATION_STATUS_LABELS[to]}${note ? ` (${note})` : ""}`,
        userId: user.id,
        quotationId: q.id,
        metadata: { from: q.status, to },
      },
      tx,
    );
    await audit(
      {
        userId: user.id,
        action: override ? "override" : "status_change",
        entityType: "quotation",
        entityId: q.id,
        summary: `${q.code}: ${QUOTATION_STATUS_LABELS[q.status]} → ${QUOTATION_STATUS_LABELS[to]}${override ? " (override de prontidão)" : ""}`,
        changes: { status: { de: q.status, para: to }, ...(override ? { override } : {}) },
      },
      tx,
    );
    await afterQuotationChange(q.id, tx);
    await onQuotationStatusChanged(q.id, q.status, to, user.id, tx);
  });
}

export async function softDeleteQuotation(id: string, user: CurrentUser) {
  const q = await loadQuotation(id);
  await db.transaction(async (tx) => {
    await tx.update(quotations).set({ deletedAt: new Date(), updatedBy: user.id }).where(eq(quotations.id, id));
    await tx
      .update(tasks)
      .set({ status: "cancelada" })
      .where(and(eq(tasks.quotationId, id), inArray(tasks.status, ["a_fazer", "em_andamento", "aguardando_terceiro"])));
    await tx
      .update(pendencies)
      .set({ status: "cancelada", resolvedAt: new Date() })
      .where(and(eq(pendencies.quotationId, id), inArray(pendencies.status, ["aberta", "em_andamento"])));
    await audit({ userId: user.id, action: "delete", entityType: "quotation", entityId: id, summary: `Cotação ${q.code} excluída (lógica)` }, tx);
    await addTimeline({ type: "sistema", description: `Cotação ${q.code} excluída`, userId: user.id, companyId: q.companyId }, tx);
  });
}

// ─── Consultas ───

export interface QuotationFilters {
  q?: string | null;
  status?: QuotationStatus[] | null;
  processType?: ProcessType | null;
  ownerId?: string | null;
  companyId?: string | null;
  minLives?: number | null;
  includeClosed?: boolean;
  priority?: Priority | null;
}

export async function listQuotations(f: QuotationFilters = {}) {
  const conds: SQL[] = [isNull(quotations.deletedAt)];
  if (f.status?.length) conds.push(inArray(quotations.status, f.status));
  else if (!f.includeClosed) conds.push(sql`${quotations.status} not in ${sql.raw(`(${CLOSED_STATUSES.map((s) => `'${s}'`).join(",")})`)}`);
  if (f.processType) conds.push(eq(quotations.processType, f.processType));
  if (f.ownerId) conds.push(eq(quotations.ownerId, f.ownerId));
  if (f.companyId) conds.push(eq(quotations.companyId, f.companyId));
  if (f.minLives) conds.push(gte(quotations.estimatedLives, f.minLives));
  if (f.priority) conds.push(eq(quotations.priority, f.priority));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(
      sql`(${quotations.code} ilike ${like} or ${companies.legalName} ilike ${like} or ${companies.tradeName} ilike ${like} or ${quotations.stipulantName} ilike ${like})`,
    );
  }
  const rows = await db
    .select({
      q: quotations,
      companyName: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`,
      ownerName: users.name,
      reqTotal: sql<number>`(select count(*)::int from ${quotationChecklistItems} ci where ci.quotation_id = ${Q_ID} and ci.required and ci.applicable)`,
      reqDone: sql<number>`(select count(*)::int from ${quotationChecklistItems} ci where ci.quotation_id = ${Q_ID} and ci.required and ci.applicable and ci.status <> 'pendente')`,
      openPendencies: sql<number>`(select count(*)::int from ${pendencies} p where p.quotation_id = ${Q_ID} and p.status in ('aberta','em_andamento'))`,
      insurersTotal: sql<number>`(select count(*)::int from ${quotationInsurers} qi where qi.quotation_id = ${Q_ID})`,
      insurersAwaiting: sql<number>`(select count(*)::int from ${quotationInsurers} qi where qi.quotation_id = ${Q_ID} and qi.status in ('enviada','recebida_operadora','em_analise','pendencia'))`,
      proposalsReceived: sql<number>`(select count(*)::int from ${quotationInsurers} qi where qi.quotation_id = ${Q_ID} and qi.status in ('cotacao_recebida','em_negociacao','finalista'))`,
      nextTaskDue: sql<string | null>`(select min(coalesce(t.due_date, t.scheduled_date))::text from ${tasks} t where t.quotation_id = ${Q_ID} and t.deleted_at is null and t.status in ('a_fazer','em_andamento','aguardando_terceiro'))`,
    })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .leftJoin(users, eq(users.id, quotations.ownerId))
    .where(and(...conds))
    .orderBy(desc(quotations.lastActivityAt))
    .limit(1000);
  return rows.map((r) => ({
    ...r,
    completeness: r.reqTotal ? Math.floor((r.reqDone / r.reqTotal) * 100) : 100,
    isLarge: r.q.estimatedLives >= LARGE_ACCOUNT_MIN_LIVES,
  }));
}
export type QuotationListRow = Awaited<ReturnType<typeof listQuotations>>[number];

export async function getQuotationDetail(id: string) {
  const [row] = await db
    .select({ q: quotations, company: companies, ownerName: users.name })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .leftJoin(users, eq(users.id, quotations.ownerId))
    .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)));
  if (!row) return null;
  const [cnpjs, checklist, history, summaries, entries, activeImport, settings] = await Promise.all([
    db.select().from(quotationCnpjs).where(eq(quotationCnpjs.quotationId, id)).orderBy(asc(quotationCnpjs.createdAt)),
    db
      .select()
      .from(quotationChecklistItems)
      .where(eq(quotationChecklistItems.quotationId, id))
      .orderBy(asc(quotationChecklistItems.sortOrder)),
    db
      .select({ h: quotationStatusHistory, userName: users.name })
      .from(quotationStatusHistory)
      .leftJoin(users, eq(users.id, quotationStatusHistory.changedBy))
      .where(eq(quotationStatusHistory.quotationId, id))
      .orderBy(desc(quotationStatusHistory.changedAt)),
    db.select().from(specialCases).where(eq(specialCases.quotationId, id)),
    db.select().from(specialCaseEntries).where(eq(specialCaseEntries.quotationId, id)).orderBy(asc(specialCaseEntries.createdAt)),
    db
      .select()
      .from(lifeImports)
      .where(and(eq(lifeImports.quotationId, id), eq(lifeImports.active, true))),
    getAllSettings(),
  ]);
  const completeness = computeCompleteness(checklist);
  const imp = activeImport[0] ?? null;
  const readiness = computeReadiness(
    {
      checklist,
      lives: { imported: !!imp, total: imp?.totalRows ?? 0, incomplete: imp?.errorRows ?? 0 },
      commercial: { ...row.q },
      specialSummaries: summaries,
      specialEntries: entries,
    },
    settings.readiness_weights,
  );
  const critical = await db
    .select()
    .from(pendencies)
    .where(and(eq(pendencies.quotationId, id), inArray(pendencies.status, ["aberta", "em_andamento"]), inArray(pendencies.priority, ["alta", "critica"])))
    .orderBy(asc(pendencies.dueDate))
    .limit(10);
  const [nextDeadline] = await db
    .select({ title: tasks.title, date: sql<string>`coalesce(${tasks.dueDate}, ${tasks.scheduledDate})::text` })
    .from(tasks)
    .where(
      and(eq(tasks.quotationId, id), isNull(tasks.deletedAt), inArray(tasks.status, ["a_fazer", "em_andamento", "aguardando_terceiro"]), sql`coalesce(${tasks.dueDate}, ${tasks.scheduledDate}) is not null`),
    )
    .orderBy(asc(sql`coalesce(${tasks.dueDate}, ${tasks.scheduledDate})`))
    .limit(1);
  return {
    ...row,
    cnpjs,
    checklist,
    history,
    specialSummaries: summaries,
    specialEntries: entries,
    activeImport: imp,
    completeness,
    readiness,
    criticalPendencies: critical,
    nextDeadline: nextDeadline ?? null,
    closed: isClosed(row.q.status),
  };
}
export type QuotationDetail = NonNullable<Awaited<ReturnType<typeof getQuotationDetail>>>;

export async function quotationsDueBetween(from: string, to: string) {
  return db
    .select({ id: quotations.id, code: quotations.code, targetDate: quotations.targetDate })
    .from(quotations)
    .where(and(isNull(quotations.deletedAt), gte(quotations.targetDate, from), lte(quotations.targetDate, to)));
}
