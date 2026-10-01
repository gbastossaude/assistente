import type { QuotationListRow } from "@/server/services/quotations";
import type { PipelineRow } from "./pipeline";

export function toPipelineRows(rows: QuotationListRow[]): PipelineRow[] {
  return rows.map((r) => ({
    id: r.q.id,
    code: r.q.code,
    companyName: r.companyName,
    processType: r.q.processType,
    status: r.q.status,
    lives: r.q.estimatedLives,
    priority: r.q.priority,
    ownerName: r.ownerName,
    targetDate: r.q.targetDate,
    renewalDate: r.q.renewalDate,
    completeness: r.completeness,
    pendingRequired: r.reqTotal - r.reqDone,
    openPendencies: r.openPendencies,
    insurersTotal: r.insurersTotal,
    insurersAwaiting: r.insurersAwaiting,
    proposalsReceived: r.proposalsReceived,
    lastActivityAt: r.q.lastActivityAt.toISOString(),
  }));
}
