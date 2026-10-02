"use server";
import { eventSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { effectiveOwner, guardCompany, guardEvent, guardQuotation } from "../access";
import { deleteEvent, saveEvent } from "../services/calendar";

export async function saveEventAction(id: string | null, input: unknown) {
  return runAction("calendar:write", async (u) => {
    const d = parseInput(eventSchema, input);
    if (id) await guardEvent(u, id);
    await guardQuotation(u, d.quotationId);
    await guardCompany(u, d.companyId);
    return saveEvent(id, { ...d, ownerId: await effectiveOwner(u, d.ownerId) }, u);
  }, { message: "Compromisso salvo" });
}
export async function deleteEventAction(id: string) {
  return runAction("calendar:write", async (u) => (await guardEvent(u, id), deleteEvent(id, u)), { message: "Compromisso excluído" });
}
