import "server-only";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS, SENSITIVE_DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/constants";
import type { documentMetaSchema, documentUpdateSchema } from "@/lib/validation/schemas";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db, type DbOrTx } from "../db";
import { companies, quotationChecklistItems, quotationDocuments, quotations, users } from "../db/schema";
import { BusinessError, ForbiddenError, NotFoundError } from "../errors";
import { getRule } from "../settings";
import { newStorageKey, storage, validateUpload } from "../storage";
import { addTimeline } from "../timeline";
import { afterQuotationChange } from "./quotation-sync";

export function isSensitiveType(t: string) {
  return SENSITIVE_DOCUMENT_TYPES.includes(t as DocumentType);
}

/** Grava o arquivo no storage privado e registra o documento. Atualiza checklist/pendências da cotação. */
export async function uploadDocument(
  file: { name: string; buffer: Buffer },
  meta: z.output<typeof documentMetaSchema>,
  user: CurrentUser,
  opts: { tx?: DbOrTx; skipSync?: boolean } = {},
) {
  const v = validateUpload(file.name, file.buffer);
  let companyId = meta.companyId;
  if (meta.quotationId) {
    const [q] = await db
      .select({ companyId: quotations.companyId })
      .from(quotations)
      .where(and(eq(quotations.id, meta.quotationId), isNull(quotations.deletedAt)));
    if (!q) throw new NotFoundError("Cotação");
    companyId = q.companyId;
  }
  const key = newStorageKey(meta.quotationId ? `cotacoes/${meta.quotationId}` : companyId ? `empresas/${companyId}` : "geral", v.ext);
  await storage().put(key, file.buffer, v.mimeType);
  const run = async (tx: DbOrTx) => {
    const [doc] = await tx
      .insert(quotationDocuments)
      .values({
        quotationId: meta.quotationId,
        companyId,
        taskId: meta.taskId,
        docType: meta.docType,
        fileName: v.fileName,
        storageKey: key,
        mimeType: v.mimeType,
        sizeBytes: v.size,
        sha256: v.sha256,
        referenceDate: meta.referenceDate,
        sender: meta.sender,
        status: meta.status,
        sensitive: isSensitiveType(meta.docType),
        notes: meta.notes,
        uploadedBy: user.id,
      })
      .returning();
    await audit(
      {
        userId: user.id,
        action: "upload",
        entityType: "document",
        entityId: doc.id,
        summary: `Upload: ${DOCUMENT_TYPE_LABELS[meta.docType as DocumentType]} — ${v.fileName}`,
        sensitive: doc.sensitive,
      },
      tx,
    );
    if (meta.quotationId || companyId) {
      await addTimeline(
        {
          type: "upload",
          description: `Documento recebido: ${DOCUMENT_TYPE_LABELS[meta.docType as DocumentType]} (${v.fileName})${meta.sender ? ` — enviado por ${meta.sender}` : ""}`,
          userId: user.id,
          companyId,
          quotationId: meta.quotationId,
          metadata: { documentId: doc.id },
        },
        tx,
      );
    }
    if (meta.quotationId && !opts.skipSync) await linkChecklistAndSync(meta.quotationId, doc.id, meta.docType, user, tx);
    return doc;
  };
  try {
    return opts.tx ? await run(opts.tx) : await db.transaction(run);
  } catch (e) {
    await storage()
      .remove(key)
      .catch(() => undefined); // não deixa arquivo órfão
    throw e;
  }
}

async function linkChecklistAndSync(quotationId: string, documentId: string, docType: string, user: CurrentUser, tx: DbOrTx) {
  const rule = await getRule("document_updates_checklist", tx);
  if (rule.enabled) {
    // Vincula o documento ao item correspondente (sem sobrescrever vínculo existente)
    await tx
      .update(quotationChecklistItems)
      .set({ documentId, sentBy: sql`coalesce(${quotationChecklistItems.sentBy}, ${user.name})` })
      .where(and(eq(quotationChecklistItems.quotationId, quotationId), eq(quotationChecklistItems.documentType, docType), isNull(quotationChecklistItems.documentId)));
  }
  await afterQuotationChange(quotationId, tx);
}

export async function updateDocument(input: z.output<typeof documentUpdateSchema>, user: CurrentUser) {
  const [cur] = await db
    .select()
    .from(quotationDocuments)
    .where(and(eq(quotationDocuments.id, input.id), isNull(quotationDocuments.deletedAt)));
  if (!cur) throw new NotFoundError("Documento");
  await db.transaction(async (tx) => {
    await tx
      .update(quotationDocuments)
      .set({ docType: input.docType, referenceDate: input.referenceDate, sender: input.sender, status: input.status, notes: input.notes, sensitive: isSensitiveType(input.docType) })
      .where(eq(quotationDocuments.id, input.id));
    const statusChanged = cur.status !== input.status;
    await audit(
      {
        userId: user.id,
        action: statusChanged ? "status_change" : "update",
        entityType: "document",
        entityId: input.id,
        summary: `${cur.fileName}: ${statusChanged ? `${DOCUMENT_STATUS_LABELS[cur.status]} → ${DOCUMENT_STATUS_LABELS[input.status]}` : "metadados atualizados"}`,
      },
      tx,
    );
    if (statusChanged && (cur.quotationId || cur.companyId)) {
      await addTimeline(
        {
          type: "documento",
          description: `Documento ${cur.fileName}: ${DOCUMENT_STATUS_LABELS[input.status]}${input.notes ? ` — ${input.notes}` : ""}`,
          userId: user.id,
          companyId: cur.companyId,
          quotationId: cur.quotationId,
        },
        tx,
      );
    }
    if (cur.quotationId) {
      // Se o documento vinculado ao item deixou de ser válido, o item volta para reavaliação
      if (input.status === "invalido" || input.status === "desatualizado") {
        await tx
          .update(quotationChecklistItems)
          .set({ status: "pendente", autoFilled: false })
          .where(
            and(
              eq(quotationChecklistItems.quotationId, cur.quotationId),
              eq(quotationChecklistItems.documentId, input.id),
              sql`${quotationChecklistItems.status} in ('recebido','em_validacao','validado')`,
            ),
          );
      }
      await linkChecklistAndSync(cur.quotationId, input.id, input.docType, user, tx);
    }
  });
}

export async function softDeleteDocument(id: string, user: CurrentUser) {
  const [cur] = await db.select().from(quotationDocuments).where(eq(quotationDocuments.id, id));
  if (!cur || cur.deletedAt) throw new NotFoundError("Documento");
  await db.transaction(async (tx) => {
    await tx.update(quotationDocuments).set({ deletedAt: new Date() }).where(eq(quotationDocuments.id, id));
    await tx
      .update(quotationChecklistItems)
      .set({ documentId: null })
      .where(eq(quotationChecklistItems.documentId, id));
    await audit({ userId: user.id, action: "delete", entityType: "document", entityId: id, summary: `Documento excluído (lógica): ${cur.fileName}`, sensitive: cur.sensitive }, tx);
    if (cur.quotationId) {
      await addTimeline({ type: "documento", description: `Documento removido: ${cur.fileName}`, userId: user.id, quotationId: cur.quotationId }, tx);
      await afterQuotationChange(cur.quotationId, tx);
    }
  });
}

/** Autoriza e registra o download. Documentos sensíveis exigem sensitive:read e geram log sensível. */
export async function authorizeDownload(id: string, user: CurrentUser) {
  const [doc] = await db
    .select()
    .from(quotationDocuments)
    .where(and(eq(quotationDocuments.id, id), isNull(quotationDocuments.deletedAt)));
  if (!doc) throw new NotFoundError("Documento");
  if (doc.storageKey === "expurgado") throw new BusinessError("Arquivo expurgado pela política de retenção.");
  if (doc.sensitive && !can(user.role, "sensitive:read")) {
    await audit({ userId: user.id, action: "download", entityType: "document", entityId: id, summary: `Acesso NEGADO a documento sensível: ${doc.fileName}`, sensitive: true });
    throw new ForbiddenError("Documento com dados de saúde: acesso restrito.");
  }
  await audit({ userId: user.id, action: "download", entityType: "document", entityId: id, summary: `Download: ${doc.fileName}`, sensitive: doc.sensitive });
  return doc;
}

export interface DocumentFilters {
  q?: string | null;
  docType?: string | null;
  status?: string | null;
  quotationId?: string | null;
  companyId?: string | null;
  taskId?: string | null;
}

export async function listDocuments(f: DocumentFilters = {}) {
  const conds: SQL[] = [isNull(quotationDocuments.deletedAt)];
  if (f.docType) conds.push(eq(quotationDocuments.docType, f.docType));
  if (f.status) conds.push(eq(quotationDocuments.status, f.status as never));
  if (f.quotationId) conds.push(eq(quotationDocuments.quotationId, f.quotationId));
  if (f.companyId) conds.push(eq(quotationDocuments.companyId, f.companyId));
  if (f.taskId) conds.push(eq(quotationDocuments.taskId, f.taskId));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(sql`(${quotationDocuments.fileName} ilike ${like} or ${companies.legalName} ilike ${like} or ${companies.tradeName} ilike ${like} or ${quotations.code} ilike ${like})`);
  }
  return db
    .select({
      d: quotationDocuments,
      companyName: sql<string | null>`coalesce(${companies.tradeName}, ${companies.legalName})`,
      quotationCode: quotations.code,
      uploaderName: users.name,
    })
    .from(quotationDocuments)
    .leftJoin(companies, eq(companies.id, quotationDocuments.companyId))
    .leftJoin(quotations, eq(quotations.id, quotationDocuments.quotationId))
    .leftJoin(users, eq(users.id, quotationDocuments.uploadedBy))
    .where(and(...conds))
    .orderBy(desc(quotationDocuments.createdAt))
    .limit(500);
}
export type DocumentRow = Awaited<ReturnType<typeof listDocuments>>[number];
