"use server";
import { eventSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { deleteEvent, saveEvent } from "../services/calendar";

export async function saveEventAction(id: string | null, input: unknown) {
  return runAction("calendar:write", (u) => saveEvent(id, parseInput(eventSchema, input), u), { message: "Compromisso salvo" });
}
export async function deleteEventAction(id: string) {
  return runAction("calendar:write", (u) => deleteEvent(id, u), { message: "Compromisso excluído" });
}
