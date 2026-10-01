"use server";
import { z } from "zod";
import { followupSchema, insurerSchema, proposalSchema, quotationInsurerSchema, sendToInsurerSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import {
  addInsurersToQuotation,
  deleteProposal,
  registerFollowup,
  removeInsurerFromQuotation,
  saveInsurer,
  saveProposal,
  sendToInsurer,
  softDeleteInsurer,
  toggleProposalHighlight,
  updateQuotationInsurer,
} from "../services/insurers";

export async function saveInsurerAction(id: string | null, input: unknown) {
  return runAction("insurer:write", (u) => saveInsurer(id, parseInput(insurerSchema, input), u), { message: "Operadora salva" });
}
export async function deleteInsurerAction(id: string) {
  return runAction("delete", (u) => softDeleteInsurer(id, u), { message: "Operadora excluída" });
}
export async function addInsurersAction(quotationId: string, ids: unknown) {
  return runAction("quotation:write", (u) => addInsurersToQuotation(quotationId, parseInput(z.array(z.string().uuid()).min(1, "Selecione ao menos uma operadora"), ids), u), { message: "Operadoras adicionadas" });
}
export async function removeQuotationInsurerAction(id: string) {
  return runAction("quotation:write", (u) => removeInsurerFromQuotation(id, u), { message: "Operadora removida" });
}
export async function updateQuotationInsurerAction(input: unknown) {
  return runAction("quotation:write", (u) => updateQuotationInsurer(parseInput(quotationInsurerSchema, input), u), { message: "Operadora atualizada" });
}
export async function sendToInsurerAction(input: unknown) {
  return runAction("quotation:write", (u) => sendToInsurer(parseInput(sendToInsurerSchema, input), u), { message: "Envio registrado — follow-up agendado" });
}
export async function registerFollowupAction(input: unknown) {
  return runAction("quotation:write", (u) => registerFollowup(parseInput(followupSchema, input), u), { message: "Follow-up registrado" });
}
export async function saveProposalAction(input: unknown) {
  return runAction("quotation:write", (u) => saveProposal(parseInput(proposalSchema, input), u), { message: "Proposta salva" });
}
export async function deleteProposalAction(id: string) {
  return runAction("quotation:write", (u) => deleteProposal(id, u), { message: "Proposta excluída" });
}
export async function toggleHighlightAction(id: string) {
  return runAction("quotation:write", (u) => toggleProposalHighlight(id, u), { message: "Destaque atualizado" });
}
