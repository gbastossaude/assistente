import "server-only";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { CLOSED_STATUSES, CLOSED_RENEWAL_STATUSES, QUOTATION_STATUS_LABELS, type QuotationStatus } from "@/lib/domain/constants";
import { addDays, diffDays, todayISO } from "@/lib/domain/dates";
import { renewalMilestones, renewalWindow } from "@/lib/domain/renewals";
import { db, type DbOrTx } from "../db";
import {
  assistantMessages,
  companies,
  insurers,
  notifications,
  proposals,
  quotationDocuments,
  quotationInsurers,
  quotations,
  renewals,
  settings,
  tasks,
  calendarEvents,
} from "../db/schema";
import { audit } from "../audit";
import { getRule, getSetting } from "../settings";
import { storage } from "../storage";
import { notify } from "../services/notifications";
import { syncPendencies } from "../services/pendencies";

const OPEN_TASK = ["a_fazer", "em_andamento", "aguardando_terceiro"] as const;

// ───────────────────────────── Gatilhos de eventos ─────────────────────────────

export async function onQuotationCreated(quotationId: string, actorId: string, tx: DbOrTx = db) {
  const [q] = await tx.select().from(quotations).where(eq(quotations.id, quotationId));
  if (q?.ownerId && q.ownerId !== actorId) {
    await notify({ userId: q.ownerId, kind: "atribuicao", title: `Nova cotação atribuída: ${q.code}`, link: `/cotacoes/${q.id}`, dedupeKey: `assign:${q.id}:${q.ownerId}` }, tx);
  }
}

export async function onQuotationStatusChanged(quotationId: string, from: QuotationStatus, to: QuotationStatus, actorId: string, tx: DbOrTx = db) {
  const [q] = await tx.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!q) return;
  if (to === "pronta_para_mercado") {
    const rule = await getRule("ready_suggests_sending", tx);
    if (rule.enabled && q.ownerId) {
      await notify(
        {
          userId: q.ownerId,
          kind: "sugestao",
          title: `${q.code} pronta para mercado`,
          body: "Sugestão: selecionar operadoras e registrar o envio do estudo.",
          link: `/cotacoes/${q.id}?tab=operadoras`,
          dedupeKey: `ready:${q.id}:${q.statusChangedAt.toISOString()}`,
        },
        tx,
      );
    }
  }
  if (to === "apresentacao_cliente" && from !== "apresentacao_cliente") {
    await scheduleClientCadence(q, actorId, tx);
  }
  if (["negociacao", "finalista"].includes(to) || CLOSED_STATUSES.includes(to)) {
    // Cliente avançou (ou cotação encerrada): a cadência D1–D7 deixa de fazer sentido.
    await tx
      .update(tasks)
      .set({ status: "cancelada", notes: sql`coalesce(${tasks.notes} || E'\n', '') || ${`Cadência encerrada: cotação em ${QUOTATION_STATUS_LABELS[to]}`}` })
      .where(and(eq(tasks.quotationId, quotationId), sql`${tasks.automationKey} like ${`cad:${quotationId}:%`}`, inArray(tasks.status, [...OPEN_TASK])));
  }
  if (CLOSED_STATUSES.includes(to) && !CLOSED_STATUSES.includes(from)) {
    // Encerramento: cancela follow-ups automáticos pendentes da cotação.
    await tx
      .update(tasks)
      .set({ status: "cancelada", notes: sql`coalesce(${tasks.notes} || E'\n', '') || ${`Cancelada automaticamente: cotação ${QUOTATION_STATUS_LABELS[to]}`}` })
      .where(and(eq(tasks.quotationId, quotationId), eq(tasks.source, "automacao"), inArray(tasks.status, [...OPEN_TASK])));
  }
  void actorId;
}

/** Etapas da cadência de follow-up com o cliente (Playbook Be Smart → Follow-up). */
export const CLIENT_CADENCE_STEPS = [
  { step: "d1", title: "Check-in", template: "cliente_cadencia_d1", hint: "Perguntar se conseguiu analisar a proposta." },
  { step: "d3", title: "Objeção silenciosa", template: "cliente_cadencia_d3", hint: "Tratar a objeção silenciosa: perguntar o que está pesando (preço × qualidade) e ajustar a proposta." },
  { step: "d5", title: "Urgência", template: "cliente_cadencia_d5", hint: "Avisar sobre reajuste/condição com prazo e pedir retorno." },
  { step: "d7", title: "Despedida", template: "cliente_cadencia_d7", hint: "Encerrar com elegância e deixar a porta aberta." },
] as const;

async function scheduleClientCadence(q: typeof quotations.$inferSelect, actorId: string, tx: DbOrTx) {
  const rule = await getRule("client_followup_cadence", tx);
  if (!rule.enabled) return;
  const [company] = await tx
    .select({ name: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` })
    .from(companies)
    .where(eq(companies.id, q.companyId));
  const base = todayISO();
  for (const s of CLIENT_CADENCE_STEPS) {
    const days = rule.params[s.step];
    if (days == null || days < 0) continue;
    const due = addDays(base, days);
    await tx
      .insert(tasks)
      .values({
        title: `${s.step.toUpperCase()} ${s.title} — ${q.code} (${company?.name ?? "cliente"})`,
        description: `Cadência de follow-up com o cliente após a apresentação. ${s.hint} Modelo sugerido: “Cadência ${s.step.toUpperCase()}” (aba Mensagens da cotação).`,
        companyId: q.companyId,
        quotationId: q.id,
        ownerId: q.ownerId ?? actorId,
        priority: q.priority,
        dueDate: due,
        scheduledDate: due,
        category: "follow_up",
        source: "automacao",
        automationKey: `cad:${q.id}:${s.step}`,
        createdBy: actorId,
      })
      .onConflictDoUpdate({ target: tasks.automationKey, set: { status: "a_fazer", completedAt: null, dueDate: due, scheduledDate: due } });
  }
}

async function quotationContext(tx: DbOrTx, qiId: string) {
  const [row] = await tx
    .select({ qi: quotationInsurers, insurer: insurers, q: quotations, companyName: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` })
    .from(quotationInsurers)
    .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
    .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(eq(quotationInsurers.id, qiId));
  return row;
}

async function upsertFollowupTask(tx: DbOrTx, qiId: string, dueDate: string, actorId: string) {
  const ctx = await quotationContext(tx, qiId);
  if (!ctx) return;
  // Conclui follow-ups automáticos anteriores desta operadora (substituídos pelo novo)
  await tx
    .update(tasks)
    .set({ status: "concluida", completedAt: new Date() })
    .where(and(eq(tasks.quotationInsurerId, qiId), eq(tasks.source, "automacao"), eq(tasks.category, "follow_up"), inArray(tasks.status, [...OPEN_TASK])));
  await tx
    .insert(tasks)
    .values({
      title: `Follow-up ${ctx.insurer.name} — ${ctx.q.code} (${ctx.companyName})`,
      description: `Cobrar retorno da cotação${ctx.qi.protocol ? ` — protocolo ${ctx.qi.protocol}` : ""}.`,
      companyId: ctx.q.companyId,
      quotationId: ctx.q.id,
      insurerId: ctx.insurer.id,
      quotationInsurerId: qiId,
      ownerId: ctx.q.ownerId ?? actorId,
      priority: ctx.q.priority,
      dueDate,
      scheduledDate: dueDate,
      category: "follow_up",
      source: "automacao",
      automationKey: `qi:${qiId}:fu:${dueDate}`,
      createdBy: actorId,
    })
    .onConflictDoUpdate({ target: tasks.automationKey, set: { status: "a_fazer", completedAt: null } });
}

/** Envio a operadora → follow-up automático em X dias. Retorna a data do próximo follow-up. */
export async function onInsurerSent(qiId: string, sentAtISO: string, actorId: string, tx: DbOrTx = db) {
  const rule = await getRule("followup_after_send", tx);
  const ctx = await quotationContext(tx, qiId);
  if (!rule.enabled || !ctx) return null;
  const days = ctx.insurer.followupDays ?? rule.params.dias ?? 5;
  const next = addDays(sentAtISO, days);
  await tx.update(quotationInsurers).set({ nextFollowupAt: next }).where(eq(quotationInsurers.id, qiId));
  await upsertFollowupTask(tx, qiId, next, actorId);
  return next;
}

export async function onFollowupRegistered(qiId: string, nextISO: string | null, actorId: string, tx: DbOrTx = db) {
  if (nextISO) await upsertFollowupTask(tx, qiId, nextISO, actorId);
  else {
    await tx
      .update(tasks)
      .set({ status: "concluida", completedAt: new Date() })
      .where(and(eq(tasks.quotationInsurerId, qiId), eq(tasks.category, "follow_up"), inArray(tasks.status, [...OPEN_TASK])));
  }
}

/** Proposta recebida → cancela cobranças pendentes daquela operadora. */
export async function onProposalReceived(qiId: string, actorId: string, tx: DbOrTx = db) {
  const rule = await getRule("proposal_cancels_followup", tx);
  if (!rule.enabled) return 0;
  const cancelled = await tx
    .update(tasks)
    .set({ status: "cancelada", notes: sql`coalesce(${tasks.notes} || E'\n', '') || 'Cancelada automaticamente: proposta recebida'` })
    .where(and(eq(tasks.quotationInsurerId, qiId), eq(tasks.category, "follow_up"), inArray(tasks.status, [...OPEN_TASK])))
    .returning({ id: tasks.id });
  await tx.update(quotationInsurers).set({ nextFollowupAt: null }).where(eq(quotationInsurers.id, qiId));
  void actorId;
  return cancelled.length;
}

/** Renovação cadastrada/alterada → tarefas de marco (120/90/60/30) e evento na agenda. */
export async function onRenewalSaved(renewalId: string, actorId: string, tx: DbOrTx = db) {
  const [r] = await tx
    .select({ r: renewals, companyName: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` })
    .from(renewals)
    .innerJoin(companies, eq(companies.id, renewals.companyId))
    .where(eq(renewals.id, renewalId));
  if (!r) return;
  const rule = await getRule("renewal_milestones", tx);
  const closed = CLOSED_RENEWAL_STATUSES.includes(r.r.status) || !!r.r.deletedAt;
  if (closed) {
    await tx
      .update(tasks)
      .set({ status: "cancelada" })
      .where(and(eq(tasks.renewalId, renewalId), eq(tasks.source, "automacao"), inArray(tasks.status, [...OPEN_TASK])));
    return;
  }
  if (rule.enabled) {
    const today = todayISO();
    for (const m of renewalMilestones(r.r.anniversaryDate, rule.params)) {
      const due = m.date < today ? today : m.date;
      await tx
        .insert(tasks)
        .values({
          title: `${m.label} — ${r.companyName}`,
          description: `Aniversário do contrato em ${r.r.anniversaryDate.split("-").reverse().join("/")} (${m.daysBefore} dias antes).`,
          companyId: r.r.companyId,
          quotationId: r.r.quotationId,
          renewalId,
          ownerId: r.r.ownerId ?? actorId,
          priority: m.daysBefore <= 30 ? "alta" : "media",
          dueDate: due,
          scheduledDate: due,
          category: "renovacao",
          source: "automacao",
          automationKey: `ren:${renewalId}:${m.key}`,
          createdBy: actorId,
        })
        .onConflictDoUpdate({
          target: tasks.automationKey,
          set: { dueDate: due, scheduledDate: due, title: `${m.label} — ${r.companyName}`, ownerId: r.r.ownerId ?? actorId },
          setWhere: inArray(tasks.status, [...OPEN_TASK]),
        });
    }
  }
  const start = new Date(`${r.r.anniversaryDate}T12:00:00Z`);
  await tx
    .insert(calendarEvents)
    .values({
      title: `Renovação — ${r.companyName}`,
      type: "renovacao",
      startsAt: start,
      allDay: true,
      companyId: r.r.companyId,
      quotationId: r.r.quotationId,
      ownerId: r.r.ownerId ?? actorId,
      automationKey: `ren:${renewalId}:event`,
      createdBy: actorId,
    })
    .onConflictDoUpdate({ target: calendarEvents.automationKey, set: { startsAt: start, title: `Renovação — ${r.companyName}`, deletedAt: null } });
}

// ───────────────────────────── Rotina diária ─────────────────────────────

export interface SweepReport {
  quotations: number;
  notifications: number;
  remindersSent: number;
  purged: { notifications: number; assistant: number; files: number };
}

export async function runSweep(now = new Date()): Promise<SweepReport> {
  const today = todayISO(now);
  const report: SweepReport = { quotations: 0, notifications: 0, remindersSent: 0, purged: { notifications: 0, assistant: 0, files: 0 } };
  const count = async (n: Parameters<typeof notify>[0]) => {
    await notify(n);
    report.notifications++;
  };

  // 1) Pendências automáticas de todas as cotações abertas (operadora sem resposta, proposta vencendo…)
  const open = await db
    .select()
    .from(quotations)
    .where(and(isNull(quotations.deletedAt), sql`${quotations.status} not in ('fechada_ganha','fechada_perdida','concluida','cancelada')`));
  for (const q of open) {
    await syncPendencies(q.id, db, today);
    report.quotations++;
  }

  // 2) Processos sem movimentação
  const stale = await getRule("stale_process");
  if (stale.enabled) {
    const days = stale.params.dias ?? 7;
    for (const q of open) {
      const idle = diffDays(q.lastActivityAt.toISOString().slice(0, 10), today);
      if (idle >= days && q.ownerId) {
        await count({
          userId: q.ownerId,
          kind: "parada",
          title: `${q.code} sem movimentação há ${idle} dias`,
          link: `/cotacoes/${q.id}`,
          dedupeKey: `stale:${q.id}:${q.lastActivityAt.toISOString().slice(0, 10)}`,
        });
      }
    }
  }

  // 3) Propostas próximas de vencer
  const exp = await getRule("proposal_expiring");
  if (exp.enabled) {
    const limit = addDays(today, exp.params.dias ?? 7);
    const rows = await db
      .select({ p: proposals, q: quotations, insurerName: insurers.name })
      .from(proposals)
      .innerJoin(quotations, eq(quotations.id, proposals.quotationId))
      .innerJoin(quotationInsurers, eq(quotationInsurers.id, proposals.quotationInsurerId))
      .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
      .where(and(isNull(proposals.deletedAt), isNull(quotations.deletedAt), lte(proposals.validUntil, limit), sql`${proposals.validUntil} >= ${today}`));
    for (const { p, q, insurerName } of rows) {
      if (!q.ownerId || CLOSED_STATUSES.includes(q.status)) continue;
      await count({
        userId: q.ownerId,
        kind: "proposta",
        title: `Proposta ${insurerName} (${q.code}) vence em ${diffDays(today, p.validUntil!)} dia(s)`,
        link: `/cotacoes/${q.id}?tab=propostas`,
        dedupeKey: `propexp:${p.id}`,
      });
    }
  }

  // 4) Follow-ups de operadora vencidos
  const fus = await db
    .select({ qi: quotationInsurers, q: quotations, insurerName: insurers.name })
    .from(quotationInsurers)
    .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
    .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
    .where(and(isNull(quotations.deletedAt), lte(quotationInsurers.nextFollowupAt, today), inArray(quotationInsurers.status, ["enviada", "recebida_operadora", "em_analise", "pendencia"])));
  for (const { qi, q, insurerName } of fus) {
    if (!q.ownerId) continue;
    await count({
      userId: q.ownerId,
      kind: "followup",
      title: `Follow-up ${insurerName} — ${q.code}`,
      body: `Previsto para ${qi.nextFollowupAt!.split("-").reverse().join("/")}`,
      link: `/cotacoes/${q.id}?tab=operadoras`,
      dedupeKey: `fu:${qi.id}:${qi.nextFollowupAt}`,
    });
  }

  // 5) Tarefas atrasadas e lembretes
  const overdueRule = await getRule("overdue_tasks");
  if (overdueRule.enabled) {
    const overdue = await db
      .select()
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), inArray(tasks.status, [...OPEN_TASK]), sql`${tasks.dueDate} < ${today}`));
    for (const t of overdue) {
      if (!t.ownerId) continue;
      await count({ userId: t.ownerId, kind: "atraso", title: `Tarefa atrasada: ${t.title}`, link: `/tarefas?id=${t.id}`, dedupeKey: `overdue:${t.id}:${t.dueDate}` });
    }
  }
  const remRule = await getRule("task_reminders");
  if (remRule.enabled) {
    const due = await db
      .select()
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), inArray(tasks.status, [...OPEN_TASK]), lte(tasks.reminderAt, now), isNull(tasks.reminderSentAt)));
    for (const t of due) {
      if (t.ownerId) await notify({ userId: t.ownerId, kind: "lembrete", title: `Lembrete: ${t.title}`, link: `/tarefas?id=${t.id}`, dedupeKey: `rem:${t.id}:${t.reminderAt?.toISOString()}` });
      await db.update(tasks).set({ reminderSentAt: now }).where(eq(tasks.id, t.id));
      report.remindersSent++;
    }
  }

  // 6) Janelas de renovação (120/90/60/30)
  const rens = await db
    .select({ r: renewals, companyName: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` })
    .from(renewals)
    .innerJoin(companies, eq(companies.id, renewals.companyId))
    .where(and(isNull(renewals.deletedAt), sql`${renewals.status} not in ('renovada','migrada','perdida','cancelada')`));
  for (const { r, companyName } of rens) {
    const w = renewalWindow(r.anniversaryDate, today);
    if (!r.ownerId || w === "futura") continue;
    await count({
      userId: r.ownerId,
      kind: "renovacao",
      title: w === "vencida" ? `Renovação ${companyName}: aniversário passou sem conclusão` : `Renovação ${companyName} em até ${w} dias`,
      link: `/renovacoes?id=${r.id}`,
      dedupeKey: `ren:${r.id}:${w}:${r.anniversaryDate}`,
    });
  }

  // 7) Retenção (LGPD)
  const retention = await getSetting("retention");
  if (retention.readNotificationsDays > 0) {
    const del = await db
      .delete(notifications)
      .where(sql`${notifications.readAt} < now() - make_interval(days => ${retention.readNotificationsDays})`)
      .returning({ id: notifications.id });
    report.purged.notifications = del.length;
  }
  if (retention.assistantHistoryDays > 0) {
    const del = await db
      .delete(assistantMessages)
      .where(sql`${assistantMessages.createdAt} < now() - make_interval(days => ${retention.assistantHistoryDays})`)
      .returning({ id: assistantMessages.id });
    report.purged.assistant = del.length;
  }
  if (retention.softDeletedDays > 0) {
    const docs = await db
      .select()
      .from(quotationDocuments)
      .where(and(sql`${quotationDocuments.deletedAt} < now() - make_interval(days => ${retention.softDeletedDays})`, sql`${quotationDocuments.storageKey} <> 'expurgado'`));
    for (const d of docs) {
      try {
        await storage().remove(d.storageKey);
      } catch {
        continue;
      }
      await db.update(quotationDocuments).set({ storageKey: "expurgado" }).where(eq(quotationDocuments.id, d.id));
      report.purged.files++;
    }
    if (report.purged.files) {
      await audit({ userId: null, action: "retention_purge", entityType: "document", summary: `Retenção: ${report.purged.files} arquivo(s) excluído(s) definitivamente` });
    }
  }

  await db
    .insert(settings)
    .values({ key: "last_sweep_at", value: now.toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value: now.toISOString() } });
  return report;
}

/** Executa a rotina se a última foi há mais de 1 hora (usada no carregamento do "Meu Dia"). */
export async function maybeRunSweep() {
  // Reserva atômica: só um processo "ganha" a execução por janela de 1 hora.
  const claimed = await db.execute(
    sql`insert into settings (key, value, updated_at) values ('last_sweep_at', to_jsonb(now()::text), now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
        where settings.updated_at < now() - interval '1 hour'
        returning key`,
  );
  if (claimed.rows.length === 0) return null;
  return runSweep();
}
