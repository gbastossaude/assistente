import "server-only";
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { RENEWAL_STATUS_LABELS } from "@/lib/domain/constants";
import { addDays, nextAnniversary, todayISO } from "@/lib/domain/dates";
import { recommendedStartDate } from "@/lib/domain/renewals";
import type { renewalSchema } from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { companies, currentContracts, insurers, quotations, renewals, users } from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { getRule } from "../settings";
import { addTimeline } from "../timeline";
import { onRenewalSaved } from "../automation/engine";

type RenewalData = z.output<typeof renewalSchema>;

export async function saveRenewal(id: string | null, input: RenewalData, user: CurrentUser) {
  const rule = await getRule("renewal_milestones");
  let insurerName = input.insurerName;
  if (input.insurerId) {
    const [i] = await db.select({ name: insurers.name }).from(insurers).where(eq(insurers.id, input.insurerId));
    insurerName = i?.name ?? insurerName;
  }
  const data = { ...input, insurerName, recommendedStartDate: recommendedStartDate(input.anniversaryDate, rule.params), ownerId: input.ownerId ?? user.id };
  return db.transaction(async (tx) => {
    let rid = id;
    if (rid) {
      const [cur] = await tx.select().from(renewals).where(eq(renewals.id, rid));
      if (!cur) throw new NotFoundError("Renovação");
      await tx.update(renewals).set(data).where(eq(renewals.id, rid));
      const changes = diff(cur as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      await audit({ userId: user.id, action: "anniversaryDate" in changes ? "deadline_change" : "update", entityType: "renewal", entityId: rid, summary: `Renovação atualizada (${RENEWAL_STATUS_LABELS[input.status]})`, changes }, tx);
      if ("status" in changes) {
        await addTimeline({ type: "status", description: `Renovação: ${RENEWAL_STATUS_LABELS[cur.status]} → ${RENEWAL_STATUS_LABELS[input.status]}`, userId: user.id, companyId: input.companyId, quotationId: input.quotationId }, tx);
      }
    } else {
      const [dup] = await tx
        .select({ id: renewals.id })
        .from(renewals)
        .where(and(eq(renewals.companyId, input.companyId), eq(renewals.anniversaryDate, input.anniversaryDate), isNull(renewals.deletedAt)));
      if (dup) throw new BusinessError("Já existe renovação desta empresa para esta data.");
      const [r] = await tx
        .insert(renewals)
        .values({ ...data, createdBy: user.id })
        .returning();
      rid = r.id;
      await audit({ userId: user.id, action: "create", entityType: "renewal", entityId: rid, summary: `Renovação cadastrada para ${input.anniversaryDate}` }, tx);
      await addTimeline({ type: "sistema", description: `Renovação cadastrada — aniversário ${input.anniversaryDate.split("-").reverse().join("/")}`, userId: user.id, companyId: input.companyId }, tx);
    }
    await onRenewalSaved(rid!, user.id, tx);
    return rid!;
  });
}

export async function softDeleteRenewal(id: string, user: CurrentUser) {
  const [r] = await db.update(renewals).set({ deletedAt: new Date() }).where(eq(renewals.id, id)).returning();
  if (!r) throw new NotFoundError("Renovação");
  await onRenewalSaved(id, user.id);
  await audit({ userId: user.id, action: "delete", entityType: "renewal", entityId: id, summary: "Renovação excluída (lógica)" });
}

/** Sugere renovações a partir dos contratos atuais com aniversário nos próximos N dias e sem renovação cadastrada. */
export async function renewalSuggestions(days = 150) {
  const today = todayISO();
  const contracts = await db
    .select({ c: currentContracts, companyName: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`, ownerId: companies.ownerId })
    .from(currentContracts)
    .innerJoin(companies, eq(companies.id, currentContracts.companyId))
    .where(and(isNull(currentContracts.deletedAt), isNull(companies.deletedAt), sql`${currentContracts.anniversaryDate} is not null`));
  const existing = await db.select({ companyId: renewals.companyId, date: renewals.anniversaryDate }).from(renewals).where(isNull(renewals.deletedAt));
  return contracts
    .map((r) => ({ ...r, next: nextAnniversary(r.c.anniversaryDate!, today) }))
    .filter((r) => r.next <= addDays(today, days) && !existing.some((e) => e.companyId === r.c.companyId && e.date === r.next));
}

export async function listRenewals(f: { q?: string | null; status?: string | null; ownerId?: string | null; includeClosed?: boolean; month?: string | null } = {}) {
  const conds: SQL[] = [isNull(renewals.deletedAt)];
  if (f.status) conds.push(eq(renewals.status, f.status as never));
  else if (!f.includeClosed) conds.push(sql`${renewals.status} not in ('renovada','migrada','perdida','cancelada')`);
  if (f.ownerId) conds.push(eq(renewals.ownerId, f.ownerId));
  if (f.month) conds.push(sql`to_char(${renewals.anniversaryDate}, 'YYYY-MM') = ${f.month}`);
  if (f.q) conds.push(sql`(${companies.legalName} ilike ${"%" + f.q + "%"} or ${companies.tradeName} ilike ${"%" + f.q + "%"} or ${renewals.insurerName} ilike ${"%" + f.q + "%"})`);
  return db
    .select({
      r: renewals,
      companyName: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`,
      ownerName: users.name,
      quotationCode: quotations.code,
    })
    .from(renewals)
    .innerJoin(companies, eq(companies.id, renewals.companyId))
    .leftJoin(users, eq(users.id, renewals.ownerId))
    .leftJoin(quotations, eq(quotations.id, renewals.quotationId))
    .where(and(...conds))
    .orderBy(asc(renewals.anniversaryDate));
}
export type RenewalRow = Awaited<ReturnType<typeof listRenewals>>[number];
