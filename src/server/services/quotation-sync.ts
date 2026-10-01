import "server-only";
import { db, type DbOrTx } from "../db";
import { syncChecklist } from "./checklist";
import { syncPendencies } from "./pendencies";

/** Reavalia checklist e pendências após qualquer alteração que afete a cotação. */
export async function afterQuotationChange(quotationId: string, tx: DbOrTx = db) {
  const completeness = await syncChecklist(quotationId, tx);
  await syncPendencies(quotationId, tx);
  return completeness;
}
