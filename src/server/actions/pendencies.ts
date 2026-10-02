"use server";
import { z } from "zod";
import { PENDENCY_STATUSES } from "@/lib/domain/constants";
import { pendencySchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { createPendency, deletePendency, setPendencyStatus, updatePendency } from "../services/pendencies";

export async function savePendencyAction(id: string | null, input: unknown) {
  return runAction("pendency:write", async (u) => {
    const data = parseInput(pendencySchema, input);
    if (id) await updatePendency(id, data, u.id);
    else await createPendency(data, u.id);
  }, { message: "Pendência salva" });
}
export async function setPendencyStatusAction(id: string, status: unknown) {
  return runAction("pendency:write", (u) => setPendencyStatus(id, parseInput(z.enum(PENDENCY_STATUSES), status), u.id), { message: "Pendência atualizada" });
}
export async function deletePendencyAction(id: string) {
  return runAction("pendency:write", (u) => deletePendency(parseInput(z.string().uuid(), id), u.id), { message: "Pendência excluída" });
}
