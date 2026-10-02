import "server-only";
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { MeetingStatus } from "@/lib/domain/commercial";
import type { EventStatus } from "@/lib/domain/constants";
import { todayISO } from "@/lib/domain/dates";
import { buildMeetingOutputs, type MeetingOutputs } from "@/lib/domain/meetings";
import type { meetingSchema } from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { calendarEvents, companies, meetings, opportunities, tasks, users } from "../db/schema";
import { NotFoundError } from "../errors";
import { assertInScope, getScope, ownerCond, scopedOwner, type DataScope } from "../scope";
import { addTimeline } from "../timeline";
import { localToUtc } from "./calendar";
import { changeOpportunityStage } from "./opportunities";
import { createTask } from "./tasks";

type MeetingData = z.output<typeof meetingSchema>;

const EVENT_STATUS: Record<MeetingStatus, EventStatus> = { agendada: "agendado", realizada: "realizado", remarcada: "remarcado", cancelada: "cancelado" };

async function loadInScope(id: string, user: CurrentUser) {
  const [m] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)));
  if (!m) throw new NotFoundError("Reunião");
  assertInScope(await getScope(user), m.ownerId, "Reunião");
  return m;
}

/** Completa empresa/cliente a partir da oportunidade ou do cadastro da empresa. */
async function resolveParties(input: MeetingData) {
  let { companyId, clientName, companyName } = input;
  if (input.opportunityId) {
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId));
    if (o) {
      companyId ??= o.companyId;
      clientName ??= o.contactName;
      companyName ??= o.clientName;
    }
  }
  if (companyId && !companyName) {
    const [c] = await db.select({ n: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` }).from(companies).where(eq(companies.id, companyId));
    companyName = c?.n ?? null;
  }
  return { companyId, clientName, companyName };
}

async function syncCalendar(meetingId: string, m: MeetingData & { companyId: string | null; clientName: string | null; companyName: string | null; ownerId: string }, existingEventId: string | null, user: CurrentUser) {
  const startsAt = localToUtc(m.date, m.startTime ?? "09:00");
  const endsAt = m.endTime ? localToUtc(m.date, m.endTime) : null;
  const values = {
    title: `Reunião: ${m.title}`,
    type: "reuniao_cliente" as const,
    status: EVENT_STATUS[m.status],
    startsAt,
    endsAt,
    allDay: !m.startTime,
    location: m.location,
    description: m.objective,
    companyId: m.companyId,
    quotationId: m.quotationId,
    opportunityId: m.opportunityId,
    clientName: m.clientName ?? m.companyName,
    advisorName: m.advisorName,
    salesRepName: m.salesRepName,
    ownerId: m.ownerId,
  };
  if (existingEventId) {
    const [e] = await db.update(calendarEvents).set({ ...values, deletedAt: null }).where(eq(calendarEvents.id, existingEventId)).returning({ id: calendarEvents.id });
    if (e) return e.id;
  }
  const [e] = await db
    .insert(calendarEvents)
    .values({ ...values, reminderMinutes: 30, createdBy: user.id })
    .returning({ id: calendarEvents.id });
  await db.update(meetings).set({ calendarEventId: e.id }).where(eq(meetings.id, meetingId));
  return e.id;
}

export async function saveMeeting(id: string | null, input: MeetingData, user: CurrentUser) {
  const scope = await getScope(user);
  const parties = await resolveParties(input);
  const { addToAgenda, ...data } = input;
  const cur = id ? await loadInScope(id, user) : null;
  const ownerId = scopedOwner(scope, data.ownerId, cur?.ownerId ?? user.id);
  const row = { ...data, ...parties, ownerId, updatedBy: user.id };
  let meetingId: string;
  if (cur) {
    await db.update(meetings).set(row).where(eq(meetings.id, cur.id));
    meetingId = cur.id;
    await audit({ userId: user.id, action: "update", entityType: "meeting", entityId: cur.id, summary: `Reunião atualizada: ${data.title}`, changes: diff(cur as unknown as Record<string, unknown>, { ...data, ...parties } as unknown as Record<string, unknown>) });
  } else {
    const [m] = await db
      .insert(meetings)
      .values({ ...row, createdBy: user.id })
      .returning();
    meetingId = m.id;
    await audit({ userId: user.id, action: "create", entityType: "meeting", entityId: m.id, summary: `Reunião criada: ${data.title}` });
    await addTimeline({ type: "reuniao", description: `Reunião agendada: ${data.title}`, userId: user.id, companyId: parties.companyId, opportunityId: data.opportunityId, quotationId: data.quotationId, nextAction: data.title, nextActionAt: data.date });
  }
  if (addToAgenda) await syncCalendar(meetingId, { ...input, ...parties, ownerId }, cur?.calendarEventId ?? null, user);
  else if (cur?.calendarEventId) await db.update(calendarEvents).set({ deletedAt: new Date() }).where(eq(calendarEvents.id, cur.calendarEventId));
  return meetingId;
}

/**
 * Gera ata resumida, pendências, próximos passos e WhatsApp de follow-up; opcionalmente cria a tarefa de retorno.
 * A reunião passa a "realizada" (se estava agendada) e a ata entra na timeline do cliente.
 */
export async function generateMeetingOutputs(id: string, opts: { createTask: boolean }, user: CurrentUser): Promise<MeetingOutputs & { taskId: string | null }> {
  const m = await loadInScope(id, user);
  const out = buildMeetingOutputs(
    { ...m, startTime: m.startTime, endTime: m.endTime },
    { consultant: user.name.replace(/\s*\(.*\)$/, ""), today: todayISO() },
  );
  let taskId: string | null = m.followupTaskId;
  if (opts.createTask) {
    const [existing] = taskId ? await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt))) : [];
    if (!existing) {
      const t = await createTask(
        {
          title: out.followupTask.title,
          description: `Retorno combinado na reunião de ${m.date.split("-").reverse().join("/")}.\n\nPróximos passos:\n${out.nextSteps.map((s) => `• ${s}`).join("\n")}`,
          companyId: m.companyId,
          quotationId: m.quotationId,
          insurerId: null,
          opportunityId: m.opportunityId,
          meetingId: m.id,
          ownerId: m.ownerId ?? user.id,
          priority: "alta",
          scheduledDate: out.followupTask.dueDate,
          scheduledTime: null,
          dueDate: out.followupTask.dueDate,
          status: "a_fazer",
          category: "follow_up",
          checklist: out.pendencies.slice(0, 20).map((p) => ({ text: p.slice(0, 300), done: false })),
          notes: null,
          recurrence: "nenhuma",
          recurrenceUntil: null,
          reminderAt: null,
        },
        user,
        { source: "reuniao" },
      );
      taskId = t.id;
    }
  }
  const status: MeetingStatus = m.status === "agendada" ? "realizada" : m.status;
  await db
    .update(meetings)
    .set({ minutes: out.minutes, followupMessage: out.whatsapp, minutesGeneratedAt: new Date(), followupTaskId: taskId, status, updatedBy: user.id })
    .where(eq(meetings.id, m.id));
  if (m.calendarEventId) await db.update(calendarEvents).set({ status: EVENT_STATUS[status] }).where(eq(calendarEvents.id, m.calendarEventId));
  if (m.opportunityId) {
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, m.opportunityId));
    if (o && !o.nextFollowupAt) await db.update(opportunities).set({ nextFollowupAt: out.followupTask.dueDate, nextStep: out.nextSteps[0]?.slice(0, 500) ?? null }).where(eq(opportunities.id, o.id));
    if (o?.stage === "primeiro_contato" || o?.stage === "lead_novo") {
      // Reunião de diagnóstico realizada: a oportunidade avança para "Diagnóstico realizado".
      await changeOpportunityStage({ id: o.id, stage: "diagnostico", note: "Reunião de diagnóstico realizada", lostReason: null, nextFollowupAt: null }, user);
    }
  }
  if (!m.minutesGeneratedAt) {
    await addTimeline({ type: "reuniao", description: `Ata da reunião “${m.title}”:\n${out.minutes.split("\n").slice(1).join("\n").slice(0, 3000)}`, userId: user.id, companyId: m.companyId, quotationId: m.quotationId, opportunityId: m.opportunityId, nextAction: out.nextSteps[0] ?? null, nextActionAt: out.followupTask.dueDate, metadata: { meetingId: m.id } });
  }
  await audit({ userId: user.id, action: "update", entityType: "meeting", entityId: m.id, summary: `Ata gerada: ${m.title}${taskId && taskId !== m.followupTaskId ? " (tarefa de retorno criada)" : ""}` });
  return { ...out, taskId };
}

export async function softDeleteMeeting(id: string, user: CurrentUser) {
  const m = await loadInScope(id, user);
  await db.update(meetings).set({ deletedAt: new Date(), updatedBy: user.id }).where(eq(meetings.id, id));
  if (m.calendarEventId) await db.update(calendarEvents).set({ deletedAt: new Date() }).where(eq(calendarEvents.id, m.calendarEventId));
  await audit({ userId: user.id, action: "delete", entityType: "meeting", entityId: id, summary: `Reunião excluída (lógica): ${m.title}` });
}

export interface MeetingFilters {
  q?: string | null;
  status?: MeetingStatus | null;
  ownerId?: string | null;
  from?: string | null;
  to?: string | null;
  opportunityId?: string | null;
}

export async function listMeetings(f: MeetingFilters, scope: DataScope) {
  const conds: (SQL | undefined)[] = [isNull(meetings.deletedAt), ownerCond(scope, meetings.ownerId)];
  if (f.status) conds.push(eq(meetings.status, f.status));
  if (f.ownerId) conds.push(eq(meetings.ownerId, f.ownerId));
  if (f.from) conds.push(gte(meetings.date, f.from));
  if (f.to) conds.push(lte(meetings.date, f.to));
  if (f.opportunityId) conds.push(eq(meetings.opportunityId, f.opportunityId));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(ilike(meetings.title, like), ilike(meetings.clientName, like), ilike(meetings.companyName, like), ilike(meetings.advisorName, like), ilike(meetings.salesRepName, like)));
  }
  return db
    .select({ m: meetings, ownerName: users.name, opportunityName: opportunities.clientName })
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.ownerId))
    .leftJoin(opportunities, eq(opportunities.id, meetings.opportunityId))
    .where(and(...conds))
    .orderBy(desc(meetings.date), asc(meetings.startTime))
    .limit(500);
}
export type MeetingRow = Awaited<ReturnType<typeof listMeetings>>[number];

export async function getMeeting(id: string, user: CurrentUser) {
  const m = await loadInScope(id, user);
  const [o] = m.opportunityId ? await db.select({ id: opportunities.id, clientName: opportunities.clientName, stage: opportunities.stage }).from(opportunities).where(eq(opportunities.id, m.opportunityId)) : [];
  const [t] = m.followupTaskId ? await db.select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate }).from(tasks).where(and(eq(tasks.id, m.followupTaskId), isNull(tasks.deletedAt))) : [];
  return { m, opportunity: o ?? null, followupTask: t ?? null };
}

export async function findMeetings(term: string, scope: DataScope, limit = 3) {
  const like = `%${term.trim()}%`;
  return db
    .select()
    .from(meetings)
    .where(and(isNull(meetings.deletedAt), ownerCond(scope, meetings.ownerId), or(ilike(meetings.title, like), ilike(meetings.clientName, like), ilike(meetings.companyName, like))))
    .orderBy(desc(meetings.date))
    .limit(limit);
}
