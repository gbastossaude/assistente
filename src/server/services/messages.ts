import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { formatDateBR } from "@/lib/domain/dates";
import { formatPendencyList, missingPlaceholders, renderTemplate } from "@/lib/domain/messages";
import { evaluateSpecialCase, SPECIAL_CASE_KINDS } from "@/lib/domain/special-cases";
import { db } from "../db";
import { companies, contacts, insurers, messageTemplates, quotationChecklistItems, quotationInsurers, quotations, specialCaseEntries, specialCases } from "../db/schema";
import { NotFoundError } from "../errors";

/**
 * Itens a solicitar ao cliente: somente obrigatórios aplicáveis ainda pendentes + pendências de situações
 * especiais. Itens recebidos/validados/dispensados são omitidos (seção 34).
 */
export async function clientRequestItems(quotationId: string, includeOptional = false) {
  const items = await db
    .select()
    .from(quotationChecklistItems)
    .where(eq(quotationChecklistItems.quotationId, quotationId))
    .orderBy(asc(quotationChecklistItems.sortOrder));
  const list = items
    .filter((i) => i.applicable && i.status === "pendente" && (i.required || includeOptional))
    .filter((i) => i.category !== "situacoes_especiais" || i.itemKey === "situacoes_declaradas")
    .map((i) => i.requestText || i.label);
  const [sums, entries] = await Promise.all([
    db.select().from(specialCases).where(eq(specialCases.quotationId, quotationId)),
    db.select().from(specialCaseEntries).where(eq(specialCaseEntries.quotationId, quotationId)),
  ]);
  for (const kind of SPECIAL_CASE_KINDS) {
    const s = sums.find((x) => x.kind === kind);
    if (s?.has) list.push(...evaluateSpecialCase({ kind, has: s.has, quantity: s.quantity }, entries).map((i) => i.message));
  }
  return [...new Set(list)];
}

export async function listTemplates(audience?: "cliente" | "operadora") {
  return db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.active, true), audience ? eq(messageTemplates.audience, audience) : undefined))
    .orderBy(asc(messageTemplates.name));
}

export interface GeneratedMessage {
  templateKey: string;
  channel: string;
  subject: string | null;
  body: string;
  missing: string[];
  items: string[];
  to: string | null;
}

export async function generateMessage(
  opts: { quotationId: string; templateKey: string; quotationInsurerId?: string | null; includeOptional?: boolean },
  senderName: string,
): Promise<GeneratedMessage> {
  const [tpl] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, opts.templateKey));
  if (!tpl) throw new NotFoundError("Template");
  const [row] = await db
    .select({ q: quotations, company: companies })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(and(eq(quotations.id, opts.quotationId), isNull(quotations.deletedAt)));
  if (!row) throw new NotFoundError("Cotação");
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.companyId, row.company.id), isNull(contacts.deletedAt)))
    .orderBy(desc(contacts.isPrimary), asc(contacts.createdAt))
    .limit(1);
  const items = await clientRequestItems(opts.quotationId, opts.includeOptional);
  const channel = tpl.channel === "whatsapp" ? "whatsapp" : "email";

  let qi: { qi: typeof quotationInsurers.$inferSelect; insurer: typeof insurers.$inferSelect } | undefined;
  if (opts.quotationInsurerId) {
    [qi] = await db
      .select({ qi: quotationInsurers, insurer: insurers })
      .from(quotationInsurers)
      .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
      .where(and(eq(quotationInsurers.id, opts.quotationInsurerId), eq(quotationInsurers.quotationId, opts.quotationId)));
  }
  const values: Record<string, string | null> = {
    empresa: row.company.tradeName ?? row.company.legalName,
    contato: contact?.name ?? null,
    cotacao: row.q.code,
    vidas: String(row.q.estimatedLives),
    tipo: row.q.processType,
    pendencias: formatPendencyList(items, channel),
    data_limite: row.q.targetDate ? formatDateBR(row.q.targetDate) : null,
    data_renovacao: row.q.renewalDate ? formatDateBR(row.q.renewalDate) : null,
    data_renovacao_frase: row.q.renewalDate ? ` (renovação em ${formatDateBR(row.q.renewalDate)})` : "",
    responsavel: senderName,
    operadora: qi?.insurer.name ?? null,
    contato_operadora: qi?.qi.insurerContact ?? qi?.insurer.contactName ?? null,
    protocolo: qi?.qi.protocol ?? null,
    data_envio: qi?.qi.sentAt ? formatDateBR(qi.qi.sentAt) : null,
    data_retorno: qi?.qi.expectedReturnAt ? formatDateBR(qi.qi.expectedReturnAt) : null,
    pendencias_operadora: qi?.qi.pendingNotes ?? null,
  };
  const text = `${tpl.subject ?? ""}\n${tpl.body}`;
  return {
    templateKey: tpl.key,
    channel: tpl.channel,
    subject: tpl.subject ? renderTemplate(tpl.subject, values) : null,
    body: renderTemplate(tpl.body, values),
    missing: missingPlaceholders(text, values),
    items,
    to: tpl.audience === "operadora" ? (qi?.qi.insurerEmail ?? qi?.insurer.email ?? null) : tpl.channel === "whatsapp" ? (contact?.whatsapp ?? contact?.phone ?? null) : (contact?.email ?? null),
  };
}
