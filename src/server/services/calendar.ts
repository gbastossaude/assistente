import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { z } from "zod";
import { APP_TIMEZONE } from "@/lib/domain/dates";
import type { eventSchema } from "@/lib/validation/schemas";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { calendarEvents, companies, meetings, quotations, tasks, users } from "../db/schema";
import { NotFoundError } from "../errors";
import { addTimeline } from "../timeline";

/** Converte data+hora local (fuso de negócio) em instante UTC. */
export function localToUtc(dateISO: string, time: string | null): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = (time ?? "12:00").split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  // descobre o offset do fuso naquele instante
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(guess)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

type EventData = z.output<typeof eventSchema>;

function toRow(input: EventData) {
  const startsAt = localToUtc(input.date, input.allDay ? "12:00" : input.startTime);
  const endsAt = !input.allDay && input.endTime ? localToUtc(input.date, input.endTime) : null;
  const { date: _d, startTime: _s, endTime: _e, ...rest } = input;
  void _d;
  void _s;
  void _e;
  return { ...rest, startsAt, endsAt };
}

export async function saveEvent(id: string | null, input: EventData, user: CurrentUser) {
  let companyId = input.companyId;
  if (input.quotationId && !companyId) {
    const [q] = await db.select({ c: quotations.companyId }).from(quotations).where(eq(quotations.id, input.quotationId));
    companyId = q?.c ?? null;
  }
  const row = { ...toRow(input), companyId, ownerId: input.ownerId ?? user.id };
  if (id) {
    // Mudou horário/lembrete/status: o lembrete volta a valer.
    await db.update(calendarEvents).set({ ...row, reminderSentAt: null }).where(eq(calendarEvents.id, id));
    await audit({ userId: user.id, action: "update", entityType: "calendar_event", entityId: id, summary: `Compromisso atualizado: ${input.title}` });
    return id;
  }
  const [e] = await db
    .insert(calendarEvents)
    .values({ ...row, createdBy: user.id })
    .returning();
  await audit({ userId: user.id, action: "create", entityType: "calendar_event", entityId: e.id, summary: `Compromisso criado: ${input.title}` });
  if (companyId || input.quotationId) {
    await addTimeline({ type: "reuniao", description: `Compromisso agendado: ${input.title}`, userId: user.id, companyId, quotationId: input.quotationId, nextAction: input.title, nextActionAt: input.date });
  }
  return e.id;
}

export async function deleteEvent(id: string, user: CurrentUser) {
  const [e] = await db.update(calendarEvents).set({ deletedAt: new Date() }).where(eq(calendarEvents.id, id)).returning();
  if (!e) throw new NotFoundError("Compromisso");
  await audit({ userId: user.id, action: "delete", entityType: "calendar_event", entityId: id, summary: `Compromisso excluído: ${e.title}` });
}

/** Eventos + tarefas com data no intervalo [from, to) — a agenda funciona sem integração externa. */
export async function listAgenda(from: Date, to: Date, opts: { ownerId?: string | null; ownerIds?: string[] | null } = {}) {
  const scopeCond = (col: typeof calendarEvents.ownerId | typeof tasks.ownerId) => (opts.ownerIds ? (opts.ownerIds.length ? inArray(col, opts.ownerIds) : sql`false`) : undefined);
  const events = await db
    .select({
      e: calendarEvents,
      companyName: sql<string | null>`coalesce(${companies.tradeName}, ${companies.legalName})`,
      quotationCode: quotations.code,
      ownerName: users.name,
      meetingId: meetings.id,
    })
    .from(calendarEvents)
    .leftJoin(meetings, and(eq(meetings.calendarEventId, calendarEvents.id), isNull(meetings.deletedAt)))
    .leftJoin(companies, eq(companies.id, calendarEvents.companyId))
    .leftJoin(quotations, eq(quotations.id, calendarEvents.quotationId))
    .leftJoin(users, eq(users.id, calendarEvents.ownerId))
    .where(
      and(
        isNull(calendarEvents.deletedAt),
        gte(calendarEvents.startsAt, from),
        lt(calendarEvents.startsAt, to),
        opts.ownerId ? eq(calendarEvents.ownerId, opts.ownerId) : undefined,
        scopeCond(calendarEvents.ownerId),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt));
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = to.toISOString().slice(0, 10);
  const taskRows = await db
    .select({ t: tasks, companyName: sql<string | null>`coalesce(${companies.tradeName}, ${companies.legalName})` })
    .from(tasks)
    .leftJoin(companies, eq(companies.id, tasks.companyId))
    .where(
      and(
        isNull(tasks.deletedAt),
        sql`${tasks.status} in ('a_fazer','em_andamento','aguardando_terceiro')`,
        sql`coalesce(${tasks.scheduledDate}, ${tasks.dueDate}) >= ${fromISO} and coalesce(${tasks.scheduledDate}, ${tasks.dueDate}) <= ${toISO}`,
        opts.ownerId ? eq(tasks.ownerId, opts.ownerId) : undefined,
        scopeCond(tasks.ownerId),
      ),
    );
  return { events, tasks: taskRows };
}
