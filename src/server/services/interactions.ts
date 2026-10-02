import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { INTERACTION_TYPE_LABELS, type InteractionType } from "@/lib/domain/constants";
import type { interactionSchema } from "@/lib/validation/schemas";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { companies, interactions, quotations, users } from "../db/schema";
import { BusinessError } from "../errors";
import { addTimeline } from "../timeline";
import { createTask } from "./tasks";

export async function registerInteraction(input: z.output<typeof interactionSchema>, user: CurrentUser) {
  if (!input.companyId && !input.quotationId) throw new BusinessError("Vincule a interação a uma empresa ou cotação.");
  const id = await addTimeline({
    type: input.type as InteractionType,
    description: input.description,
    userId: user.id,
    companyId: input.companyId,
    quotationId: input.quotationId,
    nextAction: input.nextAction,
    nextActionAt: input.nextActionAt,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
  });
  await audit({ userId: user.id, action: "create", entityType: "interaction", entityId: id, summary: `${INTERACTION_TYPE_LABELS[input.type as InteractionType]} registrada` });
  if (input.createTask && input.nextAction) {
    await createTask(
      {
        title: input.nextAction,
        description: `Próxima ação de ${INTERACTION_TYPE_LABELS[input.type as InteractionType].toLowerCase()}: ${input.description.slice(0, 200)}`,
        companyId: input.companyId,
        quotationId: input.quotationId,
        insurerId: null,
        ownerId: user.id,
        priority: "media",
        scheduledDate: input.nextActionAt,
        scheduledTime: null,
        dueDate: input.nextActionAt,
        status: "a_fazer",
        category: "follow_up",
        checklist: [],
        notes: null,
        recurrence: "nenhuma",
        recurrenceUntil: null,
        reminderAt: null,
      },
      user,
    );
  }
  return id;
}

export async function listTimeline(f: { companyId?: string | null; quotationId?: string | null; types?: InteractionType[] | null; limit?: number; userIds?: string[] | null }) {
  return db
    .select({
      i: interactions,
      userName: users.name,
      quotationCode: quotations.code,
      companyName: sql<string | null>`coalesce(${companies.tradeName}, ${companies.legalName})`,
    })
    .from(interactions)
    .leftJoin(users, eq(users.id, interactions.userId))
    .leftJoin(quotations, eq(quotations.id, interactions.quotationId))
    .leftJoin(companies, eq(companies.id, interactions.companyId))
    .where(
      and(
        f.companyId ? eq(interactions.companyId, f.companyId) : undefined,
        f.quotationId ? eq(interactions.quotationId, f.quotationId) : undefined,
        f.types?.length ? inArray(interactions.type, f.types) : undefined,
        f.userIds ? (f.userIds.length ? inArray(interactions.userId, f.userIds) : sql`false`) : undefined,
      ),
    )
    .orderBy(desc(interactions.occurredAt))
    .limit(f.limit ?? 200);
}
export type TimelineRow = Awaited<ReturnType<typeof listTimeline>>[number];
