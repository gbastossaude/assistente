import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { quotationDataGaps, type QuotationGap } from "@/lib/domain/quotation-gaps";
import { db } from "../db";
import { companies, contacts, currentContracts, lifeImports, lives, quotationCnpjs, quotationDocuments, quotations } from "../db/schema";

/** Pendências de dados (campo a campo) que devem ser resolvidas antes de enviar a cotação às operadoras. */
export async function getQuotationGaps(quotationId: string): Promise<QuotationGap[]> {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!q) return [];
  const [[company], [contact], contract, [cnpjCount], docs, [livesCount]] = await Promise.all([
    db.select().from(companies).where(eq(companies.id, q.companyId)),
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, q.companyId), isNull(contacts.deletedAt)))
      .orderBy(desc(contacts.isPrimary))
      .limit(1),
    db
      .select({ c: currentContracts, plans: sql<number>`(select count(*)::int from current_contract_plans p where p.contract_id = ${currentContracts.id})`, cost: sql<number | null>`(select sum(p.monthly_cost)::float from current_contract_plans p where p.contract_id = ${currentContracts.id})` })
      .from(currentContracts)
      .where(and(eq(currentContracts.companyId, q.companyId), isNull(currentContracts.deletedAt), eq(currentContracts.active, true)))
      .limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(quotationCnpjs).where(eq(quotationCnpjs.quotationId, quotationId)),
    db
      .selectDistinct({ t: quotationDocuments.docType })
      .from(quotationDocuments)
      .where(and(isNull(quotationDocuments.deletedAt), sql`(${quotationDocuments.quotationId} = ${quotationId} or ${quotationDocuments.companyId} = ${q.companyId})`, sql`${quotationDocuments.status} <> 'invalido'`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(lives)
      .innerJoin(lifeImports, eq(lifeImports.id, lives.importId))
      .where(and(eq(lives.quotationId, quotationId), eq(lifeImports.active, true))),
  ]);
  const cc = contract[0];
  return quotationDataGaps({
    stipulantName: q.stipulantName ?? company?.legalName ?? null,
    estimatedLives: q.estimatedLives,
    holdersCount: q.holdersCount,
    dependentsCount: q.dependentsCount,
    livesImported: livesCount.n,
    modality: q.modality,
    hasCopay: q.hasCopay,
    accommodation: q.accommodation,
    coverageArea: q.coverageArea,
    employeeContributionType: q.employeeContributionType,
    desiredStartDate: q.desiredStartDate,
    targetDate: q.targetDate,
    clientDeadline: q.clientDeadline,
    quotationCnpjs: cnpjCount.n,
    company: { legalName: company?.legalName ?? null, tradeName: company?.tradeName ?? null, mainCnpj: company?.mainCnpj ?? null, segment: company?.segment ?? null, address: company?.address ?? null, city: company?.city ?? null, uf: company?.uf ?? null },
    primaryContact: contact ? { name: contact.name, phone: contact.phone ?? contact.whatsapp, email: contact.email } : null,
    currentContract: cc ? { insurer: cc.c.insurerName ?? (cc.c.insurerId ? "cadastrada" : null), plans: cc.plans, monthlyCost: cc.cost, startDate: cc.c.startDate, anniversaryDate: cc.c.anniversaryDate } : null,
    documents: docs.map((d) => d.t),
  });
}
