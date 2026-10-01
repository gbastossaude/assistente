import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { formatCnpj } from "@/lib/domain/cnpj";
import { QUOTATION_STATUS_LABELS, DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/constants";
import { db } from "../db";
import {
  companies,
  companyCnpjs,
  contacts,
  currentContractPlans,
  currentContracts,
  insurers,
  quotationDocuments,
  quotationInsurers,
  quotations,
  tasks,
} from "../db/schema";

export interface SearchHit {
  kind: "empresa" | "cnpj" | "contato" | "cotacao" | "operadora" | "protocolo" | "plano" | "documento" | "tarefa";
  title: string;
  subtitle?: string;
  href: string;
}

/** Busca global (empresa, CNPJ, contato, cotação, operadora, protocolo, plano, documento, tarefa). */
export async function globalSearch(term: string, limitPerKind = 8): Promise<SearchHit[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const alnum = q.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const name = sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`;

  const [cos, cnpjs, cts, qts, ins, prots, plans, docs, tks] = await Promise.all([
    db
      .select({ id: companies.id, name, legal: companies.legalName, group: companies.economicGroup })
      .from(companies)
      .where(and(isNull(companies.deletedAt), sql`(${companies.legalName} ilike ${like} or ${companies.tradeName} ilike ${like} or ${companies.economicGroup} ilike ${like})`))
      .limit(limitPerKind),
    alnum.length >= 4
      ? db
          .select({ cnpj: companyCnpjs.cnpj, companyId: companies.id, name })
          .from(companyCnpjs)
          .innerJoin(companies, eq(companies.id, companyCnpjs.companyId))
          .where(and(isNull(companies.deletedAt), sql`${companyCnpjs.cnpj} like ${"%" + alnum + "%"}`))
          .limit(limitPerKind)
      : Promise.resolve([]),
    db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email, companyId: contacts.companyId, company: name })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(and(isNull(contacts.deletedAt), sql`(${contacts.name} ilike ${like} or ${contacts.email} ilike ${like} or ${contacts.phone} ilike ${like})`))
      .limit(limitPerKind),
    db
      .select({ id: quotations.id, code: quotations.code, status: quotations.status, company: name, lives: quotations.estimatedLives })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .where(and(isNull(quotations.deletedAt), sql`(${quotations.code} ilike ${like} or ${companies.legalName} ilike ${like} or ${companies.tradeName} ilike ${like} or ${quotations.stipulantName} ilike ${like})`))
      .limit(limitPerKind),
    db
      .select({ id: insurers.id, name: insurers.name })
      .from(insurers)
      .where(and(isNull(insurers.deletedAt), sql`${insurers.name} ilike ${like}`))
      .limit(limitPerKind),
    db
      .select({ protocol: quotationInsurers.protocol, quotationId: quotations.id, code: quotations.code, insurer: insurers.name })
      .from(quotationInsurers)
      .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
      .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
      .where(and(isNull(quotations.deletedAt), sql`${quotationInsurers.protocol} ilike ${like}`))
      .limit(limitPerKind),
    db
      .selectDistinct({ plan: currentContractPlans.planName, companyId: currentContracts.companyId, company: name, insurer: currentContracts.insurerName })
      .from(currentContractPlans)
      .innerJoin(currentContracts, eq(currentContracts.id, currentContractPlans.contractId))
      .innerJoin(companies, eq(companies.id, currentContracts.companyId))
      .where(and(isNull(currentContracts.deletedAt), sql`${currentContractPlans.planName} ilike ${like}`))
      .limit(limitPerKind),
    db
      .select({ id: quotationDocuments.id, fileName: quotationDocuments.fileName, docType: quotationDocuments.docType, quotationId: quotationDocuments.quotationId, companyId: quotationDocuments.companyId })
      .from(quotationDocuments)
      .where(and(isNull(quotationDocuments.deletedAt), sql`${quotationDocuments.fileName} ilike ${like}`))
      .limit(limitPerKind),
    db
      .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate })
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), sql`${tasks.title} ilike ${like}`))
      .limit(limitPerKind),
  ]);

  return [
    ...qts.map((r) => ({ kind: "cotacao" as const, title: `${r.code} — ${r.company}`, subtitle: `${QUOTATION_STATUS_LABELS[r.status]} · ${r.lives} vidas`, href: `/cotacoes/${r.id}` })),
    ...cos.map((r) => ({ kind: "empresa" as const, title: r.name, subtitle: [r.legal !== r.name ? r.legal : null, r.group].filter(Boolean).join(" · ") || undefined, href: `/empresas/${r.id}` })),
    ...cnpjs.map((r) => ({ kind: "cnpj" as const, title: formatCnpj(r.cnpj), subtitle: r.name, href: `/empresas/${r.companyId}` })),
    ...cts.map((r) => ({ kind: "contato" as const, title: r.name, subtitle: [r.company, r.email].filter(Boolean).join(" · "), href: `/empresas/${r.companyId}?tab=contatos` })),
    ...ins.map((r) => ({ kind: "operadora" as const, title: r.name, href: `/operadoras/${r.id}` })),
    ...prots.map((r) => ({ kind: "protocolo" as const, title: `Protocolo ${r.protocol}`, subtitle: `${r.insurer} · ${r.code}`, href: `/cotacoes/${r.quotationId}?tab=operadoras` })),
    ...plans.map((r) => ({ kind: "plano" as const, title: r.plan, subtitle: [r.company, r.insurer].filter(Boolean).join(" · "), href: `/empresas/${r.companyId}?tab=contratos` })),
    ...docs.map((r) => ({
      kind: "documento" as const,
      title: r.fileName,
      subtitle: DOCUMENT_TYPE_LABELS[r.docType as DocumentType] ?? r.docType,
      href: r.quotationId ? `/cotacoes/${r.quotationId}?tab=documentos` : `/documentos?q=${encodeURIComponent(r.fileName)}`,
    })),
    ...tks.map((r) => ({ kind: "tarefa" as const, title: r.title, subtitle: r.dueDate ? `Prazo ${r.dueDate.split("-").reverse().join("/")}` : undefined, href: `/tarefas?id=${r.id}` })),
  ];
}
