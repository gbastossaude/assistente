import "server-only";
import { db, type DbOrTx } from "./db";
import { activityLogs } from "./db/schema";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "status_change"
  | "upload"
  | "download"
  | "import"
  | "deadline_change"
  | "checklist_change"
  | "batch"
  | "login"
  | "login_failed"
  | "override"
  | "assistant_action"
  | "settings_change"
  | "retention_purge";

/** Campos que nunca entram no diff de auditoria (dados de saúde / segredos). */
const REDACT = new Set(["cid", "passwordHash", "password", "relatorio_medico", "protocolo", "semanas", "data_prevista_parto", "observacao"]);

export function redact(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, REDACT.has(k) ? "[protegido]" : v]));
}

/** Diferença rasa entre dois objetos (somente campos alterados). */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { de: unknown; para: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const b = after[k] instanceof Date ? (after[k] as Date).toISOString() : after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = REDACT.has(k) ? { de: "[protegido]", para: "[protegido]" } : { de: a ?? null, para: b ?? null };
  }
  return out;
}

export async function audit(
  entry: {
    userId: string | null;
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    summary: string;
    changes?: Record<string, unknown>;
    sensitive?: boolean;
  },
  tx: DbOrTx = db,
) {
  await tx.insert(activityLogs).values({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    changes: entry.changes ? redact(entry.changes) : null,
    sensitive: entry.sensitive ?? false,
  });
}
