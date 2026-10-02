import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { CLOSED_STATUSES, DOCUMENT_TYPE_LABELS, INSURER_AWAITING_STATUSES, type PendencyCategory, type Priority } from "@/lib/domain/constants";
import { addDays, diffDays, todayISO } from "@/lib/domain/dates";
import { evaluateSpecialCase, SPECIAL_CASE_KINDS } from "@/lib/domain/special-cases";
import type { z } from "zod";
import type { pendencySchema } from "@/lib/validation/schemas";
import { audit } from "../audit";
import { db, type DbOrTx } from "../db";
import {
  companies,
  insurers,
  lifeImports,
  pendencies,
  proposals,
  quotationChecklistItems,
  quotationDocuments,
  quotationInsurers,
  quotations,
  specialCaseEntries,
  specialCases,
  users,
} from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { getRule } from "../settings";

interface DesiredPendency {
  sourceKey: string;
  category: PendencyCategory;
  title: string;
  description?: string | null;
  origin: string;
  dueDate: string | null;
  priority: Priority;
  nextAction?: string | null;
  quotationInsurerId?: string | null;
  documentId?: string | null;
}

/**
 * Recalcula as pendências automáticas de uma cotação (checklist, situações especiais, documentos,
 * base de vidas e operadoras). Idempotente por source_key; resolve automaticamente o que deixou de existir.
 * Pendências canceladas manualmente não são reabertas.
 */
export async function syncPendencies(quotationId: string, tx: DbOrTx = db, today = todayISO()) {
  const [q] = await tx.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!q) return;
  const desired: DesiredPendency[] = [];
  const closed = CLOSED_STATUSES.includes(q.status) || !!q.deletedAt;

  if (!closed) {
    // Sequencial: consultas concorrentes na mesma conexão/transação não são suportadas pelo pg@9.
    const items = await tx.select().from(quotationChecklistItems).where(eq(quotationChecklistItems.quotationId, quotationId));
    const summaries = await tx.select().from(specialCases).where(eq(specialCases.quotationId, quotationId));
    const entries = await tx.select().from(specialCaseEntries).where(eq(specialCaseEntries.quotationId, quotationId));
    const docs = await tx
      .select()
      .from(quotationDocuments)
      .where(and(eq(quotationDocuments.quotationId, quotationId), isNull(quotationDocuments.deletedAt)));
    const imports = await tx
      .select()
      .from(lifeImports)
      .where(and(eq(lifeImports.quotationId, quotationId), eq(lifeImports.active, true)));
    const qis = await tx
      .select({ qi: quotationInsurers, insurerName: insurers.name })
      .from(quotationInsurers)
      .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
      .where(eq(quotationInsurers.quotationId, quotationId));

    // Checklist obrigatório pendente (situações especiais são detalhadas pelas regras próprias abaixo)
    for (const it of items) {
      if (!it.applicable || !it.required || it.status !== "pendente") continue;
      if (it.category === "situacoes_especiais" && it.itemKey !== "situacoes_declaradas") continue;
      const category: PendencyCategory = it.category === "base_vidas" ? "base_vidas" : it.documentType ? "documento" : "cliente";
      desired.push({
        sourceKey: `chk:${quotationId}:${it.itemKey}`,
        category,
        title: it.documentType ? `${it.label} — não enviado(a)` : `${it.label} — não informado(a)`,
        origin: "checklist",
        dueDate: q.targetDate,
        priority: q.priority,
        nextAction: "Solicitar ao cliente",
      });
    }

    // Situações especiais (ex.: Home Care sem relatório, liminar sem documento)
    for (const kind of SPECIAL_CASE_KINDS) {
      const s = summaries.find((x) => x.kind === kind);
      if (!s || s.has !== true) continue; // "não declarado" já é coberto pelo item situacoes_declaradas
      for (const issue of evaluateSpecialCase({ kind, has: s.has, quantity: s.quantity }, entries)) {
        desired.push({
          sourceKey: `sp:${quotationId}:${kind}:${issue.message}`.slice(0, 250),
          category: issue.category,
          title: issue.message,
          origin: "especial",
          dueDate: q.targetDate,
          priority: q.priority === "baixa" ? "media" : q.priority,
          nextAction: "Solicitar ao cliente",
        });
      }
    }

    // Documentos inválidos / desatualizados
    const invRule = await getRule("invalid_document_pendency", tx);
    if (invRule.enabled) {
      for (const d of docs) {
        if (d.status !== "invalido" && d.status !== "desatualizado") continue;
        const typeLabel = DOCUMENT_TYPE_LABELS[d.docType as keyof typeof DOCUMENT_TYPE_LABELS] ?? d.docType;
        desired.push({
          sourceKey: `doc:${d.id}`,
          category: "documento",
          title: `${typeLabel} ${d.status === "invalido" ? "inválido(a)" : "desatualizado(a)"} — ${d.fileName}`,
          description: d.notes,
          origin: "documento",
          dueDate: addDays(d.updatedAt.toISOString().slice(0, 10), invRule.params.prazo ?? 3),
          priority: "alta",
          nextAction: "Solicitar nova versão ao cliente",
          documentId: d.id,
        });
      }
    }

    // Base de vidas com erros
    const imp = imports[0];
    if (imp && imp.errorRows > 0) {
      desired.push({
        sourceKey: `lives:${quotationId}`,
        category: "base_vidas",
        title: `Base de vidas incompleta: ${imp.errorRows} registro(s) com erro`,
        origin: "base_vidas",
        dueDate: q.targetDate,
        priority: q.priority,
        nextAction: "Solicitar correção da base ao cliente",
      });
    }

    // Operadoras: sem resposta, pendência registrada, proposta vencendo
    const noResp = await getRule("insurer_no_response", tx);
    const expiring = await getRule("proposal_expiring", tx);
    for (const { qi, insurerName } of qis) {
      if (noResp.enabled && INSURER_AWAITING_STATUSES.includes(qi.status) && qi.status !== "pendencia" && qi.expectedReturnAt) {
        if (diffDays(qi.expectedReturnAt, today) > (noResp.params.dias ?? 0)) {
          desired.push({
            sourceKey: `qi:${qi.id}:noresp`,
            category: "operadora",
            title: `${insurerName} sem resposta (retorno previsto ${qi.expectedReturnAt.split("-").reverse().join("/")})`,
            origin: "operadora",
            dueDate: today,
            priority: "alta",
            nextAction: "Cobrar retorno da operadora",
            quotationInsurerId: qi.id,
          });
        }
      }
      if (qi.status === "pendencia") {
        desired.push({
          sourceKey: `qi:${qi.id}:pend`,
          category: "operadora",
          title: `Pendência solicitada por ${insurerName}`,
          description: qi.pendingNotes,
          origin: "operadora",
          dueDate: qi.nextFollowupAt,
          priority: "alta",
          nextAction: "Enviar complemento à operadora",
          quotationInsurerId: qi.id,
        });
      }
    }
    if (expiring.enabled && qis.length) {
      const props = await tx
        .select({ p: proposals, qiId: quotationInsurers.id, insurerName: insurers.name, qiStatus: quotationInsurers.status })
        .from(proposals)
        .innerJoin(quotationInsurers, eq(quotationInsurers.id, proposals.quotationInsurerId))
        .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
        .where(and(eq(proposals.quotationId, quotationId), isNull(proposals.deletedAt)));
      for (const { p, insurerName, qiStatus } of props) {
        if (!p.validUntil || qiStatus === "declinada" || qiStatus === "encerrada") continue;
        const left = diffDays(today, p.validUntil);
        if (left <= (expiring.params.dias ?? 7)) {
          desired.push({
            sourceKey: `prop:${p.id}:exp`,
            category: "operadora",
            title: left < 0 ? `Proposta ${insurerName} vencida` : `Proposta ${insurerName} vence em ${left} dia(s)`,
            origin: "operadora",
            dueDate: p.validUntil,
            priority: left <= 2 ? "critica" : "alta",
            nextAction: "Solicitar prorrogação da validade",
            quotationInsurerId: p.quotationInsurerId,
          });
        }
      }
    }
  }

  const existing = await tx
    .select()
    .from(pendencies)
    .where(and(eq(pendencies.quotationId, quotationId), ne(pendencies.origin, "manual")));
  const byKey = new Map(existing.map((p) => [p.sourceKey, p]));
  const desiredKeys = new Set(desired.map((d) => d.sourceKey));

  for (const d of desired) {
    const cur = byKey.get(d.sourceKey);
    if (!cur) {
      await tx
        .insert(pendencies)
        .values({
          ...d,
          companyId: q.companyId,
          quotationId,
          ownerId: q.ownerId,
          status: "aberta",
        })
        .onConflictDoNothing({ target: pendencies.sourceKey });
      continue;
    }
    if (cur.status === "cancelada") continue;
    const reopen = cur.status === "resolvida";
    if (reopen || cur.title !== d.title || cur.dueDate !== d.dueDate || cur.priority !== d.priority || cur.category !== d.category) {
      await tx
        .update(pendencies)
        .set({
          title: d.title,
          dueDate: d.dueDate,
          priority: d.priority,
          category: d.category,
          ...(reopen ? { status: "aberta" as const, resolvedAt: null } : {}),
        })
        .where(eq(pendencies.id, cur.id));
    }
  }
  const toResolve = existing.filter((p) => p.sourceKey && !desiredKeys.has(p.sourceKey) && (p.status === "aberta" || p.status === "em_andamento"));
  if (toResolve.length) {
    await tx
      .update(pendencies)
      .set({ status: "resolvida", resolvedAt: new Date() })
      .where(
        inArray(
          pendencies.id,
          toResolve.map((p) => p.id),
        ),
      );
  }
}

export interface PendencyFilters {
  category?: PendencyCategory | null;
  status?: "abertas" | "todas" | "resolvidas";
  ownerId?: string | null;
  quotationId?: string | null;
  q?: string | null;
}

export async function listPendencies(f: PendencyFilters = {}) {
  const conds: SQL[] = [];
  if (f.category) conds.push(eq(pendencies.category, f.category));
  if (!f.status || f.status === "abertas") conds.push(inArray(pendencies.status, ["aberta", "em_andamento"]));
  if (f.status === "resolvidas") conds.push(inArray(pendencies.status, ["resolvida", "cancelada"]));
  if (f.ownerId) conds.push(eq(pendencies.ownerId, f.ownerId));
  if (f.quotationId) conds.push(eq(pendencies.quotationId, f.quotationId));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(sql`${pendencies.title} ilike ${like}`, sql`${companies.legalName} ilike ${like}`, sql`${companies.tradeName} ilike ${like}`)!);
  }
  return db
    .select({
      p: pendencies,
      companyName: sql<string | null>`coalesce(${companies.tradeName}, ${companies.legalName})`,
      quotationCode: quotations.code,
      ownerName: users.name,
    })
    .from(pendencies)
    .leftJoin(companies, eq(companies.id, pendencies.companyId))
    .leftJoin(quotations, eq(quotations.id, pendencies.quotationId))
    .leftJoin(users, eq(users.id, pendencies.ownerId))
    .where(and(...conds))
    .orderBy(asc(sql`coalesce(${pendencies.dueDate}, '2999-12-31')`), desc(pendencies.createdAt))
    .limit(500);
}

export async function createPendency(input: z.output<typeof pendencySchema>, userId: string) {
  let companyId = input.companyId;
  if (input.quotationId && !companyId) {
    const [q] = await db.select({ companyId: quotations.companyId }).from(quotations).where(eq(quotations.id, input.quotationId));
    companyId = q?.companyId ?? null;
  }
  const [row] = await db
    .insert(pendencies)
    .values({ ...input, companyId, origin: "manual", ownerId: input.ownerId ?? userId, createdBy: userId })
    .returning();
  await audit({ userId, action: "create", entityType: "pendency", entityId: row.id, summary: `Pendência criada: ${row.title}` });
  return row;
}

export async function updatePendency(id: string, input: z.output<typeof pendencySchema>, userId: string) {
  const [cur] = await db.select().from(pendencies).where(eq(pendencies.id, id));
  if (!cur) throw new NotFoundError("Pendência");
  const resolved = input.status === "resolvida" || input.status === "cancelada";
  await db
    .update(pendencies)
    .set({ ...input, resolvedAt: resolved ? (cur.resolvedAt ?? new Date()) : null })
    .where(eq(pendencies.id, id));
  await audit({ userId, action: "update", entityType: "pendency", entityId: id, summary: `Pendência atualizada: ${input.title} (${input.status})` });
}

export async function setPendencyStatus(id: string, status: "aberta" | "em_andamento" | "resolvida" | "cancelada", userId: string) {
  const [cur] = await db.select().from(pendencies).where(eq(pendencies.id, id));
  if (!cur) throw new NotFoundError("Pendência");
  await db
    .update(pendencies)
    .set({ status, resolvedAt: status === "resolvida" || status === "cancelada" ? new Date() : null })
    .where(eq(pendencies.id, id));
  await audit({ userId, action: "status_change", entityType: "pendency", entityId: id, summary: `Pendência "${cur.title}": ${cur.status} → ${status}` });
}

/** Exclui uma pendência criada manualmente. As automáticas voltariam na sincronização: para elas, use "Cancelada". */
export async function deletePendency(id: string, userId: string) {
  const [cur] = await db.select().from(pendencies).where(eq(pendencies.id, id));
  if (!cur) throw new NotFoundError("Pendência");
  if (cur.origin !== "manual") throw new BusinessError("Pendências automáticas não podem ser excluídas — marque como “Cancelada” para que não reabram.");
  await db.delete(pendencies).where(eq(pendencies.id, id));
  await audit({ userId, action: "delete", entityType: "pendency", entityId: id, summary: `Pendência excluída: ${cur.title}` });
}
