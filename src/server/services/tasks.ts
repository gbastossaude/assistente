import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { OPEN_TASK_STATUSES, TASK_STATUS_LABELS, type Recurrence, type TaskStatus } from "@/lib/domain/constants";
import { addDays, addMonths, todayISO } from "@/lib/domain/dates";
import type { completeTaskSchema, taskSchema } from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { companies, insurers, quotations, tasks, users } from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { addTimeline } from "../timeline";

type TaskData = z.output<typeof taskSchema>;
type Links = "opportunityId" | "meetingId" | "campaignId";
/** Vínculos comerciais são opcionais para quem cria tarefas por código (automações, assistente). */
export type NewTaskData = Omit<TaskData, Links> & Partial<Pick<TaskData, Links>>;

async function resolveCompany(data: { companyId: string | null; quotationId: string | null }) {
  if (data.quotationId && !data.companyId) {
    const [q] = await db.select({ companyId: quotations.companyId }).from(quotations).where(eq(quotations.id, data.quotationId));
    return q?.companyId ?? null;
  }
  return data.companyId;
}

export async function createTask(input: NewTaskData, user: CurrentUser, extra: { source?: string; parentTaskId?: string | null } = {}) {
  const companyId = await resolveCompany(input);
  const [t] = await db
    .insert(tasks)
    .values({
      ...input,
      companyId,
      ownerId: input.ownerId ?? user.id,
      reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
      source: extra.source ?? "manual",
      parentTaskId: extra.parentTaskId ?? null,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning();
  await audit({ userId: user.id, action: "create", entityType: "task", entityId: t.id, summary: `Tarefa criada: ${t.title}` });
  if (t.quotationId) await addTimeline({ type: "sistema", description: `Tarefa criada: ${t.title}`, userId: user.id, quotationId: t.quotationId, companyId });
  return t;
}

export async function updateTask(id: string, input: TaskData, user: CurrentUser) {
  const [cur] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
  if (!cur) throw new NotFoundError("Tarefa");
  const companyId = await resolveCompany(input);
  const reminderAt = input.reminderAt ? new Date(input.reminderAt) : null;
  await db
    .update(tasks)
    .set({
      ...input,
      companyId,
      reminderAt,
      reminderSentAt: reminderAt?.getTime() !== cur.reminderAt?.getTime() ? null : cur.reminderSentAt,
      completedAt: input.status === "concluida" ? (cur.completedAt ?? new Date()) : null,
      updatedBy: user.id,
    })
    .where(eq(tasks.id, id));
  const changes = diff(cur as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
  const deadline = "dueDate" in changes || "scheduledDate" in changes;
  await audit({ userId: user.id, action: deadline ? "deadline_change" : "update", entityType: "task", entityId: id, summary: `Tarefa atualizada: ${input.title}`, changes });
  if (input.status === "concluida" && cur.status !== "concluida") await afterComplete({ ...cur, ...input, companyId, reminderAt }, user);
}

function nextOccurrence(date: string, r: Recurrence) {
  switch (r) {
    case "diaria":
      return addDays(date, 1);
    case "semanal":
      return addDays(date, 7);
    case "quinzenal":
      return addDays(date, 14);
    case "mensal":
      return addMonths(date, 1);
    default:
      return null;
  }
}

async function afterComplete(t: typeof tasks.$inferSelect, user: CurrentUser) {
  if (t.quotationId || t.companyId) {
    await addTimeline({ type: "tarefa", description: `Tarefa concluída: ${t.title}`, userId: user.id, quotationId: t.quotationId, companyId: t.companyId });
  }
  // Recorrência: cria a próxima ocorrência
  if (t.recurrence !== "nenhuma") {
    const base = t.dueDate ?? t.scheduledDate;
    const next = base ? nextOccurrence(base, t.recurrence) : null;
    if (next && (!t.recurrenceUntil || next <= t.recurrenceUntil)) {
      const shift = (d: string | null) => (d ? nextOccurrence(d, t.recurrence) : null);
      await db.insert(tasks).values({
        title: t.title,
        description: t.description,
        companyId: t.companyId,
        quotationId: t.quotationId,
        insurerId: t.insurerId,
        opportunityId: t.opportunityId,
        campaignId: t.campaignId,
        ownerId: t.ownerId,
        priority: t.priority,
        scheduledDate: shift(t.scheduledDate),
        scheduledTime: t.scheduledTime,
        dueDate: shift(t.dueDate),
        category: t.category,
        checklist: t.checklist.map((c) => ({ ...c, done: false })),
        notes: t.notes,
        recurrence: t.recurrence,
        recurrenceUntil: t.recurrenceUntil,
        source: "recorrencia",
        parentTaskId: t.id,
        createdBy: user.id,
      });
    }
  }
}

/** Conclui a tarefa e, opcionalmente, já cadastra a próxima ação (seção 14). */
export async function completeTask(input: z.output<typeof completeTaskSchema>, user: CurrentUser) {
  const [t] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, input.id), isNull(tasks.deletedAt)));
  if (!t) throw new NotFoundError("Tarefa");
  if (t.status === "concluida") throw new BusinessError("Tarefa já concluída.");
  await db.update(tasks).set({ status: "concluida", completedAt: new Date(), updatedBy: user.id }).where(eq(tasks.id, t.id));
  await audit({ userId: user.id, action: "status_change", entityType: "task", entityId: t.id, summary: `Tarefa concluída: ${t.title}` });
  await afterComplete(t, user);
  if (input.nextAction) {
    await createTask(
      {
        title: input.nextAction,
        description: `Próxima ação após: ${t.title}`,
        companyId: t.companyId,
        quotationId: t.quotationId,
        insurerId: t.insurerId,
        opportunityId: t.opportunityId,
        ownerId: input.nextActionOwnerId ?? t.ownerId,
        priority: t.priority,
        scheduledDate: input.nextActionDate,
        scheduledTime: null,
        dueDate: input.nextActionDate,
        status: "a_fazer",
        category: t.category as TaskData["category"],
        checklist: [],
        notes: null,
        recurrence: "nenhuma",
        recurrenceUntil: null,
        reminderAt: null,
      },
      user,
      { parentTaskId: t.id },
    );
  }
}

export async function setTaskStatus(id: string, status: TaskStatus, user: CurrentUser) {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!t || t.deletedAt) throw new NotFoundError("Tarefa");
  if (status === "concluida") return completeTask({ id, nextAction: null, nextActionDate: null, nextActionOwnerId: null }, user);
  await db
    .update(tasks)
    .set({ status, completedAt: null, updatedBy: user.id })
    .where(eq(tasks.id, id));
  await audit({ userId: user.id, action: "status_change", entityType: "task", entityId: id, summary: `Tarefa "${t.title}": ${TASK_STATUS_LABELS[t.status]} → ${TASK_STATUS_LABELS[status]}` });
}

export async function toggleTaskChecklistItem(id: string, index: number, user: CurrentUser) {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!t) throw new NotFoundError("Tarefa");
  const checklist = t.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
  await db.update(tasks).set({ checklist, updatedBy: user.id }).where(eq(tasks.id, id));
}

export async function softDeleteTask(id: string, user: CurrentUser) {
  const [t] = await db.update(tasks).set({ deletedAt: new Date(), updatedBy: user.id }).where(eq(tasks.id, id)).returning();
  if (!t) throw new NotFoundError("Tarefa");
  await audit({ userId: user.id, action: "delete", entityType: "task", entityId: id, summary: `Tarefa excluída (lógica): ${t.title}` });
}

export interface TaskFilters {
  q?: string | null;
  ownerId?: string | null;
  status?: TaskStatus[] | null;
  view?: "abertas" | "hoje" | "atrasadas" | "semana" | "concluidas" | "todas" | null;
  quotationId?: string | null;
  companyId?: string | null;
  priority?: string | null;
  category?: string | null;
  from?: string | null;
  to?: string | null;
  ownerIds?: string[] | null;
}

const effectiveDate = sql`coalesce(${tasks.dueDate}, ${tasks.scheduledDate})`;

export async function listTasks(f: TaskFilters = {}) {
  const today = todayISO();
  const conds: SQL[] = [isNull(tasks.deletedAt)];
  const view = f.view ?? "abertas";
  if (f.status?.length) conds.push(inArray(tasks.status, f.status));
  else if (view === "concluidas") conds.push(eq(tasks.status, "concluida"));
  else if (view !== "todas") conds.push(inArray(tasks.status, OPEN_TASK_STATUSES));
  if (view === "hoje") conds.push(or(eq(tasks.dueDate, today), eq(tasks.scheduledDate, today))!);
  if (view === "atrasadas") conds.push(sql`${tasks.dueDate} < ${today}`);
  if (view === "semana") conds.push(sql`${effectiveDate} between ${today} and ${addDays(today, 7)}`);
  if (f.ownerId) conds.push(eq(tasks.ownerId, f.ownerId));
  if (f.ownerIds) conds.push(f.ownerIds.length ? inArray(tasks.ownerId, f.ownerIds) : sql`false`);
  if (f.quotationId) conds.push(eq(tasks.quotationId, f.quotationId));
  if (f.companyId) conds.push(eq(tasks.companyId, f.companyId));
  if (f.priority) conds.push(eq(tasks.priority, f.priority as never));
  if (f.category) conds.push(eq(tasks.category, f.category));
  if (f.from) conds.push(gte(sql`${effectiveDate}`, f.from));
  if (f.to) conds.push(lte(sql`${effectiveDate}`, f.to));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(sql`(${tasks.title} ilike ${like} or ${tasks.description} ilike ${like} or ${companies.legalName} ilike ${like} or ${companies.tradeName} ilike ${like} or ${quotations.code} ilike ${like})`);
  }
  return db
    .select({
      t: tasks,
      companyName: sql<string | null>`coalesce(${companies.tradeName}, ${companies.legalName})`,
      quotationCode: quotations.code,
      insurerName: insurers.name,
      ownerName: users.name,
    })
    .from(tasks)
    .leftJoin(companies, eq(companies.id, tasks.companyId))
    .leftJoin(quotations, eq(quotations.id, tasks.quotationId))
    .leftJoin(insurers, eq(insurers.id, tasks.insurerId))
    .leftJoin(users, eq(users.id, tasks.ownerId))
    .where(and(...conds))
    .orderBy(asc(sql`coalesce(${effectiveDate}, '2999-12-31')`), desc(tasks.priority), asc(tasks.scheduledTime))
    .limit(1000);
}
export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

export async function getTask(id: string) {
  const [r] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
  return r ?? null;
}
