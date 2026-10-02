import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { campaignMilestones, currentMilestone, milestoneMessage } from "@/lib/domain/campaigns";
import { CAMPAIGN_STATUS_LABELS, OPEN_STAGES, WON_STAGES, type CampaignStatus } from "@/lib/domain/commercial";
import { todayISO } from "@/lib/domain/dates";
import type { campaignSchema } from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { campaigns, opportunities, users } from "../db/schema";
import { NotFoundError } from "../errors";
import { ownerCond, type DataScope } from "../scope";
import { notify } from "./notifications";

type CampaignData = z.output<typeof campaignSchema>;

export async function saveCampaign(id: string | null, input: CampaignData, user: CurrentUser) {
  const row = { ...input, ownerId: input.ownerId ?? user.id, updatedBy: user.id };
  if (id) {
    const [cur] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)));
    if (!cur) throw new NotFoundError("Campanha");
    await db.update(campaigns).set(row).where(eq(campaigns.id, id));
    const changes = diff(cur as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
    await audit({ userId: user.id, action: cur.status !== input.status ? "status_change" : "update", entityType: "campaign", entityId: id, summary: `Campanha atualizada: ${input.name}`, changes });
    return id;
  }
  const [c] = await db
    .insert(campaigns)
    .values({ ...row, createdBy: user.id })
    .returning();
  await audit({ userId: user.id, action: "create", entityType: "campaign", entityId: c.id, summary: `Campanha criada: ${c.name}` });
  return c.id;
}

export async function setCampaignStatus(id: string, status: CampaignStatus, user: CurrentUser) {
  const [c] = await db.update(campaigns).set({ status, updatedBy: user.id }).where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt))).returning();
  if (!c) throw new NotFoundError("Campanha");
  await audit({ userId: user.id, action: "status_change", entityType: "campaign", entityId: id, summary: `Campanha ${c.name}: ${CAMPAIGN_STATUS_LABELS[status]}` });
}

export async function softDeleteCampaign(id: string, user: CurrentUser) {
  const [c] = await db.update(campaigns).set({ deletedAt: new Date(), updatedBy: user.id }).where(eq(campaigns.id, id)).returning();
  if (!c) throw new NotFoundError("Campanha");
  await audit({ userId: user.id, action: "delete", entityType: "campaign", entityId: id, summary: `Campanha excluída (lógica): ${c.name}` });
}

/** Indicadores por campanha (leads, vendas, valor, follow-ups pendentes), restritos ao escopo do usuário. */
function statsSelect(scope: DataScope, today: string) {
  const scopeSql = scope.all ? sql`true` : sql`o.broker_id in (${sql.join(scope.ownerIds.map((i) => sql`${i}`), sql`, `)})`;
  const won = sql.raw(WON_STAGES.map((s) => `'${s}'`).join(","));
  const open = sql.raw(OPEN_STAGES.map((s) => `'${s}'`).join(","));
  return {
    leads: sql<number>`(select count(*)::int from opportunities o where o.campaign_id = ${campaigns.id} and o.deleted_at is null and ${scopeSql})`,
    sales: sql<number>`(select count(*)::int from opportunities o where o.campaign_id = ${campaigns.id} and o.deleted_at is null and o.stage in (${won}) and ${scopeSql})`,
    salesValue: sql<number>`(select coalesce(sum(o.estimated_value), 0)::float from opportunities o where o.campaign_id = ${campaigns.id} and o.deleted_at is null and o.stage in (${won}) and ${scopeSql})`,
    pendingFollowups: sql<number>`(select count(*)::int from opportunities o where o.campaign_id = ${campaigns.id} and o.deleted_at is null and o.stage in (${open}) and (o.next_followup_at is null or o.next_followup_at <= ${today}) and ${scopeSql})`,
  };
}

export async function listCampaigns(f: { status?: CampaignStatus | null; month?: string | null }, scope: DataScope) {
  const today = todayISO();
  const conds: (SQL | undefined)[] = [isNull(campaigns.deletedAt)];
  if (f.status) conds.push(eq(campaigns.status, f.status));
  if (f.month && /^\d{4}-\d{2}$/.test(f.month)) {
    const [y, m] = f.month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    conds.push(sql`${campaigns.startDate} <= ${last} and ${campaigns.endDate} >= ${`${f.month}-01`}`);
  }
  return db
    .select({ c: campaigns, ownerName: users.name, ...statsSelect(scope, today) })
    .from(campaigns)
    .leftJoin(users, eq(users.id, campaigns.ownerId))
    .where(and(...conds))
    .orderBy(sql`case ${campaigns.status} when 'ativa' then 0 when 'planejada' then 1 when 'pausada' then 2 else 3 end`, desc(campaigns.startDate))
    .limit(300);
}
export type CampaignRow = Awaited<ReturnType<typeof listCampaigns>>[number];

export async function getCampaign(id: string, scope: DataScope) {
  const today = todayISO();
  const [row] = await db
    .select({ c: campaigns, ownerName: users.name, ...statsSelect(scope, today) })
    .from(campaigns)
    .leftJoin(users, eq(users.id, campaigns.ownerId))
    .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)));
  if (!row) return null;
  const opps = await db
    .select({ o: opportunities, brokerName: users.name })
    .from(opportunities)
    .leftJoin(users, eq(users.id, opportunities.brokerId))
    .where(and(eq(opportunities.campaignId, id), isNull(opportunities.deletedAt), ownerCond(scope, opportunities.brokerId)))
    .orderBy(asc(opportunities.stage), desc(opportunities.updatedAt));
  return { ...row, opportunities: opps, milestones: campaignMilestones(row.c.startDate, row.c.endDate) };
}

export async function campaignOptions() {
  return db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .where(and(isNull(campaigns.deletedAt), inArray(campaigns.status, ["planejada", "ativa", "pausada"])))
    .orderBy(desc(campaigns.startDate));
}

/**
 * Rotina de campanhas: ativa as planejadas que começaram e envia um lembrete por marco
 * (início, meio, últimos dias, encerramento) ao responsável — com leads e follow-ups pendentes.
 */
export async function runCampaignReminders(today = todayISO()) {
  let sent = 0;
  const started = await db
    .update(campaigns)
    .set({ status: "ativa" })
    .where(and(isNull(campaigns.deletedAt), eq(campaigns.status, "planejada"), sql`${campaigns.startDate} <= ${today}`, sql`${campaigns.endDate} >= ${today}`))
    .returning({ id: campaigns.id, name: campaigns.name });
  for (const c of started) await audit({ userId: null, action: "status_change", entityType: "campaign", entityId: c.id, summary: `Campanha ${c.name} ativada automaticamente (data de início)` });

  const rows = await db
    .select({ c: campaigns, ...statsSelect({ all: true }, today) })
    .from(campaigns)
    .where(and(isNull(campaigns.deletedAt), eq(campaigns.remindersEnabled, true), inArray(campaigns.status, ["ativa", "pausada"]), sql`${campaigns.startDate} <= ${today}`, sql`${campaigns.endDate} >= (${today}::date - 7)`));
  for (const r of rows) {
    const m = currentMilestone(r.c.startDate, r.c.endDate, today);
    if (!m) continue;
    const msg = milestoneMessage(m.key, r.c, { leads: r.leads, pendingFollowups: r.pendingFollowups, goalLeads: r.c.goalLeads });
    for (const uid of new Set([r.c.ownerId, r.c.createdBy].filter((x): x is string => !!x))) {
      await notify({ userId: uid, kind: "campanha", title: msg.title, body: msg.body, link: `/campanhas/${r.c.id}`, dedupeKey: `camp:${r.c.id}:${m.key}:${m.date}` });
      sent++;
    }
  }
  return { activated: started.length, sent };
}
