import "server-only";
import { and, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { addDays, todayISO } from "@/lib/domain/dates";
import { db } from "../db";
import { companies, insurers, pendencies, quotationInsurers, quotations, renewals, tasks } from "../db/schema";

export interface ReportFilters {
  from?: string | null;
  to?: string | null;
  companyId?: string | null;
  insurerId?: string | null;
  status?: string | null;
}

export async function getReports(f: ReportFilters) {
  const today = todayISO();
  const from = f.from ?? addDays(today, -365);
  const to = f.to ?? today;
  const qConds: SQL[] = [isNull(quotations.deletedAt), gte(quotations.openedAt, from), lte(quotations.openedAt, to)];
  if (f.companyId) qConds.push(eq(quotations.companyId, f.companyId));
  if (f.status) qConds.push(eq(quotations.status, f.status as never));
  if (f.insurerId) qConds.push(sql`exists (select 1 from quotation_insurers qi where qi.quotation_id = ${quotations.id} and qi.insurer_id = ${f.insurerId})`);
  const where = and(...qConds);
  const open = sql`${quotations.status} not in ('fechada_ganha','fechada_perdida','concluida','cancelada')`;

  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${open})::int`,
      large: sql<number>`count(*) filter (where ${open} and ${quotations.estimatedLives} >= 100)::int`,
      lives: sql<number>`coalesce(sum(${quotations.estimatedLives}), 0)::int`,
      won: sql<number>`count(*) filter (where ${quotations.status} in ('fechada_ganha','implantacao','concluida'))::int`,
      lost: sql<number>`count(*) filter (where ${quotations.status} = 'fechada_perdida')::int`,
      avgCompleteness: sql<number | null>`round(avg((select case when count(*) filter (where ci.required and ci.applicable) = 0 then 100 else 100.0 * count(*) filter (where ci.required and ci.applicable and ci.status <> 'pendente') / count(*) filter (where ci.required and ci.applicable) end from quotation_checklist_items ci where ci.quotation_id = ${quotations.id})) filter (where ${open}), 1)::float`,
    })
    .from(quotations)
    .where(where);

  const byStatus = await db
    .select({ status: quotations.status, n: sql<number>`count(*)::int`, lives: sql<number>`sum(${quotations.estimatedLives})::int` })
    .from(quotations)
    .where(where)
    .groupBy(quotations.status);

  const byType = await db
    .select({ type: quotations.processType, n: sql<number>`count(*)::int` })
    .from(quotations)
    .where(where)
    .groupBy(quotations.processType);

  const lostReasons = await db
    .select({ reason: sql<string>`coalesce(nullif(trim(${quotations.lostReason}), ''), '(não informado)')`, n: sql<number>`count(*)::int` })
    .from(quotations)
    .where(and(where, eq(quotations.status, "fechada_perdida")))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`);

  // Tempo médio (dias) em cada etapa, a partir do histórico de status
  const stageTimes = await db.execute<{ status: string; avg_days: number; n: number }>(sql`
    with h as (
      select h.quotation_id, h.to_status, h.changed_at,
             lead(h.changed_at) over (partition by h.quotation_id order by h.changed_at) as next_at
      from quotation_status_history h
      join quotations q on q.id = h.quotation_id
      where q.deleted_at is null and q.opened_at between ${from} and ${to}
      ${f.companyId ? sql`and q.company_id = ${f.companyId}` : sql``}
    )
    select to_status as status, round(avg(extract(epoch from (coalesce(next_at, now()) - changed_at)) / 86400)::numeric, 1)::float as avg_days, count(*)::int as n
    from h group by to_status`);

  const insurerResponse = await db
    .select({
      insurer: insurers.name,
      sent: sql<number>`count(*) filter (where ${quotationInsurers.sentAt} is not null)::int`,
      responded: sql<number>`count(*) filter (where ${quotationInsurers.firstResponseAt} is not null)::int`,
      declined: sql<number>`count(*) filter (where ${quotationInsurers.status} = 'declinada')::int`,
      avgDays: sql<number | null>`round(avg(extract(epoch from (${quotationInsurers.firstResponseAt} - ${quotationInsurers.sentAt})) / 86400)::numeric, 1)::float`,
    })
    .from(quotationInsurers)
    .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
    .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
    .where(and(where, f.insurerId ? eq(quotationInsurers.insurerId, f.insurerId) : undefined))
    .groupBy(insurers.name)
    .orderBy(insurers.name);

  const pendencyByCategory = await db
    .select({ category: pendencies.category, n: sql<number>`count(*)::int` })
    .from(pendencies)
    .where(and(sql`${pendencies.status} in ('aberta','em_andamento')`, f.companyId ? eq(pendencies.companyId, f.companyId) : undefined))
    .groupBy(pendencies.category);

  const [taskStats] = await db
    .select({
      overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today})::int`,
      open: sql<number>`count(*)::int`,
      followups: sql<number>`count(*) filter (where ${tasks.category} = 'follow_up')::int`,
    })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), sql`${tasks.status} in ('a_fazer','em_andamento','aguardando_terceiro')`, f.companyId ? eq(tasks.companyId, f.companyId) : undefined));

  const [insurerFollowupsOpen] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quotationInsurers)
    .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
    .where(and(isNull(quotations.deletedAt), sql`${quotationInsurers.nextFollowupAt} is not null`, sql`${quotationInsurers.status} in ('enviada','recebida_operadora','em_analise','pendencia')`));

  const renewalWindows = await db
    .select({
      d30: sql<number>`count(*) filter (where ${renewals.anniversaryDate} between ${today} and ${addDays(today, 30)})::int`,
      d60: sql<number>`count(*) filter (where ${renewals.anniversaryDate} between ${addDays(today, 31)} and ${addDays(today, 60)})::int`,
      d90: sql<number>`count(*) filter (where ${renewals.anniversaryDate} between ${addDays(today, 61)} and ${addDays(today, 90)})::int`,
      d120: sql<number>`count(*) filter (where ${renewals.anniversaryDate} between ${addDays(today, 91)} and ${addDays(today, 120)})::int`,
    })
    .from(renewals)
    .innerJoin(companies, eq(companies.id, renewals.companyId))
    .where(and(isNull(renewals.deletedAt), sql`${renewals.status} not in ('renovada','migrada','perdida','cancelada')`, f.companyId ? eq(renewals.companyId, f.companyId) : undefined));

  return {
    period: { from, to },
    totals: { ...totals, pendencies: pendencyByCategory.reduce((a, r) => a + r.n, 0) },
    byStatus,
    byType,
    lostReasons,
    stageTimes: stageTimes.rows,
    insurerResponse,
    pendencyByCategory,
    tasks: { ...taskStats, insurerFollowupsOpen: insurerFollowupsOpen.n },
    renewalWindows: renewalWindows[0],
  };
}
export type Reports = Awaited<ReturnType<typeof getReports>>;
