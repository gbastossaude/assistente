"use server";
import { z } from "zod";
import { playbookEntrySchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { restorePlaybookEntry, updatePlaybookEntry } from "../services/playbook";

export async function savePlaybookEntryAction(input: unknown) {
  return runAction("settings:manage", (u) => updatePlaybookEntry(parseInput(playbookEntrySchema, input), u), { message: "Playbook atualizado", revalidate: ["/playbook"] });
}
export async function restorePlaybookEntryAction(id: string) {
  return runAction("settings:manage", (u) => restorePlaybookEntry(parseInput(z.string().uuid(), id), u), { message: "Texto original restaurado", revalidate: ["/playbook"] });
}
