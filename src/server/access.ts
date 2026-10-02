import "server-only";
import { eq } from "drizzle-orm";
import { SCOPED_ROLES } from "@/lib/domain/constants";
import type { CurrentUser } from "./auth";
import { db } from "./db";
import {
  calendarEvents,
  companies,
  companyCnpjs,
  contacts,
  currentContracts,
  proposals,
  quotationChecklistItems,
  quotationDocuments,
  quotationInsurers,
  quotations,
  specialCaseEntries,
  tasks,
} from "./db/schema";
import { NotFoundError } from "./errors";
import { assertInScope, getScope, scopedOwner } from "./scope";

/**
 * Guardas de escopo para escrita/leitura por ID (seção 12): Corretor só acessa a própria carteira e
 * Supervisor a da equipe. Para os demais papéis não há custo (retorno imediato).
 */
const scoped = (u: CurrentUser) => SCOPED_ROLES.includes(u.role);

async function check(u: CurrentUser, ownerId: string | null | undefined, what: string) {
  assertInScope(await getScope(u), ownerId, what);
}

export async function guardQuotation(u: CurrentUser, quotationId: string | null | undefined) {
  if (!scoped(u) || !quotationId) return;
  const [q] = await db.select({ ownerId: quotations.ownerId }).from(quotations).where(eq(quotations.id, quotationId));
  if (!q) throw new NotFoundError("Cotação");
  await check(u, q.ownerId, "Cotação");
}

export async function guardCompany(u: CurrentUser, companyId: string | null | undefined) {
  if (!scoped(u) || !companyId) return;
  const [c] = await db.select({ ownerId: companies.ownerId }).from(companies).where(eq(companies.id, companyId));
  if (!c) throw new NotFoundError("Empresa");
  await check(u, c.ownerId, "Empresa");
}

export async function guardQuotationInsurer(u: CurrentUser, qiId: string) {
  if (!scoped(u)) return;
  const [r] = await db.select({ q: quotationInsurers.quotationId }).from(quotationInsurers).where(eq(quotationInsurers.id, qiId));
  if (!r) throw new NotFoundError("Operadora da cotação");
  await guardQuotation(u, r.q);
}

export async function guardProposal(u: CurrentUser, proposalId: string) {
  if (!scoped(u)) return;
  const [r] = await db.select({ q: proposals.quotationId }).from(proposals).where(eq(proposals.id, proposalId));
  if (!r) throw new NotFoundError("Proposta");
  await guardQuotation(u, r.q);
}

export async function guardChecklistItem(u: CurrentUser, itemId: string) {
  if (!scoped(u)) return;
  const [r] = await db.select({ q: quotationChecklistItems.quotationId }).from(quotationChecklistItems).where(eq(quotationChecklistItems.id, itemId));
  if (!r) throw new NotFoundError("Item");
  await guardQuotation(u, r.q);
}

export async function guardSpecialEntry(u: CurrentUser, id: string) {
  if (!scoped(u)) return;
  const [r] = await db.select({ q: specialCaseEntries.quotationId }).from(specialCaseEntries).where(eq(specialCaseEntries.id, id));
  if (!r) throw new NotFoundError("Registro");
  await guardQuotation(u, r.q);
}

export async function guardCompanyChild(u: CurrentUser, kind: "cnpj" | "contact" | "contract", id: string) {
  if (!scoped(u)) return;
  const table = kind === "cnpj" ? companyCnpjs : kind === "contact" ? contacts : currentContracts;
  const [r] = await db.select({ c: table.companyId }).from(table).where(eq(table.id, id));
  if (!r) throw new NotFoundError("Registro");
  await guardCompany(u, r.c);
}

export async function guardTask(u: CurrentUser, taskId: string) {
  if (!scoped(u)) return;
  const [t] = await db.select({ ownerId: tasks.ownerId }).from(tasks).where(eq(tasks.id, taskId));
  if (!t) throw new NotFoundError("Tarefa");
  await check(u, t.ownerId, "Tarefa");
}

export async function guardEvent(u: CurrentUser, eventId: string) {
  if (!scoped(u)) return;
  const [e] = await db.select({ ownerId: calendarEvents.ownerId }).from(calendarEvents).where(eq(calendarEvents.id, eventId));
  if (!e) throw new NotFoundError("Compromisso");
  await check(u, e.ownerId, "Compromisso");
}

/** Documento: vale o escopo da cotação, empresa ou tarefa a que pertence. */
export async function guardDocument(u: CurrentUser, docId: string) {
  if (!scoped(u)) return;
  const [d] = await db.select().from(quotationDocuments).where(eq(quotationDocuments.id, docId));
  if (!d) throw new NotFoundError("Documento");
  if (d.quotationId) return guardQuotation(u, d.quotationId);
  if (d.companyId) return guardCompany(u, d.companyId);
  if (d.taskId) return guardTask(u, d.taskId);
  throw new NotFoundError("Documento");
}

/** Responsável efetivo ao gravar: papéis com escopo não atribuem registros a quem está fora dele. */
export async function effectiveOwner(u: CurrentUser, requested: string | null | undefined) {
  if (!scoped(u)) return requested ?? null;
  return scopedOwner(await getScope(u), requested, u.id);
}
