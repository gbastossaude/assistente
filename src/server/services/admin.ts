import "server-only";
import { and, asc, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { validateAgeBands, type AgeBand } from "@/lib/domain/age";
import { AUTOMATION_RULES, type ReadinessWeights, type RetentionPolicy } from "@/lib/domain/settings-defaults";
import type { checklistTemplateSchema, templateSchema } from "@/lib/validation/schemas";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { activityLogs, automationRules, checklistTemplates, messageTemplates, quotationChecklistItems, quotations, settings, users } from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { getRule } from "../settings";
import { afterQuotationChange } from "./quotation-sync";

async function putSetting(key: string, value: unknown, user: CurrentUser, summary: string) {
  await db
    .insert(settings)
    .values({ key, value, updatedBy: user.id })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: user.id } });
  await audit({ userId: user.id, action: "settings_change", entityType: "settings", entityId: key, summary, changes: { [key]: value } });
}

export async function updateGeneralSettings(
  input: { copayMaxPct: number; criticalDeadlineDays: number; weights: ReadinessWeights; retention: RetentionPolicy },
  user: CurrentUser,
) {
  if (input.copayMaxPct < 0 || input.copayMaxPct > 100) throw new BusinessError("Limite de coparticipação deve estar entre 0 e 100%.");
  const sum = Object.values(input.weights).reduce((a, b) => a + b, 0);
  if (sum <= 0 || Object.values(input.weights).some((w) => w < 0)) throw new BusinessError("Pesos do score devem ser positivos.");
  await putSetting("copay_max_pct", input.copayMaxPct, user, `Limite de coparticipação: ${input.copayMaxPct}%`);
  await putSetting("critical_deadline_days", input.criticalDeadlineDays, user, `Prazo crítico: ${input.criticalDeadlineDays} dias`);
  await putSetting("readiness_weights", input.weights, user, "Pesos do score de prontidão atualizados");
  await putSetting("retention", input.retention, user, "Política de retenção atualizada");
}

export async function updateAgeBands(bands: AgeBand[], user: CurrentUser) {
  const err = validateAgeBands(bands);
  if (err) throw new BusinessError(err);
  await putSetting("ans_age_bands", [...bands].sort((a, b) => a.min - b.min), user, "Faixas etárias ANS atualizadas");
}

export async function listRules() {
  return Promise.all(AUTOMATION_RULES.map(async (r) => ({ ...r, config: await getRule(r.key) })));
}

export async function updateRule(key: string, enabled: boolean, params: Record<string, number>, user: CurrentUser) {
  const def = AUTOMATION_RULES.find((r) => r.key === key);
  if (!def) throw new NotFoundError("Regra");
  const clean: Record<string, number> = {};
  for (const k of Object.keys(def.params)) {
    const v = Number(params[k]);
    if (!Number.isFinite(v) || v < 0 || v > 365) throw new BusinessError(`${def.paramLabels?.[k] ?? k}: valor inválido (0–365).`);
    clean[k] = Math.round(v);
  }
  await db
    .insert(automationRules)
    .values({ key, name: def.name, description: def.description, enabled, params: clean, updatedBy: user.id })
    .onConflictDoUpdate({ target: automationRules.key, set: { enabled, params: clean, updatedBy: user.id } });
  await audit({ userId: user.id, action: "settings_change", entityType: "automation_rule", entityId: key, summary: `Automação "${def.name}": ${enabled ? "ativa" : "inativa"}`, changes: clean });
}

export async function listMessageTemplates() {
  return db.select().from(messageTemplates).orderBy(asc(messageTemplates.audience), asc(messageTemplates.name));
}

export async function updateMessageTemplate(input: z.output<typeof templateSchema>, user: CurrentUser) {
  const [t] = await db
    .update(messageTemplates)
    .set({ name: input.name, subject: input.subject, body: input.body, active: input.active, updatedBy: user.id })
    .where(eq(messageTemplates.id, input.id))
    .returning();
  if (!t) throw new NotFoundError("Template");
  await audit({ userId: user.id, action: "settings_change", entityType: "message_template", entityId: t.id, summary: `Template atualizado: ${t.name}` });
}

export async function listChecklistTemplates() {
  return db.select().from(checklistTemplates).orderBy(asc(checklistTemplates.processType), asc(checklistTemplates.sortOrder));
}

export async function saveChecklistTemplate(input: z.output<typeof checklistTemplateSchema>, user: CurrentUser) {
  const { id, ...data } = input;
  if (id) {
    await db.update(checklistTemplates).set(data).where(eq(checklistTemplates.id, id));
  } else {
    const [dup] = await db
      .select({ id: checklistTemplates.id })
      .from(checklistTemplates)
      .where(and(eq(checklistTemplates.processType, data.processType), eq(checklistTemplates.itemKey, data.itemKey)));
    if (dup) throw new BusinessError("Já existe item com esta chave neste modelo.", { itemKey: ["Duplicada"] });
    await db.insert(checklistTemplates).values(data);
  }
  await audit({ userId: user.id, action: "checklist_change", entityType: "checklist_template", entityId: id ?? data.itemKey, summary: `Modelo ${data.processType}: item "${data.label}" ${id ? "atualizado" : "criado"} (${data.required ? "obrigatório" : "opcional"})` });
}

/** Aplica o modelo atualizado a uma cotação: insere itens novos e atualiza obrigatoriedade dos pendentes. */
export async function applyTemplateToQuotation(quotationId: string, user: CurrentUser) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!q) throw new NotFoundError("Cotação");
  const templates = await db
    .select()
    .from(checklistTemplates)
    .where(and(eq(checklistTemplates.processType, q.processType), eq(checklistTemplates.active, true)));
  const added = await db.transaction(async (tx) => {
    let n = 0;
    for (const t of templates) {
      const res = await tx
        .insert(quotationChecklistItems)
        .values({ quotationId, itemKey: t.itemKey, label: t.label, category: t.category, required: t.required, condition: t.condition, autoSource: t.autoSource, documentType: t.documentType, requestText: t.requestText, sortOrder: t.sortOrder })
        .onConflictDoUpdate({
          target: [quotationChecklistItems.quotationId, quotationChecklistItems.itemKey],
          set: { label: t.label, required: t.required, condition: t.condition, autoSource: t.autoSource, requestText: t.requestText, sortOrder: t.sortOrder },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      if (res[0]?.inserted) n++;
    }
    await audit({ userId: user.id, action: "checklist_change", entityType: "quotation", entityId: quotationId, summary: `${q.code}: modelo de checklist reaplicado (${n} item(ns) novo(s))` }, tx);
    await afterQuotationChange(quotationId, tx);
    return n;
  });
  return added;
}

export async function listAudit(f: { q?: string | null; entityType?: string | null; action?: string | null; userId?: string | null; from?: string | null; to?: string | null; sensitive?: boolean; page?: number }) {
  const conds: SQL[] = [];
  if (f.q) conds.push(ilike(activityLogs.summary, `%${f.q}%`));
  if (f.entityType) conds.push(eq(activityLogs.entityType, f.entityType));
  if (f.action) conds.push(eq(activityLogs.action, f.action));
  if (f.userId) conds.push(eq(activityLogs.userId, f.userId));
  if (f.from) conds.push(gte(activityLogs.createdAt, new Date(`${f.from}T00:00:00-03:00`)));
  if (f.to) conds.push(lte(activityLogs.createdAt, new Date(`${f.to}T23:59:59-03:00`)));
  if (f.sensitive) conds.push(eq(activityLogs.sensitive, true));
  const page = Math.max(1, f.page ?? 1);
  return db
    .select({ l: activityLogs, userName: users.name })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(activityLogs.createdAt))
    .limit(100)
    .offset((page - 1) * 100);
}
