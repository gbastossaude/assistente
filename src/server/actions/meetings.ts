"use server";
import { meetingSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { generateMeetingOutputs, saveMeeting, softDeleteMeeting } from "../services/meetings";

export async function saveMeetingAction(id: string | null, input: unknown) {
  return runAction("meeting:write", (u) => saveMeeting(id, parseInput(meetingSchema, input), u), { message: "Reunião salva" });
}
export async function generateMeetingOutputsAction(id: string, createTask: boolean) {
  return runAction("meeting:write", (u) => generateMeetingOutputs(id, { createTask }, u), { message: createTask ? "Ata gerada e tarefa de retorno criada" : "Ata gerada" });
}
export async function deleteMeetingAction(id: string) {
  return runAction("meeting:write", (u) => softDeleteMeeting(id, u), { message: "Reunião excluída" });
}
