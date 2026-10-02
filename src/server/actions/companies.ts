"use server";
import { companyCnpjSchema, companySchema, contactSchema, contractSchema, interactionSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { effectiveOwner, guardCompany, guardCompanyChild, guardQuotation } from "../access";
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
  return runAction("company:write", async (u) => {
    const d = parseInput(companySchema, input);
    return (await createCompany({ ...d, ownerId: await effectiveOwner(u, d.ownerId) }, u)).id;
  }, { message: "Empresa cadastrada" });
}
export async function updateCompanyAction(id: string, input: unknown) {
  return runAction("company:write", async (u) => {
    await guardCompany(u, id);
    const d = parseInput(companySchema, input);
    return updateCompany(id, { ...d, ownerId: await effectiveOwner(u, d.ownerId) }, u);
  }, { message: "Empresa atualizada" });
}
export async function deleteCompanyAction(id: string) {
  return runAction("delete", async (u) => (await guardCompany(u, id), softDeleteCompany(id, u)), { message: "Empresa excluída" });
}
export async function restoreCompanyAction(id: string) {
  return runAction("delete", async (u) => (await guardCompany(u, id), restoreCompany(id, u)), { message: "Empresa restaurada" });
}
export async function addCnpjAction(input: unknown) {
  return runAction("company:write", async (u) => {
    const d = parseInput(companyCnpjSchema, input);
    await guardCompany(u, d.companyId);
    return (await addCompanyCnpj(d, u)).id;
  }, { message: "CNPJ vinculado" });
}
export async function removeCnpjAction(id: string) {
  return runAction("company:write", async (u) => (await guardCompanyChild(u, "cnpj", id), removeCompanyCnpj(id, u)), { message: "CNPJ desvinculado" });
}
export async function saveContactAction(id: string | null, input: unknown) {
  return runAction("company:write", async (u) => {
    const d = parseInput(contactSchema, input);
    await guardCompany(u, d.companyId);
    if (id) await guardCompanyChild(u, "contact", id);
    return saveContact(id, d, u);
  }, { message: "Contato salvo" });
}
export async function deleteContactAction(id: string) {
  return runAction("company:write", async (u) => (await guardCompanyChild(u, "contact", id), deleteContact(id, u)), { message: "Contato excluído" });
}
export async function saveContractAction(id: string | null, input: unknown) {
  return runAction("company:write", async (u) => {
    const d = parseInput(contractSchema, input);
    await guardCompany(u, d.companyId);
    if (id) await guardCompanyChild(u, "contract", id);
    return saveContract(id, d, u);
  }, { message: "Contrato salvo" });
}
export async function deleteContractAction(id: string) {
  return runAction("company:write", async (u) => (await guardCompanyChild(u, "contract", id), deleteContract(id, u)), { message: "Contrato excluído" });
}
export async function registerInteractionAction(input: unknown) {
  return runAction("read", async (u) => {
    const d = parseInput(interactionSchema, input);
    await guardCompany(u, d.companyId);
    await guardQuotation(u, d.quotationId);
    return registerInteraction(d, u);
  }, { message: "Interação registrada" });
}
