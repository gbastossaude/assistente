import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { companies, quotations } from "../db/schema";
import { companyOptions } from "./companies";
import { insurerOptions } from "./insurers";
import { userOptions } from "./users";

/** Opções para formulários de tarefas/agenda. */
export async function taskOptions() {
  const [users, cos, insurers, qs] = await Promise.all([
    userOptions(),
    companyOptions(),
    insurerOptions(),
    db
      .select({ id: quotations.id, code: quotations.code, companyId: quotations.companyId, name: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .where(and(isNull(quotations.deletedAt)))
      .orderBy(quotations.code),
  ]);
  return {
    users,
    companies: cos.map((c) => ({ id: c.id, name: c.name })),
    insurers,
    quotations: qs.map((q) => ({ id: q.id, label: `${q.code} — ${q.name}`, companyId: q.companyId })),
  };
}
