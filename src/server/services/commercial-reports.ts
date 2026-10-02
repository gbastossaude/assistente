import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { OPEN_STAGES, WON_STAGES } from "@/lib/domain/commercial";
import { MEETING_EVENT_TYPES, OPEN_TASK_STATUSES } from "@/lib/domain/constants";
import { conversionRate } from "@/lib/domain/crm";
import { addDays, todayISO } from "@/lib/domain/dates";
import { db } from "../db";
import { calendarEvents, campaigns, meetings, opportunities, tasks, users } from "../db/schema";
import { ownerCond, type DataScope } from "../scope";
import { localToUtc } from "./calendar";

/** Relatórios comerciais (seção 11): vendas por período/corretor/produto, leads por origem, etapas, campanhas… */
export async function getCommercialReports(f: { from?: string | null; to?: string | null }, scope: DataScope) {
  const today = todayISO();
  const from = f.from ?? addDays(today, -365);
  const to = f.to ?? today;
  const fromTs = localToUtc(from, "00:00");
  const toTs = localToUtc(addDays(to, 1), "00:00");
  const base = and(isNull(opportunities.deletedAt), ownerCond(scope, opportunities.brokerId));
  const wonInPeriod = and(base, inArray(opportunities.stage, WON_STAGES), gte(opportunities.closedAt, fromTs), lt(opportunities.closedAt, toTs));
  const value = sql<number>`coalesce(sum(${opportunities.estimatedValue}), 0)::float`;
  const n = sql<number>`count(*)::int`;
  const month = sql<string>`to_char(${opportunities.closedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM')`;

  const [salesByMonth, salesByBroker, salesByProduct, byStage, bySource, [decided], noFollowup, [meetingsHeld], meetingsByOwner, [overdueTasks], camps, lostReasons, [eventMeetings]] = await Promise.all([
    db.select({ month, n, value }).from(opportunities).where(wonInPeriod).groupBy(month).orderBy(month),
    db
      .select({ broker: sql<string>`coalesce(${users.name}, 'Sem corretor')`, n, value })
      .from(opportunities)
      .leftJoin(users, eq(users.id, opportunities.brokerId))
      .where(wonInPeriod)
      .groupBy(users.name)
      .orderBy(desc(value)),
    db.select({ product: opportunities.product, n, value }).from(opportunities).where(wonInPeriod).groupBy(opportunities.product).orderBy(desc(value)),
    db.select({ stage: opportunities.stage, n, value }).from(opportunities).where(base).groupBy(opportunities.stage),
    db.select({ source: opportunities.source, n }).from(opportunities).where(and(base, gte(opportunities.createdAt, fromTs), lt(opportunities.createdAt, toTs))).groupBy(opportunities.source).orderBy(desc(n)),
    db
      .select({ won: sql<number>`count(*) filter (where ${opportunities.stage} in ('fechado','implantado'))::int`, lost: sql<number>`count(*) filter (where ${opportunities.stage} = 'perdido')::int` })
      .from(opportunities)
      .where(and(base, gte(opportunities.closedAt, fromTs), lt(opportunities.closedAt, toTs))),
    db
      .select({ o: opportunities, brokerName: users.name })
      .from(opportunities)
      .leftJoin(users, eq(users.id, opportunities.brokerId))
      .where(and(base, inArray(opportunities.stage, OPEN_STAGES), or(isNull(opportunities.nextFollowupAt), lt(opportunities.nextFollowupAt, today))))
      .orderBy(asc(sql`coalesce(${opportunities.nextFollowupAt}, '1900-01-01')`))
      .limit(200),
    db
      .select({ n })
      .from(meetings)
      .where(and(isNull(meetings.deletedAt), ownerCond(scope, meetings.ownerId), eq(meetings.status, "realizada"), gte(meetings.date, from), lte(meetings.date, to))),
    db
      .select({ owner: sql<string>`coalesce(${users.name}, '—')`, n })
      .from(meetings)
      .leftJoin(users, eq(users.id, meetings.ownerId))
      .where(and(isNull(meetings.deletedAt), ownerCond(scope, meetings.ownerId), eq(meetings.status, "realizada"), gte(meetings.date, from), lte(meetings.date, to)))
      .groupBy(users.name)
      .orderBy(desc(n)),
    db
      .select({ n })
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), ownerCond(scope, tasks.ownerId), inArray(tasks.status, OPEN_TASK_STATUSES), lt(tasks.dueDate, today))),
    db
      .select({
        c: campaigns,
        leads: sql<number>`(select count(*)::int from opportunities o where o.campaign_id = ${campaigns.id} and o.deleted_at is null)`,
        sales: sql<number>`(select count(*)::int from opportunities o where o.campaign_id = ${campaigns.id} and o.deleted_at is null and o.stage in ('fechado','implantado'))`,
        value: sql<number>`(select coalesce(sum(o.estimated_value),0)::float from opportunities o where o.campaign_id = ${campaigns.id} and o.deleted_at is null and o.stage in ('fechado','implantado'))`,
      })
      .from(campaigns)
      .where(and(isNull(campaigns.deletedAt), lte(campaigns.startDate, to), gte(campaigns.endDate, from)))
      .orderBy(desc(campaigns.startDate)),
    db
      .select({ reason: sql<string>`coalesce(${opportunities.lostReason}, 'Não informado')`, n })
      .from(opportunities)
      .where(and(base, eq(opportunities.stage, "perdido"), gte(opportunities.closedAt, fromTs), lt(opportunities.closedAt, toTs)))
      .groupBy(opportunities.lostReason)
      .orderBy(desc(n)),
    db
      .select({ n })
      .from(calendarEvents)
      .where(and(isNull(calendarEvents.deletedAt), ownerCond(scope, calendarEvents.ownerId), inArray(calendarEvents.type, MEETING_EVENT_TYPES), eq(calendarEvents.status, "realizado"), gte(calendarEvents.startsAt, fromTs), lt(calendarEvents.startsAt, toTs))),
  ]);
  const totalWon = salesByMonth.reduce((a, r) => a + r.n, 0);
  const totalValue = salesByMonth.reduce((a, r) => a + r.value, 0);
  return {
    period: { from, to },
    totals: { sales: totalWon, value: totalValue, ticket: totalWon ? totalValue / totalWon : null, conversion: conversionRate(decided.won, decided.lost), decided, meetingsHeld: meetingsHeld.n, agendaMeetingsHeld: eventMeetings.n, overdueTasks: overdueTasks.n, noFollowup: noFollowup.length },
    salesByMonth,
    salesByBroker,
    salesByProduct,
    byStage,
    bySource,
    noFollowup,
    meetingsByOwner,
    campaigns: camps,
    lostReasons,
  };
}
export type CommercialReports = Awaited<ReturnType<typeof getCommercialReports>>;
