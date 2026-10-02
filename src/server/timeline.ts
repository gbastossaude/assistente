import "server-only";
import { eq, sql } from "drizzle-orm";
import type { InteractionType } from "@/lib/domain/constants";
import { db, type DbOrTx } from "./db";
import { interactions, quotations } from "./db/schema";

/** Registra um evento na timeline única (empresa, cotação e/ou oportunidade) e atualiza a "última movimentação". */
export async function addTimeline(
  e: {
    type: InteractionType;
    description: string;
    userId: string | null;
    companyId?: string | null;
    quotationId?: string | null;
    opportunityId?: string | null;
    nextAction?: string | null;
    nextActionAt?: string | null;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  },
  tx: DbOrTx = db,
) {
  let companyId = e.companyId ?? null;
  if (!companyId && e.quotationId) {
    const [q] = await tx.select({ companyId: quotations.companyId }).from(quotations).where(eq(quotations.id, e.quotationId));
    companyId = q?.companyId ?? null;
  }
  const [row] = await tx
    .insert(interactions)
    .values({
      type: e.type,
      description: e.description,
      userId: e.userId,
      companyId,
      quotationId: e.quotationId ?? null,
      opportunityId: e.opportunityId ?? null,
      nextAction: e.nextAction ?? null,
      nextActionAt: e.nextActionAt ?? null,
      metadata: e.metadata ?? {},
      occurredAt: e.occurredAt ?? new Date(),
    })
    .returning({ id: interactions.id });
  if (e.quotationId) await touchQuotation(e.quotationId, tx);
  return row.id;
}

export async function touchQuotation(quotationId: string, tx: DbOrTx = db) {
  await tx.update(quotations).set({ lastActivityAt: sql`now()` }).where(eq(quotations.id, quotationId));
}
