import "server-only";
import { C_ID } from "../db/qualified";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { formatCnpj } from "@/lib/domain/cnpj";
import type { companyCnpjSchema, companySchema, contactSchema, contractSchema } from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import {
  companies,
  companyCnpjs,
  contacts,
  currentContractPlans,
  currentContracts,
  insurers,
  quotations,
  renewals,
  users,
} from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { addTimeline } from "../timeline";
import { afterQuotationChange } from "./quotation-sync";

type CompanyData = z.output<typeof companySchema>;

async function assertCnpjFree(cnpj: string | null, exceptCompanyId?: string) {
  if (!cnpj) return;
  const rows = await db
    .select({ id: companies.id, name: companies.legalName })
    .from(companyCnpjs)
    .innerJoin(companies, eq(companies.id, companyCnpjs.companyId))
    .where(and(eq(companyCnpjs.cnpj, cnpj), isNull(companies.deletedAt)));
  const other = rows.find((r) => r.id !== exceptCompanyId);
  if (other) throw new BusinessError(`CNPJ ${formatCnpj(cnpj)} já cadastrado em ${other.name}.`, { mainCnpj: ["CNPJ já cadastrado"] });
}

export async function createCompany(input: CompanyData, user: CurrentUser) {
  await assertCnpjFree(input.mainCnpj);
  return db.transaction(async (tx) => {
    const [c] = await tx
      .insert(companies)
      .values({ ...input, ownerId: input.ownerId ?? user.id, createdBy: user.id, updatedBy: user.id })
      .returning();
    if (input.mainCnpj) await tx.insert(companyCnpjs).values({ companyId: c.id, cnpj: input.mainCnpj, legalName: input.legalName, isMain: true });
    await audit({ userId: user.id, action: "create", entityType: "company", entityId: c.id, summary: `Empresa criada: ${c.legalName}` }, tx);
    await addTimeline({ type: "sistema", description: "Empresa cadastrada", userId: user.id, companyId: c.id }, tx);
    return c;
  });
}

export async function updateCompany(id: string, input: CompanyData, user: CurrentUser) {
  const [cur] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)));
  if (!cur) throw new NotFoundError("Empresa");
  await assertCnpjFree(input.mainCnpj, id);
  await db.transaction(async (tx) => {
    await tx
      .update(companies)
      .set({ ...input, updatedBy: user.id })
      .where(eq(companies.id, id));
    if (input.mainCnpj && input.mainCnpj !== cur.mainCnpj) {
      await tx.update(companyCnpjs).set({ isMain: false }).where(eq(companyCnpjs.companyId, id));
      await tx
        .insert(companyCnpjs)
        .values({ companyId: id, cnpj: input.mainCnpj, legalName: input.legalName, isMain: true })
        .onConflictDoUpdate({ target: [companyCnpjs.companyId, companyCnpjs.cnpj], set: { isMain: true } });
    }
    const changes = diff(cur as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
    if (Object.keys(changes).length) {
      await audit({ userId: user.id, action: "update", entityType: "company", entityId: id, summary: `Empresa atualizada: ${input.legalName}`, changes }, tx);
      if ("ownerId" in changes && input.ownerId) {
        const [o] = await tx.select({ name: users.name }).from(users).where(eq(users.id, input.ownerId));
        await addTimeline({ type: "responsavel", description: `Executivo responsável alterado para ${o?.name ?? "—"}`, userId: user.id, companyId: id }, tx);
      }
    }
  });
}

export async function softDeleteCompany(id: string, user: CurrentUser) {
  const [cur] = await db.select().from(companies).where(eq(companies.id, id));
  if (!cur || cur.deletedAt) throw new NotFoundError("Empresa");
  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quotations)
    .where(and(eq(quotations.companyId, id), isNull(quotations.deletedAt), sql`${quotations.status} not in ('fechada_ganha','fechada_perdida','concluida','cancelada')`));
  if (open.n > 0) throw new BusinessError(`A empresa possui ${open.n} cotação(ões) em andamento. Encerre-as antes de excluir.`);
  await db.update(companies).set({ deletedAt: new Date(), updatedBy: user.id }).where(eq(companies.id, id));
  await audit({ userId: user.id, action: "delete", entityType: "company", entityId: id, summary: `Empresa excluída (lógica): ${cur.legalName}` });
}

export async function restoreCompany(id: string, user: CurrentUser) {
  await db.update(companies).set({ deletedAt: null, updatedBy: user.id }).where(eq(companies.id, id));
  await audit({ userId: user.id, action: "restore", entityType: "company", entityId: id, summary: "Empresa restaurada" });
}

// ─── CNPJs ───
export async function addCompanyCnpj(input: z.output<typeof companyCnpjSchema>, user: CurrentUser) {
  await assertCnpjFree(input.cnpj, input.companyId);
  const [row] = await db
    .insert(companyCnpjs)
    .values(input)
    .onConflictDoNothing()
    .returning();
  if (!row) throw new BusinessError("CNPJ já vinculado a esta empresa.");
  if (input.isMain) {
    await db.update(companyCnpjs).set({ isMain: false }).where(and(eq(companyCnpjs.companyId, input.companyId), sql`${companyCnpjs.id} <> ${row.id}`));
    await db.update(companies).set({ mainCnpj: input.cnpj }).where(eq(companies.id, input.companyId));
  }
  await audit({ userId: user.id, action: "create", entityType: "company_cnpj", entityId: row.id, summary: `CNPJ ${formatCnpj(input.cnpj)} vinculado` });
  return row;
}

export async function removeCompanyCnpj(id: string, user: CurrentUser) {
  const [row] = await db.delete(companyCnpjs).where(eq(companyCnpjs.id, id)).returning();
  if (!row) throw new NotFoundError("CNPJ");
  if (row.isMain) await db.update(companies).set({ mainCnpj: null }).where(eq(companies.id, row.companyId));
  await audit({ userId: user.id, action: "delete", entityType: "company_cnpj", entityId: id, summary: `CNPJ ${formatCnpj(row.cnpj)} desvinculado` });
}

// ─── Contatos ───
export async function saveContact(id: string | null, input: z.output<typeof contactSchema>, user: CurrentUser) {
  return db.transaction(async (tx) => {
    if (input.isPrimary) await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.companyId, input.companyId));
    if (id) {
      await tx.update(contacts).set(input).where(eq(contacts.id, id));
      await audit({ userId: user.id, action: "update", entityType: "contact", entityId: id, summary: `Contato atualizado: ${input.name}` }, tx);
      return id;
    }
    const [c] = await tx
      .insert(contacts)
      .values({ ...input, createdBy: user.id })
      .returning();
    await audit({ userId: user.id, action: "create", entityType: "contact", entityId: c.id, summary: `Contato criado: ${input.name}` }, tx);
    return c.id;
  });
}

export async function deleteContact(id: string, user: CurrentUser) {
  const [c] = await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, id)).returning();
  if (!c) throw new NotFoundError("Contato");
  await audit({ userId: user.id, action: "delete", entityType: "contact", entityId: id, summary: `Contato excluído: ${c.name}` });
}

// ─── Contratos atuais ───
async function reevaluateOpenQuotations(companyId: string) {
  const open = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.companyId, companyId), isNull(quotations.deletedAt)));
  for (const q of open) await afterQuotationChange(q.id);
}

export async function saveContract(id: string | null, input: z.output<typeof contractSchema>, user: CurrentUser) {
  const { plans, ...data } = input;
  let insurerName = data.insurerName;
  if (data.insurerId) {
    const [ins] = await db.select({ name: insurers.name }).from(insurers).where(eq(insurers.id, data.insurerId));
    insurerName = ins?.name ?? insurerName;
  }
  const contractId = await db.transaction(async (tx) => {
    let cid = id;
    if (cid) {
      await tx
        .update(currentContracts)
        .set({ ...data, insurerName })
        .where(eq(currentContracts.id, cid));
    } else {
      const [c] = await tx
        .insert(currentContracts)
        .values({ ...data, insurerName, createdBy: user.id })
        .returning();
      cid = c.id;
    }
    // Planos: substitui o conjunto (mantém ids informados)
    const existing = await tx.select({ id: currentContractPlans.id }).from(currentContractPlans).where(eq(currentContractPlans.contractId, cid));
    const keep = plans.filter((p) => p.id).map((p) => p.id as string);
    const remove = existing.map((e) => e.id).filter((e) => !keep.includes(e));
    if (remove.length) await tx.delete(currentContractPlans).where(inArray(currentContractPlans.id, remove));
    for (const p of plans) {
      const { id: pid, ...pd } = p;
      if (pid && existing.some((e) => e.id === pid)) await tx.update(currentContractPlans).set(pd).where(eq(currentContractPlans.id, pid));
      else await tx.insert(currentContractPlans).values({ ...pd, contractId: cid });
    }
    await audit(
      {
        userId: user.id,
        action: id ? "update" : "create",
        entityType: "current_contract",
        entityId: cid,
        summary: `Contrato atual ${id ? "atualizado" : "cadastrado"}: ${insurerName ?? "—"} (${plans.length} plano(s))`,
      },
      tx,
    );
    await addTimeline({ type: "sistema", description: `Contrato atual ${id ? "atualizado" : "cadastrado"}: ${insurerName ?? "—"}`, userId: user.id, companyId: input.companyId }, tx);
    return cid;
  });
  await reevaluateOpenQuotations(input.companyId);
  return contractId;
}

export async function deleteContract(id: string, user: CurrentUser) {
  const [c] = await db.update(currentContracts).set({ deletedAt: new Date() }).where(eq(currentContracts.id, id)).returning();
  if (!c) throw new NotFoundError("Contrato");
  await audit({ userId: user.id, action: "delete", entityType: "current_contract", entityId: id, summary: `Contrato excluído: ${c.insurerName ?? "—"}` });
  await reevaluateOpenQuotations(c.companyId);
}

// ─── Consultas ───
export interface CompanyFilters {
  q?: string | null;
  ownerId?: string | null;
  uf?: string | null;
  segment?: string | null;
  kind?: "cliente" | "prospect" | null;
  deleted?: boolean;
}

export async function listCompanies(f: CompanyFilters = {}) {
  const conds: SQL[] = [f.deleted ? isNotNull(companies.deletedAt) : isNull(companies.deletedAt)];
  if (f.ownerId) conds.push(eq(companies.ownerId, f.ownerId));
  if (f.uf) conds.push(eq(companies.uf, f.uf));
  if (f.segment) conds.push(sql`${companies.segment} ilike ${"%" + f.segment + "%"}`);
  if (f.kind) conds.push(eq(companies.isClient, f.kind === "cliente"));
  if (f.q) {
    const like = `%${f.q}%`;
    const digits = f.q.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    conds.push(
      sql`(${companies.legalName} ilike ${like} or ${companies.tradeName} ilike ${like} or ${companies.economicGroup} ilike ${like}
        or exists (select 1 from ${companyCnpjs} cc where cc.company_id = ${C_ID} and ${digits.length >= 4 ? sql`cc.cnpj like ${"%" + digits + "%"}` : sql`false`})
        or exists (select 1 from ${contacts} ct where ct.company_id = ${C_ID} and ct.deleted_at is null and (ct.name ilike ${like} or ct.email ilike ${like})))`,
    );
  }
  return db
    .select({
      c: companies,
      ownerName: users.name,
      cnpjCount: sql<number>`(select count(*)::int from ${companyCnpjs} cc where cc.company_id = ${C_ID})`,
      openQuotations: sql<number>`(select count(*)::int from ${quotations} q where q.company_id = ${C_ID} and q.deleted_at is null and q.status not in ('fechada_ganha','fechada_perdida','concluida','cancelada'))`,
      nextAnniversary: sql<string | null>`(select min(cc.anniversary_date)::text from ${currentContracts} cc where cc.company_id = ${C_ID} and cc.deleted_at is null)`,
    })
    .from(companies)
    .leftJoin(users, eq(users.id, companies.ownerId))
    .where(and(...conds))
    .orderBy(asc(companies.legalName))
    .limit(1000);
}

export async function getCompanyDetail(id: string) {
  const [row] = await db
    .select({ c: companies, ownerName: users.name })
    .from(companies)
    .leftJoin(users, eq(users.id, companies.ownerId))
    .where(eq(companies.id, id));
  if (!row) return null;
  const [cnpjs, contactRows, contracts, quotationRows, renewalRows] = await Promise.all([
    db.select().from(companyCnpjs).where(eq(companyCnpjs.companyId, id)).orderBy(desc(companyCnpjs.isMain), asc(companyCnpjs.createdAt)),
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, id), isNull(contacts.deletedAt)))
      .orderBy(desc(contacts.isPrimary), asc(contacts.name)),
    db
      .select()
      .from(currentContracts)
      .where(and(eq(currentContracts.companyId, id), isNull(currentContracts.deletedAt)))
      .orderBy(asc(currentContracts.anniversaryDate)),
    db
      .select({ q: quotations, ownerName: users.name })
      .from(quotations)
      .leftJoin(users, eq(users.id, quotations.ownerId))
      .where(and(eq(quotations.companyId, id), isNull(quotations.deletedAt)))
      .orderBy(desc(quotations.openedAt)),
    db
      .select()
      .from(renewals)
      .where(and(eq(renewals.companyId, id), isNull(renewals.deletedAt)))
      .orderBy(asc(renewals.anniversaryDate)),
  ]);
  const plans = contracts.length
    ? await db
        .select()
        .from(currentContractPlans)
        .where(
          inArray(
            currentContractPlans.contractId,
            contracts.map((c) => c.id),
          ),
        )
        .orderBy(asc(currentContractPlans.planName))
    : [];
  return {
    ...row,
    cnpjs,
    contacts: contactRows,
    contracts: contracts.map((c) => ({ ...c, plans: plans.filter((p) => p.contractId === c.id) })),
    quotations: quotationRows,
    renewals: renewalRows,
  };
}
export type CompanyDetail = NonNullable<Awaited<ReturnType<typeof getCompanyDetail>>>;

export async function companyOptions() {
  return db
    .select({ id: companies.id, name: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`, legalName: companies.legalName, mainCnpj: companies.mainCnpj })
    .from(companies)
    .where(isNull(companies.deletedAt))
    .orderBy(asc(companies.legalName));
}
