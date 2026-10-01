"use server";
import { documentUpdateSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { softDeleteDocument, updateDocument } from "../services/documents";

export async function updateDocumentAction(input: unknown) {
  return runAction("document:write", (u) => updateDocument(parseInput(documentUpdateSchema, input), u), { message: "Documento atualizado" });
}
export async function deleteDocumentAction(id: string) {
  return runAction("document:write", (u) => softDeleteDocument(id, u), { message: "Documento excluído" });
}
