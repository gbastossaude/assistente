"use server";
import { libraryItemSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { deleteLibraryItem, duplicateLibraryItem, restoreLibraryDefault, saveLibraryItem } from "../services/library";

export async function saveLibraryItemAction(id: string | null, input: unknown) {
  return runAction("content:write", (u) => saveLibraryItem(id, parseInput(libraryItemSchema, input), u), { message: "Salvo na biblioteca" });
}
export async function duplicateLibraryItemAction(id: string) {
  return runAction("content:write", (u) => duplicateLibraryItem(id, u), { message: "Item duplicado" });
}
export async function deleteLibraryItemAction(id: string) {
  return runAction("content:write", (u) => deleteLibraryItem(id, u), { message: "Item excluído" });
}
export async function restoreLibraryDefaultAction(id: string) {
  return runAction("content:write", (u) => restoreLibraryDefault(id, u), { message: "Texto original restaurado" });
}
