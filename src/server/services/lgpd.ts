import "server-only";
import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { companies, contacts, interactions, meetings, opportunities } from "../db/schema";
import { BusinessError } from "../errors";
import { anonymizeOpportunity } from "./opportunities";

/** LGPD — localiza registros com dados pessoais de um titular (nome, e-mail, telefone ou documento). */
export async function findDataSubject(term: string) {
  const t = term.trim();
  if (t.length < 3) throw new BusinessError("Digite ao menos 3 caracteres (nome, e-mail, telefone ou documento).");
  const like = `%${t}%`;
  const digits = t.replace(/\D/g, "");
  const [cts, opps, mts] = await Promise.all([
    db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email, phone: sql<string | null>`coalesce(${contacts.phone}, ${contacts.whatsapp})`, company: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(and(isNull(contacts.deletedAt), or(ilike(contacts.name, like), ilike(contacts.email, like), ilike(contacts.phone, like), ilike(contacts.whatsapp, like))))
      .limit(50),
    db
      .select({ id: opportunities.id, name: opportunities.clientName, contact: opportunities.contactName, email: opportunities.email, phone: opportunities.phone, document: opportunities.document, anonymizedAt: opportunities.anonymizedAt })
      .from(opportunities)
      .where(
        and(
          isNull(opportunities.deletedAt),
          or(ilike(opportunities.clientName, like), ilike(opportunities.contactName, like), ilike(opportunities.email, like), ilike(opportunities.phone, like), digits.length >= 6 ? sql`regexp_replace(coalesce(${opportunities.document}, ''), '\\D', '', 'g') like ${`%${digits}%`}` : sql`false`),
        ),
      )
      .limit(50),
    db
      .select({ id: meetings.id, title: meetings.title, client: meetings.clientName, date: meetings.date })
      .from(meetings)
      .where(and(isNull(meetings.deletedAt), or(ilike(meetings.clientName, like), ilike(meetings.participants, like), ilike(meetings.title, like))))
      .limit(50),
  ]);
  return { contacts: cts, opportunities: opps, meetings: mts };
}

/** Anonimiza os registros selecionados (irreversível). Mantém dados agregados para relatórios. */
export async function anonymizeSubject(sel: { contactIds: string[]; opportunityIds: string[]; meetingIds: string[] }, user: CurrentUser) {
  const total = sel.contactIds.length + sel.opportunityIds.length + sel.meetingIds.length;
  if (!total) throw new BusinessError("Selecione ao menos um registro.");
  if (sel.contactIds.length) {
    await db.update(contacts).set({ name: "Contato anonimizado", email: null, phone: null, whatsapp: null, notes: null, roleTitle: null }).where(inArray(contacts.id, sel.contactIds));
  }
  for (const id of sel.opportunityIds) await anonymizeOpportunity(id, user);
  if (sel.meetingIds.length) {
    const rows = await db.select({ id: meetings.id, questions: meetings.questions }).from(meetings).where(inArray(meetings.id, sel.meetingIds));
    for (const m of rows) {
      await db
        .update(meetings)
        .set({
          clientName: null,
          participants: null,
          summary: "[conteúdo anonimizado — LGPD]",
          minutes: null,
          followupMessage: null,
          questions: m.questions.map((q) => ({ ...q, answer: q.answer ? "[anonimizado]" : "", note: "" })),
          updatedBy: user.id,
        })
        .where(eq(meetings.id, m.id));
    }
    await db
      .update(interactions)
      .set({ description: "[conteúdo anonimizado — LGPD]" })
      .where(sql`${interactions.metadata}->>'meetingId' in (${sql.join(sel.meetingIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  await audit({ userId: user.id, action: "update", entityType: "lgpd", summary: `Anonimização LGPD: ${sel.contactIds.length} contato(s), ${sel.opportunityIds.length} oportunidade(s), ${sel.meetingIds.length} reunião(ões)`, sensitive: true });
  return total;
}
