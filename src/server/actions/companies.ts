"use server";
import { companyCnpjSchema, companySchema, contactSchema, contractSchema, interactionSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import {
  addCompanyCnpj,
  createCompany,
  deleteContact,
  deleteContract,
  removeCompanyCnpj,
  restoreCompany,
  saveContact,
  saveContract,
  softDeleteCompany,
  updateCompany,
} from "../services/companies";
import { registerInteraction } from "../services/interactions";

export async function createCompanyAction(input: unknown) {
  return runAction("company:write", async (u) => (await createCompany(parseInput(companySchema, input), u)).id, { message: "Empresa cadastrada" });
}
export async function updateCompanyAction(id: string, input: unknown) {
  return runAction("company:write", (u) => updateCompany(id, parseInput(companySchema, input), u), { message: "Empresa atualizada" });
}
export async function deleteCompanyAction(id: string) {
  return runAction("delete", (u) => softDeleteCompany(id, u), { message: "Empresa excluída" });
}
export async function restoreCompanyAction(id: string) {
  return runAction("delete", (u) => restoreCompany(id, u), { message: "Empresa restaurada" });
}
export async function addCnpjAction(input: unknown) {
  return runAction("company:write", async (u) => (await addCompanyCnpj(parseInput(companyCnpjSchema, input), u)).id, { message: "CNPJ vinculado" });
}
export async function removeCnpjAction(id: string) {
  return runAction("company:write", (u) => removeCompanyCnpj(id, u), { message: "CNPJ desvinculado" });
}
export async function saveContactAction(id: string | null, input: unknown) {
  return runAction("company:write", (u) => saveContact(id, parseInput(contactSchema, input), u), { message: "Contato salvo" });
}
export async function deleteContactAction(id: string) {
  return runAction("company:write", (u) => deleteContact(id, u), { message: "Contato excluído" });
}
export async function saveContractAction(id: string | null, input: unknown) {
  return runAction("company:write", (u) => saveContract(id, parseInput(contractSchema, input), u), { message: "Contrato salvo" });
}
export async function deleteContractAction(id: string) {
  return runAction("company:write", (u) => deleteContract(id, u), { message: "Contrato excluído" });
}
export async function registerInteractionAction(input: unknown) {
  return runAction("read", (u) => registerInteraction(parseInput(interactionSchema, input), u), { message: "Interação registrada" });
}
