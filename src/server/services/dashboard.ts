import "server-only";
import { Q_ID } from "../db/qualified";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  CLIENT_PENDING_STATUSES,
  INSURER_WAITING_STATUSES,
  LARGE_ACCOUNT_MIN_LIVES,
  OPEN_TASK_STATUSES,
  type Priority,
} from "@/lib/domain/constants";
import { addDays, diffDays, todayISO } from "@/lib/domain/dates";
import { rankPriorities, type PriorityCandidate } from "@/lib/domain/priorities";
import { db } from "../db";
import { companies, pendencies, quotationInsurers, quotations, renewals, tasks, insurers } from "../db/schema";
import { getRule, getSetting } from "../settings";
import { listTimeline } from "./interactions";

const companyName = sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`;
const openQuotation = and(isNull(quotations.deletedAt), sql`${quotations.status} not in ('fechada_ganha','fechada_perdida','concluida','cancelada')`);

/**
 * "Meu Dia": tudo que exige ação agora. `owner` null = toda a operação; string = carteira de um usuário;
 * lista = equipe (escopo do supervisor).
 */
export async function getMyDay(owner: string | string[] | null) {
  const oc = (col: Parameters<typeof eq>[0]) => (owner === null ? undefined : Array.isArray(owner) ? (owner.length ? inArray(col, owner) : sql`false`) : eq(col, owner));
  const ownerId = owner;
  const today = todayISO();
  const staleDays = (await getRule("stale_process")).params.dias ?? 7;
  const criticalDays = await getSetting("critical_deadline_days");
  const taskOwner = oc(tasks.ownerId);
  const qOwner = oc(quotations.ownerId);

  const [taskRows, quotationRows, followupRows, renewalRows, pendencyRows] = await Promise.all([
    db
      .select({ t: tasks, companyName, quotationCode: quotations.code, lives: quotations.estimatedLives })
      .from(tasks)
      .leftJoin(companies, eq(companies.id, tasks.companyId))
      .leftJoin(quotations, eq(quotations.id, tasks.quotationId))
      .where(and(isNull(tasks.deletedAt), inArray(tasks.status, OPEN_TASK_STATUSES), taskOwner, sql`coalesce(${tasks.dueDate}, ${tasks.scheduledDate}) <= ${addDays(today, 7)}`))
      .orderBy(asc(sql`coalesce(${tasks.dueDate}, ${tasks.scheduledDate})`)),
    db
      .select({
        q: quotations,
        companyName,
        reqTotal: sql<number>`(select count(*)::int from quotation_checklist_items ci where ci.quotation_id = ${Q_ID} and ci.required and ci.applicable)`,
        reqDone: sql<number>`(select count(*)::int from quotation_checklist_items ci where ci.quotation_id = ${Q_ID} and ci.required and ci.applicable and ci.status <> 'pendente')`,
        proposalsToReview: sql<number>`(select count(*)::int from quotation_insurers qi where qi.quotation_id = ${Q_ID} and qi.status = 'cotacao_recebida')`,
        criticalPendencies: sql<number>`(select count(*)::int from pendencies p where p.quotation_id = ${Q_ID} and p.status in ('aberta','em_andamento') and p.priority in ('alta','critica'))`,
      })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .where(and(openQuotation, qOwner))
      .orderBy(asc(quotations.targetDate)),
    db
      .select({ qi: quotationInsurers, insurerName: insurers.name, q: quotations, companyName })
      .from(quotationInsurers)
      .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
      .where(and(openQuotation, qOwner, lte(quotationInsurers.nextFollowupAt, today), inArray(quotationInsurers.status, ["enviada", "recebida_operadora", "em_analise", "pendencia"])))
      .orderBy(asc(quotationInsurers.nextFollowupAt)),
    db
      .select({ r: renewals, companyName })
      .from(renewals)
      .innerJoin(companies, eq(companies.id, renewals.companyId))
      .where(
        and(
          isNull(renewals.deletedAt),
          oc(renewals.ownerId),
          sql`${renewals.status} not in ('renovada','migrada','perdida','cancelada')`,
          lte(renewals.anniversaryDate, addDays(today, 90)),
        ),
      )
      .orderBy(asc(renewals.anniversaryDate)),
    db
      .select({ p: pendencies, companyName, quotationCode: quotations.code, lives: quotations.estimatedLives })
      .from(pendencies)
      .leftJoin(companies, eq(companies.id, pendencies.companyId))
      .leftJoin(quotations, eq(quotations.id, pendencies.quotationId))
      .where(and(inArray(pendencies.status, ["aberta", "em_andamento"]), oc(pendencies.ownerId)))
      .orderBy(asc(pendencies.dueDate)),
  ]);

  const tasksToday = taskRows.filter((r) => (r.t.dueDate ?? r.t.scheduledDate) === today);
  const tasksOverdue = taskRows.filter((r) => r.t.dueDate && r.t.dueDate < today);
  const qs = quotationRows.map((r) => ({ ...r, completeness: r.reqTotal ? Math.floor((r.reqDone / r.reqTotal) * 100) : 100, idleDays: diffDays(r.q.lastActivityAt.toISOString().slice(0, 10), today) }));
  const clientPending = qs.filter((r) => CLIENT_PENDING_STATUSES.includes(r.q.status) || (r.completeness < 100 && ["coleta_informacoes", "validando_documentacao", "base_vidas_validacao"].includes(r.q.status)));
  const awaitingInsurer = qs.filter((r) => INSURER_WAITING_STATUSES.includes(r.q.status));
  const proposalsToReview = qs.filter((r) => r.proposalsToReview > 0);
  const largeAccounts = qs.filter((r) => r.q.estimatedLives >= LARGE_ACCOUNT_MIN_LIVES);
  const stale = qs.filter((r) => r.idleDays >= staleDays);
  const critical = qs.filter(
    (r) => r.q.priority === "critica" || r.criticalPendencies > 0 || (r.q.targetDate !== null && diffDays(today, r.q.targetDate) <= criticalDays && r.completeness < 100),
  );
  const renewalBuckets = {
    d30: renewalRows.filter((r) => diffDays(today, r.r.anniversaryDate) <= 30),
    d60: renewalRows.filter((r) => diffDays(today, r.r.anniversaryDate) > 30 && diffDays(today, r.r.anniversaryDate) <= 60),
    d90: renewalRows.filter((r) => diffDays(today, r.r.anniversaryDate) > 60),
  };

  // Prioridades do dia: prazo × criticidade × impacto (vidas)
  const candidates: PriorityCandidate[] = [
    ...taskRows
      .filter((r) => (r.t.dueDate ?? r.t.scheduledDate ?? "9999") <= today)
      .map((r) => ({
        id: `t-${r.t.id}`,
        kind: "tarefa" as const,
        title: r.t.title,
        subtitle: [r.companyName, r.quotationCode].filter(Boolean).join(" · "),
        href: `/tarefas?id=${r.t.id}`,
        dueDate: r.t.dueDate ?? r.t.scheduledDate,
        priority: r.t.priority,
        lives: r.lives,
      })),
    // follow-ups já representados por tarefa automática não se repetem
    ...followupRows.filter((r) => !taskRows.some((t) => t.t.quotationInsurerId === r.qi.id && (t.t.dueDate ?? "9999") <= today)).map((r) => ({
      id: `f-${r.qi.id}`,
      kind: "followup" as const,
      title: `Follow-up ${r.insurerName}`,
      subtitle: `${r.companyName} · ${r.q.code}`,
      href: `/cotacoes/${r.q.id}?tab=operadoras`,
      dueDate: r.qi.nextFollowupAt,
      priority: r.q.priority,
      lives: r.q.estimatedLives,
    })),
    ...critical.map((r) => ({
      id: `q-${r.q.id}`,
      kind: "cotacao" as const,
      title: `${r.q.code} — ${r.companyName}`,
      subtitle: `${r.completeness}% completa · ${r.criticalPendencies} pendência(s) crítica(s)`,
      href: `/cotacoes/${r.q.id}`,
      dueDate: r.q.targetDate,
      priority: r.q.priority,
      lives: r.q.estimatedLives,
    })),
    ...pendencyRows
      .filter((r) => r.p.priority === "critica" || (r.p.dueDate !== null && r.p.dueDate <= today))
      .slice(0, 30)
      .map((r) => ({
        id: `p-${r.p.id}`,
        kind: "pendencia" as const,
        title: r.p.title,
        subtitle: [r.companyName, r.quotationCode].filter(Boolean).join(" · "),
        href: r.p.quotationId ? `/cotacoes/${r.p.quotationId}?tab=checklist` : `/pendencias`,
        dueDate: r.p.dueDate,
        priority: r.p.priority as Priority,
        lives: r.lives,
      })),
    ...renewalBuckets.d30.map((r) => ({
      id: `r-${r.r.id}`,
      kind: "renovacao" as const,
      title: `Renovação ${r.companyName}`,
      subtitle: `Aniversário ${r.r.anniversaryDate.split("-").reverse().join("/")}`,
      href: `/renovacoes?id=${r.r.id}`,
      dueDate: r.r.anniversaryDate,
      priority: "alta" as Priority,
      lives: r.r.lives,
    })),
  ];
  const priorities = rankPriorities(candidates, today).slice(0, 15);
  const timeline = await listTimeline({ limit: 15, userIds: Array.isArray(ownerId) ? ownerId : null });

  return {
    today,
    staleDays,
    tasksToday,
    tasksOverdue,
    followupsToday: followupRows,
    clientPending,
    awaitingInsurer,
    proposalsToReview,
    renewalBuckets,
    largeAccounts,
    stale,
    critical,
    priorities,
    timeline,
    openPendencies: pendencyRows.length,
  };
}
export type MyDay = Awaited<ReturnType<typeof getMyDay>>;

export async function recentQuotationsForUser(ownerId: string) {
  return db
    .select({ q: quotations, companyName })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(and(openQuotation, eq(quotations.ownerId, ownerId)))
    .orderBy(desc(quotations.lastActivityAt))
    .limit(20);
}
