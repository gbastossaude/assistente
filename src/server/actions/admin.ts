"use server";
import { z } from "zod";
import { checklistTemplateSchema, templateSchema, userSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { saveChecklistTemplate, updateAgeBands, updateGeneralSettings, updateMessageTemplate, updateRule } from "../services/admin";
import { saveUser } from "../services/users";
import { runSweep } from "../automation/engine";

const num = z.coerce.number();
const generalSchema = z.object({
  copayMaxPct: num.min(0).max(100),
  criticalDeadlineDays: num.int().min(0).max(120),
  weights: z.object({ documentacao: num.min(0), base_vidas: num.min(0), comercial: num.min(0), casos_especiais: num.min(0) }),
  retention: z.object({ softDeletedDays: num.int().min(0), assistantHistoryDays: num.int().min(0), readNotificationsDays: num.int().min(0) }),
});
const bandsSchema = z.array(z.object({ label: z.string().trim().min(1), min: num.int().min(0), max: z.union([num.int().min(0), z.null()]) })).min(1);

export async function saveUserAction(input: unknown) {
  return runAction("users:manage", (u) => saveUser(parseInput(userSchema, input), u), { message: "Usuário salvo" });
}
export async function saveGeneralSettingsAction(input: unknown) {
  return runAction("settings:manage", (u) => updateGeneralSettings(parseInput(generalSchema, input), u), { message: "Parâmetros salvos" });
}
export async function saveAgeBandsAction(input: unknown) {
  return runAction("settings:manage", (u) => updateAgeBands(parseInput(bandsSchema, input), u), { message: "Faixas etárias salvas" });
}
export async function saveRuleAction(key: string, enabled: boolean, params: Record<string, number>) {
  return runAction("settings:manage", (u) => updateRule(key, enabled, params, u), { message: "Automação salva" });
}
export async function saveTemplateAction(input: unknown) {
  return runAction("settings:manage", (u) => updateMessageTemplate(parseInput(templateSchema, input), u), { message: "Template salvo" });
}
export async function saveChecklistTemplateAction(input: unknown) {
  return runAction("settings:manage", (u) => saveChecklistTemplate(parseInput(checklistTemplateSchema, input), u), { message: "Item do modelo salvo" });
}
export async function runSweepAction() {
  return runAction("settings:manage", () => runSweep(), { message: "Rotina de automações executada" });
}
