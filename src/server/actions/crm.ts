"use server";
import { opportunityFollowupSchema, opportunityInteractionSchema, opportunitySchema, opportunityStageSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import {
  anonymizeOpportunity,
  changeOpportunityStage,
  createOpportunity,
  registerOpportunityInteraction,
  softDeleteOpportunity,
  updateOpportunity,
  updateOpportunityFollowup,
} from "../services/opportunities";

export async function saveOpportunityAction(id: string | null, input: unknown) {
  return runAction(
    "crm:write",
    async (u) => {
      const data = parseInput(opportunitySchema, input);
      if (id) {
        await updateOpportunity(id, data, u);
        return id;
      }
      return (await createOpportunity(data, u)).id;
    },
    { message: id ? "Oportunidade atualizada" : "Oportunidade criada" },
  );
}
export async function changeOpportunityStageAction(input: unknown) {
  return runAction("crm:write", (u) => changeOpportunityStage(parseInput(opportunityStageSchema, input), u), { message: "Etapa atualizada" });
}
export async function updateOpportunityFollowupAction(input: unknown) {
  return runAction("crm:write", (u) => updateOpportunityFollowup(parseInput(opportunityFollowupSchema, input), u), { message: "Follow-up atualizado" });
}
export async function registerOpportunityInteractionAction(input: unknown) {
  return runAction("crm:write", (u) => registerOpportunityInteraction(parseInput(opportunityInteractionSchema, input), u), { message: "Interação registrada" });
}
export async function deleteOpportunityAction(id: string) {
  return runAction("crm:write", (u) => softDeleteOpportunity(id, u), { message: "Oportunidade excluída" });
}
export async function anonymizeOpportunityAction(id: string) {
  return runAction("lgpd:manage", (u) => anonymizeOpportunity(id, u), { message: "Dados pessoais anonimizados" });
}
