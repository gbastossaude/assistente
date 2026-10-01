import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { SPECIAL_CASES, type FieldDef, type SpecialCaseKind } from "@/lib/domain/special-cases";
import type { specialCaseSummarySchema } from "@/lib/validation/schemas";
import { optBool, optCnpj, optDate, optNum, optStr, optUuid, reqCnpj, reqDate, reqNum, reqStr } from "@/lib/validation/fields";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { quotationDocuments, quotations, specialCaseEntries, specialCases } from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { addTimeline } from "../timeline";
import { afterQuotationChange } from "./quotation-sync";

/** Constrói o schema Zod de um registro a partir da definição declarativa do tipo. */
function fieldSchema(f: FieldDef): z.ZodType {
  switch (f.type) {
    case "number":
    case "money":
      return f.required ? reqNum(f.label, { min: f.min ?? 0, max: f.max }) : optNum({ min: f.min ?? 0, max: f.max, label: f.label });
    case "date":
      return f.required ? reqDate(f.label) : optDate(f.label);
    case "boolean":
      return optBool();
    case "cnpj":
      return f.required ? reqCnpj(f.label) : optCnpj(f.label);
    case "document":
      return f.required ? optUuid() : optUuid(); // ausência vira pendência, não bloqueia o cadastro
    case "select": {
      const values = (f.options ?? []).map((o) => o.value) as [string, ...string[]];
      const base = z.union([z.enum(values), z.literal(""), z.null()]).optional().transform((v) => v || null);
      return f.required ? base.refine((v) => v !== null, { message: `${f.label} é obrigatório` }) : base;
    }
    case "textarea":
      return optStr(3000);
    default:
      return f.required ? reqStr(f.label, 300) : optStr(300);
  }
}

export function entrySchema(kind: SpecialCaseKind) {
  return z.object(Object.fromEntries(SPECIAL_CASES[kind].entryFields.map((f) => [f.key, fieldSchema(f)])));
}

function summaryDetailsSchema(kind: SpecialCaseKind) {
  return z.object(Object.fromEntries(SPECIAL_CASES[kind].summaryFields.map((f) => [f.key, fieldSchema({ ...f, required: false })])));
}

async function quotationOf(id: string) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
  if (!q || q.deletedAt) throw new NotFoundError("Cotação");
  return q;
}

async function assertDocsBelong(quotationId: string, kind: SpecialCaseKind, data: Record<string, unknown>) {
  for (const f of SPECIAL_CASES[kind].entryFields.filter((x) => x.type === "document")) {
    const id = data[f.key];
    if (!id) continue;
    const [d] = await db
      .select({ q: quotationDocuments.quotationId })
      .from(quotationDocuments)
      .where(eq(quotationDocuments.id, String(id)));
    if (!d || d.q !== quotationId) throw new BusinessError(`${f.label}: documento não pertence a esta cotação.`);
  }
}

export async function saveSpecialSummary(input: z.output<typeof specialCaseSummarySchema>, user: CurrentUser) {
  const q = await quotationOf(input.quotationId);
  const details = summaryDetailsSchema(input.kind).parse(input.details ?? {});
  const def = SPECIAL_CASES[input.kind];
  if (input.has === false) input.quantity = null;
  await db.transaction(async (tx) => {
    await tx
      .insert(specialCases)
      .values({ quotationId: q.id, kind: input.kind, has: input.has, quantity: input.quantity, details, notes: input.notes, updatedBy: user.id })
      .onConflictDoUpdate({
        target: [specialCases.quotationId, specialCases.kind],
        set: { has: input.has, quantity: input.quantity, details, notes: input.notes, updatedBy: user.id },
      });
    if (input.has === false) await tx.delete(specialCaseEntries).where(and(eq(specialCaseEntries.quotationId, q.id), eq(specialCaseEntries.kind, input.kind)));
    await audit({ userId: user.id, action: "update", entityType: "special_case", entityId: q.id, summary: `${q.code}: ${def.label} — ${input.has === null ? "não declarado" : input.has ? `Sim (${input.quantity ?? "?"})` : "Não"}` }, tx);
    await addTimeline({ type: "sistema", description: `Situação especial: ${def.label} — ${input.has === null ? "não declarado" : input.has ? `Sim, ${input.quantity ?? "quantidade não informada"}` : "Não"}`, userId: user.id, quotationId: q.id }, tx);
    await afterQuotationChange(q.id, tx);
  });
}

/** Declara "Não" para todos os tipos ainda não declarados (atalho do wizard). */
export async function declareRemainingAsNo(quotationId: string, user: CurrentUser) {
  const q = await quotationOf(quotationId);
  const existing = await db.select().from(specialCases).where(eq(specialCases.quotationId, quotationId));
  const kinds = (Object.keys(SPECIAL_CASES) as SpecialCaseKind[]).filter((k) => {
    const s = existing.find((e) => e.kind === k);
    return !s || s.has === null;
  });
  if (!kinds.length) return 0;
  await db.transaction(async (tx) => {
    for (const kind of kinds) {
      await tx
        .insert(specialCases)
        .values({ quotationId, kind, has: false, updatedBy: user.id })
        .onConflictDoUpdate({ target: [specialCases.quotationId, specialCases.kind], set: { has: false, quantity: null, updatedBy: user.id } });
    }
    await audit({ userId: user.id, action: "update", entityType: "special_case", entityId: quotationId, summary: `${q.code}: ${kinds.length} situação(ões) especial(is) declarada(s) como "Não"` }, tx);
    await afterQuotationChange(quotationId, tx);
  });
  return kinds.length;
}

export async function saveSpecialEntry(
  input: { id?: string | null; quotationId: string; kind: SpecialCaseKind; data: Record<string, unknown> },
  user: CurrentUser,
) {
  const q = await quotationOf(input.quotationId);
  const parsed = entrySchema(input.kind).safeParse(input.data);
  if (!parsed.success) {
    const fe: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fe[i.path.join(".")] ??= []).push(i.message);
    throw new BusinessError(parsed.error.issues[0]?.message ?? "Dados inválidos", fe);
  }
  const data = parsed.data as Record<string, unknown>;
  await assertDocsBelong(q.id, input.kind, data);
  const def = SPECIAL_CASES[input.kind];
  await db.transaction(async (tx) => {
    // Registro detalhado implica "possui = Sim"
    await tx
      .insert(specialCases)
      .values({ quotationId: q.id, kind: input.kind, has: true, updatedBy: user.id })
      .onConflictDoUpdate({ target: [specialCases.quotationId, specialCases.kind], set: { has: true } });
    if (input.id) {
      await tx
        .update(specialCaseEntries)
        .set({ data })
        .where(and(eq(specialCaseEntries.id, input.id), eq(specialCaseEntries.quotationId, q.id)));
    } else {
      await tx.insert(specialCaseEntries).values({ quotationId: q.id, kind: input.kind, data, createdBy: user.id });
    }
    await audit({ userId: user.id, action: input.id ? "update" : "create", entityType: "special_case_entry", entityId: q.id, summary: `${q.code}: ${def.label} — ${def.entryLabel} ${input.id ? "atualizado" : "incluído"}` }, tx);
    await afterQuotationChange(q.id, tx);
  });
}

export async function deleteSpecialEntry(id: string, user: CurrentUser) {
  const [e] = await db.delete(specialCaseEntries).where(eq(specialCaseEntries.id, id)).returning();
  if (!e) throw new NotFoundError("Registro");
  await audit({ userId: user.id, action: "delete", entityType: "special_case_entry", entityId: e.quotationId, summary: `${SPECIAL_CASES[e.kind].label}: registro removido` });
  await afterQuotationChange(e.quotationId);
}
