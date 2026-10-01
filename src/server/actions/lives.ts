"use server";
import { runAction } from "../action-utils";
import { deactivateImport } from "../services/lives";

export async function deactivateImportAction(id: string) {
  return runAction("lives:import", (u) => deactivateImport(id, u), { message: "Importação desativada" });
}
