"use server";
import { z } from "zod";
import { followupSchema, insurerSchema, proposalSchema, quotationInsurerSchema, sendToInsurerSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { guardProposal, guardQuotation, guardQuotationInsurer } from "../access";
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
  return runAction("quotation:write", async (u) => (await guardQuotation(u, quotationId), addInsurersToQuotation(quotationId, parseInput(z.array(z.string().uuid()).min(1, "Selecione ao menos uma operadora"), ids), u)), { message: "Operadoras adicionadas" });
}
export async function removeQuotationInsurerAction(id: string) {
  return runAction("quotation:write", async (u) => (await guardQuotationInsurer(u, id), removeInsurerFromQuotation(id, u)), { message: "Operadora removida" });
}
export async function updateQuotationInsurerAction(input: unknown) {
  return runAction("quotation:write", async (u) => {
    const d = parseInput(quotationInsurerSchema, input);
    await guardQuotationInsurer(u, d.id);
    return updateQuotationInsurer(d, u);
  }, { message: "Operadora atualizada" });
}
export async function sendToInsurerAction(input: unknown) {
  return runAction("quotation:write", async (u) => {
    const d = parseInput(sendToInsurerSchema, input);
    await guardQuotationInsurer(u, d.id);
    return sendToInsurer(d, u);
  }, { message: "Envio registrado — follow-up agendado" });
}
export async function registerFollowupAction(input: unknown) {
  return runAction("quotation:write", async (u) => {
    const d = parseInput(followupSchema, input);
    await guardQuotationInsurer(u, d.quotationInsurerId);
    return registerFollowup(d, u);
  }, { message: "Follow-up registrado" });
}
export async function saveProposalAction(input: unknown) {
  return runAction("quotation:write", async (u) => {
    const d = parseInput(proposalSchema, input);
    await guardQuotationInsurer(u, d.quotationInsurerId);
    if (d.id) await guardProposal(u, d.id);
    return saveProposal(d, u);
  }, { message: "Proposta salva" });
}
export async function deleteProposalAction(id: string) {
  return runAction("quotation:write", async (u) => (await guardProposal(u, id), deleteProposal(id, u)), { message: "Proposta excluída" });
}
export async function toggleHighlightAction(id: string) {
  return runAction("quotation:write", async (u) => (await guardProposal(u, id), toggleProposalHighlight(id, u)), { message: "Destaque atualizado" });
}
