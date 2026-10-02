import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { LOST_STAGES, NEGOTIATION_STAGES, OPEN_STAGES, WON_STAGES } from "@/lib/domain/commercial";
import { MEETING_EVENT_TYPES, OPEN_TASK_STATUSES } from "@/lib/domain/constants";
import { conversionRate } from "@/lib/domain/crm";
import { addDays, todayISO } from "@/lib/domain/dates";
import { db } from "../db";
import { calendarEvents, campaigns, companies, meetings, opportunities, quotations, tasks, users } from "../db/schema";
import { ownerCond, type DataScope } from "../scope";
import { localToUtc } from "./calendar";

function weekBounds(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
  return { from: monday, to: addDays(monday, 7) };
}

/** Indicadores comerciais e listas do dia (seção 1 do prompt mestre), no escopo do usuário. */
export async function getCommercialOverview(scope: DataScope, today = todayISO()) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const week = weekBounds(today);
  const opp = (...c: Parameters<typeof and>) => and(isNull(opportunities.deletedAt), ownerCond(scope, opportunities.brokerId), ...c);
  const count = sql<number>`count(*)::int`;
  const sumValue = sql<number>`coalesce(sum(${opportunities.estimatedValue}), 0)::float`;

  const [
    [leads],
    [newLeads],
    [clients],
    [openQuotations],
    [quoting],
    [proposals],
    [won],
    [negotiation],
    [decided],
    [overdueTasks],
    [meetingsWeek],
    todayEvents,
    overdueFollowups,
    [todayFollowups],
    activeCampaigns,
    pendingMinutes,
  ] = await Promise.all([
    db.select({ n: count }).from(opportunities).where(opp()),
    db.select({ n: count }).from(opportunities).where(opp(gte(opportunities.createdAt, localToUtc(monthStart, "00:00")))),
    db.select({ n: count }).from(companies).where(and(isNull(companies.deletedAt), eq(companies.isClient, true), ownerCond(scope, companies.ownerId))),
    db
      .select({ n: count })
      .from(quotations)
      .where(and(isNull(quotations.deletedAt), ownerCond(scope, quotations.ownerId), sql`${quotations.status} not in ('fechada_ganha','fechada_perdida','concluida','cancelada')`)),
    db.select({ n: count }).from(opportunities).where(opp(eq(opportunities.stage, "cotacao_em_andamento"))),
    db.select({ n: count, v: sumValue }).from(opportunities).where(opp(eq(opportunities.stage, "proposta_enviada"))),
    db.select({ n: count, v: sumValue }).from(opportunities).where(opp(inArray(opportunities.stage, WON_STAGES), gte(opportunities.closedAt, localToUtc(monthStart, "00:00")))),
    db.select({ n: count, v: sumValue }).from(opportunities).where(opp(inArray(opportunities.stage, NEGOTIATION_STAGES))),
    db
      .select({
        won: sql<number>`count(*) filter (where ${opportunities.stage} in ('fechado','implantado'))::int`,
        lost: sql<number>`count(*) filter (where ${opportunities.stage} = 'perdido')::int`,
      })
      .from(opportunities)
      .where(opp(inArray(opportunities.stage, [...WON_STAGES, ...LOST_STAGES]), gte(opportunities.closedAt, sql`now() - interval '12 months'`))),
    db
      .select({ n: count })
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), ownerCond(scope, tasks.ownerId), inArray(tasks.status, OPEN_TASK_STATUSES), lt(tasks.dueDate, today))),
    db
      .select({ n: count })
      .from(calendarEvents)
      .where(
        and(
          isNull(calendarEvents.deletedAt),
          ownerCond(scope, calendarEvents.ownerId),
          inArray(calendarEvents.type, MEETING_EVENT_TYPES),
          ne(calendarEvents.status, "cancelado"),
          gte(calendarEvents.startsAt, localToUtc(week.from, "00:00")),
          lt(calendarEvents.startsAt, localToUtc(week.to, "00:00")),
        ),
      ),
    db
      .select({ e: calendarEvents, ownerName: users.name })
      .from(calendarEvents)
      .leftJoin(users, eq(users.id, calendarEvents.ownerId))
      .where(and(isNull(calendarEvents.deletedAt), ownerCond(scope, calendarEvents.ownerId), ne(calendarEvents.status, "cancelado"), gte(calendarEvents.startsAt, localToUtc(today, "00:00")), lt(calendarEvents.startsAt, localToUtc(addDays(today, 1), "00:00"))))
      .orderBy(asc(calendarEvents.startsAt)),
    db
      .select({ o: opportunities, brokerName: users.name })
      .from(opportunities)
      .leftJoin(users, eq(users.id, opportunities.brokerId))
      .where(opp(inArray(opportunities.stage, OPEN_STAGES), lt(opportunities.nextFollowupAt, today)))
      .orderBy(asc(opportunities.nextFollowupAt))
      .limit(50),
    db.select({ n: count }).from(opportunities).where(opp(inArray(opportunities.stage, OPEN_STAGES), eq(opportunities.nextFollowupAt, today))),
    db
      .select({
        c: campaigns,
        leads: sql<number>`(select count(*)::int from opportunities o where o.campaign_id = ${campaigns.id} and o.deleted_at is null)`,
      })
      .from(campaigns)
      .where(and(isNull(campaigns.deletedAt), eq(campaigns.status, "ativa")))
      .orderBy(asc(campaigns.endDate)),
    db
      .select({ id: meetings.id, title: meetings.title, date: meetings.date })
      .from(meetings)
      .where(and(isNull(meetings.deletedAt), ownerCond(scope, meetings.ownerId), lte(meetings.date, today), isNull(meetings.minutesGeneratedAt), inArray(meetings.status, ["agendada", "realizada"])))
      .orderBy(desc(meetings.date))
      .limit(20),
  ]);

  const alerts: { tone: "red" | "amber" | "blue"; text: string; href: string }[] = [];
  if (overdueFollowups.length) alerts.push({ tone: "red", text: `${overdueFollowups.length} follow-up(s) de vendas atrasado(s)`, href: "/crm?followup=atrasado&view=tabela" });
  if (overdueTasks.n) alerts.push({ tone: "red", text: `${overdueTasks.n} tarefa(s) atrasada(s)`, href: "/tarefas?view=atrasadas" });
  if (pendingMinutes.length) alerts.push({ tone: "amber", text: `${pendingMinutes.length} reunião(ões) sem ata registrada`, href: `/reunioes/${pendingMinutes[0].id}` });
  for (const { c } of activeCampaigns) {
    const left = Math.round((Date.parse(c.endDate) - Date.parse(today)) / 86_400_000);
    if (left >= 0 && left <= 3) alerts.push({ tone: "amber", text: `Campanha “${c.name}” termina ${left === 0 ? "hoje" : `em ${left} dia(s)`}`, href: `/campanhas/${c.id}` });
    if (left < 0) alerts.push({ tone: "blue", text: `Campanha “${c.name}” encerrada — registre o resultado`, href: `/campanhas/${c.id}` });
  }
  if (todayFollowups.n) alerts.push({ tone: "blue", text: `${todayFollowups.n} follow-up(s) de vendas para hoje`, href: "/crm?followup=hoje&view=tabela" });

  return {
    today,
    kpis: {
      totalLeads: leads.n,
      newLeadsMonth: newLeads.n,
      activeClients: clients.n,
      quotationsInProgress: openQuotations.n + quoting.n,
      quotationsSplit: { large: openQuotations.n, crm: quoting.n },
      proposalsSent: proposals.n,
      proposalsValue: proposals.v,
      salesClosedMonth: won.n,
      salesValueMonth: won.v,
      negotiationValue: negotiation.v,
      negotiationCount: negotiation.n,
      conversionRate: conversionRate(decided.won, decided.lost),
      decided,
      overdueTasks: overdueTasks.n,
      meetingsWeek: meetingsWeek.n,
    },
    todayEvents,
    overdueFollowups,
    activeCampaigns,
    pendingMinutes,
    alerts,
  };
}
export type CommercialOverview = Awaited<ReturnType<typeof getCommercialOverview>>;
