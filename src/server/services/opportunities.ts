import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { OPEN_STAGES, OPPORTUNITY_STAGE_LABELS, WON_STAGES, type OpportunityStage, type Product } from "@/lib/domain/commercial";
import { INTERACTION_TYPE_LABELS, type InteractionType } from "@/lib/domain/constants";
import { stageChangeError } from "@/lib/domain/crm";
import { todayISO } from "@/lib/domain/dates";
import type { opportunityFollowupSchema, opportunityInteractionSchema, opportunitySchema, opportunityStageSchema } from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { campaigns, companies, interactions, meetings, opportunities, opportunityStageHistory, quotations, tasks, users } from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { assertInScope, getScope, ownerCond, scopedOwner, type DataScope } from "../scope";
import { addTimeline } from "../timeline";

type OppData = z.output<typeof opportunitySchema>;

async function loadInScope(id: string, user: CurrentUser) {
  const [o] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, id), isNull(opportunities.deletedAt)));
  if (!o) throw new NotFoundError("Oportunidade");
  assertInScope(await getScope(user), o.brokerId, "Oportunidade");
  return o;
}

function closedAtFor(stage: OpportunityStage, current: Date | null) {
  return WON_STAGES.includes(stage) || stage === "perdido" ? (current ?? new Date()) : null;
}

export async function createOpportunity(input: OppData, user: CurrentUser) {
  const err = stageChangeError(input.stage, input.lostReason);
  if (err) throw new BusinessError(err, { lostReason: [err] });
  const scope = await getScope(user);
  const [o] = await db
    .insert(opportunities)
    .values({
      ...input,
      brokerId: scopedOwner(scope, input.brokerId, user.id),
      closedAt: closedAtFor(input.stage, null),
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning();
  await db.insert(opportunityStageHistory).values({ opportunityId: o.id, fromStage: null, toStage: o.stage, userId: user.id, note: "Oportunidade criada" });
  await audit({ userId: user.id, action: "create", entityType: "opportunity", entityId: o.id, summary: `Oportunidade criada: ${o.clientName}` });
  await addTimeline({ type: "sistema", description: `Oportunidade criada (${OPPORTUNITY_STAGE_LABELS[o.stage]})`, userId: user.id, companyId: o.companyId, opportunityId: o.id });
  return o;
}

export async function updateOpportunity(id: string, input: OppData, user: CurrentUser) {
  const cur = await loadInScope(id, user);
  const err = stageChangeError(input.stage, input.lostReason ?? cur.lostReason);
  if (err) throw new BusinessError(err, { lostReason: [err] });
  const scope = await getScope(user);
  const brokerId = scopedOwner(scope, input.brokerId, cur.brokerId ?? user.id);
  const stageChanged = input.stage !== cur.stage;
  await db
    .update(opportunities)
    .set({
      ...input,
      brokerId,
      lostReason: input.stage === "perdido" ? (input.lostReason ?? cur.lostReason) : input.lostReason,
      stageChangedAt: stageChanged ? new Date() : cur.stageChangedAt,
      closedAt: closedAtFor(input.stage, cur.closedAt),
      updatedBy: user.id,
    })
    .where(eq(opportunities.id, id));
  if (stageChanged) await recordStage(id, cur.stage, input.stage, null, user, cur.companyId);
  const changes = diff(cur as unknown as Record<string, unknown>, { ...input, brokerId } as unknown as Record<string, unknown>);
  await audit({ userId: user.id, action: "update", entityType: "opportunity", entityId: id, summary: `Oportunidade atualizada: ${input.clientName}`, changes });
}

async function recordStage(id: string, from: OpportunityStage, to: OpportunityStage, note: string | null, user: CurrentUser, companyId: string | null) {
  await db.insert(opportunityStageHistory).values({ opportunityId: id, fromStage: from, toStage: to, userId: user.id, note });
  const back = (OPEN_STAGES.indexOf(to) >= 0 && OPEN_STAGES.indexOf(from) > OPEN_STAGES.indexOf(to)) || (!OPEN_STAGES.includes(from) && OPEN_STAGES.includes(to));
  await addTimeline({
    type: "status",
    description: `Etapa: ${OPPORTUNITY_STAGE_LABELS[from]} → ${OPPORTUNITY_STAGE_LABELS[to]}${back ? " (retorno de etapa)" : ""}${note ? ` — ${note}` : ""}`,
    userId: user.id,
    companyId,
    opportunityId: id,
  });
}

/** Move a oportunidade no pipeline (inclusive para trás). Perder exige motivo. */
export async function changeOpportunityStage(input: z.output<typeof opportunityStageSchema>, user: CurrentUser) {
  const cur = await loadInScope(input.id, user);
  if (cur.stage === input.stage) return;
  const err = stageChangeError(input.stage, input.lostReason);
  if (err) throw new BusinessError(err, { lostReason: [err] });
  await db
    .update(opportunities)
    .set({
      stage: input.stage,
      stageChangedAt: new Date(),
      lostReason: input.stage === "perdido" ? input.lostReason : cur.lostReason,
      closedAt: closedAtFor(input.stage, cur.closedAt),
      nextFollowupAt: input.nextFollowupAt ?? cur.nextFollowupAt,
      updatedBy: user.id,
    })
    .where(eq(opportunities.id, cur.id));
  await recordStage(cur.id, cur.stage, input.stage, input.note ?? (input.stage === "perdido" ? `Motivo: ${input.lostReason}` : null), user, cur.companyId);
  await audit({ userId: user.id, action: "status_change", entityType: "opportunity", entityId: cur.id, summary: `${cur.clientName}: ${OPPORTUNITY_STAGE_LABELS[cur.stage]} → ${OPPORTUNITY_STAGE_LABELS[input.stage]}` });
}

export async function updateOpportunityFollowup(input: z.output<typeof opportunityFollowupSchema>, user: CurrentUser) {
  const cur = await loadInScope(input.id, user);
  await db.update(opportunities).set({ nextStep: input.nextStep, nextFollowupAt: input.nextFollowupAt, updatedBy: user.id }).where(eq(opportunities.id, cur.id));
  await audit({ userId: user.id, action: "deadline_change", entityType: "opportunity", entityId: cur.id, summary: `Follow-up de ${cur.clientName} atualizado`, changes: diff(cur as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>) });
}

export async function registerOpportunityInteraction(input: z.output<typeof opportunityInteractionSchema>, user: CurrentUser) {
  const o = await loadInScope(input.opportunityId, user);
  const id = await addTimeline({ type: input.type as InteractionType, description: input.description, userId: user.id, companyId: o.companyId, opportunityId: o.id, nextAction: input.nextAction, nextActionAt: input.nextActionAt });
  if (input.nextAction || input.nextActionAt) {
    await db
      .update(opportunities)
      .set({ nextStep: input.nextAction ?? o.nextStep, nextFollowupAt: input.nextActionAt ?? o.nextFollowupAt, updatedBy: user.id })
      .where(eq(opportunities.id, o.id));
  }
  await audit({ userId: user.id, action: "create", entityType: "interaction", entityId: id, summary: `${INTERACTION_TYPE_LABELS[input.type as InteractionType]} registrada em ${o.clientName}` });
}

export async function softDeleteOpportunity(id: string, user: CurrentUser) {
  const o = await loadInScope(id, user);
  await db.update(opportunities).set({ deletedAt: new Date(), updatedBy: user.id }).where(eq(opportunities.id, id));
  await audit({ userId: user.id, action: "delete", entityType: "opportunity", entityId: id, summary: `Oportunidade excluída (lógica): ${o.clientName}` });
}

/** LGPD: remove dados pessoais da oportunidade, preservando números agregados (etapa, produto, valores). */
export async function anonymizeOpportunity(id: string, user: CurrentUser) {
  const [o] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!o) throw new NotFoundError("Oportunidade");
  await db
    .update(opportunities)
    .set({ clientName: "Titular anonimizado", document: null, contactName: null, phone: null, email: null, notes: null, nextStep: null, anonymizedAt: new Date(), updatedBy: user.id })
    .where(eq(opportunities.id, id));
  await db.update(interactions).set({ description: "[conteúdo anonimizado — LGPD]", nextAction: null }).where(eq(interactions.opportunityId, id));
  await audit({ userId: user.id, action: "update", entityType: "opportunity", entityId: id, summary: "Oportunidade anonimizada (LGPD)", sensitive: true });
}

export interface OpportunityFilters {
  q?: string | null;
  stage?: OpportunityStage | null;
  product?: Product | null;
  brokerId?: string | null;
  source?: string | null;
  campaignId?: string | null;
  followup?: "atrasado" | "hoje" | "sem_data" | null;
  includeClosed?: boolean;
}

const companyName = sql<string | null>`coalesce(${companies.tradeName}, ${companies.legalName})`;

export async function listOpportunities(f: OpportunityFilters, scope: DataScope) {
  const today = todayISO();
  const conds: (SQL | undefined)[] = [isNull(opportunities.deletedAt), ownerCond(scope, opportunities.brokerId)];
  if (f.stage) conds.push(eq(opportunities.stage, f.stage));
  else if (!f.includeClosed) conds.push(or(inArray(opportunities.stage, OPEN_STAGES), sql`${opportunities.closedAt} > now() - interval '60 days'`));
  if (f.product) conds.push(eq(opportunities.product, f.product));
  if (f.brokerId) conds.push(eq(opportunities.brokerId, f.brokerId));
  if (f.source) conds.push(eq(opportunities.source, f.source));
  if (f.campaignId) conds.push(eq(opportunities.campaignId, f.campaignId));
  if (f.followup === "atrasado") conds.push(lt(opportunities.nextFollowupAt, today), inArray(opportunities.stage, OPEN_STAGES));
  if (f.followup === "hoje") conds.push(eq(opportunities.nextFollowupAt, today));
  if (f.followup === "sem_data") conds.push(isNull(opportunities.nextFollowupAt), inArray(opportunities.stage, OPEN_STAGES));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(ilike(opportunities.clientName, like), ilike(opportunities.contactName, like), ilike(opportunities.document, like), ilike(opportunities.currentInsurer, like), sql`${companyName} ilike ${like}`));
  }
  return db
    .select({ o: opportunities, brokerName: users.name, companyName, campaignName: campaigns.name, quotationCode: quotations.code })
    .from(opportunities)
    .leftJoin(users, eq(users.id, opportunities.brokerId))
    .leftJoin(companies, eq(companies.id, opportunities.companyId))
    .leftJoin(campaigns, eq(campaigns.id, opportunities.campaignId))
    .leftJoin(quotations, eq(quotations.id, opportunities.quotationId))
    .where(and(...conds))
    .orderBy(asc(sql`coalesce(${opportunities.nextFollowupAt}, '2999-12-31')`), desc(opportunities.updatedAt))
    .limit(1000);
}
export type OpportunityRow = Awaited<ReturnType<typeof listOpportunities>>[number];

export async function getOpportunity(id: string, user: CurrentUser) {
  const o = await loadInScope(id, user);
  const [extra, history, timeline, oppTasks, oppMeetings] = await Promise.all([
    db
      .select({ brokerName: users.name, companyName, campaignName: campaigns.name, quotationCode: quotations.code })
      .from(opportunities)
      .leftJoin(users, eq(users.id, opportunities.brokerId))
      .leftJoin(companies, eq(companies.id, opportunities.companyId))
      .leftJoin(campaigns, eq(campaigns.id, opportunities.campaignId))
      .leftJoin(quotations, eq(quotations.id, opportunities.quotationId))
      .where(eq(opportunities.id, id))
      .then((r) => r[0]),
    db
      .select({ h: opportunityStageHistory, userName: users.name })
      .from(opportunityStageHistory)
      .leftJoin(users, eq(users.id, opportunityStageHistory.userId))
      .where(eq(opportunityStageHistory.opportunityId, id))
      .orderBy(desc(opportunityStageHistory.createdAt)),
    db
      .select({ i: interactions, userName: users.name })
      .from(interactions)
      .leftJoin(users, eq(users.id, interactions.userId))
      .where(eq(interactions.opportunityId, id))
      .orderBy(desc(interactions.occurredAt))
      .limit(200),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.opportunityId, id), isNull(tasks.deletedAt)))
      .orderBy(asc(sql`coalesce(${tasks.dueDate}, ${tasks.scheduledDate})`)),
    db
      .select()
      .from(meetings)
      .where(and(eq(meetings.opportunityId, id), isNull(meetings.deletedAt)))
      .orderBy(desc(meetings.date)),
  ]);
  return { o, ...extra, history, timeline, tasks: oppTasks, meetings: oppMeetings };
}

/** Localiza oportunidades por nome/contato/documento no escopo do usuário (assistente). */
export async function findOpportunities(term: string, scope: DataScope, limit = 5) {
  const like = `%${term.trim()}%`;
  return db
    .select({ o: opportunities, brokerName: users.name })
    .from(opportunities)
    .leftJoin(users, eq(users.id, opportunities.brokerId))
    .leftJoin(companies, eq(companies.id, opportunities.companyId))
    .where(and(isNull(opportunities.deletedAt), ownerCond(scope, opportunities.brokerId), or(ilike(opportunities.clientName, like), ilike(opportunities.contactName, like), sql`${companyName} ilike ${like}`)))
    .orderBy(sql`case when ${opportunities.stage} in ('fechado','implantado','perdido') then 1 else 0 end`, desc(opportunities.updatedAt))
    .limit(limit);
}

export async function opportunityOptions(scope: DataScope) {
  const rows = await db
    .select({ id: opportunities.id, clientName: opportunities.clientName, companyId: opportunities.companyId, contactName: opportunities.contactName })
    .from(opportunities)
    .where(and(isNull(opportunities.deletedAt), ownerCond(scope, opportunities.brokerId), inArray(opportunities.stage, OPEN_STAGES)))
    .orderBy(asc(opportunities.clientName));
  return rows;
}
