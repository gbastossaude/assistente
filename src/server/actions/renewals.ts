"use server";
import { renewalSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { saveRenewal, softDeleteRenewal } from "../services/renewals";

export async function saveRenewalAction(id: string | null, input: unknown) {
  return runAction("renewal:write", (u) => saveRenewal(id, parseInput(renewalSchema, input), u), { message: "Renovação salva — marcos 120/90/60/30 programados" });
}
export async function deleteRenewalAction(id: string) {
  return runAction("delete", (u) => softDeleteRenewal(id, u), { message: "Renovação excluída" });
}
