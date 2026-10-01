import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { todayISO } from "@/lib/domain/dates";
import { LIFE_FIELDS, LIFE_FIELD_LABELS, REQUIRED_LIFE_FIELDS, type ColumnMapping, type LifeField } from "@/lib/lives-import/fields";
import { summarizeLives, type LivesSummary } from "@/lib/lives-import/summary";
import { hasErrors, validateLifeRows, type NormalizedLife } from "@/lib/lives-import/validate";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { lifeImports, lives, quotations, users } from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";
import { parseWorkbook, WorkbookError } from "../lives-import/parse-workbook";
import { getSetting } from "../settings";
import { storage, validateUpload } from "../storage";
import { addTimeline } from "../timeline";
import { uploadDocument } from "./documents";
import { afterQuotationChange } from "./quotation-sync";

const SPREADSHEET_EXT = ["xlsx", "xlsm"];

export interface ImportPreview {
  tempKey: string;
  fileName: string;
  sheetNames: string[];
  sheetName: string;
  headerRowNumber: number;
  headers: string[];
  mapping: ColumnMapping;
  missingRequired: LifeField[];
  totals: { rows: number; valid: number; withErrors: number; withWarnings: number; skippedEmpty: number };
  rows: NormalizedLife[];
  issues: { row: number; field: string; level: "error" | "warning"; message: string }[];
  issuesTruncated: boolean;
  summary: LivesSummary;
}

function missingRequired(mapping: ColumnMapping): LifeField[] {
  const missing = REQUIRED_LIFE_FIELDS.filter((f) => mapping[f] === null);
  if (mapping.data_nascimento === null && mapping.idade === null) missing.push("data_nascimento");
  return missing;
}

async function loadQuotation(id: string) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
  if (!q || q.deletedAt) throw new NotFoundError("Cotação");
  return q;
}

function sanitizeMapping(m: Partial<Record<string, unknown>> | null | undefined, width: number): ColumnMapping | null {
  if (!m) return null;
  const out = {} as ColumnMapping;
  for (const f of LIFE_FIELDS) {
    const v = m[f];
    out[f] = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < width ? v : null;
  }
  return out;
}

async function analyze(buffer: Buffer, sheet: string | null, mapping: ColumnMapping | null) {
  let parsed;
  try {
    parsed = await parseWorkbook(buffer, sheet);
  } catch (e) {
    if (e instanceof WorkbookError) throw new BusinessError(e.message);
    throw e;
  }
  const effective = sanitizeMapping(mapping, parsed.headers.length) ?? parsed.autoMapping;
  const bands = await getSetting("ans_age_bands");
  const result = validateLifeRows(parsed.rows, effective, { referenceDate: todayISO(), ageBands: bands, firstRowNumber: parsed.headerRowNumber + 1 });
  return { parsed, mapping: effective, result, bands };
}

export async function previewImport(
  quotationId: string,
  input: { file?: { name: string; buffer: Buffer }; tempKey?: string; fileName?: string; sheet?: string | null; mapping?: ColumnMapping | null },
): Promise<ImportPreview> {
  await loadQuotation(quotationId);
  let tempKey = input.tempKey;
  let buffer: Buffer;
  let fileName = input.fileName ?? "base.xlsx";
  if (input.file) {
    const v = validateUpload(input.file.name, input.file.buffer, SPREADSHEET_EXT);
    tempKey = `tmp/imports/${quotationId}/${randomUUID()}.${v.ext}`;
    await storage().put(tempKey, input.file.buffer, v.mimeType);
    buffer = input.file.buffer;
    fileName = v.fileName;
  } else {
    if (!tempKey || !tempKey.startsWith(`tmp/imports/${quotationId}/`)) throw new BusinessError("Arquivo temporário inválido. Envie a planilha novamente.");
    buffer = await storage()
      .get(tempKey)
      .catch(() => {
        throw new BusinessError("Arquivo temporário expirou. Envie a planilha novamente.");
      });
  }
  const { parsed, mapping, result, bands } = await analyze(buffer, input.sheet ?? null, input.mapping ?? null);
  const issues = result.lives.flatMap((l) => l.issues.map((i) => ({ row: l.rowNumber, field: i.field === "linha" ? "linha" : LIFE_FIELD_LABELS[i.field], level: i.level, message: i.message })));
  return {
    tempKey: tempKey!,
    fileName,
    sheetNames: parsed.sheetNames,
    sheetName: parsed.sheetName,
    headerRowNumber: parsed.headerRowNumber,
    headers: parsed.headers,
    mapping,
    missingRequired: missingRequired(mapping),
    totals: {
      rows: result.lives.length,
      valid: result.lives.filter((l) => !hasErrors(l)).length,
      withErrors: result.lives.filter(hasErrors).length,
      withWarnings: result.lives.filter((l) => l.issues.some((i) => i.level === "warning")).length,
      skippedEmpty: result.skippedEmpty,
    },
    rows: result.lives.slice(0, 50),
    issues: issues.slice(0, 2000),
    issuesTruncated: issues.length > 2000,
    summary: summarizeLives(result.lives, bands),
  };
}

export async function confirmImport(
  quotationId: string,
  input: { tempKey: string; fileName: string; sheet: string; mapping: ColumnMapping; mode: "todas" | "validas" },
  user: CurrentUser,
) {
  const q = await loadQuotation(quotationId);
  if (!input.tempKey.startsWith(`tmp/imports/${quotationId}/`)) throw new BusinessError("Arquivo temporário inválido.");
  const buffer = await storage()
    .get(input.tempKey)
    .catch(() => {
      throw new BusinessError("Arquivo temporário expirou. Envie a planilha novamente.");
    });
  const { parsed, mapping, result, bands } = await analyze(buffer, input.sheet, input.mapping);
  const missing = missingRequired(mapping);
  if (missing.length) throw new BusinessError(`Mapeie as colunas obrigatórias: ${missing.map((f) => LIFE_FIELD_LABELS[f]).join(", ")}`);
  const selected = input.mode === "validas" ? result.lives.filter((l) => !hasErrors(l)) : result.lives;
  if (selected.length === 0) throw new BusinessError("Nenhuma vida para importar.");
  const summary = summarizeLives(selected, bands);

  const importId = await db.transaction(async (tx) => {
    const doc = await uploadDocument(
      { name: input.fileName, buffer },
      { quotationId, companyId: q.companyId, taskId: null, docType: "base_vidas", referenceDate: todayISO(), sender: null, status: "recebido", notes: `Importada pela aba ${parsed.sheetName}` },
      user,
      { tx, skipSync: true },
    );
    await tx.update(lifeImports).set({ active: false }).where(eq(lifeImports.quotationId, quotationId));
    const [imp] = await tx
      .insert(lifeImports)
      .values({
        quotationId,
        documentId: doc.id,
        fileName: input.fileName,
        sheetName: parsed.sheetName,
        mapping,
        totalRows: selected.length,
        validRows: selected.filter((l) => !hasErrors(l)).length,
        errorRows: selected.filter(hasErrors).length,
        warningRows: selected.filter((l) => l.issues.some((i) => i.level === "warning")).length,
        skippedRows: result.skippedEmpty + (result.lives.length - selected.length),
        summary,
        importedBy: user.id,
      })
      .returning();
    for (let i = 0; i < selected.length; i += 1000) {
      await tx.insert(lives).values(
        selected.slice(i, i + 1000).map((l) => ({
          importId: imp.id,
          quotationId,
          rowNumber: l.rowNumber,
          companyName: l.companyName,
          cnpj: l.cnpj,
          birthDate: l.birthDate,
          age: l.age,
          ageBand: l.ageBand,
          holderType: l.holderType,
          kinship: l.kinship,
          situation: l.situation,
          cid: l.cid,
          city: l.city,
          uf: l.uf,
          insurer: l.insurer,
          plan: l.plan,
          sex: l.sex,
          issues: l.issues.map((x) => ({ field: x.field, level: x.level, message: x.message })),
        })),
      );
    }
    await audit(
      {
        userId: user.id,
        action: "import",
        entityType: "life_import",
        entityId: imp.id,
        summary: `${q.code}: base de vidas importada (${selected.length} vidas, ${imp.errorRows} com erro) — ${input.fileName}`,
        sensitive: true,
      },
      tx,
    );
    await addTimeline(
      {
        type: "upload",
        description: `Base de vidas importada: ${selected.length} vidas (${summary.titulares} titulares, ${summary.dependentes} dependentes, ${summary.agregados} agregados)${imp.errorRows ? ` — ${imp.errorRows} registro(s) incompletos` : ""}`,
        userId: user.id,
        quotationId,
      },
      tx,
    );
    await afterQuotationChange(quotationId, tx);
    return imp.id;
  });
  await storage()
    .remove(input.tempKey)
    .catch(() => undefined);
  return importId;
}

export async function deactivateImport(importId: string, user: CurrentUser) {
  const [imp] = await db.update(lifeImports).set({ active: false }).where(eq(lifeImports.id, importId)).returning();
  if (!imp) throw new NotFoundError("Importação");
  await audit({ userId: user.id, action: "update", entityType: "life_import", entityId: importId, summary: `Importação de base desativada (${imp.fileName})` });
  await addTimeline({ type: "sistema", description: `Importação da base de vidas desativada (${imp.fileName})`, userId: user.id, quotationId: imp.quotationId });
  await afterQuotationChange(imp.quotationId);
}

export async function listImports(quotationId: string) {
  return db
    .select({ i: lifeImports, userName: users.name })
    .from(lifeImports)
    .leftJoin(users, eq(users.id, lifeImports.importedBy))
    .where(eq(lifeImports.quotationId, quotationId))
    .orderBy(desc(lifeImports.createdAt));
}

export async function listLives(
  importId: string,
  opts: { page?: number; pageSize?: number; onlyIssues?: boolean; q?: string | null; includeSensitive: boolean },
) {
  const pageSize = Math.min(opts.pageSize ?? 50, 200);
  const page = Math.max(1, opts.page ?? 1);
  const conds: SQL[] = [eq(lives.importId, importId)];
  if (opts.onlyIssues) conds.push(sql`jsonb_array_length(${lives.issues}) > 0`);
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(sql`(${lives.sex} ilike ${like} or ${lives.plan} ilike ${like} or ${lives.city} ilike ${like} or ${lives.cnpj} ilike ${like} or ${lives.situation} ilike ${like} or ${lives.kinship} ilike ${like})`);
  }
  const [rows, [{ n }]] = await Promise.all([
    db
      .select()
      .from(lives)
      .where(and(...conds))
      .orderBy(asc(lives.rowNumber))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(lives)
      .where(and(...conds)),
  ]);
  return {
    total: n,
    page,
    pageSize,
    rows: rows.map((r) => (opts.includeSensitive ? r : { ...r, cid: r.cid ? "•••" : null })),
  };
}
