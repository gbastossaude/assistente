import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { ownerCond, type DataScope } from "../scope";
import { companies, quotations } from "../db/schema";
import { companyOptions } from "./companies";
import { insurerOptions } from "./insurers";
import { userOptions } from "./users";
import { campaignOptions } from "./campaigns";
import { opportunityOptions } from "./opportunities";

/** Opções para formulários de tarefas/agenda (respeitam o escopo do usuário, quando informado). */
export async function taskOptions(scope?: DataScope) {
  const [users, cos, insurers, qs] = await Promise.all([
    userOptions(scope),
    companyOptions(scope),
    insurerOptions(),
    db
      .select({ id: quotations.id, code: quotations.code, companyId: quotations.companyId, name: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .where(and(isNull(quotations.deletedAt), scope ? ownerCond(scope, quotations.ownerId) : undefined))
      .orderBy(quotations.code),
  ]);
  return {
    users,
    companies: cos.map((c) => ({ id: c.id, name: c.name })),
    insurers,
    quotations: qs.map((q) => ({ id: q.id, label: `${q.code} — ${q.name}`, companyId: q.companyId })),
  };
}

/** Opções do CRM/reuniões: as de tarefas + campanhas e oportunidades abertas. */
export async function commercialOptions(scope: DataScope) {
  const [base, camps, opps] = await Promise.all([taskOptions(scope), campaignOptions(), opportunityOptions(scope)]);
  return { ...base, campaigns: camps.map((c) => ({ id: c.id, name: c.name })), opportunities: opps.map((o) => ({ id: o.id, name: o.clientName, companyId: o.companyId, contactName: o.contactName })) };
}
export type CommercialOptions = Awaited<ReturnType<typeof commercialOptions>>;
